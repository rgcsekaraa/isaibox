// Fetches album cover art from the iTunes Search API.
// No API key required; Apple's endpoint returns Access-Control-Allow-Origin: *.
// Results are stored in sessionStorage so each album name is fetched at most once per session.

const mem = new Map();
const SESSION_PREFIX = "isai_art:";

function readSession(name) {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + name);
    return raw === null ? undefined : (raw || null);
  } catch { return undefined; }
}

function writeSession(name, url) {
  try { sessionStorage.setItem(SESSION_PREFIX + name, url || ""); } catch {}
}

export async function fetchAlbumArt(name) {
  if (!name) return null;
  if (mem.has(name)) {
    const val = mem.get(name);
    // If a promise is in-flight, await it (deduplicates parallel callers)
    return val instanceof Promise ? val : val;
  }

  const stored = readSession(name);
  if (stored !== undefined) {
    mem.set(name, stored);
    return stored;
  }

  const promise = (async () => {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=album&country=in&limit=5`,
        { cache: "force-cache" }
      );
      const data = await res.json();
      const raw = data.results?.find((r) => r.artworkUrl100)?.artworkUrl100 ?? null;
      const url = raw ? raw.replace("100x100bb", "400x400bb") : null;
      mem.set(name, url);
      writeSession(name, url);
      return url;
    } catch {
      mem.delete(name);
      return null;
    }
  })();

  mem.set(name, promise);
  return promise;
}
