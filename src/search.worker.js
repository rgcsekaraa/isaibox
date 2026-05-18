let tracks = [];
let indexedTracks = [];
let tracksByAlbum = new Map();
let lastRequestId = 0;
let lastSearch = null;
let queryCache = new Map();

const QUERY_CACHE_LIMIT = 80;
const GLOBAL_SEARCH_RESULT_LIMIT = 500;

const normalizeSearchText = (value) => {
  const normalized = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token
      .replace(/dh/g, "th")
      .replace(/sh/g, "s")
      .replace(/zh/g, "l")
      .replace(/ph/g, "f")
      .replace(/ck/g, "k")
      .replace(/aa+/g, "a")
      .replace(/ee+/g, "i")
      .replace(/oo+/g, "u")
      .replace(/ii+/g, "i")
      .replace(/uu+/g, "u")
      .replace(/([bcdfghjklmnpqstvwxyz])\1+/g, "$1"))
    .join(" ");
};

const compactSearchText = (value) => String(value || "").replace(/\s+/g, "").replace(/r{3,}/g, "rr");

const prepareSearchQuery = (query) => {
  const normalizedQuery = normalizeSearchText(query);
  return {
    normalizedQuery,
    queryCompact: compactSearchText(normalizedQuery),
    queryTokens: normalizedQuery.split(/\s+/).filter(Boolean),
  };
};

const orderedTokenScore = (queryTokens, text) => {
  let cursor = 0;
  let penalty = 0;
  for (const token of queryTokens) {
    const index = text.indexOf(token, cursor);
    if (index === -1) return null;
    penalty += index - cursor;
    cursor = index + token.length;
  }
  return penalty;
};

const levenshteinDistance = (a, b) => {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
};

const fieldScore = (field, fieldCompact, queryCompact, queryTokens, base) => {
  if (!field || !queryCompact) return null;
  if (fieldCompact === queryCompact) return base;
  if (fieldCompact.startsWith(queryCompact)) return base + 6 + fieldCompact.length - queryCompact.length;
  const compactIndex = fieldCompact.indexOf(queryCompact);
  if (compactIndex !== -1) return base + 18 + compactIndex;
  const tokenScore = orderedTokenScore(queryTokens, field);
  if (tokenScore !== null) return base + 34 + tokenScore;
  return null;
};

const splitCreditNames = (value) =>
  String(value || "")
    .split(/\s*(?:,|&|\/|\band\b)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);

const personSearchKey = (value) => compactSearchText(normalizeSearchText(value));

const formatPersonName = (value) => {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const compactPeriods = cleaned.replace(/\s*\.\s*/g, ".");
  const parts = compactPeriods.split(".").filter(Boolean);
  if (parts.length > 1 && parts.slice(0, -1).every((part) => part.length <= 2)) {
    return `${parts.slice(0, -1).join(".")}. ${parts.at(-1)}`;
  }
  return cleaned;
};

const prepareTrackSearch = (track) => {
  const title = normalizeSearchText(track.title);
  const album = normalizeSearchText(track.movie);
  const singer = normalizeSearchText(track.singer);
  const director = normalizeSearchText(track.director);
  const year = normalizeSearchText(track.year);
  const combined = [title, album, singer, director, year].filter(Boolean).join(" ");
  return {
    title,
    titleCompact: compactSearchText(title),
    album,
    albumCompact: compactSearchText(album),
    singer,
    singerCompact: compactSearchText(singer),
    director,
    directorCompact: compactSearchText(director),
    year,
    combined,
    combinedCompact: compactSearchText(combined),
  };
};

const getTrackFieldMatches = (entry, query) => {
  const { track, search } = entry;
  const { queryCompact, queryTokens } = query;
  return [
    { label: "Song", value: track.title || "", score: fieldScore(search.title, search.titleCompact, queryCompact, queryTokens, 0) },
    { label: "Album", value: track.movie || "", score: fieldScore(search.album, search.albumCompact, queryCompact, queryTokens, 22) },
    { label: "Music director", value: track.director || "", score: fieldScore(search.director, search.directorCompact, queryCompact, queryTokens, 26) },
    { label: "Singer", value: track.singer || "", score: fieldScore(search.singer, search.singerCompact, queryCompact, queryTokens, 32) },
  ].filter((match) => match.score !== null).sort((a, b) => a.score - b.score);
};

