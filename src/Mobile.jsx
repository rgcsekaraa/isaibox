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
  { id: "directors", label: "Directors" },
  { id: "singers", label: "Singers" },
];
const SEARCH_HELP_TEXT = "Choose whether this search should show albums, songs, music directors, or singers.";
const MOBILE_SKELETON_ROWS = Array.from({ length: 8 });

function MobileLoadingState(props) {
  return (
    <div class="m-loading-state">
      <Icon name="spinner" size={20} />
      <span>{props.text || "Loading..."}</span>
    </div>
  );
}

function MobileTrackSkeleton() {
  return (
    <div class="m-track-skeleton" aria-label="Loading tracks">
      <For each={MOBILE_SKELETON_ROWS}>
        {() => (
          <div class="m-track-skeleton-row">
            <div class="m-track-skeleton-lines">
              <span class="sk m-sk-title" />
              <span class="sk m-sk-sub" />
            </div>
            <span class="sk m-sk-icon" />
          </div>
        )}
      </For>
    </div>
  );
}

export function MobileHeader(props) {
  return (
    <header class="m-header">
      <Show
        when={props.searchOpen}
        fallback={
          <>
            <div class="m-header-brand">
              <span class="m-brand-mark"><Icon name="logo" size={16} /></span>
              <span class="m-brand-name">isaibox</span>
            </div>
            <div class="m-header-actions">
              <button class="m-icon-btn" onClick={() => props.setSearchOpen(true)}>
                <Icon name="search" size={20} />
              </button>
              <button
                class="m-icon-btn"
                classList={{ active: props.settingsOpen }}
                onClick={() => props.setSettingsOpen?.((open) => !open)}
              >
                <Icon name="settings" size={18} />
              </button>
            </div>
          </>
        }
      >
        <div class="m-search-row">
          <button class="m-icon-btn" onClick={() => { props.setSearch(""); props.setSearchOpen(false); }}>
            <Icon name="chevron-left" size={20} />
          </button>
          <div class="m-search-input">
            <Icon name="search" size={15} />
            <input
              autofocus
              placeholder={props.searchPlaceholder || "Search songs, albums, directors..."}
              value={props.search}
              onInput={(e) => props.setSearch(e.currentTarget.value)}
            />
            <Show when={props.search}>
              <button class="m-icon-btn small" onClick={() => props.setSearch("")}>
                <Icon name="x" size={14} />
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </header>
  );
}

const TAB_ITEMS = [
  { id: "Library", label: "Library", icon: "library" },
  { id: "Recents", label: "Recents", icon: "clock" },
  { id: "Favorites", label: "Likes", icon: "heart" },
];

export function MobileBottomTabs(props) {
  return (
    <nav class="m-bottom-tabs">
      <For each={TAB_ITEMS}>
        {(it) => (
          <button
            class="m-tab"
            classList={{ active: props.tab === it.id }}
            onClick={() => props.setTab(it.id)}
          >
            <Icon
              name={props.tab === it.id && it.icon === "heart" ? "heart-fill" : it.icon}
              size={20}
            />
            <span>{it.label}</span>
          </button>
        )}
      </For>
    </nav>
  );
}

