import { For, Show, Switch, Match, createSignal, createEffect } from "solid-js";
import { Icon } from "./Icon.jsx";
import { MenuSelect } from "./MenuSelect.jsx";
import { fetchAlbumArt } from "./albumArt.js";

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
                <button class="search-person-main" onClick={() => props.onOpenArtist?.(item.name, props.role)}>
                  <span class="search-person-title">{item.name}</span>
                  <span class="search-person-sub">{item.albumCount} albums · {item.trackCount} songs</span>
                </button>
                <button class="search-person-action" onClick={() => props.onOpenArtist?.(item.name, props.role)}>
                  View
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
      <Show when={props.showDirector !== false}>
        <div class="t-director">
          <Show when={props.onOpenArtist && props.track.director} fallback={<span>{props.track.director || "—"}</span>}>
            <button class="artist-link" onClick={(e) => { e.stopPropagation(); props.onOpenArtist(props.track.director, "director"); }}>{props.track.director}</button>
          </Show>
        </div>
      </Show>
      <Show when={props.showSinger !== false}>
        <div class="t-singer" title={props.track.singer}>
          <Show when={props.onOpenArtist && props.track.singer} fallback={<span>{props.track.singer || "—"}</span>}>
            <button class="artist-link" onClick={(e) => { e.stopPropagation(); props.onOpenArtist(props.track.singer, "singer"); }}>{props.track.singer}</button>
          </Show>
        </div>
      </Show>
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

// ─── Album art placeholder ───────────────────────────────────────
const ART_COLORS = [
  "#e84855","#3d405b","#81b29a","#f2cc8f","#118ab2",
  "#06d6a0","#ef476f","#8338ec","#3a86ff","#fb5607",
];
function artColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return ART_COLORS[Math.abs(h) % ART_COLORS.length];
}
function AlbumArt(props) {
  const name = () => props.name || "?";
  const initial = () => name()[0].toUpperCase();
  const bg = () => artColor(name());
  const size = () => props.size || 48;
  const [imgUrl, setImgUrl] = createSignal(props.src || null);

  createEffect(() => {
    const n = name();
    if (props.src) { setImgUrl(props.src); return; }
    setImgUrl(null);
    fetchAlbumArt(n).then((url) => { if (url) setImgUrl(url); });
  });

  return (
    <Show when={imgUrl()} fallback={
      <div class="album-art-placeholder" style={{ background: bg(), width: `${size()}px`, height: `${size()}px`, "border-radius": props.radius || "6px" }}>
        <span class="album-art-initial" style={{ "font-size": `${Math.round(size() * 0.4)}px` }}>{initial()}</span>
      </div>
    }>
      <img class="album-art-img" src={imgUrl()} alt={name()} width={size()} height={size()} style={{ "border-radius": props.radius || "6px" }} loading="lazy" />
    </Show>
  );
}

// ─── Era / decade filter chips ───────────────────────────────────
const DECADES = [
  { label: "60s", from: 1960, to: 1970 },
  { label: "70s", from: 1970, to: 1980 },
  { label: "80s", from: 1980, to: 1990 },
  { label: "90s", from: 1990, to: 2000 },
  { label: "2000s", from: 2000, to: 2010 },
  { label: "2010s", from: 2010, to: 2020 },
  { label: "2020s", from: 2020, to: 2030 },
];