const getTrackSearchMatch = (entry, query) => {
  const { track, search } = entry;
  const { queryCompact, queryTokens } = query;
  const fieldMatches = getTrackFieldMatches(entry, query);
  if (fieldMatches.length) return fieldMatches[0];

  if (search.combinedCompact.includes(queryCompact)) {
    return { score: 70 + search.combinedCompact.indexOf(queryCompact), label: "Song", value: track.title || "" };
  }

  const combinedTokenScore = orderedTokenScore(queryTokens, search.combined);
  if (combinedTokenScore !== null) {
    return { score: 90 + combinedTokenScore, label: "Song", value: track.title || "" };
  }

  if (queryTokens.every((token) => search.combined.includes(token))) {
    return { score: 120, label: "Song", value: track.title || "" };
  }

  if (
    queryCompact.length >= 5 &&
    Math.abs(search.titleCompact.length - queryCompact.length) <= Math.max(3, Math.floor(queryCompact.length * 0.35)) &&
    queryTokens.some((token) => token.length >= 3 && search.title.includes(token.slice(0, 3)))
  ) {
    const maxDistance = Math.max(2, Math.floor(queryCompact.length * 0.22));
    const titleDistance = levenshteinDistance(queryCompact, search.titleCompact);
    if (titleDistance <= maxDistance) {
      return { score: 45 + titleDistance * 4, label: "Song", value: track.title || "" };
    }
  }

  return null;
};

const matchCreditName = (entry, label, query) => {
  const names = splitCreditNames(label === "Music director" ? entry.track.director : entry.track.singer);
  const base = label === "Music director" ? 26 : 32;
  for (const name of names) {
    const normalizedName = normalizeSearchText(name);
    const nameCompact = compactSearchText(normalizedName);
    const nameTokens = normalizedName.split(/\s+/).filter(Boolean);
    const { queryCompact, queryTokens } = query;
    let score = null;

    if (nameCompact === queryCompact) {
      score = base;
    } else if (nameCompact.startsWith(queryCompact)) {
      score = base + 8 + nameCompact.length - queryCompact.length;
    } else if (queryTokens.every((queryToken) => nameTokens.some((nameToken) => nameToken === queryToken || nameToken.startsWith(queryToken)))) {
      score = base + 22;
    } else if (nameCompact.includes(queryCompact) && nameTokens.some((nameToken) => nameToken.startsWith(queryCompact))) {
      score = base + 34 + nameCompact.indexOf(queryCompact);
    }

    if (score !== null) return { label, score, value: formatPersonName(name), key: personSearchKey(name) };
  }
  return null;
};

const pushCache = (key, value) => {
  if (queryCache.has(key)) queryCache.delete(key);
  queryCache.set(key, value);
  if (queryCache.size > QUERY_CACHE_LIMIT) {
    queryCache.delete(queryCache.keys().next().value);
  }
};

const buildIndex = (items) => {
  tracks = items || [];
  indexedTracks = tracks.map((track, index) => ({ track, index, search: prepareTrackSearch(track) }));
  tracksByAlbum = new Map();
  queryCache = new Map();

  for (const track of tracks) {
    const album = String(track.movie || "").trim();
    if (!album) continue;
    if (!tracksByAlbum.has(album)) tracksByAlbum.set(album, []);
    tracksByAlbum.get(album).push(track.n);
  }
};

const buildEmptyPayload = (query) => ({
  query,
  songs: [],
  albums: [],
  directors: [],
  singers: [],
  counts: { songs: 0, albums: 0, directors: 0, singers: 0 },
});

