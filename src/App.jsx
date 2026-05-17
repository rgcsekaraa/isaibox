import { createSignal, createMemo, createEffect, onCleanup, onMount, Show, Match, Switch } from "solid-js";
import { fmtTime, getTrackSearchMatch, parseDur, prepareSearchQuery, prepareTrackSearch, useMediaQuery } from "./utils.js";
import { TopBar, Sidebar, ShortcutsDrawer } from "./Desktop.jsx";
import { MobileHeader, MobileBottomTabs, MobileLibraryPage, MobilePlaylistDetail } from "./Mobile.jsx";
import { LibraryPage, QueuePanel, LyricsPanel, RecentsPage, FavoritesPage } from "./Pages.jsx";
import { NowPlayingDock, MiniPlayer, FullPlayer } from "./Player.jsx";
import { MenuSelect } from "./MenuSelect.jsx";
import { Icon } from "./Icon.jsx";

const GOOGLE_GSI_SRC = "https://accounts.google.com/gsi/client";
const THEME_STORAGE_KEY = "isaibox-theme";
const INITIAL_LOADING_SEEN_KEY = "isaibox-initial-loading-seen";
const SEARCH_DEBOUNCE_MS = 120;
let googleScriptPromise;

const emptySearchResults = (query = "") => ({
  query,
  songs: [],
  albums: [],
  directors: [],
  singers: [],
  counts: { songs: 0, albums: 0, directors: 0, singers: 0 },
});

function readInitialTheme() {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  } catch {
    return "dark";
  }
}

function shouldShowInitialLoading() {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(INITIAL_LOADING_SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

function ensureGoogleScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load Google sign-in"));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

function GoogleSignInButton(props) {
  let buttonRef;
  let rendered = false;

  createEffect(() => {
    const clientId = props.clientId?.();
    if (!clientId || !buttonRef || rendered) return;
    rendered = true;
    ensureGoogleScript()
      .then(() => {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => props.onCredential?.(credential),
        });
        window.google.accounts.id.renderButton(buttonRef, { theme: "outline", size: "large", width: 220 });
      })
      .catch((error) => props.onError?.(error.message));
  });

  return <div ref={buttonRef} class="google-signin-slot" />;
}