export function MobileLibraryPage(props) {
  const { ctx } = props;
  const sections = () => [
    { label: "Global", items: ctx.playlistSections().global },
    { label: "Personal", items: ctx.playlistSections().personal },
  ];

  const onPick = (id) => {
    ctx.setActivePlaylist(id);
    ctx.setMobileView("playlist");
  };

  const filter = (items) =>
    ctx.playlistSearch() ? items.filter((p) => p.name.toLowerCase().includes(ctx.playlistSearch().toLowerCase())) : items;

  return (
    <div class="m-page">
      <div class="m-page-header">
        <div class="m-page-kicker">Your library</div>
        <h1 class="m-page-title">Library</h1>
        <div class="m-playlist-search">
          <Icon name="search" size={14} />
          <input
            placeholder="Search playlists..."
            value={ctx.playlistSearch()}
            onInput={(event) => ctx.setPlaylistSearch(event.currentTarget.value)}
          />
          <Show when={ctx.playlistSearch()}>
            <button class="m-icon-btn small" onClick={() => ctx.setPlaylistSearch("")}>
              <Icon name="x" size={13} />
            </button>
          </Show>
        </div>
      </div>
      <For each={sections()}>
        {(sec) => {
          const items = filter(sec.items);
          return (
            <Show when={items.length > 0}>
              <div class="m-section">
                <div class="m-section-head">
                  <span class="m-section-label">{sec.label}</span>
                  <span class="m-section-count">{items.length}</span>
                </div>
                <ul class="m-pl-list">
                  <For each={items}>
                    {(p) => (
                      <li>
	                        <button class="m-pl-item" onClick={() => onPick(p.id)}>
	                          <div class="m-pl-meta">
	                            <div class="m-pl-name">{p.name}</div>
                            <div class="m-pl-sub">{p.count} tracks</div>
                          </div>
                          <Icon name="chevron-right" size={16} />
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
          );
        }}
      </For>
      <Show when={!ctx.loading() && ctx.playlistSearch() && sections().every((section) => filter(section.items).length === 0)}>
        <div class="empty">No playlists match "{ctx.playlistSearch()}"</div>
      </Show>
    </div>
  );
}

export function MobilePlaylistDetail(props) {
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

  const filteredTracks = () => ctx.filteredTracks();

  return (
    <div class="m-page m-page-detail">
      <div class="m-detail-panel">
        <div class="m-detail-top">
          <button
            class="m-detail-back"
            onClick={() => {
              if (isSearch()) {
                ctx.setSongSearch("");
                ctx.setMobileView("list");
              } else if (isAlbum()) {
                ctx.closeAlbum();
              } else {
                ctx.setMobileView("list");
              }
            }}
          >
            <Icon name="chevron-left" size={20} />
            <span>Library</span>
          </button>
          <div class="m-detail-meta">
            <Show when={isAlbum()}>
              <div class="m-page-kicker">Album</div>
            </Show>
            <div class="m-detail-title-row">
              <h2 class="m-detail-title" classList={{ search: isSearch() }}>{playlist().name}</h2>
              <Show when={isSearch()}>
                <button class="search-help mobile" title={SEARCH_HELP_TEXT} aria-label={SEARCH_HELP_TEXT}>
                  <Icon name="help" size={12} />
                </button>
              </Show>
            </div>
          </div>
          <span class="m-detail-spacer" aria-hidden="true" />
        </div>
        <Show when={isSearch()}>
          <div class="m-search-tabs" role="tablist" aria-label="Search result type">
            <For each={SEARCH_TABS}>
              {(tab) => {
                const count = () => searchCounts()[tab.id] || 0;
                const disabled = () => count() === 0 && activeSearchTab() !== tab.id;
                return (
                  <button
                    role="tab"
                    class="m-search-tab"
                    classList={{ active: activeSearchTab() === tab.id }}
                    disabled={disabled()}
                    aria-disabled={disabled()}
                    onClick={() => !disabled() && ctx.setSearchResultTab(tab.id)}
                  >
                    <span>{tab.label}</span>
                    <span>{count()}</span>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
        <Show when={isAlbum() && filteredTracks().length > 0}>
          <button class="btn-secondary m-play-album" onClick={() => ctx.playPlaylist(ctx.activeAlbumTracks(), { type: "album", label: ctx.activeAlbum(), caption: "Album" })}>
            <Icon name="play" size={13} /><span>Play</span>
          </button>
        </Show>
        <Show when={!isSearch() || activeSearchTab() === "songs"}>
          <div class="m-detail-controlbar">
            <Show when={hasScopedTracks()}>
              <div class="m-track-search">
                <Icon name="search" size={14} />
                <input
                  placeholder={scopedPlaceholder()}
                  value={ctx.trackSearch()}
                  onInput={(event) => ctx.setTrackSearch(event.currentTarget.value)}
                />
                <Show when={ctx.trackSearch()}>
                  <button class="m-icon-btn small" onClick={() => ctx.setTrackSearch("")}>
                    <Icon name="x" size={13} />
                  </button>
                </Show>
              </div>
            </Show>
            <div class="m-sort-control m-sort-inline">
              <MenuSelect class="sort-menu" label="Sort" value={ctx.sort()} onChange={ctx.setSort} options={SORT_OPTIONS} />
            </div>
          </div>
        </Show>
      </div>
      <Show when={isSearch() && activeSearchTab() === "albums"}>
        <section class="m-search-albums">
          <Show when={!ctx.searchPending()} fallback={<MobileLoadingState text="Searching..." />}>
            <Show when={ctx.searchAlbumResults().length > 0} fallback={<div class="empty">No albums match this search.</div>}>
              <For each={ctx.searchAlbumResults()}>
                {(album) => (
                  <div class="m-search-album-row">
                    <button class="m-search-album-main" onClick={() => ctx.openAlbum(album.name)}>
                      <span class="m-search-album-title">{album.name}</span>
                      <span class="m-search-album-sub">
                        <Show when={album.matchLabel && album.matchValue}>
                          {album.matchLabel}: {album.matchValue}
                        </Show>
                        <span>{album.count} tracks{album.year ? ` · ${album.year}` : ""}</span>
                      </span>
                    </button>
                    <button class="m-icon" onClick={() => ctx.playPlaylist(album.tracks, { type: "album", label: album.name, caption: "Album" })}>
                      <Icon name="play" size={14} />
                    </button>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </section>
      </Show>
      <Show when={isSearch() && (activeSearchTab() === "directors" || activeSearchTab() === "singers")}>
        <section class="m-search-people">
          <Show when={!ctx.searchPending()} fallback={<MobileLoadingState text="Searching..." />}>
            <For each={activeSearchTab() === "directors" ? ctx.searchDirectorResults() : ctx.searchSingerResults()}>
              {(item) => (
                <div class="m-search-person-row">
                  <button class="m-search-person-main" onClick={() => ctx.openSearchPersonAlbums(item.name)}>
                    <span class="m-search-person-title">{item.name}</span>
                    <span class="m-search-person-sub">{item.albumCount} albums · {item.trackCount} songs</span>
                  </button>
                </div>
              )}
            </For>
          </Show>
        </section>
      </Show>
      <Show when={!isSearch() || activeSearchTab() === "songs"}>
        <div class="m-track-body">
        <For each={filteredTracks()}>
          {(t) => (
            <div
              class="m-track-row"
              classList={{ current: ctx.currentN() === t.n }}
              onClick={() => ctx.playTrack(t.n)}
            >
	              <div class="m-tr-meta">
	                <div class="m-tr-title">
	                  <Show when={ctx.currentN() === t.n && (ctx.isPlaying() || ctx.audioLoading())}>
	                    <span class="m-tr-wave" classList={{ loading: ctx.audioLoading() }}>
                        <Icon name={ctx.audioLoading() ? "spinner" : "wave"} size={14} />
                      </span>
	                  </Show>
	                  <span>{t.title}</span>
	                </div>
                <div class="m-tr-sub">
                  <span>{t.singer}</span>
                  <Show when={isSearch() && t._matchLabel && t._matchLabel !== "Song"}>
                    <span class="m-tr-match">{t._matchLabel}: {t._matchValue}</span>
                  </Show>
                  <Show when={t.movie}>
                    <button
                      class="m-tr-album"
                      onClick={(event) => {
                        event.stopPropagation();
                        ctx.openAlbum(t.movie);
                      }}
                    >
                      {t.movie}
                    </button>
                  </Show>
                </div>
              </div>
              <div class="m-tr-actions">
                <button
                  class="m-icon"
                  classList={{ active: t.fav }}
                  onClick={(e) => { e.stopPropagation(); ctx.toggleFav(t.n); }}
                >
                  <Icon name={t.fav ? "heart-fill" : "heart"} size={16} />
                </button>
                <button
                  class="m-icon"
                  onClick={(e) => { e.stopPropagation(); ctx.addToQueue(t.n); }}
                >
                  <Icon name="plus" size={16} />
                </button>
              </div>
            </div>
          )}
        </For>
        <Show when={filteredTracks().length === 0}>
          <Show
            when={ctx.searchPending()}
            fallback={
              <Show
                when={ctx.loading() || ctx.playlistLoading()}
                fallback={<div class="empty">{ctx.trackSearch() ? `No tracks match "${ctx.trackSearch()}"` : "No tracks available"}</div>}
              >
                <MobileTrackSkeleton />
              </Show>
            }
          >
            <MobileLoadingState text="Searching..." />
          </Show>
        </Show>
      </div>
      </Show>
    </div>
  );
}
