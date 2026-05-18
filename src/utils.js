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
      .replace(/([bcdfghjklmnpqstvwxyz])\1+/g, "$1")
    )
    .join(" ");
};

const compactSearchText = (value) => String(value || "").replace(/\s+/g, "").replace(/r{3,}/g, "rr");

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

export const prepareSearchQuery = (query) => {
  const normalizedQuery = normalizeSearchText(query);
  const queryCompact = compactSearchText(normalizedQuery);
  return {
    normalizedQuery,
    queryCompact,
    queryTokens: normalizedQuery.split(/\s+/).filter(Boolean),
  };
};

export const splitCreditNames = (value) =>
  String(value || "")
    .split(/\s*(?:,|&|\/|\band\b)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);

export const personSearchKey = (value) => compactSearchText(normalizeSearchText(value));

export const formatPersonName = (value) => {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const compactPeriods = cleaned.replace(/\s*\.\s*/g, ".");
  const parts = compactPeriods.split(".").filter(Boolean);
  if (parts.length > 1 && parts.slice(0, -1).every((part) => part.length <= 2)) {
    return `${parts.slice(0, -1).join(".")}. ${parts.at(-1)}`;
  }
  return cleaned;
};

export const scoreTrackSearch = (track, query) => {
  const preparedQuery = typeof query === "string" ? prepareSearchQuery(query) : query;
  if (!preparedQuery.normalizedQuery) return 0;

  return getTrackSearchMatch(track, preparedQuery)?.score ?? null;
};

export const getTrackFieldMatches = (track, query) => {
  const preparedQuery = typeof query === "string" ? prepareSearchQuery(query) : query;
  if (!preparedQuery.normalizedQuery) return [{ score: 0, label: "Song", value: track.title || "" }];

  const search = track.search || track._search || prepareTrackSearch(track);
  const { queryCompact, queryTokens } = preparedQuery;
  return [
    {
      label: "Song",
      value: track.title || "",
      score: fieldScore(search.title, search.titleCompact, queryCompact, queryTokens, 0),
    },
    {
      label: "Album",
      value: track.movie || "",
      score: fieldScore(search.album, search.albumCompact, queryCompact, queryTokens, 22),
    },
    {
      label: "Music director",
      value: track.director || "",
      score: fieldScore(search.director, search.directorCompact, queryCompact, queryTokens, 26),
    },
    {
      label: "Singer",
      value: track.singer || "",
      score: fieldScore(search.singer, search.singerCompact, queryCompact, queryTokens, 32),
    },
  ]
    .filter((match) => match.score !== null)
    .sort((a, b) => a.score - b.score);
};

export const getTrackSearchMatch = (track, query) => {
  const preparedQuery = typeof query === "string" ? prepareSearchQuery(query) : query;
  if (!preparedQuery.normalizedQuery) return { score: 0, label: "Song", value: track.title || "" };

  const search = track.search || track._search || prepareTrackSearch(track);
  const { queryCompact, queryTokens } = preparedQuery;
  const fieldMatches = getTrackFieldMatches(track, preparedQuery);

  if (fieldMatches.length) return fieldMatches[0];

  if (search.combinedCompact.includes(queryCompact)) {
    return { score: 70 + search.combinedCompact.indexOf(queryCompact), label: "Song", value: track.title || "" };
  }

  const combinedTokenScore = orderedTokenScore(queryTokens, search.combined);
  if (combinedTokenScore !== null) {
    return { score: 90 + combinedTokenScore, label: "Song", value: track.title || "" };
  }

  const allTokensPresent = queryTokens.every((token) => search.combined.includes(token));
  if (allTokensPresent) return { score: 120, label: "Song", value: track.title || "" };

  // Levenshtein is intentionally last and gated; running it for every
  // non-candidate on every keystroke is what made the UI hang.
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

// Solid version of useMediaQuery — returns a reactive accessor
export const useMediaQuery = (query) => {
  const m = window.matchMedia(query);
  const [match, setMatch] = createSignal(m.matches);
  const fn = (e) => setMatch(e.matches);
  m.addEventListener("change", fn);
  onCleanup(() => m.removeEventListener("change", fn));
  return match;
};