function AppLoadingScreen() {
  const [dotCount, setDotCount] = createSignal(1);

  onMount(() => {
    const timer = setInterval(() => setDotCount((count) => count === 3 ? 1 : count + 1), 420);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <div class="app-loading-screen" role="status" aria-live="polite">
      <div class="app-loading-mark">
        <Icon name="logo" size={26} />
      </div>
      <div class="app-loading-copy">
        <div class="app-loading-brand">isaibox</div>
        <div class="app-loading-text">Loading{".".repeat(dotCount())}</div>
      </div>
    </div>
  );
}

export function App() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  let audioEl;

  // Navigation state
  const [tab, setTab] = createSignal("Library");
  const [activePlaylist, setActivePlaylist] = createSignal("rahman");
  const [activeAlbum, setActiveAlbum] = createSignal("");
  const [songSearch, setSongSearch] = createSignal("");
  const [committedSongSearch, setCommittedSongSearch] = createSignal("");
  const [searchResults, setSearchResults] = createSignal(emptySearchResults());
  const [searchPending, setSearchPending] = createSignal(false);
  const [searchResultTab, setSearchResultTab] = createSignal("songs");
  const [playlistSearch, setPlaylistSearch] = createSignal("");
  const [trackSearch, setTrackSearch] = createSignal("");
  const [sort, setSort] = createSignal("n");
  const [filterMode, setFilterMode] = createSignal("all");
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [theme, setTheme] = createSignal(readInitialTheme());
  const [createPlaylistOpen, setCreatePlaylistOpen] = createSignal(false);
  const [newPlaylistName, setNewPlaylistName] = createSignal("");
  const [savingPlaylist, setSavingPlaylist] = createSignal(false);
  const [queueCollapsed, setQueueCollapsed] = createSignal(false);
  const [lyricsOpen, setLyricsOpen] = createSignal(false);
  const [lyricsState, setLyricsState] = createSignal({ status: "idle", loading: false, available: false });
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false);

  // Mobile-specific
  const [mobileView, setMobileView] = createSignal("list"); // list | playlist
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [playerExpanded, setPlayerExpanded] = createSignal(false);
  const [pendingTrackReveal, setPendingTrackReveal] = createSignal(false);

  // Player state
  const [currentN, setCurrentN] = createSignal(0);
  const [isPlaying, setIsPlayingState] = createSignal(false);
  const [audioLoading, setAudioLoading] = createSignal(false);
  const [position, setPosition] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [shuffle, setShuffle] = createSignal(false);
  const [repeat, setRepeat] = createSignal("all");
  const [speed, setSpeed] = createSignal(1);
  const [volume, setVolume] = createSignal(75);
  const [muted, setMuted] = createSignal(false);
  const [favs, setFavs] = createSignal(new Set());
  const [queue, setQueue] = createSignal([]);
  const [playbackScope, setPlaybackScope] = createSignal([]);
  const [playbackSource, setPlaybackSource] = createSignal(null);
  const [recents, setRecents] = createSignal([]);
  const [tracks, setTracks] = createSignal([]);
  const [playlistSections, setPlaylistSections] = createSignal({ global: [], personal: [] });
  const [playlistTrackIds, setPlaylistTrackIds] = createSignal([]);
  const [playlistTracks, setPlaylistTracks] = createSignal([]);
  const [playlistLoading, setPlaylistLoading] = createSignal(false);
  const [playlistDetailState, setPlaylistDetailState] = createSignal("idle");
  const [loading, setLoading] = createSignal(true);
  const [showInitialLoading, setShowInitialLoading] = createSignal(shouldShowInitialLoading());
  const [loadError, setLoadError] = createSignal("");
  const [config, setConfig] = createSignal(null);
  const [user, setUser] = createSignal(null);
  const [message, setMessage] = createSignal("");
  let playbackIntent = false;
  let playbackRequestId = 0;
  let playAttemptId = 0;
  let playWatchTimer = null;
  let searchWorker = null;
  let searchRequestId = 0;
  let lyricsRequestId = 0;
  let lyricsFetchKey = "";

  const setIsPlaying = (nextValue) => {
    let shouldStart = false;
    let requestId = 0;
    setIsPlayingState((current) => {
      const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
      playbackIntent = !!next;
      playbackRequestId += 1;
      requestId = playbackRequestId;
      shouldStart = playbackIntent;
      if (!playbackIntent) {
        setAudioLoading(false);
        audioEl?.pause?.();
      }
      return playbackIntent;
    });
    if (shouldStart) requestAudioPlay(requestId, 2);
    return requestId;
  };

  const ensureAudioSource = (track) => {
    if (!audioEl || !track?.audioUrl) return false;
    const nextSrc = new URL(track.audioUrl, window.location.href).href;
    if (audioEl.src !== nextSrc) {
      setAudioLoading(playbackIntent);
      audioEl.src = nextSrc;
      audioEl.load();
    }
    return true;
  };

  const requestAudioPlay = (requestId, retries = 1) => {
    if (!audioEl || !playbackIntent || requestId !== playbackRequestId) return;
    if (!ensureAudioSource(activeAudioTrack())) return;
    const attemptId = ++playAttemptId;
    setAudioLoading(true);
    if (playWatchTimer) window.clearTimeout(playWatchTimer);
    playWatchTimer = window.setTimeout(() => {
      if (attemptId === playAttemptId && requestId === playbackRequestId && playbackIntent && audioEl?.paused) {
        setAudioLoading(false);
        setIsPlaying(false);
      }
    }, 8000);
    audioEl.play().then(() => {
      if (requestId !== playbackRequestId || !playbackIntent) {
        audioEl.pause();
        return;
      }
      if (attemptId !== playAttemptId) return;
      if (playWatchTimer) window.clearTimeout(playWatchTimer);
      setAudioLoading(false);
    }).catch((error) => {
      if (attemptId !== playAttemptId || requestId !== playbackRequestId) return;
      if (playWatchTimer) window.clearTimeout(playWatchTimer);
      if (error?.name === "AbortError" && playbackIntent && retries > 0) {
        window.setTimeout(() => requestAudioPlay(requestId, retries - 1), 120);
        return;
      }
      setAudioLoading(false);
      setIsPlaying(false);
    });
  };

  onCleanup(() => {
    if (playWatchTimer) window.clearTimeout(playWatchTimer);
  });

  createEffect(() => {
    const text = message();
    if (!text) return;
    const timer = setTimeout(() => setMessage(""), 3200);
    onCleanup(() => clearTimeout(timer));
  });

  createEffect(() => {
    if (loading()) return;
    setShowInitialLoading(false);
    try {
      localStorage.setItem(INITIAL_LOADING_SEEN_KEY, "1");
    } catch {}
  });

  createEffect(() => {
    const value = theme();
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {}
  });

  createEffect(() => {
    const value = songSearch().trim();
    searchRequestId += 1;
    const requestId = searchRequestId;
    if (!value) {
      setCommittedSongSearch("");
      setSearchPending(false);
      setSearchResults(emptySearchResults());
      return;
    }
    setSearchPending(true);
    const timer = window.setTimeout(() => {
      setCommittedSongSearch(value);
      searchWorker?.postMessage({ type: "search", requestId, payload: value });
    }, SEARCH_DEBOUNCE_MS);
    onCleanup(() => window.clearTimeout(timer));
  });

  onMount(() => {
    searchWorker = new Worker(new URL("./search.worker.js", import.meta.url), { type: "module" });
    searchWorker.onmessage = (event) => {
      const { type, requestId, payload } = event.data || {};
      if (type !== "results" || requestId !== searchRequestId) return;
      setSearchResults(payload || emptySearchResults(committedSongSearch().trim()));
      setSearchPending(false);
    };
    if (tracks().length) {
      searchWorker.postMessage({
        type: "index",
        payload: tracks().map((track) => ({
          n: track.n,
          title: track.title,
          movie: track.movie,
          director: track.director,
          singer: track.singer,
          year: track.year,
        })),
      });
    }
    onCleanup(() => {
      searchWorker?.terminate();
      searchWorker = null;
    });
  });

  // Density (held simple — wire up a tweaks panel separately if you want)
  const [density] = createSignal("comfortable");

  const toTrack = (song, index) => {
    const id = String(song?.id || "").trim();
    const title = String(song?.track || song?.title || "").trim();
    if (!id || !title) return null;
    return {
      id,
      n: index + 1,
      title,
      movie: song.movie || "",
      director: song.musicDirector || song.director || "",
      singer: song.singers || song.singer || "",
      year: song.year || "",
      duration: "0:00",
      audioUrl: song.audioUrl || `/api/stream/${id}`,
      albumUrl: song.albumUrl || "",
      updatedAt: song.updatedAt || "",
      fav: favs().has(index + 1),
    };
  };

  const trackMap = createMemo(() => Object.fromEntries(tracks().map((t) => [t.n, { ...t, fav: favs().has(t.n) }])));
  const trackById = createMemo(() => Object.fromEntries(tracks().map((t) => [t.id, { ...t, fav: favs().has(t.n) }])));
  const trackSearchMap = createMemo(() => Object.fromEntries(tracks().map((t) => [t.id, prepareTrackSearch(t)])));
  const activeAudioTrack = createMemo(() => tracks().find((track) => track.n === currentN()) || tracks()[0] || null);
  const isKnownPlaylist = createMemo(() =>
    [...playlistSections().global, ...playlistSections().personal].some((p) => p.id === activePlaylist())
  );
  const activePlaylistMeta = createMemo(() =>
    [...playlistSections().global, ...playlistSections().personal].find((p) => p.id === activePlaylist()) || null
  );
  const activeAlbumTracks = createMemo(() => {
    const album = activeAlbum();
    if (!album) return [];
    return tracks().filter((track) => track.movie === album);
  });
  const albumPlaybackSource = (name) => name ? { type: "album", label: name, caption: "Album" } : null;
  const playlistPlaybackSource = (playlist) => playlist ? {
    type: "playlist",
    id: playlist.id,
    label: playlist.name,
    caption: "Playlist",
  } : null;
  const searchPlaybackSource = (query) => query ? {
    type: "search",
    query,
    label: query,
    caption: "Search",
  } : null;
  const playbackSourceForCurrentView = () => {
    const query = committedSongSearch().trim() || songSearch().trim();
    if (activeAlbum()) return albumPlaybackSource(activeAlbum());
    if (query) return searchPlaybackSource(query);
    return playlistPlaybackSource(activePlaylistMeta()) || { type: "library", label: "Library", caption: "Library" };
  };
  createEffect(() => {
    if (!searchWorker) return;
    searchWorker.postMessage({
      type: "index",
      payload: tracks().map((track) => ({
        n: track.n,
        title: track.title,
        movie: track.movie,
        director: track.director,
        singer: track.singer,
        year: track.year,
      })),
    });
  });
  const currentTrack = createMemo(() => {
    const track = activeAudioTrack();
    if (!track) return null;
    return {
      ...track,
      duration: duration() > 0 ? fmtTime(duration()) : (track.duration || "0:00"),
      fav: favs().has(track.n),
    };
  });

  const loadLyrics = async (options = {}) => {
    const track = activeAudioTrack();
    if (!track?.id) return;
    const roundedDuration = Math.round(Number(duration()) || 0);
    const requestId = ++lyricsRequestId;
    setLyricsState((current) => ({
      ...current,
      songId: track.id,
      status: current.songId === track.id ? current.status : "loading",
      loading: true,
    }));
    const params = new URLSearchParams();
    if (roundedDuration > 0) params.set("duration", String(roundedDuration));
    if (options.force) params.set("refresh", "1");
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`/api/lyrics/${track.id}${suffix}`, { cache: "no-store" }).catch(() => null);
    if (requestId !== lyricsRequestId) return;
    if (!response?.ok) {
      setLyricsState({ songId: track.id, status: "error", loading: false, available: false, error: "Unable to load lyrics" });
      return;
    }
    const payload = await response.json().catch(() => null);
    setLyricsState({ songId: track.id, ...(payload?.lyrics || {}), loading: false });
  };

  const refreshLyrics = () => loadLyrics({ force: true });

  createEffect(() => {
    const track = activeAudioTrack();
    if (!track?.id) {
      setLyricsState({ status: "idle", loading: false, available: false });
      lyricsFetchKey = "";
      return;
    }
    const roundedDuration = Math.round(Number(duration()) || 0);
    const key = `${track.id}:${roundedDuration > 0 ? roundedDuration : 0}`;
    const currentLyrics = lyricsState();
    if (lyricsFetchKey === key) return;
    if (lyricsFetchKey.startsWith(`${track.id}:`) && roundedDuration === 0) return;
    if (lyricsFetchKey.startsWith(`${track.id}:`) && currentLyrics.available) return;
    lyricsFetchKey = key;
    loadLyrics({ force: roundedDuration > 0 && currentLyrics.songId === track.id && !currentLyrics.available });
  });

  const filteredTracks = createMemo(() => {
    const hasPlaylistSections = playlistSections().global.length > 0 || playlistSections().personal.length > 0;
    const rawQuery = committedSongSearch().trim();
    const scopedQuery = rawQuery ? "" : trackSearch().trim();
    if (rawQuery) {
      const results = searchResults();
      if (results.query !== rawQuery || searchPending()) return [];
      const byN = trackMap();
      return results.songs
        .map((result) => {
          const track = byN[result.n];
          return track ? { ...track, _matchLabel: result.matchLabel, _matchValue: result.matchValue } : null;
        })
        .filter(Boolean);
    }
    const source = rawQuery
      ? tracks()
      : activeAlbum()
      ? activeAlbumTracks()
      : isKnownPlaylist()
      ? playlistTracks()
      : (!loading() && !hasPlaylistSections ? tracks() : []);
    const searchMap = trackSearchMap();
    let arr = source.map((t) => ({ ...t, fav: favs().has(t.n), _search: searchMap[t.id] }));
    if (scopedQuery) {
      const activeQuery = prepareSearchQuery(scopedQuery);
      arr = arr
        .map((track, index) => ({ track, index, match: getTrackSearchMatch(track, activeQuery) }))
        .filter((entry) => entry.match !== null)
        .sort((a, b) => a.match.score - b.match.score || a.index - b.index)
        .map((entry) => ({
          ...entry.track,
          _matchLabel: entry.match.label,
          _matchValue: entry.match.value,
        }));
    }
    if (filterMode() === "recent") {
      arr = [...arr].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    } else if (filterMode() === "played") {
      const rank = new Map(recents().map((item, index) => [item.n, index]));
      arr = arr.filter((track) => rank.has(track.n)).sort((a, b) => rank.get(a.n) - rank.get(b.n));
    }
    if (scopedQuery && sort() === "n") return arr;
    arr.sort((a, b) => {
      if (filterMode() !== "all" && sort() === "n") return 0;
      if (sort() === "title") return a.title.localeCompare(b.title);
      if (sort() === "year") return b.year - a.year;
      if (sort() === "duration") return parseDur(b.duration) - parseDur(a.duration);
      return a.n - b.n;
    });
    return arr;
  });

  const searchAlbumResults = createMemo(() => {
    const rawQuery = committedSongSearch().trim();
    const results = searchResults();
    if (!rawQuery || results.query !== rawQuery || searchPending()) return [];
    const byN = trackMap();
    return results.albums.map((album) => ({
      ...album,
      tracks: (album.trackNs || []).map((n) => byN[n]).filter(Boolean),
    }));
  });

  const searchPeopleResultsFor = (label) => {
    const rawQuery = committedSongSearch().trim();
    const results = searchResults();
    if (!rawQuery || results.query !== rawQuery || searchPending()) return [];
    return label === "Music director" ? results.directors : results.singers;
  };

  const searchDirectorResults = createMemo(() => searchPeopleResultsFor("Music director"));
  const searchSingerResults = createMemo(() => searchPeopleResultsFor("Singer"));

  const searchResultCounts = createMemo(() => ({
    albums: committedSongSearch().trim() && !searchPending() ? searchResults().counts.albums : searchAlbumResults().length,
    songs: committedSongSearch().trim() && !searchPending() ? searchResults().counts.songs : filteredTracks().length,
    directors: committedSongSearch().trim() && !searchPending() ? searchResults().counts.directors : searchDirectorResults().length,
    singers: committedSongSearch().trim() && !searchPending() ? searchResults().counts.singers : searchSingerResults().length,
  }));

  const addToRecents = (n) => {
    setRecents((r) => [{ n, when: "just now" }, ...r.filter((x) => x.n !== n)].slice(0, 30));
  };

  const applyPlaylistPayload = (payload) => {
    const global = (payload.globalPlaylists || []).map((p) => ({
      id: p.id,
      name: p.name,
      count: p.trackCount || 0,
      source: p.source || "global",
    }));
    const personal = (payload.playlists || []).map((p) => ({
      id: p.id,
      name: p.name,
      count: p.trackCount || 0,
      source: "personal",
    }));
    setPlaylistSections({ global, personal });
    if ((global.length || personal.length) && !activePlaylistMeta()) {
      setActivePlaylist((global[0] || personal[0])?.id || "library");
    }
  };

  const refreshSession = async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return null;
    const payload = await response.json();
    setUser(payload.user || null);
    return payload.user || null;
  };

  const refreshPlaylists = async () => {
    const response = await fetch("/api/playlists", { cache: "no-store" }).catch(() => null);
    if (response?.ok) applyPlaylistPayload(await response.json());
  };

  const refreshFavorites = async () => {
    if (!user()) {
      setFavs(new Set());
      return;
    }
    const response = await fetch("/api/favorites", { cache: "no-store" }).catch(() => null);
    const payload = response?.ok ? await response.json() : null;
    const byId = Object.fromEntries(tracks().map((track) => [track.id, track.n]));
    setFavs(new Set((payload?.favoriteSongIds || []).map((id) => byId[id]).filter(Boolean)));
  };

  onMount(async () => {
    try {
      setLoading(true);
      const [configResponse, sessionResponse, libraryResponse, playlistsResponse] = await Promise.all([
        fetch("/api/config", { cache: "no-store" }).catch(() => null),
        fetch("/api/auth/session", { cache: "no-store" }).catch(() => null),
        fetch("/api/library", { cache: "no-store" }),
        fetch("/api/playlists", { cache: "no-store" }).catch(() => null),
      ]);
      if (configResponse?.ok) {
        setConfig(await configResponse.json());
      }
      let sessionUser = null;
      if (sessionResponse?.ok) {
        const sessionPayload = await sessionResponse.json();
        sessionUser = sessionPayload.user || null;
        setUser(sessionUser);
      }
      if (!libraryResponse.ok) {
        throw new Error("Unable to load library");
      }
      const libraryPayload = await libraryResponse.json();
      const nextTracks = (libraryPayload.songs || []).map(toTrack).filter(Boolean);
      setTracks(nextTracks);
      if (nextTracks.length) {
        const sharedTrackId = new URLSearchParams(window.location.search).get("track");
        const sharedTrack = sharedTrackId ? nextTracks.find((track) => track.id === sharedTrackId) : null;
        setCurrentN((sharedTrack || nextTracks[0]).n);
        setRecents([]);
        setQueue([]);
      }
      if (playlistsResponse?.ok) {
        const payload = await playlistsResponse.json();
        if (sessionUser) {
          const favoritesResponse = await fetch("/api/favorites", { cache: "no-store" }).catch(() => null);
          const favoritesPayload = favoritesResponse?.ok ? await favoritesResponse.json() : null;
          const byId = Object.fromEntries(nextTracks.map((track) => [track.id, track.n]));
          setFavs(new Set((favoritesPayload?.favoriteSongIds || []).map((id) => byId[id]).filter(Boolean)));
        }
        applyPlaylistPayload(payload);
      }
    } catch (error) {
      setLoadError(error?.message || "Unable to load library");
    } finally {
      setLoading(false);
    }
  });

  createEffect(() => {
    const playlistId = activePlaylist();
    const known = [...playlistSections().global, ...playlistSections().personal].some((p) => p.id === playlistId);
    if (!playlistId || !known) {
      setPlaylistTrackIds([]);
      setPlaylistTracks([]);
      setPlaylistDetailState("idle");
      return;
    }
    let cancelled = false;
    setPlaylistLoading(true);
    setPlaylistDetailState("loading");
    setPlaylistTrackIds([]);
    setPlaylistTracks([]);
    fetch(`/api/playlists/${playlistId}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load playlist")))
      .then((payload) => {
        if (cancelled) return;
        const playlistSongs = payload.playlist?.tracks || [];
        const currentById = Object.fromEntries(tracks().map((track) => [track.id, track]));
        const resolvedPlaylistTracks = playlistSongs
          .map((song, index) => currentById[song.id] || toTrack(song, tracks().length + index))
          .filter(Boolean);
        setTracks((current) => {
          const byId = new Map(current.map((track) => [track.id, track]));
          let nextIndex = current.length;
          const additions = [];
          for (const song of playlistSongs) {
            if (!song?.id || byId.has(song.id)) continue;
            const converted = toTrack(song, nextIndex);
            if (!converted) continue;
            nextIndex += 1;
            byId.set(song.id, converted);
            additions.push(converted);
          }
          return additions.length ? [...current, ...additions] : current;
        });
        const ids = playlistSongs.map((song) => song.id).filter(Boolean);
        setPlaylistTrackIds(ids);
        setPlaylistTracks(resolvedPlaylistTracks);
        setPlaylistDetailState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setPlaylistTrackIds([]);
          setPlaylistTracks([]);
          setPlaylistDetailState("error");
        }
      })
      .finally(() => {
        if (!cancelled) setPlaylistLoading(false);
      });
    onCleanup(() => {
      cancelled = true;
    });
  });

  const playTrack = (n, source) => {
    const visibleTracks = filteredTracks();
    const nextSource = source || playbackSourceForCurrentView();
    if (visibleTracks.some((track) => track.n === n)) {
      setPlaybackScope(visibleTracks.map((track) => track.n));
      setPlaybackSource(nextSource);
    } else if (!playbackScope().includes(n)) {
      setPlaybackScope([n]);
      setPlaybackSource(nextSource);
    }
    if (n === currentN()) {
      setIsPlaying((p) => !p);
    } else {
      setCurrentN(n);
      setPosition(0);
      setDuration(0);
      setQueue([]);
      setIsPlaying(true);
      addToRecents(n);
    }
  };

  const selectPlaylist = (id) => {
    setActiveAlbum("");
    setSongSearch("");
    setTrackSearch("");
    setActivePlaylist(id);
    setMobileView("playlist");
  };

  const closeAlbum = () => {
    setActiveAlbum("");
    setSongSearch("");
    setTrackSearch("");
    setMobileView("playlist");
  };

  const openAlbum = (album, options = {}) => {
    const name = String(album || "").trim();
    if (!name) return;
    setSongSearch("");
    setTrackSearch("");
    setActiveAlbum(name);
    setTab("Library");
    setMobileView("album");
    setPlayerExpanded(false);
    if (options.play) {
      const albumTracks = tracks().filter((track) => track.movie === name);
      playPlaylist(albumTracks, albumPlaybackSource(name));
    }
  };

  const playPlaylist = (tracks, source) => {
    if (!tracks.length) return;
    const trackIds = tracks.map((track) => track.n).filter(Boolean);
    const firstTrack = shuffle() && tracks.length > 1
      ? tracks[Math.floor(Math.random() * tracks.length)]
      : tracks[0];
    setPlaybackScope(trackIds);
    setPlaybackSource(source || playbackSourceForCurrentView());
    setCurrentN(firstTrack.n);
    setPosition(0);
    setDuration(0);
    setIsPlaying(true);
    setQueue([]);
    addToRecents(firstTrack.n);
  };

  const playbackList = () => {
    const scope = playbackScope();
    const byN = trackMap();
    const scopedTracks = scope.map((n) => byN[n]).filter(Boolean);
    if (scopedTracks.length) return scopedTracks;
    return filteredTracks().length ? filteredTracks() : tracks();
  };
  const revealCurrentTrack = () => {
    const n = currentN();
    if (!n) return false;
    const row = document.querySelector(`[data-track-n="${n}"]`);
    if (!row) return false;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.add("reveal-current");
    window.setTimeout(() => row.classList.remove("reveal-current"), 1300);
    return true;
  };
  const openPlaybackSource = () => {
    const source = playbackSource();
    if (!source) return;
    setPendingTrackReveal(true);
    setTab("Library");
    setPlayerExpanded(false);
    setSearchOpen(false);
    if (source.type === "playlist" && source.id) {
      selectPlaylist(source.id);
      return;
    }
    if (source.type === "album" && source.label) {
      openAlbum(source.label);
      return;
    }
    if (source.type === "search" && source.query) {
      setActiveAlbum("");
      setTrackSearch("");
      setSongSearch(source.query);
      setMobileView("playlist");
      return;
    }
    setActiveAlbum("");
    setSongSearch("");
    setTrackSearch("");
    setMobileView("playlist");
  };
  createEffect(() => {
    if (!pendingTrackReveal()) return;
    currentN();
    tab();
    mobileView();
    activePlaylist();
    activeAlbum();
    committedSongSearch();
    filteredTracks().length;
    if (loading() || playlistLoading() || searchPending()) return;
    const attemptReveal = (attempt = 0) => requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (revealCurrentTrack()) {
          setPendingTrackReveal(false);
        } else if (attempt < 8) {
          window.setTimeout(() => attemptReveal(attempt + 1), 120);
        }
      });
    });
    attemptReveal();
  });
  const switchToTrack = (n, shouldPlay = isPlaying()) => {
    if (!n) return;
    setCurrentN(n);
    setPosition(0);
    setDuration(0);
    setIsPlaying(shouldPlay);
    addToRecents(n);
  };

  const handleNext = (fromEnded = false) => {
    if (fromEnded && repeat() === "off" && queue().length === 0) {
      const list = playbackList();
      const idx = list.findIndex((t) => t.n === currentN());
      if (idx >= list.length - 1) {
        setIsPlaying(false);
        seekTo(0);
        return;
      }
    }
    if (queue().length > 0) {
      const [nextN, ...rest] = queue();
      setQueue(rest);
      switchToTrack(nextN, fromEnded ? true : isPlaying());
      return;
    }
    const list = playbackList();
    if (list.length === 0) return;
    if (shuffle() && list.length > 1) {
      const candidates = list.filter((t) => t.n !== currentN());
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      switchToTrack(next?.n, fromEnded ? true : isPlaying());
      return;
    }
    const idx = list.findIndex((t) => t.n === currentN());
    const nextIndex = idx + 1;
    const next = nextIndex < list.length ? list[nextIndex] : (repeat() === "all" ? list[0] : null);
    if (!next) return;
    switchToTrack(next.n, fromEnded ? true : isPlaying());
  };

  const handlePrev = () => {
    if (position() > 3) { setPosition(0); return; }
    const list = playbackList();
    if (list.length === 0) return;
    const idx = list.findIndex((t) => t.n === currentN());
    if (shuffle() && list.length > 1) {
      const candidates = list.filter((t) => t.n !== currentN());
      const prev = candidates[Math.floor(Math.random() * candidates.length)];
      switchToTrack(prev?.n);
      return;
    }
    const prev = idx > 0 ? list[idx - 1] : (repeat() === "all" ? list[list.length - 1] : null);
    if (!prev) return;
    switchToTrack(prev.n);
  };

  const cycleRepeat = () =>
    setRepeat(repeat() === "off" ? "all" : repeat() === "all" ? "one" : "off");
  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(speed());
    setSpeed(speeds[(currentIndex + 1) % speeds.length]);
  };

  const toggleFav = async (n) => {
    const track = trackMap()[n];
    if (!track?.id) return;
    if (!user()) {
      setMessage(config()?.localMode ? "Favorites are unavailable until local profile support is mapped." : "Sign in to save favorites.");
      return;
    }
    const nextFav = !favs().has(n);
    setFavs((s) => {
      const next = new Set(s);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
    const response = await fetch(`/api/favorites/${track.id}`, { method: nextFav ? "POST" : "DELETE" }).catch(() => null);
    if (!response?.ok) {
      setFavs((s) => {
        const next = new Set(s);
        nextFav ? next.delete(n) : next.add(n);
        return next;
      });
      setMessage("Unable to update favorites.");
    }
  };

  const handleGoogleCredential = async (credential) => {
    if (!credential) return;
    setMessage("");
    const response = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    }).catch(() => null);
    if (!response?.ok) {
      const payload = await response?.json().catch(() => null);
      setMessage(payload?.message || "Sign in failed.");
      return;
    }
    await refreshSession();
    await refreshPlaylists();
    await refreshFavorites();
    setSettingsOpen(false);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setFavs(new Set());
    await refreshPlaylists();
    setSettingsOpen(false);
  };

  const openCreatePlaylist = () => {
    if (!user()) {
      setMessage(config()?.localMode ? "Personal playlists are disabled in local mode." : "Sign in to create playlists.");
      return;
    }
    setNewPlaylistName("");
    setCreatePlaylistOpen(true);
  };

  const createPlaylist = async (event) => {
    event?.preventDefault();
    const name = newPlaylistName().trim();
    if (!name || savingPlaylist()) return;
    setSavingPlaylist(true);
    const response = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setSavingPlaylist(false);
    const payload = await response?.json().catch(() => null);
    if (!response?.ok || !payload?.playlist) {
      setMessage(payload?.message || "Unable to create playlist.");
      return;
    }
    await refreshPlaylists();
    setActivePlaylist(payload.playlist.id);
    setCreatePlaylistOpen(false);
    setTab("Library");
  };

  const addToActivePlaylist = async (n) => {
    const track = trackMap()[n];
    const playlist = activePlaylistMeta();
    if (!track?.id) return;
    if (!user()) {
      setMessage(config()?.localMode ? "Personal playlists are disabled in local mode." : "Sign in to save tracks to playlists.");
      return;
    }
    if (!playlist || playlist.source !== "personal") {
      setMessage("Select a personal playlist before saving tracks.");
      return;
    }
    const response = await fetch(`/api/playlists/${playlist.id}/songs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: track.id }),
    }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    if (!response?.ok) {
      setMessage(payload?.message || "Unable to save track to playlist.");
      return;
    }
    await refreshPlaylists();
    setPlaylistTrackIds((ids) => ids.includes(track.id) ? ids : [...ids, track.id]);
    setMessage(payload?.alreadyExists ? "Track is already in this playlist." : "Track saved to playlist.");
  };

  const shareTrack = async (track) => {
    if (!track) return;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set("track", track.id);
    const text = `${track.title}${track.singer ? ` - ${track.singer}` : ""}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: track.title, text, url: url.toString() });
        setMessage("Share sheet opened.");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    const copied = await copyTextToClipboard(url.toString());
    setMessage(copied ? "Track link copied." : "Unable to copy track link.");
  };

  const changeTab = (nextTab) => {
    setTab(nextTab);
    if (nextTab !== "Library") {
      setSongSearch("");
      setTrackSearch("");
      setActiveAlbum("");
    }
  };

  const updateSongSearch = (value) => {
    const hadSearch = !!songSearch().trim();
    setSongSearch(value);
    if (String(value || "").trim()) {
      if (!hadSearch) setSearchResultTab("songs");
      setTrackSearch("");
      setTab("Library");
      setActiveAlbum("");
      setMobileView("playlist");
    } else if (hadSearch && isMobile()) {
      setTrackSearch("");
      setMobileView("list");
    }
  };

  const openSearchPersonAlbums = (name) => {
    const value = String(name || "").trim();
    if (!value) return;
    setSongSearch(value);
    setSearchResultTab("albums");
    setTab("Library");
    setActiveAlbum("");
    setTrackSearch("");
    setMobileView("playlist");
  };

  const removeFromQueue = (idx) => setQueue((q) => q.filter((_, i) => i !== idx));
  const clearQueue = () => setQueue([]);
  const addToQueue = (n) => {
    if (!n) return;
    setQueue((q) => q.includes(n) ? q : [...q, n]);
  };

  const targetAcceptsText = (target) => {
    const tag = target?.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
  };

  onMount(() => {
    const onKeyDown = (event) => {
      if (isMobile()) return;
      const key = event.key.toLowerCase();

      if (key === "escape") {
        setSettingsOpen(false);
        setCreatePlaylistOpen(false);
        setShortcutsOpen(false);
        return;
      }

      if (targetAcceptsText(event.target)) {
        if (key === "escape") event.target.blur?.();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        document.querySelector(".search input")?.focus();
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
        setSettingsOpen(false);
        setCreatePlaylistOpen(false);
        return;
      }

      if (event.key === ",") {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        setShortcutsOpen(false);
        setCreatePlaylistOpen(false);
        return;
      }

      if (settingsOpen() || shortcutsOpen() || createPlaylistOpen()) return;

      if (event.code === "Space" || key === "k") {
        event.preventDefault();
        setIsPlaying((playing) => !playing);
      } else if (key === "j" || event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrev();
      } else if (key === "l" || event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      } else if (key === "s") {
        setShuffle((value) => !value);
      } else if (key === "r") {
        cycleRepeat();
      } else if (key === "m") {
        setMuted((value) => !value);
      } else if (key === "q") {
        setQueueCollapsed((value) => !value);
      } else if (key === "f" && currentN()) {
        toggleFav(currentN());
      } else if ((event.key === "+" || event.key === "=") && currentN()) {
        addToQueue(currentN());
        setQueueCollapsed(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  onMount(() => {
    if (!("mediaSession" in navigator)) return;
    const setHandler = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };
    setHandler("play", () => setIsPlaying(true));
    setHandler("pause", () => setIsPlaying(false));
    setHandler("previoustrack", () => handlePrev());
    setHandler("nexttrack", () => handleNext());
    setHandler("seekbackward", (details) => seekTo(position() - (details.seekOffset || 10)));
    setHandler("seekforward", (details) => seekTo(position() + (details.seekOffset || 10)));
    setHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seekTo(details.seekTime);
    });
    onCleanup(() => {
      ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"].forEach((action) => {
        setHandler(action, null);
      });
    });
  });

  const seekTo = (nextPosition) => {
    const safePosition = Math.max(0, Number(nextPosition) || 0);
    setPosition(safePosition);
    if (audioEl && Number.isFinite(safePosition)) {
      audioEl.currentTime = safePosition;
    }
  };

  createEffect(() => {
    if (!audioEl) return;
    audioEl.volume = Math.max(0, Math.min(1, volume() / 100));
    audioEl.muted = muted();
    audioEl.playbackRate = speed();
  });

  createEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const track = currentTrack();
    navigator.mediaSession.playbackState = isPlaying() ? "playing" : "paused";
    if (track) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || "isaibox",
        artist: track.singer || "",
        album: track.movie || "",
      });
    }
    if ("setPositionState" in navigator.mediaSession) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, Number(duration()) || parseDur(track?.duration || "0:00")),
          playbackRate: speed(),
          position: Math.max(0, Number(position()) || 0),
        });
      } catch {}
    }
  });

  createEffect(() => {
    const track = activeAudioTrack();
    if (!audioEl || !track?.audioUrl) return;
    ensureAudioSource(track);
    if (!isPlaying()) {
      playAttemptId += 1;
      setAudioLoading(false);
      audioEl.pause();
    }
  });

  // Reset mobileView when switching tabs
  createEffect(() => {
    if (tab() !== "Library") setMobileView("list");
  });

  createEffect(() => {
    if (isMobile() && tab() === "Library" && mobileView() !== "list" && !songSearch().trim()) {
      setSearchOpen(false);
    }
  });

  // Shared context handed to every page — accessors + action fns
  const ctx = {
    // accessors
    tab, setTab: changeTab,
    activePlaylist, setActivePlaylist: selectPlaylist,
    activeAlbum,
    songSearch, setSongSearch: updateSongSearch,
    searchResultTab, setSearchResultTab,
    playlistSearch, setPlaylistSearch,
    trackSearch, setTrackSearch,
    sort, setSort,
    filterMode, setFilterMode,
    density,
    currentN, isPlaying, audioLoading,
    shuffle, setShuffle,
    repeat,
    speed, cycleSpeed,
    queue, recents, favs,
    tracks,
    trackMap,
    trackById,
    playlistSections,
    activePlaylistMeta,
    activeAlbumTracks,
    playlistTracks,
    playlistLoading,
    playlistDetailState,
    user,
    message,
    loading,
    loadError,
    queueCollapsed,
    setQueueCollapsed,
    lyricsOpen,
    setLyricsOpen,
    lyricsState,
    refreshLyrics,
    mobileView, setMobileView,
    currentTrack,
    position,
    filteredTracks,
    searchPending,
    searchAlbumResults,
    searchDirectorResults,
    searchSingerResults,
    searchResultCounts,
    // actions
    playTrack, playPlaylist, toggleFav, addToQueue, addToActivePlaylist, removeFromQueue, clearQueue, openAlbum, closeAlbum, openSearchPersonAlbums,
  };

  return (
    <div
      class="app"
      classList={{
        "is-mobile": isMobile(),
        "is-desktop": !isMobile(),
      }}
      attr:data-density={density()}
      attr:data-theme={theme()}
    >
      <Show when={showInitialLoading() && loading() && tracks().length === 0}>
        <AppLoadingScreen />
      </Show>
      <Show
        when={isMobile()}
        fallback={
          <>
            <TopBar
              tab={tab()}
              setTab={changeTab}
              search={songSearch()}
              setSearch={updateSongSearch}
              searchPlaceholder="Search songs, albums, directors..."
			              settingsOpen={settingsOpen()}
			              shortcutsOpen={shortcutsOpen()}
	              setSettingsOpen={setSettingsOpen}
	              setShortcutsOpen={setShortcutsOpen}
	            />
            <main
              class="main"
              classList={{
                "with-library-sidebar": tab() === "Library",
                "queue-collapsed": queueCollapsed(),
              }}
            >
              <Show when={tab() === "Library"}>
                <Sidebar
                  active={activePlaylist()}
                  setActive={selectPlaylist}
                  setTab={changeTab}
                  playlistSections={playlistSections()}
                  playlistSearch={playlistSearch()}
                  setPlaylistSearch={setPlaylistSearch}
                  loading={loading()}
                  onCreatePlaylist={openCreatePlaylist}
                />
              </Show>
              <section class="content" classList={{ "no-sidebar": tab() !== "Library" }}>
	                <Switch>
	                  <Match when={tab() === "Library"}><LibraryPage ctx={ctx} /></Match>
	                  <Match when={tab() === "Recents"}><RecentsPage ctx={ctx} /></Match>
	                  <Match when={tab() === "Favorites"}><FavoritesPage ctx={ctx} /></Match>
	                </Switch>
              </section>
              <Show when={lyricsOpen()} fallback={<QueuePanel ctx={ctx} />}>
                <LyricsPanel ctx={ctx} />
              </Show>
            </main>
            <Show
              when={currentTrack()}
              fallback={
                <footer class="dock dock-loading" aria-label="Loading player">
                  <div class="dock-grid">
                    <div class="dock-left">
                      <div class="dock-meta">
                        <div class="dock-song">{loading() ? "Loading..." : (loadError() || "No tracks available")}</div>
                        <div class="dock-sub">isaibox</div>
                      </div>
                    </div>
                    <div class="dock-center">
                      <div class="dock-transport">
                        <button class="tr-btn" disabled><Icon name="prev" size={17} /></button>
                        <button class="tr-play loading" disabled><Icon name="spinner" size={17} /></button>
                        <button class="tr-btn" disabled><Icon name="next" size={17} /></button>
                      </div>
                      <div class="dock-scrub-row">
                        <span class="dock-time mono">0:00</span>
                        <div class="dock-empty-scrub" />
                        <span class="dock-time mono">0:00</span>
                      </div>
                    </div>
                    <div class="dock-right">
                      <Icon name="spinner" size={16} />
                    </div>
                  </div>
                </footer>
              }
            >
              {(track) => (
                <NowPlayingDock
                  track={track()}
                  isPlaying={isPlaying()}
                  audioLoading={audioLoading()}
                  setIsPlaying={setIsPlaying}
                  position={position()}
                  duration={duration()}
                  setPosition={seekTo}
                  playbackSource={playbackSource()}
                  onOpenPlaybackSource={openPlaybackSource}
                  onPrev={handlePrev}
                  onNext={handleNext}
                  shuffle={shuffle()}
                  setShuffle={setShuffle}
                  repeat={repeat()}
                  cycleRepeat={cycleRepeat}
                  speed={speed()}
                  cycleSpeed={cycleSpeed}
                  volume={volume()}
                  setVolume={setVolume}
                  muted={muted()}
                  setMuted={setMuted}
                  onFav={() => toggleFav(track().n)}
                  onAddToQueue={() => addToQueue(track().n)}
                  onSaveToPlaylist={() => addToActivePlaylist(track().n)}
                  onShare={() => shareTrack(track())}
                  lyricsState={lyricsState()}
                  onToggleLyrics={() => { setLyricsOpen((value) => !value); setQueueCollapsed(false); }}
                  onOpenAlbum={() => openAlbum(track().movie)}
                  queueCollapsed={queueCollapsed()}
                  onToggleQueue={() => setQueueCollapsed((value) => !value)}
                />
              )}
            </Show>
            <ShortcutsDrawer open={shortcutsOpen()} setOpen={setShortcutsOpen} />
          </>
        }
      >
        <MobileHeader
          search={songSearch()}
          setSearch={updateSongSearch}
          searchPlaceholder="Search songs, albums, directors..."
          searchOpen={searchOpen()}
          setSearchOpen={setSearchOpen}
          settingsOpen={settingsOpen()}
          setSettingsOpen={setSettingsOpen}
        />
        <main class="m-main">
          <Switch>
            <Match when={tab() === "Library"}>
              <Show
                when={mobileView() !== "list"}
                fallback={<MobileLibraryPage ctx={ctx} />}
              >
                <MobilePlaylistDetail ctx={ctx} />
              </Show>
            </Match>
	            <Match when={tab() === "Recents"}><RecentsPage ctx={ctx} /></Match>
            <Match when={tab() === "Favorites"}><FavoritesPage ctx={ctx} /></Match>
          </Switch>
        </main>
        <Show
          when={currentTrack()}
          fallback={
            <div class="mini-player">
              <div class="mini-content">
                <div class="mini-meta">
                  <div class="mini-title mini-title-loading">
                    <Show when={loading()}>
                      <Icon name="spinner" size={15} />
                    </Show>
                    <span>{loading() ? "Loading..." : (loadError() || "No tracks available")}</span>
                  </div>
                  <div class="mini-sub">isaibox</div>
                </div>
              </div>
            </div>
          }
        >
          {(track) => (
            <MiniPlayer
              track={track()}
              isPlaying={isPlaying()}
              audioLoading={audioLoading()}
              playbackSource={playbackSource()}
              setIsPlaying={setIsPlaying}
              position={position()}
              duration={duration()}
              onNext={handleNext}
              onOpenPlaybackSource={openPlaybackSource}
              onExpand={() => setPlayerExpanded(true)}
            />
          )}
        </Show>
        <MobileBottomTabs
          tab={tab()}
          setTab={(t) => { changeTab(t); setSearchOpen(false); }}
        />
        <div class="fp-wrap" classList={{ open: playerExpanded() }}>
          <Show when={currentTrack()}>
            {(track) => (
              <FullPlayer
                track={track()}
                isPlaying={isPlaying()}
                audioLoading={audioLoading()}
                setIsPlaying={setIsPlaying}
                position={position()}
                duration={duration()}
                setPosition={seekTo}
                playbackSource={playbackSource()}
                onOpenPlaybackSource={openPlaybackSource}
                onPrev={handlePrev}
                onNext={handleNext}
                shuffle={shuffle()}
                setShuffle={setShuffle}
                repeat={repeat()}
                cycleRepeat={cycleRepeat}
                speed={speed()}
                cycleSpeed={cycleSpeed}
                onFav={() => toggleFav(track().n)}
                onAddToQueue={() => addToQueue(track().n)}
                onSaveToPlaylist={() => addToActivePlaylist(track().n)}
                onShare={() => shareTrack(track())}
                lyricsState={lyricsState()}
                onToggleLyrics={() => setLyricsOpen(true)}
                onOpenAlbum={() => openAlbum(track().movie)}
                onCollapse={() => setPlayerExpanded(false)}
              />
            )}
          </Show>
        </div>
        <Show when={lyricsOpen()}>
          <div class="lyrics-mobile-backdrop" onClick={() => setLyricsOpen(false)}>
            <section class="lyrics-mobile-sheet" onClick={(event) => event.stopPropagation()}>
              <LyricsPanel ctx={ctx} mobile />
            </section>
          </div>
        </Show>
      </Show>
      <audio
        ref={audioEl}
        preload="metadata"
        onLoadStart={() => {
          if (isPlaying()) setAudioLoading(true);
        }}
        onLoadedMetadata={() => setDuration(Number.isFinite(audioEl.duration) ? audioEl.duration : 0)}
        onCanPlay={() => setAudioLoading(false)}
        onWaiting={() => {
          if (isPlaying()) setAudioLoading(true);
        }}
        onStalled={() => {
          if (isPlaying()) setAudioLoading(true);
        }}
        onTimeUpdate={() => setPosition(audioEl.currentTime || 0)}
        onEnded={() => {
          if (repeat() === "one") {
            seekTo(0);
            audioEl.play().catch(() => setIsPlaying(false));
          } else {
            handleNext(true);
          }
        }}
        onPlay={() => {
          if (!playbackIntent) {
            audioEl.pause();
            return;
          }
          setIsPlayingState(true);
        }}
        onPlaying={() => {
          if (!playbackIntent) {
            audioEl.pause();
            return;
          }
          if (playWatchTimer) window.clearTimeout(playWatchTimer);
          setAudioLoading(false);
        }}
        onPause={() => {
          if (playbackIntent) {
            return;
          }
          setIsPlayingState(false);
          setAudioLoading(false);
        }}
        onError={() => {
          if (playWatchTimer) window.clearTimeout(playWatchTimer);
          setAudioLoading(false);
          setIsPlaying(false);
        }}
      />
      <Show when={message()}>
        <div class="app-toast">{message()}</div>
      </Show>
      <Show when={settingsOpen()}>
        <div class="sheet-backdrop" onClick={() => setSettingsOpen(false)}>
          <section class="settings-sheet" onClick={(event) => event.stopPropagation()}>
            <div class="sheet-head">
              <div>
                <div class="sheet-kicker">Account</div>
                <h2 class="sheet-title">Settings</h2>
              </div>
              <button class="icon-btn" onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <div class="sheet-block">
              <div class="sheet-label">Appearance</div>
              <div class="settings-field">
                <span>Theme</span>
                <MenuSelect
                  label="Theme"
                  value={theme()}
                  onChange={setTheme}
                  options={[
                    { value: "dark", label: "Dark" },
                    { value: "light", label: "Light" },
                  ]}
                />
              </div>
            </div>
            <Show
              when={user()}
              fallback={
                <div class="sheet-block">
                  <div class="sheet-label">Sign in</div>
                  <Show
                    when={config()?.googleClientId}
                    fallback={<p class="sheet-copy">{config()?.localMode ? "Authentication is disabled in local mode." : "Google sign-in is not configured on the backend."}</p>}
                  >
                    <GoogleSignInButton
                      clientId={() => config()?.googleClientId}
                      onCredential={handleGoogleCredential}
                      onError={setMessage}
                    />
                  </Show>
                </div>
              }
            >
              {(currentUser) => (
                <div class="sheet-block">
                  <div class="sheet-label">Signed in</div>
                  <div class="sheet-copy">{currentUser().name || currentUser().email}</div>
                  <button class="btn-ghost wide" onClick={logout}>Sign out</button>
                </div>
              )}
            </Show>
            <div class="sheet-block">
              <div class="sheet-label">Backend</div>
              <div class="sheet-copy">Library: {tracks().length} tracks</div>
              <div class="sheet-copy">Mode: {config()?.localMode ? "local" : "main"}</div>
            </div>
          </section>
        </div>
      </Show>
      <Show when={createPlaylistOpen()}>
        <div class="sheet-backdrop" onClick={() => setCreatePlaylistOpen(false)}>
          <form class="settings-sheet small" onSubmit={createPlaylist} onClick={(event) => event.stopPropagation()}>
            <div class="sheet-head">
              <div>
                <div class="sheet-kicker">Personal</div>
                <h2 class="sheet-title">New Playlist</h2>
              </div>
              <button type="button" class="icon-btn" onClick={() => setCreatePlaylistOpen(false)}>×</button>
            </div>
            <div class="sheet-block">
              <input
                class="sheet-input"
                autofocus
                maxlength="120"
                value={newPlaylistName()}
                onInput={(event) => setNewPlaylistName(event.currentTarget.value)}
                placeholder="Playlist name"
              />
              <button class="btn-primary block" disabled={!newPlaylistName().trim() || savingPlaylist()}>
                <Show when={savingPlaylist()}>
                  <Icon name="spinner" size={14} />
                </Show>
                <span>{savingPlaylist() ? "Creating..." : "Create"}</span>
              </button>
            </div>
          </form>
        </div>
      </Show>
    </div>
  );
}
