import { For, Show } from "solid-js";
import { Icon } from "./Icon.jsx";
import { MenuSelect } from "./MenuSelect.jsx";

const SORT_OPTIONS = [
  { value: "n", label: "Track #" },
  { value: "title", label: "Title" },
  { value: "year", label: "Year" },
];

const SEARCH_TABS = [
  { id: "songs", label: "Songs" },
  { id: "albums", label: "Albums" },
  { id: "directors", label: "Music Directors" },
  { id: "singers", label: "Singers" },
];
const SEARCH_HELP_TEXT = "Choose whether this search should show albums, songs, music directors, or singers.";
const TABLE_SKELETON_ROWS = Array.from({ length: 10 });

function LoadingState(props) {
  return (
    <div class={`loading-state ${props.large ? "large" : ""}`}>
      <Icon name="spinner" size={props.large ? 24 : 18} />
      <span>{props.text || "Loading..."}</span>
    </div>
  );
}

function TrackTableSkeleton(props) {
  return (
    <div class="track-skeleton" aria-label="Loading playlist">
      <For each={TABLE_SKELETON_ROWS}>
        {() => (
          <div class={`track-row track-skeleton-row ${props.density || "comfortable"}`}>
            <div class="t-num"><span class="sk sk-num" /></div>
            <div class="t-title"><span class="sk sk-title" /></div>
            <div class="t-movie"><span class="sk sk-mid" /></div>
            <div class="t-director"><span class="sk sk-mid" /></div>
            <div class="t-singer"><span class="sk sk-wide" /></div>
            <div class="t-year"><span class="sk sk-year" /></div>
            <div class="t-actions">
              <span class="sk sk-icon" />
              <span class="sk sk-icon" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function AlbumLink(props) {
  const album = () => String(props.album || "").trim();
  return (
    <Show when={album()} fallback={<span class={props.class || ""}>-</span>}>
      <button
        type="button"
        class={`album-link ${props.class || ""}`}
        title={`Open album ${album()}`}
        aria-label={`Open album ${album()}`}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpen?.(album());
        }}
      >
        {album()}
      </button>
    </Show>
  );
}

function SearchTabs(props) {
  const count = (id) => props.counts?.[id] || 0;
  return (
    <div class="search-tabs" role="tablist" aria-label="Search result type">
      <For each={SEARCH_TABS}>
        {(tab) => {
          const disabled = () => count(tab.id) === 0 && props.active !== tab.id;
          return (
            <button
              role="tab"
              class="search-tab"
              classList={{ active: props.active === tab.id }}
              disabled={disabled()}
              aria-disabled={disabled()}
              onClick={() => !disabled() && props.onChange?.(tab.id)}
            >
              <span>{tab.label}</span>
              <span class="mono">{count(tab.id)}</span>
            </button>
          );
        }}
      </For>
    </div>
  );
}

function SearchAlbumResults(props) {
  const albums = () => props.albums || [];
  return (
    <section class="search-albums">
      <Show when={!props.loading} fallback={<LoadingState text="Searching..." />}>
        <Show when={albums().length > 0} fallback={<div class="empty">No albums match this search.</div>}>
          <div class="search-album-grid">
            <For each={albums()}>
              {(album) => (
                <div class="search-album-item">
                  <button class="search-album-main" onClick={() => props.onOpen?.(album.name)}>
                    <span class="search-album-title">{album.name}</span>
                    <span class="search-album-sub">
                      <Show when={album.matchLabel && album.matchValue}>
                        <span>{album.matchLabel}: {album.matchValue}</span>
                      </Show>
                      <span>{album.count} tracks{album.year ? ` · ${album.year}` : ""}</span>
                    </span>
                  </button>
                  <button class="search-album-play" title={`Play ${album.name}`} onClick={() => props.onPlay?.(album.tracks, { type: "album", label: album.name, caption: "Album" })}>
                    <Icon name="play" size={12} />
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  );
}

function SearchPeopleResults(props) {
  const items = () => props.items || [];
  return (
    <section class="search-people">
      <Show when={!props.loading} fallback={<LoadingState text="Searching..." />}>
        <Show when={items().length > 0} fallback={<div class="empty">No {props.emptyLabel || "matches"} found.</div>}>
          <For each={items()}>
            {(item) => (
              <div class="search-person-item">
                <button class="search-person-main" onClick={() => props.onOpenAlbums?.(item.name)}>
                  <span class="search-person-title">{item.name}</span>
                  <span class="search-person-sub">{item.albumCount} albums · {item.trackCount} songs</span>
                </button>
                <button class="search-person-action" onClick={() => props.onOpenAlbums?.(item.name)}>
                  Albums
                </button>
              </div>
            )}
          </For>
        </Show>
      </Show>
    </section>
  );
}

// ─── Shared track row (desktop) ──────────────────────────────────
function TrackRow(props) {
  const isLoadingCurrent = () => props.isCurrent && props.audioLoading;
  return (
    <div
      class={`track-row ${props.class || ""}`}
      data-track-n={props.track.n}
      classList={{
        [props.density || "comfortable"]: true,
        current: props.isCurrent,
        "no-num": props.noNum,
      }}
      onClick={() => props.onPlay?.()}
      onDblClick={() => props.onPlay?.()}
    >
      <Show when={!props.noNum}>
        <div class="t-num">
          <Show
            when={props.isCurrent && (props.audioLoading || props.isPlaying)}
            fallback={
              <>
                <span class="t-n">{props.index ?? props.track.n}</span>
                <button class="t-play" onClick={(event) => { event.stopPropagation(); props.onPlay?.(); }}><Icon name="play" size={11} /></button>
              </>
            }
          >
            <Show when={isLoadingCurrent()} fallback={<span class="t-wave"><Icon name="wave" size={14} /></span>}>
              <span class="t-wave loading"><Icon name="spinner" size={14} /></span>
            </Show>
          </Show>
        </div>
      </Show>
      {props.leftSlot}
      <div class="t-title">
        <span class="t-title-text">{props.track.title}</span>
        <Show when={props.searchActive && props.track._matchLabel && props.track._matchLabel !== "Song"}>
          <span class="t-match">{props.track._matchLabel}: {props.track._matchValue}</span>
        </Show>
      </div>
      <Show when={props.showMovie !== false}>
        <div class="t-movie clickable">
          <AlbumLink album={props.track.movie} onOpen={props.onOpenAlbum} />
        </div>
      </Show>
      <Show when={props.showDirector !== false}><div class="t-director">{props.track.director}</div></Show>
      <Show when={props.showSinger !== false}><div class="t-singer" title={props.track.singer}>{props.track.singer}</div></Show>
      <Show when={props.showYear !== false}><div class="t-year">{props.yearOverride ?? props.track.year}</div></Show>
      <div class="t-actions">
        {props.rightSlot || (
          <>
            <button class="t-icon" classList={{ active: props.track.fav }} onClick={(event) => { event.stopPropagation(); props.onFav?.(); }}>
              <Icon name={props.track.fav ? "heart-fill" : "heart"} size={14} />
            </button>
            <button class="t-icon" onClick={(event) => { event.stopPropagation(); props.onQueue?.(); }}><Icon name="plus" size={14} /></button>
            <button class="t-icon" title="Save to active personal playlist" onClick={(event) => { event.stopPropagation(); props.onSaveToPlaylist?.(); }}>
              <Icon name="dots" size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Library page ────────────────────────────────────────────────
export function LibraryPage(props) {
  const { ctx } = props;
  const isAlbum = () => !!ctx.activeAlbum();
  const isSearch = () => !!ctx.songSearch().trim();
  const searchCounts = () => ctx.searchResultCounts();
  const activeSearchTab = () => {
    const current = ctx.searchResultTab();
    const counts = searchCounts();
    if (counts[current] > 0) return current;
    return SEARCH_TABS.find((tab) => counts[tab.id] > 0)?.id || current;
  };
  const hasScopedTracks = () => !isSearch() && (isAlbum() || !!ctx.activePlaylistMeta());
  const scopedPlaceholder = () => isAlbum() ? "Filter this album..." : "Filter this playlist...";
  const playlist = () =>
    isSearch()
      ? { name: "Search Results", count: ctx.filteredTracks().length, type: "Songs" }
      : isAlbum()
      ? { name: ctx.activeAlbum(), count: ctx.activeAlbumTracks().length, type: "Album" }
      : [...ctx.playlistSections().global, ...ctx.playlistSections().personal].find((p) => p.id === ctx.activePlaylist()) ||
    ctx.playlistSections().global[0] ||
    { name: "Library", count: ctx.filteredTracks().length };

  return (
    <div class="page page-library">
      <div class="pl-header">
        <div class="pl-header-top">
          <div class="pl-title-block">
            <Show
              when={isSearch()}
              fallback={
                <>
                  <Show when={isAlbum()}>
                    <div class="pl-kicker">Album</div>
                  </Show>
                  <div class="pl-title-line">
                    <h1 class="pl-title">{playlist().name}</h1>
                    <Show when={isAlbum() && ctx.activeAlbumTracks().length > 0}>
                      <button class="btn-secondary album-play-btn" onClick={() => ctx.playPlaylist(ctx.activeAlbumTracks(), { type: "album", label: ctx.activeAlbum(), caption: "Album" })}>
                        <Icon name="play" size={13} /><span>Play</span>
                      </button>
                    </Show>
                  </div>
                </>
              }
            >
              <div class="pl-search-toolbar">
                <div class="pl-title-line search-title-line">
                  <h1 class="pl-title">{playlist().name}</h1>
                  <button
                    class="search-help"
                    title={SEARCH_HELP_TEXT}
                    aria-label={SEARCH_HELP_TEXT}
                    data-tooltip={SEARCH_HELP_TEXT}
                  >
                    <Icon name="help" size={13} />
                  </button>
                </div>
                <SearchTabs active={activeSearchTab()} counts={searchCounts()} onChange={ctx.setSearchResultTab} />
                <Show when={activeSearchTab() === "songs"}>
                  <div class="sort-control search-sort-control">
                    <span class="sort-label">Sort</span>
                    <MenuSelect class="sort-menu" label="Sort" value={ctx.sort()} onChange={ctx.setSort} options={SORT_OPTIONS} />
                  </div>
                </Show>
              </div>
            </Show>
          </div>
          <div class="pl-tools">
            <Show when={hasScopedTracks()}>
              <div class="track-scope-search">
                <Icon name="search" size={14} />
                <input
                  placeholder={scopedPlaceholder()}
                  value={ctx.trackSearch()}
                  onInput={(event) => ctx.setTrackSearch(event.currentTarget.value)}
                />
                <Show when={ctx.trackSearch()}>
                  <button class="search-clear" onClick={() => ctx.setTrackSearch("")}>
                    <Icon name="x" size={13} />
                  </button>
                </Show>
              </div>
            </Show>
            <Show when={!isSearch()}>
              <div class="sort-control">
                <span class="sort-label">Sort</span>
                <MenuSelect class="sort-menu" label="Sort" value={ctx.sort()} onChange={ctx.setSort} options={SORT_OPTIONS} />
              </div>
            </Show>
          </div>
        </div>
      </div>
      <Show when={!isSearch() || activeSearchTab() === "songs"}>
        <div class="tracklist" classList={{ "search-results": isSearch() }}>
        <div class={`track-row head ${ctx.density()}`}>
          <div class="t-num">#</div>
          <div class="t-title">Title</div>
          <div class="t-movie">Movie</div>
          <div class="t-director">Music Director</div>
          <div class="t-singer">Singer</div>
          <div class="t-year">Year</div>
          <div class="t-actions" />
        </div>
        <div class="track-body">
          <For each={ctx.filteredTracks()}>
            {(t) => (
              <TrackRow
                track={t}
                isCurrent={ctx.currentN() === t.n}
                isPlaying={ctx.isPlaying()}
                audioLoading={ctx.audioLoading()}
                searchActive={isSearch() || !!ctx.trackSearch().trim()}
                density={ctx.density()}
                onPlay={() => ctx.playTrack(t.n)}
                onFav={() => ctx.toggleFav(t.n)}
                onQueue={() => ctx.addToQueue(t.n)}
                onSaveToPlaylist={() => ctx.addToActivePlaylist(t.n)}
                onOpenAlbum={ctx.openAlbum}
              />
            )}
          </For>
          <Show when={isSearch() && ctx.searchPending() && ctx.filteredTracks().length === 0}>
            <TrackTableSkeleton density={ctx.density()} />
          </Show>
          <Show when={!ctx.searchPending() && !ctx.loading() && !ctx.playlistLoading() && ctx.filteredTracks().length === 0}>
            <div class="empty">
              {ctx.songSearch()
                ? `No songs match "${ctx.songSearch()}"`
                : ctx.trackSearch()
                ? `No tracks match "${ctx.trackSearch()}"`
                : "No tracks available"}
            </div>
          </Show>
          <Show when={(ctx.loading() || ctx.playlistLoading()) && ctx.filteredTracks().length === 0}>
            <TrackTableSkeleton density={ctx.density()} />
          </Show>
        </div>
      </div>
      </Show>
      <Show when={isSearch() && activeSearchTab() === "albums"}>
        <SearchAlbumResults
          albums={ctx.searchAlbumResults()}
          loading={ctx.searchPending()}
          onOpen={ctx.openAlbum}
          onPlay={ctx.playPlaylist}
        />
      </Show>
      <Show when={isSearch() && activeSearchTab() === "directors"}>
        <SearchPeopleResults
          items={ctx.searchDirectorResults()}
          loading={ctx.searchPending()}
          emptyLabel="music directors"
          onOpenAlbums={ctx.openSearchPersonAlbums}
        />
      </Show>
      <Show when={isSearch() && activeSearchTab() === "singers"}>
        <SearchPeopleResults
          items={ctx.searchSingerResults()}
          loading={ctx.searchPending()}
          emptyLabel="singers"
          onOpenAlbums={ctx.openSearchPersonAlbums}
        />
      </Show>
    </div>
  );
}

// ─── Playlists table ─────────────────────────────────────────────
export function PlaylistsPage(props) {
  const { ctx } = props;
  const all = () => {
    const list = [
      ...ctx.playlistSections().global.map((p) => ({ ...p, type: "Global" })),
      ...ctx.playlistSections().personal.map((p) => ({ ...p, type: "Personal" })),
    ];
    return ctx.playlistSearch() ? list.filter((p) => p.name.toLowerCase().includes(ctx.playlistSearch().toLowerCase())) : list;
  };
  const open = (id) => { ctx.setActivePlaylist(id); ctx.setTab("Library"); };

  return (
    <div class="page page-playlists-table">
      <div class="page-header">
        <div class="page-kicker">All Playlists · {all().length}</div>
        <h1 class="page-title">Playlists</h1>
      </div>
      <div class="tracklist nopad">
        <div class={`pl-row head ${ctx.density()}`}>
          <div class="plr-num">#</div>
          <div class="plr-name">Name</div>
          <div class="plr-type">Type</div>
          <div class="plr-count">Tracks</div>
          <div class="plr-updated">Updated</div>
          <div class="plr-actions" />
        </div>
        <div class="track-body">
          <For each={all()}>
            {(p, i) => (
              <div class={`pl-row ${ctx.density()}`} onClick={() => open(p.id)}>
                <div class="plr-num">
                  <span class="plr-n mono">{(i() + 1).toString().padStart(2, "0")}</span>
                  <button class="plr-play" onClick={(e) => { e.stopPropagation(); open(p.id); }}>
                    <Icon name="play" size={11} />
                  </button>
                </div>
                <div class="plr-name"><span class="plr-name-text">{p.name}</span></div>
                <div class="plr-type">{p.type}</div>
                <div class="plr-count mono">{p.count}</div>
                <div class="plr-updated mono">{["2 days ago", "1 week ago", "3 weeks ago", "1 month ago"][i() % 4]}</div>
                <div class="plr-actions">
                  <button class="t-icon" onClick={(event) => { event.stopPropagation(); open(p.id); }}><Icon name="dots" size={14} /></button>
                </div>
              </div>
            )}
          </For>
          <Show when={all().length === 0}>
            <Show
              when={ctx.loading()}
              fallback={<div class="empty">No playlists match "{ctx.playlistSearch()}"</div>}
            >
              <LoadingState text="Loading playlists..." />
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}

// ─── Queue right rail ────────────────────────────────────────────
export function QueuePanel(props) {
  const { ctx } = props;
  const current = () => ctx.trackMap()[ctx.currentN()];
  const upcoming = () => ctx.queue().map((n) => ({ ...ctx.trackMap()[n], fav: ctx.favs().has(n) })).filter((t) => t.n);

  return (
    <aside class="queue-panel" classList={{ collapsed: ctx.queueCollapsed() }}>
      <Show when={!ctx.queueCollapsed()}>
            <div class="page-header">
              <div class="page-title-row queue-title-row">
                <h1 class="page-title">Queue</h1>
                <div class="queue-header-actions">
                  <Show when={ctx.queue().length > 0}>
                    <button class="btn-link" onClick={() => ctx.clearQueue()}>Clear queue</button>
                  </Show>
                  <button class="icon-btn small" onClick={() => ctx.setQueueCollapsed(true)} title="Collapse queue">
                    <Icon name="chevron-right" size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div class="queue-section">
              <div class="section-label">Now Playing</div>
              <Show
                when={current()}
                fallback={<div class="empty">No track loaded</div>}
              >
                {(track) => (
                  <button class="queue-card current" onClick={() => ctx.playTrack(track().n)}>
                    <span class="queue-card-index">
                      <Icon name={ctx.audioLoading() ? "spinner" : ctx.isPlaying() ? "wave" : "pause"} size={14} />
                    </span>
                    <span class="queue-card-meta">
                      <span class="queue-card-title">{track().title}</span>
                      <span class="queue-card-sub">{track().singer || track().movie}</span>
                    </span>
                  </button>
                )}
              </Show>
            </div>

            <div class="queue-section">
              <div class="section-label">Up Next · {upcoming().length}</div>
              <Show when={upcoming().length === 0}>
                <div class="empty">Queue is empty. Add tracks with the + icon.</div>
              </Show>
              <For each={upcoming()}>
                {(t, idx) => (
                  <div
                    class="queue-card"
                    role="button"
                    tabIndex="0"
                    onClick={() => ctx.playTrack(t.n)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        ctx.playTrack(t.n);
                      }
                    }}
                  >
                    <span class="queue-card-index mono">{idx() + 1}</span>
                    <span class="queue-card-meta">
                      <span class="queue-card-title">{t.title}</span>
                      <span class="queue-card-sub">{t.singer || t.movie}</span>
                    </span>
                    <span class="queue-card-actions">
                      <button class="t-icon visible" classList={{ active: t.fav }} onClick={(event) => { event.stopPropagation(); ctx.toggleFav(t.n); }}>
                        <Icon name={t.fav ? "heart-fill" : "heart"} size={14} />
                      </button>
                      <button class="t-icon visible" onClick={(event) => { event.stopPropagation(); ctx.removeFromQueue(idx()); }}>
                        <Icon name="x" size={14} />
                      </button>
                    </span>
                  </div>
                )}
              </For>
            </div>
      </Show>
    </aside>
  );
}

function parseSyncedLyrics(value = "") {
  return String(value || "")
    .split("\n")
    .map((line) => {
      const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
      if (!match) return null;
      const minutes = Number(match[1]) || 0;
      const seconds = Number(match[2]) || 0;
      const fraction = Number(`0.${match[3] || "0"}`) || 0;
      return { time: minutes * 60 + seconds + fraction, text: match[4] || "" };
    })
    .filter((line) => line && line.text.trim());
}

export function LyricsPanel(props) {
  const { ctx } = props;
  const lyrics = () => ctx.lyricsState?.() || { status: "idle" };
  const syncedLines = () => parseSyncedLyrics(lyrics().syncedLyrics);
  const activeLineIndex = () => {
    const lines = syncedLines();
    const current = ctx.position?.() || 0;
    let active = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].time <= current + 0.2) active = index;
    }
    return active;
  };
  const plainLines = () => String(lyrics().plainLyrics || "").split("\n").filter((line) => line.trim());
  const hasLyrics = () => lyrics().status === "available" && (syncedLines().length > 0 || plainLines().length > 0);

  return (
    <aside class={`lyrics-panel ${props.mobile ? "mobile" : "queue-panel"}`}>
      <div class="page-header">
        <div class="page-title-row queue-title-row">
          <h1 class="page-title">Lyrics</h1>
          <button class="icon-btn small" onClick={() => ctx.setLyricsOpen?.(false)} title="Close lyrics">
            <Icon name={props.mobile ? "chevron-down" : "chevron-right"} size={16} />
          </button>
        </div>
      </div>
      <div class="lyrics-track">
        <div class="lyrics-track-title">{ctx.currentTrack?.()?.title || "No track"}</div>
        <div class="lyrics-track-sub">{ctx.currentTrack?.()?.singer || ctx.currentTrack?.()?.movie || ""}</div>
      </div>
      <Show when={!lyrics().loading} fallback={<LoadingState text="Loading lyrics..." />}>
        <Show
          when={hasLyrics()}
          fallback={
            <div class="empty lyrics-empty">
              <Icon name="lyrics" size={26} />
              <div class="empty-title">
                {lyrics().status === "instrumental" ? "Instrumental" : "Lyrics unavailable"}
              </div>
              <div class="empty-sub">
                {lyrics().status === "not_found"
                  ? "No confident LRCLIB match was found."
                  : lyrics().status === "error"
                  ? "Lyrics lookup failed for this track."
                  : "Lyrics will appear here when available."}
              </div>
              <button class="btn-ghost wide" onClick={() => ctx.refreshLyrics?.()}>Retry lookup</button>
            </div>
          }
        >
          <div class="lyrics-body">
            <Show
              when={syncedLines().length > 0}
              fallback={
                <For each={plainLines()}>
                  {(line) => <p class="lyrics-line plain">{line}</p>}
                </For>
              }
            >
              <For each={syncedLines()}>
                {(line, index) => (
                  <p class="lyrics-line" classList={{ active: index() === activeLineIndex(), past: index() < activeLineIndex() }}>
                    {line.text}
                  </p>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </Show>
    </aside>
  );
}

// ─── Recents page ────────────────────────────────────────────────
export function RecentsPage(props) {
  const { ctx } = props;
  const tracks = () => ctx.recents()
    .map((r) => ({ ...ctx.trackMap()[r.n], when: r.when, fav: ctx.favs().has(r.n) }))
    .filter((t) => t.n);

  return (
    <div class="page page-recents">
      <div class="page-header">
        <h1 class="page-title">Recents</h1>
      </div>
      <div class="tracklist nopad">
        <div class={`track-row head ${ctx.density()} no-num recents-row`}>
          <div class="t-title">Title</div>
          <div class="t-movie">Movie</div>
          <div class="t-singer">Singer</div>
          <div class="t-year">Played</div>
          <div class="t-actions" />
        </div>
        <div class="track-body">
          <For each={tracks()}>
            {(t) => (
              <div
                class={`track-row ${ctx.density()} no-num recents-row`}
                classList={{ current: ctx.currentN() === t.n }}
                onClick={() => ctx.playTrack(t.n)}
                onDblClick={() => ctx.playTrack(t.n)}
              >
                <div class="t-title">
                  <span class="t-title-text">{t.title}</span>
                </div>
                <div class="t-movie clickable"><AlbumLink album={t.movie} onOpen={ctx.openAlbum} /></div>
                <div class="t-singer">{t.singer}</div>
                <div class="t-year mono">{t.when}</div>
                <div class="t-actions">
                  <button class="t-icon" classList={{ active: t.fav }} onClick={(event) => { event.stopPropagation(); ctx.toggleFav(t.n); }}>
                    <Icon name={t.fav ? "heart-fill" : "heart"} size={14} />
                  </button>
                  <button class="t-icon" onClick={(event) => { event.stopPropagation(); ctx.playTrack(t.n); }}><Icon name="play" size={12} /></button>
                  <button class="t-icon" onClick={(event) => { event.stopPropagation(); ctx.addToQueue(t.n); }}><Icon name="plus" size={12} /></button>
                  <button class="t-icon" onClick={(event) => { event.stopPropagation(); ctx.addToActivePlaylist(t.n); }}><Icon name="dots" size={14} /></button>
                </div>
              </div>
            )}
          </For>
          <Show when={tracks().length === 0}>
            <Show
              when={ctx.loading()}
              fallback={
                <div class="empty large">
                  <Icon name="clock" size={28} />
                  <div class="empty-title">No recent plays</div>
                  <div class="empty-sub">Played tracks will appear here.</div>
                </div>
              }
            >
              <LoadingState large text="Loading recents..." />
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}

// ─── Favorites page ──────────────────────────────────────────────
export function FavoritesPage(props) {
  const { ctx } = props;
  const tracks = () => ctx.tracks()
    .filter((t) => ctx.favs().has(t.n))
    .map((t) => ({ ...t, fav: true }))
    .filter((t) => t.n);

  return (
    <div class="page page-favorites">
      <div class="page-header with-cta">
        <div>
          <h1 class="page-title">Favorites</h1>
        </div>
        <Show when={tracks().length > 0}>
          <button class="btn-primary" onClick={() => ctx.playPlaylist(tracks())}>
            <Icon name="play" size={13} /><span>Play All</span>
          </button>
        </Show>
      </div>
      <Show
        when={tracks().length > 0}
        fallback={
          <Show
            when={ctx.loading()}
            fallback={
              <div class="empty large">
                <Icon name="heart" size={28} />
                <div class="empty-title">No favorites yet</div>
                <div class="empty-sub">Tap the heart on any track to save it here.</div>
              </div>
            }
          >
            <LoadingState large text="Loading favorites..." />
          </Show>
        }
      >
        <div class="tracklist nopad">
          <div class={`track-row head ${ctx.density()} no-num`}>
            <div class="t-title">Title</div>
            <div class="t-movie">Movie</div>
            <div class="t-director">Music Director</div>
            <div class="t-singer">Singer</div>
            <div class="t-year">Year</div>
            <div class="t-actions" />
          </div>
          <div class="track-body">
            <For each={tracks()}>
              {(t) => (
                <div
                  class={`track-row ${ctx.density()} no-num`}
                  classList={{ current: ctx.currentN() === t.n }}
                  onClick={() => ctx.playTrack(t.n)}
                  onDblClick={() => ctx.playTrack(t.n)}
                >
                  <div class="t-title">
                    <span class="t-title-text">{t.title}</span>
                  </div>
                  <div class="t-movie clickable"><AlbumLink album={t.movie} onOpen={ctx.openAlbum} /></div>
                  <div class="t-director">{t.director}</div>
                  <div class="t-singer">{t.singer}</div>
                  <div class="t-year">{t.year}</div>
                  <div class="t-actions">
                    <button class="t-icon active" onClick={(event) => { event.stopPropagation(); ctx.toggleFav(t.n); }}>
                      <Icon name="heart-fill" size={14} />
                    </button>
                    <button class="t-icon" onClick={(event) => { event.stopPropagation(); ctx.playTrack(t.n); }}><Icon name="play" size={12} /></button>
                    <button class="t-icon" onClick={(event) => { event.stopPropagation(); ctx.addToQueue(t.n); }}><Icon name="plus" size={12} /></button>
                    <button class="t-icon" onClick={(event) => { event.stopPropagation(); ctx.addToActivePlaylist(t.n); }}><Icon name="dots" size={14} /></button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
