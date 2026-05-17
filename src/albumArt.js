// Fetches album cover art from iTunes Search API (supports CORS, no key needed).
// Results are cached in sessionStorage and a module-level Map to avoid duplicate fetches.

const memCache = new Map(); // name → url|null
const STORE_PREFIX = "albumart:";

function fromSession(name) {
  try {
    const raw = sessionStorage.getItem(STORE_PREFIX + name);
    return raw === null ? undefined : (raw || null);
  } catch { return undefined; }
}

function toSession(name, url) {
  try { sessionStorage.setItem(STORE_PREFIX + name, url || ""); } catch {}
}

export async function fetchAlbumArt(name) {
  if (!name) return null;
  if (memCache.has(name)) return memCache.get(name);

  const stored = fromSession(name);
  if (stored !== undefined) {
    memCache.set(name, stored);
    return stored;
  }

  // Mark in-flight so parallel callers don't double-fetch
  const promise = (async () => {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=album&country=in&limit=5`,
        { cache: "force-cache" }
      );
      const data = await res.json();
      const raw = data.results?.find((r) => r.artworkUrl100)?.artworkUrl100 ?? null;
      // Upgrade to 400px for crisp display
      const url = raw ? raw.replace("100x100bb", "400x400bb") : null;
      memCache.set(name, url);
      toSession(name, url);
      return url;
    } catch {
      memCache.delete(name);
      return null;
    }
  })();

  memCache.set(name, promise); // store promise to deduplicate parallel callers
  const url = await promise;
  return url;
}
