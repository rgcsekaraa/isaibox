import { For, Show } from "solid-js";
import { Icon } from "./Icon.jsx";

const TABS = ["Library", "Recents", "Favorites"];

const SHORTCUT_GROUPS = [
  {
    title: "Playback",
    items: [
      { keys: ["Space", "K"], label: "Play or pause" },
      { keys: ["J", "←"], label: "Previous track" },
      { keys: ["L", "→"], label: "Next track" },
      { keys: ["S"], label: "Toggle shuffle" },
      { keys: ["R"], label: "Cycle repeat" },
      { keys: ["M"], label: "Mute or unmute" },
    ],
  },
  {
    title: "Library",
    items: [
      { keys: ["/"], label: "Focus search" },
      { keys: ["F"], label: "Favorite current track" },
      { keys: ["+", "="], label: "Add current track to queue" },
      { keys: ["Q"], label: "Collapse or open queue" },
    ],
  },
  {
    title: "Panels",
    items: [
      { keys: ["?"], label: "Show keyboard shortcuts" },
      { keys: ["Esc"], label: "Close drawer, settings, or dialog" },
    ],
  },
];

export function TopBar(props) {
  return (
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"><Icon name="logo" size={18} /></span>
        <span class="brand-name">isaibox</span>
      </div>
      <nav class="tabs">
        <For each={TABS}>
          {(t) => (
            <button
              class="tab"
              classList={{ active: props.tab === t }}
              onClick={() => props.setTab(t)}
            >
              <span>{t}</span>
            </button>
          )}
        </For>
      </nav>
      <div class="topbar-right">
        <div class="search" classList={{ "has-value": !!props.search }}>
          <Icon name="search" size={14} />
          <input
            placeholder={props.searchPlaceholder || "Search tracks and singers..."}
            value={props.search}
            onInput={(e) => props.setSearch(e.currentTarget.value)}
          />
          <span class="kbd">/</span>
          {props.search && (
            <button class="search-clear" onClick={() => props.setSearch("")}>
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
        <button
          class="icon-btn"
          classList={{ active: props.settingsOpen }}
          title="Settings"
          onClick={() => props.setSettingsOpen?.((open) => !open)}
        >
          <Icon name="settings" size={15} />
        </button>
        <button
          class="icon-btn"
          classList={{ active: props.shortcutsOpen }}
          title="Keyboard shortcuts"
          onClick={() => props.setShortcutsOpen?.((open) => !open)}
        >
          <Icon name="help" size={16} />
        </button>
      </div>
    </header>
  );
}

export function ShortcutsDrawer(props) {
  return (
    <div
      class="shortcut-backdrop"
      classList={{ open: props.open }}
      onClick={() => props.setOpen?.(false)}
    >
      <aside class="shortcut-drawer" onClick={(event) => event.stopPropagation()}>
        <div class="shortcut-head">
          <div>
            <div class="shortcut-kicker">Desktop controls</div>
            <h2 class="shortcut-title">Keyboard shortcuts</h2>
          </div>
          <button class="icon-btn" onClick={() => props.setOpen?.(false)} title="Close shortcuts">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div class="shortcut-body">
          <For each={SHORTCUT_GROUPS}>
            {(group) => (
              <section class="shortcut-section">
                <div class="shortcut-section-title">{group.title}</div>
                <For each={group.items}>
                  {(item) => (
                    <div class="shortcut-row">
                      <div class="shortcut-keys">
                        <For each={item.keys}>
                          {(key) => <kbd>{key}</kbd>}
                        </For>
                      </div>
                      <div class="shortcut-label">{item.label}</div>
                    </div>
                  )}
                </For>
              </section>
            )}
          </For>
        </div>
      </aside>
    </div>
  );
}

export function Sidebar(props) {
  const SKELETON_ITEMS = Array.from({ length: 8 });
  const playlistQuery = () => String(props.playlistSearch || "").trim().toLowerCase();
  const sections = () => [
    { label: "Global", items: props.playlistSections?.global || [], addable: false },
    { label: "Personal", items: props.playlistSections?.personal || [], addable: true },
  ].map((section) => ({
    ...section,
    items: playlistQuery()
      ? section.items.filter((item) => item.name.toLowerCase().includes(playlistQuery()))
      : section.items,
  }));
  return (
    <aside class="sidebar">
      <div class="sidebar-search">
        <Icon name="search" size={13} />
        <input
          placeholder="Search playlists..."
          value={props.playlistSearch || ""}
          onInput={(event) => props.setPlaylistSearch?.(event.currentTarget.value)}
        />
        {props.playlistSearch && (
          <button class="search-clear" onClick={() => props.setPlaylistSearch?.("")}>
            <Icon name="x" size={11} />
          </button>
        )}
      </div>
      <For each={sections()}>
        {(section) => (
          <div class="sidebar-section">
            <div class="sidebar-head">
              <span class="sidebar-label">{section.label}</span>
              {section.addable ? (
                <button class="sidebar-add" title="New playlist" onClick={() => props.onCreatePlaylist?.()}>
                  <Icon name="plus" size={11} />
                </button>
              ) : (
                <span class="sidebar-meta">{section.items.length}</span>
              )}
            </div>
            <ul class="playlist-list">
              <For each={section.items}>
                {(p) => (
                  <li>
                    <button
                      class="playlist-item"
                      classList={{ active: props.active === p.id }}
                      onClick={() => { props.setActive(p.id); props.setTab("Library"); }}
                    >
                      <span class="pl-bar" />
                      <span class="pl-name" title={p.name}>{p.name}</span>
                      <span class="pl-count">{p.count}</span>
                    </button>
                  </li>
                )}
              </For>
              <Show when={props.loading && section.items.length === 0}>
                <For each={SKELETON_ITEMS}>
                  {() => (
                    <li>
                      <div class="playlist-item skeleton">
                        <span class="pl-bar" />
                        <span class="skel sidebar-skel-name" />
                        <span class="skel sidebar-skel-count" />
                      </div>
                    </li>
                  )}
                </For>
              </Show>
            </ul>
          </div>
        )}
      </For>
    </aside>
  );
}
