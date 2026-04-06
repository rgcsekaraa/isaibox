import Fuse from "fuse.js";

let songs = [];
let fuse = null;
let lastRequestId = 0;
let songMeta = [];
let tokenIndex = new Map();
let prefixIndex = new Map();
let queryCache = new Map();
const QUERY_CACHE_LIMIT = 120;

const normalize = (value) =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenize = (value) => normalize(value).split(/\s+/).filter(Boolean);

const splitArtists = (value) =>
  (value || "")
    .split(/,|&|\/| feat\. | featuring /i)
    .map((item) => item.trim())
    .filter(Boolean);

const uniqueBy = (items, getKey) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const pushCache = (key, value) => {
  if (queryCache.has(key)) {
    queryCache.delete(key);
  }
  queryCache.set(key, value);
  if (queryCache.size > QUERY_CACHE_LIMIT) {
    const oldestKey = queryCache.keys().next().value;
    queryCache.delete(oldestKey);
  }
};

const addTokenToIndexes = (token, songIndex) => {
  if (!token) return;

  const tokenSet = tokenIndex.get(token) || new Set();
  tokenSet.add(songIndex);
  tokenIndex.set(token, tokenSet);

  const prefixLength = Math.min(6, token.length);
  for (let i = 1; i <= prefixLength; i += 1) {
    const prefix = token.slice(0, i);
    const prefixSet = prefixIndex.get(prefix) || new Set();
    prefixSet.add(songIndex);
    prefixIndex.set(prefix, prefixSet);
  }
};

const buildIndex = (items) => {
  songs = items;
  queryCache = new Map();
  tokenIndex = new Map();
  prefixIndex = new Map();

  songMeta = items.map((song, index) => {
    const fields = {
      track: normalize(song.track),
      movie: normalize(song.movie),
      musicDirector: normalize(song.musicDirector),
      singers: normalize(song.singers),
      year: normalize(song.year)
    };
    const artists = splitArtists(song.singers);
    const tokenSet = new Set([
      ...tokenize(song.track),
      ...tokenize(song.movie),
      ...tokenize(song.musicDirector),
      ...tokenize(song.singers),
      ...tokenize(song.year)
    ]);

    tokenSet.forEach((token) => addTokenToIndexes(token, index));

    return {
      song,
      fields,
      artists,
      tokens: [...tokenSet]
    };
  });

  fuse = new Fuse(items, {
    threshold: 0.18,
    ignoreLocation: true,
    minMatchCharLength: 2,
    ignoreFieldNorm: false,
    shouldSort: true,
    keys: [
      { name: "track", weight: 0.48 },
      { name: "movie", weight: 0.2 },
      { name: "musicDirector", weight: 0.16 },
      { name: "singers", weight: 0.12 },
      { name: "year", weight: 0.04 }
    ]
  });
};

const getCandidateIndexes = (tokens) => {
  if (!tokens.length) {
    return songMeta.map((_, index) => index);
  }

  const exactSets = tokens
    .map((token) => tokenIndex.get(token))
    .filter(Boolean)
    .sort((left, right) => left.size - right.size);

  if (exactSets.length) {
    let intersection = new Set(exactSets[0]);
    for (let i = 1; i < exactSets.length; i += 1) {
      intersection = new Set([...intersection].filter((value) => exactSets[i].has(value)));
      if (!intersection.size) break;
    }
    if (intersection.size) {
      return [...intersection];
    }
  }

  const prefixSets = tokens
    .map((token) => prefixIndex.get(token.slice(0, Math.min(6, token.length))))
    .filter(Boolean)
    .sort((left, right) => left.size - right.size);

  if (prefixSets.length) {
    let union = new Set();
    for (const set of prefixSets) {
      for (const value of set) union.add(value);
      if (union.size >= 1200) break;
    }
    if (union.size) {
      return [...union];
    }
  }

  return songMeta.map((_, index) => index);
};