function EraChips(props) {
  const decadeCounts = () => {
    const counts = {};
    for (const t of (props.tracks || [])) {
      const y = parseInt(t.year);
      if (isNaN(y)) continue;
      const decade = Math.floor(y / 10) * 10;
      counts[decade] = (counts[decade] || 0) + 1;
    }
    return counts;
  };
  const hasAny = () => DECADES.some((d) => (decadeCounts()[d.from] || 0) > 0 || props.eraFilter?.[0] === d.from);
  return (
    <Show when={hasAny()}>
      <div class="era-chips">
        <Show when={props.eraFilter}>
          <button class="era-chip active era-clear" onClick={() => props.setEraFilter(null)} title="Clear era filter">
            ✕ Clear
          </button>
        </Show>
        <For each={DECADES}>
          {(d) => {
            const count = () => decadeCounts()[d.from] || 0;
            const isActive = () => props.eraFilter?.[0] === d.from;
            return (
              <Show when={count() > 0 || isActive()}>
                <button
                  class="era-chip"
                  classList={{ active: isActive() }}
                  onClick={() => props.setEraFilter(isActive() ? null : [d.from, d.to])}
                >
                  {d.label}
                  <span class="era-chip-count">{count()}</span>
                </button>
              </Show>
            );
          }}
        </For>
      </div>
    </Show>
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
                    <Show when={isAlbum()}>
                      <AlbumArt name={ctx.activeAlbum()} size={52} radius="8px" />
                    </Show>
                    <h1 class="pl-title">{playlist().name}</h1>
                    <Show when={isAlbum() && ctx.activeAlbumTracks().length > 0}>
                      <div class="album-header-actions">
                        <button class="btn-secondary album-play-btn" onClick={() => { ctx.setShuffle(false); ctx.playPlaylist(ctx.activeAlbumTracks(), { type: "album", label: ctx.activeAlbum(), caption: "Album" }); }}>
                          <Icon name="play" size={13} /><span>Play</span>
                        </button>
                        <button class="btn-secondary album-play-btn" onClick={() => { ctx.setShuffle(true); ctx.playPlaylist(ctx.activeAlbumTracks(), { type: "album", label: ctx.activeAlbum(), caption: "Album" }); }}>
                          <Icon name="shuffle" size={13} /><span>Shuffle</span>
                        </button>
                      </div>
                    </Show>
                    <Show when={!isAlbum() && ctx.activePlaylistMeta()?.source === "personal" && ctx.user()}>
                      {() => {
                        const meta = () => ctx.activePlaylistMeta();
                        return (
                          <button
                            class="collab-toggle"
                            classList={{ active: meta()?.isCollaborative }}
                            title={meta()?.isCollaborative ? "Collaborative — click to make private" : "Make collaborative"}
                            onClick={() => ctx.toggleCollaborative?.(meta()?.id, meta()?.isCollaborative)}
                          >
                            <Icon name="collab" size={14} />
                            <span>{meta()?.isCollaborative ? "Collaborative" : "Make collaborative"}</span>
                          </button>
                        );
                      }}
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
      <Show when={!isSearch()}>
        <EraChips eraFilter={ctx.eraFilter()} setEraFilter={ctx.setEraFilter} tracks={ctx.filteredTracks()} />
      </Show>
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
                onOpenArtist={ctx.openArtist}
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
          role="director"
          onOpenArtist={ctx.openArtist}
        />
      </Show>
      <Show when={isSearch() && activeSearchTab() === "singers"}>
        <SearchPeopleResults
          items={ctx.searchSingerResults()}
          loading={ctx.searchPending()}
          emptyLabel="singers"
          role="singer"
          onOpenArtist={ctx.openArtist}
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

// ─── Recents page ────────────────────────────────────────────────
export function RecentsPage(props) {
  const { ctx } = props;
  const tracks = () => ctx.recents()
    .map((r) => ({ ...ctx.trackMap()[r.n], when: r.when, fav: ctx.favs().has(r.n) }))
    .filter((t) => t.n);

  return (
    <div class="page page-recents">
      <div class="page-header with-cta">
        <h1 class="page-title">Recents</h1>
        <Show when={tracks().length > 0}>
          <div class="header-actions">
            <button class="btn-secondary" onClick={() => { ctx.setShuffle(true); ctx.playPlaylist(tracks()); }}>
              <Icon name="shuffle" size={13} /><span>Shuffle</span>
            </button>
            <button class="btn-primary" onClick={() => { ctx.setShuffle(false); ctx.playPlaylist(tracks()); }}>
              <Icon name="play" size={13} /><span>Play All</span>
            </button>
          </div>
        </Show>
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
        <h1 class="page-title">Favorites</h1>
        <Show when={tracks().length > 0}>
          <div class="header-actions">
            <button class="btn-secondary" onClick={() => { ctx.setShuffle(true); ctx.playPlaylist(tracks()); }}>
              <Icon name="shuffle" size={13} /><span>Shuffle</span>
            </button>
            <button class="btn-primary" onClick={() => { ctx.setShuffle(false); ctx.playPlaylist(tracks()); }}>
              <Icon name="play" size={13} /><span>Play All</span>
            </button>
          </div>
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

// ─── Stats / Wrapped Page ─────────────────────────────────────────
export function StatsPage(props) {
  const { ctx } = props;
  const [stats, setStats] = createSignal(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => {
    if (!ctx.user()) { setError("Sign in to view your listening stats."); return; }
    setLoading(true);
    fetch("/api/stats/listening", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => { setStats(data); setError(""); })
      .catch(() => setError("Unable to load stats."))
      .finally(() => setLoading(false));
  });

  const fmtHours = (mins) => {
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div class="stats-page">
      <div class="stats-header">
        <div class="stats-title">Your Listening Stats</div>
        <div class="stats-sub">All-time summary of your isaibox activity</div>
      </div>
      <Show when={loading()}><div class="loading-state"><Icon name="spinner" size={20} /><span>Loading...</span></div></Show>
      <Show when={!loading() && error()}><div class="empty">{error()}</div></Show>
      <Show when={!loading() && stats()}>
        {(s) => (
          <>
            <div class="stats-grid">
              <div class="stats-card">
                <div class="stats-card-label">Total Plays</div>
                <div class="stats-card-value">{s().totalPlays?.toLocaleString()}</div>
              </div>
              <div class="stats-card">
                <div class="stats-card-label">Listening Time</div>
                <div class="stats-card-value">{fmtHours(s().totalMinutes || 0)}</div>
              </div>
            </div>
            <div class="stats-section">
              <div class="stats-section-title">Top Songs</div>
              <For each={s().topSongs}>
                {(song) => (
                  <div class="stats-row">
                    <div class="stats-row-name">{song.track} <span style="color:var(--fg-mute);font-weight:400">— {song.movie}</span></div>
                    <div class="stats-row-count">{song.plays} plays</div>
                  </div>
                )}
              </For>
            </div>
            <div class="stats-section">
              <div class="stats-section-title">Favourite Directors</div>
              <For each={s().topDirectors}>
                {(d) => (
                  <div class="stats-row">
                    <div class="stats-row-name">{d.name}</div>
                    <div class="stats-row-count">{d.plays} plays</div>
                  </div>
                )}
              </For>
            </div>
            <div class="stats-section">
              <div class="stats-section-title">Top Eras</div>
              <For each={s().topYears}>
                {(y) => (
                  <div class="stats-row">
                    <div class="stats-row-name">{y.year}s</div>
                    <div class="stats-row-count">{y.plays} plays</div>
                  </div>
                )}
              </For>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}

// ─── New This Week Page ───────────────────────────────────────────
export function NewThisWeekPage(props) {
  const { ctx } = props;
  const [albums, setAlbums] = createSignal([]);
  const [loading, setLoading] = createSignal(true);

  createEffect(() => {
    fetch("/api/library/new", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.albums) setAlbums(data.albums); })
      .finally(() => setLoading(false));
  });

  const toTrack = (song) => ctx.trackById()[song.id];

  return (
    <div class="page">
      <div class="page-header">
        <div class="page-kicker">Fresh drops</div>
        <h1 class="page-title">New This Week</h1>
      </div>
      <Show when={loading()}><div class="loading-state"><Icon name="spinner" size={18} /><span>Loading...</span></div></Show>
      <Show when={!loading() && albums().length === 0}>
        <div class="empty">No new releases in the last 7 days.</div>
      </Show>
      <div style="padding:0 24px">
        <For each={albums()}>
          {(album) => {
            const tracks = () => (album.songs || []).map((s) => toTrack(s)).filter(Boolean);
            return (
              <div class="artist-album">
                <div class="artist-album-name">
                  <button class="album-link" onClick={() => ctx.openAlbum(album.name)}>{album.name}</button>
                  <span class="artist-album-year">{album.year}</span>
                  <button class="btn-link" onClick={() => ctx.playPlaylist(tracks(), { type: "album", label: album.name, caption: "Album" })}>
                    <Icon name="play" size={12} /> Play all
                  </button>
                </div>
                <For each={(album.songs || []).slice(0, 4)}>
                  {(song) => {
                    const t = toTrack(song);
                    return (
                      <div class="track-row comfortable" style="padding-left:0">
                        <div class="t-title">{song.track}</div>
                        <div class="t-singer" style="color:var(--fg-mute);font-size:12px">{song.singers}</div>
                        <div class="t-actions">
                          <Show when={t}>
                            <button class="t-icon" onClick={() => ctx.playTrack(t.n)}><Icon name="play" size={12} /></button>
                            <button class="t-icon" onClick={() => ctx.addToQueue(t.n)}><Icon name="plus" size={12} /></button>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

// ─── Recommendations Page ────────────────────────────────────────
export function RecommendationsPage(props) {
  const { ctx } = props;
  const [songs, setSongs] = createSignal([]);
  const [basedOn, setBasedOn] = createSignal([]);
  const [loading, setLoading] = createSignal(true);

  createEffect(() => {
    fetch("/api/recommendations", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.songs) { setSongs(data.songs); setBasedOn(data.basedOn || []); } })
      .finally(() => setLoading(false));
  });

  return (
    <div class="page">
      <div class="page-header">
        <div class="page-kicker">
          {basedOn().length > 0 ? `Based on: ${basedOn().slice(0, 2).join(", ")}` : "Personalised picks"}
        </div>
        <h1 class="page-title">Recommended For You</h1>
      </div>
      <Show when={loading()}><div class="loading-state"><Icon name="spinner" size={18} /><span>Loading...</span></div></Show>
      <div class="track-body" style="padding:0 24px">
        <For each={songs()}>
          {(song) => {
            const t = () => ctx.trackById()[song.id];
            return (
              <div class="track-row comfortable" onDblClick={() => t() && ctx.playTrack(t().n)}>
                <div class="t-title">{song.track}</div>
                <div class="t-movie"><button class="album-link" onClick={() => ctx.openAlbum(song.movie)}>{song.movie}</button></div>
                <div class="t-director" style="color:var(--fg-mute);font-size:12px">{song.musicDirector}</div>
                <div class="t-year mono" style="color:var(--fg-faint);font-size:11px">{song.year}</div>
                <div class="t-actions">
                  <Show when={t()}>
                    <button class="t-icon" classList={{ active: ctx.favs().has(t().n) }} onClick={() => ctx.toggleFav(t().n)}>
                      <Icon name={ctx.favs().has(t().n) ? "heart-fill" : "heart"} size={13} />
                    </button>
                    <button class="t-icon" onClick={() => ctx.playTrack(t().n)}><Icon name="play" size={12} /></button>
                    <button class="t-icon" onClick={() => ctx.addToQueue(t().n)}><Icon name="plus" size={12} /></button>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

// ─── Artist / Music Director Page ────────────────────────────────
export function ArtistPage(props) {
  const { ctx } = props;
  const [data, setData] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  createEffect(() => {
    const view = ctx.artistView();
    if (!view?.name) return;
    setLoading(true);
    setData(null);
    fetch(`/api/artist?name=${encodeURIComponent(view.name)}&role=${view.role || "director"}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.ok) setData(d); })
      .finally(() => setLoading(false));
  });

  return (
    <div class="artist-page">
      <Show when={loading()}>
        <div class="loading-state large"><Icon name="spinner" size={22} /><span>Loading...</span></div>
      </Show>
      <Show when={!loading() && data()}>
        {(d) => {
          const allTracks = () => d().albums.flatMap((a) => (a.songs || []).map((s) => ctx.trackById()[s.id]).filter(Boolean));
          return (
            <>
              <div class="artist-header">
                <div class="artist-kicker">{d().role === "singer" ? "Singer" : "Music Director"}</div>
                <h1 class="artist-name">{d().name}</h1>
                <div class="artist-meta">{d().totalAlbums} albums · {d().totalSongs} songs</div>
                <div class="header-actions" style="margin-top:14px">
                  <button class="btn-primary" onClick={() => { ctx.setShuffle(false); ctx.playPlaylist(allTracks(), { type: "artist", label: d().name, caption: d().role === "singer" ? "Singer" : "Director" }); }}>
                    <Icon name="play" size={13} /><span>Play All</span>
                  </button>
                  <button class="btn-secondary" onClick={() => { ctx.setShuffle(true); ctx.playPlaylist(allTracks(), { type: "artist", label: d().name, caption: d().role === "singer" ? "Singer" : "Director" }); }}>
                    <Icon name="shuffle" size={13} /><span>Shuffle</span>
                  </button>
                </div>
              </div>
              <div class="artist-albums-list">
                <For each={d().albums}>
                  {(album) => {
                    const tracks = () => (album.songs || []).map((s) => ctx.trackById()[s.id]).filter(Boolean);
                    return (
                      <div class="artist-album">
                        <div class="artist-album-head">
                          <div class="artist-album-info">
                            <button class="album-link artist-album-title" onClick={() => ctx.openAlbum(album.name)}>{album.name}</button>
                            <span class="artist-album-year">{album.year}</span>
                          </div>
                          <button class="btn-link" onClick={() => { ctx.setShuffle(false); ctx.playPlaylist(tracks(), { type: "album", label: album.name, caption: "Album" }); }}>
                            <Icon name="play" size={11} /> Play
                          </button>
                        </div>
                        <div class="artist-album-tracks">
                          <For each={(album.songs || []).slice(0, 5)}>
                            {(song) => {
                              const t = () => ctx.trackById()[song.id];
                              return (
                                <Show when={t()}>
                                  {(track) => (
                                    <div class="artist-track" classList={{ current: ctx.currentN() === track().n }} onClick={() => ctx.playTrack(track().n)}>
                                      <span class="artist-track-n mono">{song.trackNumber}</span>
                                      <span class="artist-track-title">{song.track}</span>
                                      <span class="artist-track-sub">{song.singers}</span>
                                      <button class="t-icon" classList={{ active: ctx.favs().has(track().n) }} onClick={(e) => { e.stopPropagation(); ctx.toggleFav(track().n); }}>
                                        <Icon name={ctx.favs().has(track().n) ? "heart-fill" : "heart"} size={12} />
                                      </button>
                                    </div>
                                  )}
                                </Show>
                              );
                            }}
                          </For>
                          <Show when={(album.songs || []).length > 5}>
                            <button class="btn-link artist-show-more" onClick={() => ctx.openAlbum(album.name)}>
                              +{(album.songs || []).length - 5} more — open album
                            </button>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </>
          );
        }}
      </Show>
    </div>
  );
}

// ─── Discover page (New / For You / Trending) ─────────────────────
const DISCOVER_TABS = [
  { id: "new", label: "New" },
  { id: "foryou", label: "For You" },
  { id: "trending", label: "Trending" },
];

export function DiscoverPage(props) {
  const { ctx } = props;
  const [sub, setSub] = createSignal("new");
  return (
    <div class="discover-page">
      <div class="discover-sub-nav">
        <For each={DISCOVER_TABS}>
          {(t) => (
            <button class="discover-sub-tab" classList={{ active: sub() === t.id }} onClick={() => setSub(t.id)}>
              {t.label}
            </button>
          )}
        </For>
      </div>
      <Switch>
        <Match when={sub() === "new"}><NewThisWeekPage ctx={ctx} /></Match>
        <Match when={sub() === "foryou"}><RecommendationsPage ctx={ctx} /></Match>
        <Match when={sub() === "trending"}><TrendingPage ctx={ctx} /></Match>
      </Switch>
    </div>
  );
}

// ─── Trending Page ────────────────────────────────────────────────
export function TrendingPage(props) {
  const { ctx } = props;
  const [songs, setSongs] = createSignal([]);
  const [loading, setLoading] = createSignal(true);

  createEffect(() => {
    fetch("/api/library/trending?limit=50", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.songs) setSongs(data.songs); })
      .finally(() => setLoading(false));
  });

  return (
    <div class="page">
      <div class="page-header">
        <div class="page-kicker">Most played</div>
        <h1 class="page-title">Trending</h1>
      </div>
      <Show when={loading()}><div class="loading-state"><Icon name="spinner" size={18} /><span>Loading...</span></div></Show>
      <div class="track-body" style="padding:0 24px">
        <For each={songs()}>
          {(song, i) => {
            const t = () => ctx.trackById()[song.id];
            return (
              <div class="track-row comfortable" onDblClick={() => t() && ctx.playTrack(t().n)}>
                <div class="t-num"><span class="t-n mono">{i() + 1}</span></div>
                <div class="t-title">{song.track}</div>
                <div class="t-movie"><button class="album-link" onClick={() => ctx.openAlbum(song.movie)}>{song.movie}</button></div>
                <div class="t-director" style="color:var(--fg-mute);font-size:12px">{song.musicDirector}</div>
                <div class="track-plays">{song.playCount?.toLocaleString()}</div>
                <div class="t-actions">
                  <Show when={t()}>
                    <button class="t-icon" onClick={() => ctx.playTrack(t().n)}><Icon name="play" size={12} /></button>
                    <button class="t-icon" onClick={() => ctx.addToQueue(t().n)}><Icon name="plus" size={12} /></button>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
