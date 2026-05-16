import { createSignal, onCleanup } from "solid-js";

export const parseDur = (d) => {
  const [m, s] = d.split(":").map(Number);
  return m * 60 + s;
};

export const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const totalDuration = (tracks) => {
  const total = tracks.reduce((s, t) => s + parseDur(t.duration), 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const normalizeSearchText = (value) => {
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
      .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, "$1")
    )
    .join(" ");
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
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
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

export const prepareTrackSearch = (track) => {
  const title = normalizeSearchText(track.title);
  const album = normalizeSearchText(track.movie);
  const singer = normalizeSearchText(track.singer);
  const director = normalizeSearchText(track.director);
  const year = normalizeSearchText(track.year);
  const combined = [title, album, singer, director, year].filter(Boolean).join(" ");
  return {
    title,
    titleCompact: title.replace(/\s+/g, ""),
    album,
    albumCompact: album.replace(/\s+/g, ""),
    singer,
    singerCompact: singer.replace(/\s+/g, ""),
    director,
    directorCompact: director.replace(/\s+/g, ""),
    year,
    combined,
    combinedCompact: combined.replace(/\s+/g, ""),
  };
};

export const prepareSearchQuery = (query) => {
  const normalizedQuery = normalizeSearchText(query);
  const queryCompact = normalizedQuery.replace(/\s+/g, "");
  return {
    normalizedQuery,
    queryCompact,
    queryTokens: normalizedQuery.split(/\s+/).filter(Boolean),
  };
};

export const scoreTrackSearch = (track, query) => {
  const preparedQuery = typeof query === "string" ? prepareSearchQuery(query) : query;
  if (!preparedQuery.normalizedQuery) return 0;

  const search = track.search || track._search || prepareTrackSearch(track);
  const { queryCompact, queryTokens } = preparedQuery;

  const directScores = [
    fieldScore(search.title, search.titleCompact, queryCompact, queryTokens, 0),
    fieldScore(search.album, search.albumCompact, queryCompact, queryTokens, 22),
    fieldScore(search.director, search.directorCompact, queryCompact, queryTokens, 26),
    fieldScore(search.singer, search.singerCompact, queryCompact, queryTokens, 32),
  ].filter((score) => score !== null);
  if (directScores.length) return Math.min(...directScores);

  if (search.combinedCompact.includes(queryCompact)) return 70 + search.combinedCompact.indexOf(queryCompact);

  const combinedTokenScore = orderedTokenScore(queryTokens, search.combined);
  if (combinedTokenScore !== null) return 90 + combinedTokenScore;

  const allTokensPresent = queryTokens.every((token) => search.combined.includes(token));
  if (allTokensPresent) return 120;

  // Levenshtein is intentionally last and gated; running it for every
  // non-candidate on every keystroke is what made the UI hang.
  if (
    queryCompact.length >= 5 &&
    Math.abs(search.titleCompact.length - queryCompact.length) <= Math.max(3, Math.floor(queryCompact.length * 0.35)) &&
    queryTokens.some((token) => token.length >= 3 && search.title.includes(token.slice(0, 3)))
  ) {
    const maxDistance = Math.max(2, Math.floor(queryCompact.length * 0.22));
    const titleDistance = levenshteinDistance(queryCompact, search.titleCompact);
    if (titleDistance <= maxDistance) return 45 + titleDistance * 4;
  }

  return null;
};

// Solid version of useMediaQuery — returns a reactive accessor
export const useMediaQuery = (query) => {
  const m = window.matchMedia(query);
  const [match, setMatch] = createSignal(m.matches);
  const fn = (e) => setMatch(e.matches);
  m.addEventListener("change", fn);
  onCleanup(() => m.removeEventListener("change", fn));
  return match;
};