const buildSearchPayload = (rawQuery) => {
  const query = String(rawQuery || "").trim();
  if (!query) return buildEmptyPayload("");
  const preparedQuery = prepareSearchQuery(query);
  if (!preparedQuery.normalizedQuery) return buildEmptyPayload(query);

  const songs = [];
  const albums = new Map();
  const directors = new Map();
  const singers = new Map();

  for (const entry of indexedTracks) {
    const { track, index } = entry;
    const songMatch = getTrackSearchMatch(entry, preparedQuery);
    if (songMatch) {
      songs.push({
        n: track.n,
        score: songMatch.score,
        index,
        matchLabel: songMatch.label,
        matchValue: songMatch.value,
      });
    }

    const album = String(track.movie || "").trim();
    if (album) {
      const albumMatch = [
        getTrackFieldMatches(entry, preparedQuery).find((match) => match.label === "Album"),
        matchCreditName(entry, "Music director", preparedQuery),
      ].filter(Boolean).sort((a, b) => a.score - b.score)[0];
      if (albumMatch) {
        const existing = albums.get(album);
        if (!existing || albumMatch.score < existing.score) {
          albums.set(album, {
            name: album,
            director: track.director || "",
            year: track.year || "",
            count: tracksByAlbum.get(album)?.length || 1,
            trackNs: tracksByAlbum.get(album) || [track.n],
            matchLabel: albumMatch.label,
            matchValue: albumMatch.value,
            score: albumMatch.score,
          });
        }
      }
    }

    for (const [label, groups] of [["Music director", directors], ["Singer", singers]]) {
      const match = matchCreditName(entry, label, preparedQuery);
      if (!match?.key || !match.value) continue;
      const current = groups.get(match.key) || {
        name: match.value,
        score: match.score,
        albums: new Set(),
        trackCount: 0,
      };
      current.score = Math.min(current.score, match.score);
      current.trackCount += 1;
      if (track.movie) current.albums.add(track.movie);
      groups.set(match.key, current);
    }
  }

  songs.sort((a, b) => a.score - b.score || a.index - b.index);
  const albumResults = [...albums.values()]
    .sort((a, b) => a.score - b.score || String(b.year || "").localeCompare(String(a.year || "")) || a.name.localeCompare(b.name));
  const peopleResults = (groups) => [...groups.values()]
    .map((group) => ({ ...group, albumCount: group.albums.size, albums: [...group.albums] }))
    .sort((a, b) => a.score - b.score || b.albumCount - a.albumCount || a.name.localeCompare(b.name));
  const directorResults = peopleResults(directors);
  const singerResults = peopleResults(singers);

  return {
    query,
    songs: songs.slice(0, GLOBAL_SEARCH_RESULT_LIMIT),
    albums: albumResults,
    directors: directorResults,
    singers: singerResults,
    counts: {
      songs: songs.length,
      albums: albumResults.length,
      directors: directorResults.length,
      singers: singerResults.length,
    },
  };
};

self.onmessage = (event) => {
  const { type, payload, requestId } = event.data || {};
  if (type === "index") {
    buildIndex(payload || []);
    self.postMessage({ type: "indexed", payload: { count: tracks.length } });
    if (lastSearch?.query) {
      const cacheKey = normalizeSearchText(lastSearch.query);
      const result = buildSearchPayload(lastSearch.query);
      pushCache(cacheKey, result);
      self.postMessage({ type: "results", requestId: lastSearch.requestId, payload: result });
    }
    return;
  }

  if (type !== "search") return;
  lastRequestId = requestId;
  const query = String(payload || "").trim();
  lastSearch = query ? { requestId, query } : null;
  const cacheKey = normalizeSearchText(query);
  if (queryCache.has(cacheKey)) {
    self.postMessage({ type: "results", requestId, payload: { ...queryCache.get(cacheKey), query } });
    return;
  }

  const result = buildSearchPayload(query);
  pushCache(cacheKey, result);
  if (requestId === lastRequestId) {
    self.postMessage({ type: "results", requestId, payload: result });
  }
};