const scoreSong = (meta, tokens) => {
  const { fields, tokens: songTokens } = meta;
  let score = 0;
  let matchedTokens = 0;

  for (const token of tokens) {
    let tokenScore = 0;

    if (fields.track === token) tokenScore = Math.max(tokenScore, 110);
    else if (fields.track.startsWith(token)) tokenScore = Math.max(tokenScore, 72);
    else if (fields.track.includes(token)) tokenScore = Math.max(tokenScore, 48);

    if (fields.movie === token) tokenScore = Math.max(tokenScore, 82);
    else if (fields.movie.startsWith(token)) tokenScore = Math.max(tokenScore, 55);
    else if (fields.movie.includes(token)) tokenScore = Math.max(tokenScore, 38);

    if (fields.musicDirector === token) tokenScore = Math.max(tokenScore, 62);
    else if (fields.musicDirector.startsWith(token)) tokenScore = Math.max(tokenScore, 42);
    else if (fields.musicDirector.includes(token)) tokenScore = Math.max(tokenScore, 28);

    if (fields.singers === token) tokenScore = Math.max(tokenScore, 50);
    else if (fields.singers.startsWith(token)) tokenScore = Math.max(tokenScore, 34);
    else if (fields.singers.includes(token)) tokenScore = Math.max(tokenScore, 22);

    if (fields.year === token) tokenScore = Math.max(tokenScore, 20);

    if (!tokenScore) {
      for (const songToken of songTokens) {
        if (songToken.startsWith(token)) {
          tokenScore = Math.max(tokenScore, 18);
          break;
        }
        if (token.startsWith(songToken) && songToken.length > 2) {
          tokenScore = Math.max(tokenScore, 10);
        }
      }
    }

    if (tokenScore) {
      matchedTokens += 1;
      score += tokenScore;
    }
  }

  if (!matchedTokens) {
    return -1;
  }

  score += matchedTokens * 15;
  if (matchedTokens === tokens.length) {
    score += 40;
  }
  if (tokens.length > 1 && fields.track.includes(tokens.join(" "))) {
    score += 55;
  }
  if (tokens.length > 1 && fields.movie.includes(tokens.join(" "))) {
    score += 28;
  }

  return score;
};

const strictSearch = (query) => {
  const tokens = tokenize(query);
  if (!tokens.length) {
    return songs.slice(0, 200);
  }

  const candidates = getCandidateIndexes(tokens);

  return candidates
    .map((index) => {
      const meta = songMeta[index];
      const score = scoreSong(meta, tokens);
      if (score < 0) {
        return null;
      }
      return { song: meta.song, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.song.track.localeCompare(right.song.track))
    .slice(0, 240)
    .map((entry) => entry.song);
};

const buildAlbumGroups = (items, query) => {
  const normalizedQuery = normalize(query);
  const grouped = new Map();

  for (const song of items) {
    const movie = normalize(song.movie);
    if (!movie) continue;
    if (normalizedQuery && !movie.includes(normalizedQuery)) continue;

    const existing = grouped.get(song.movie) || {
      album: song.movie,
      musicDirector: song.musicDirector,
      year: song.year,
      count: 0
    };
    existing.count += 1;
    grouped.set(song.movie, existing);
  }

  return Array.from(grouped.values())
    .sort((left, right) => right.count - left.count || left.album.localeCompare(right.album))
    .slice(0, 24);
};

const buildArtistGroups = (items, query) => {
  const normalizedQuery = normalize(query);
  const grouped = new Map();

  for (const song of items) {
    for (const singer of splitArtists(song.singers)) {
      const normalizedSinger = normalize(singer);
      if (!normalizedSinger) continue;
      if (normalizedQuery && !normalizedSinger.includes(normalizedQuery)) continue;
      const existing = grouped.get(singer) || {
        artist: singer,
        count: 0
      };
      existing.count += 1;
      grouped.set(singer, existing);
    }
  }

  return Array.from(grouped.values())
    .sort((left, right) => right.count - left.count || left.artist.localeCompare(right.artist))
    .slice(0, 24);
};

const buildPayload = (query, matchedSongs) => ({
  songs: matchedSongs.slice(0, 200),
  albums: buildAlbumGroups(matchedSongs.slice(0, 600), query),
  artists: buildArtistGroups(matchedSongs.slice(0, 600), query)
});

self.onmessage = (event) => {
  const { type, payload, requestId } = event.data;

  if (type === "index") {
    buildIndex(payload);
    self.postMessage({
      type: "indexed",
      payload: {
        count: songs.length
      }
    });
    return;
  }

  if (type !== "search") {
    return;
  }

  lastRequestId = requestId;
  const query = (payload || "").trim();
  const normalizedQuery = normalize(query);

  if (queryCache.has(normalizedQuery)) {
    self.postMessage({
      type: "results",
      requestId,
      payload: queryCache.get(normalizedQuery)
    });
    return;
  }

  if (!normalizedQuery) {
    const result = buildPayload("", songs);
    pushCache(normalizedQuery, result);
    self.postMessage({
      type: "results",
      requestId,
      payload: result
    });
    return;
  }

  const strict = strictSearch(normalizedQuery);
  const fuzzy = fuse
    ? fuse.search(normalizedQuery, { limit: 140 }).map((result) => result.item)
    : [];
  const merged = uniqueBy([...strict, ...fuzzy], (song) => song.id);
  const result = buildPayload(normalizedQuery, merged);
  pushCache(normalizedQuery, result);

  if (requestId !== lastRequestId) {
    return;
  }

  self.postMessage({
    type: "results",
    requestId,
    payload: result
  });
};
