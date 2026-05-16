import { createSignal, Show, onCleanup } from "solid-js";
import { Icon } from "./Icon.jsx";
import { parseDur, fmtTime } from "./utils.js";

// ─── Scrubber (shared) ───────────────────────────────────────────
export function Scrubber(props) {
  let trackEl;
  const [dragging, setDragging] = createSignal(false);
  const [hoverPct, setHoverPct] = createSignal(null);
  let listening = false;

  const pct = () => (props.max > 0 ? (props.value / props.max) * 100 : 0);

  const setFromX = (clientX) => {
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    props.onChange((x / rect.width) * props.max);
  };

  const removeDragListeners = () => {
    if (!listening) return;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
    window.removeEventListener("touchcancel", onUp);
    listening = false;
  };

  const onMove = (e) => {
    if (!dragging()) return;
    setFromX(e.touches ? e.touches[0].clientX : e.clientX);
  };
  const onUp = () => {
    setDragging(false);
    removeDragListeners();
  };

  const ensureDragListeners = () => {
    if (listening) return;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
    listening = true;
  };
  onCleanup(removeDragListeners);

  return (
    <div
      class={`scrubber ${props.size || "default"}`}
      ref={trackEl}
      onMouseDown={(e) => { setDragging(true); ensureDragListeners(); setFromX(e.clientX); }}
      onTouchStart={(e) => { setDragging(true); ensureDragListeners(); setFromX(e.touches[0].clientX); }}
      onMouseMove={(e) => {
        const rect = trackEl.getBoundingClientRect();
        setHoverPct(((e.clientX - rect.left) / rect.width) * 100);
      }}
      onMouseLeave={() => setHoverPct(null)}
    >
      <div class="scrubber-track">
        <div class="scrubber-fill" style={{ width: `${pct()}%` }} />
        <Show when={hoverPct() !== null && !dragging()}>
          <div class="scrubber-hover" style={{ left: `${hoverPct()}%` }} />
        </Show>
        <div class="scrubber-handle" style={{ left: `${pct()}%` }} />
      </div>
    </div>
  );
}

// ─── Desktop dock ────────────────────────────────────────────────
export function NowPlayingDock(props) {
  const duration = () => props.duration || parseDur(props.track.duration);
  return (
    <footer class="dock">
      <div class="dock-grid">
        <div class="dock-left">
          <div class="dock-meta">
            <div class="dock-song" title={props.track.title}>{props.track.title}</div>
            <div class="dock-sub">
              <span>{props.track.singer}</span>
              <span class="dock-sep">from</span>
              <button class="dock-album" onClick={() => props.onOpenAlbum?.()}>{props.track.movie}</button>
            </div>
          </div>
          <button class="icon-btn small" classList={{ active: props.track.fav }} title="Favorite" onClick={() => props.onFav()}>
            <Icon name={props.track.fav ? "heart-fill" : "heart"} size={15} />
          </button>
        </div>

        <div class="dock-center">
          <div class="dock-transport">
            <button class="tr-btn" classList={{ active: props.shuffle }} onClick={() => props.setShuffle(!props.shuffle)}>
              <Icon name="shuffle" size={15} />
            </button>
            <button class="tr-btn" onClick={() => props.onPrev()}><Icon name="prev" size={17} /></button>
            <button class="tr-play" onClick={() => props.setIsPlaying(!props.isPlaying)}>
              <Icon name={props.isPlaying ? "pause" : "play"} size={16} />
            </button>
            <button class="tr-btn" onClick={() => props.onNext()}><Icon name="next" size={17} /></button>
            <button class="tr-btn" classList={{ active: props.repeat !== "off" }} onClick={() => props.cycleRepeat()}>
              <Icon name="repeat" size={14} />
              <Show when={props.repeat === "one"}><span class="tr-badge">1</span></Show>
            </button>
          </div>
          <div class="dock-scrub-row">
            <span class="dock-time mono">{fmtTime(props.position)}</span>
            <Scrubber value={props.position} max={duration()} onChange={props.setPosition} />
            <span class="dock-time mono">{fmtTime(duration())}</span>
          </div>
        </div>

        <div class="dock-right">
          <button class="icon-btn small" title="Add to queue" onClick={() => props.onAddToQueue?.()}><Icon name="plus" size={15} /></button>
          <button class="icon-btn small" title="Save to playlist" onClick={() => props.onSaveToPlaylist?.()}><Icon name="dots" size={15} /></button>
          <button class="icon-btn small" title="Share track" onClick={() => props.onShare?.()}><Icon name="share" size={15} /></button>
          <button class="icon-btn small" title="Playback speed" onClick={() => props.cycleSpeed()}><span class="mono speed">{props.speed}×</span></button>
          <button class="icon-btn small" title={props.queueCollapsed ? "Open queue" : "Collapse queue"} onClick={() => props.onToggleQueue?.()}>
            <Icon name="queue" size={15} />
          </button>
          <VolumeControl
            muted={props.muted}
            volume={props.volume}
            setMuted={props.setMuted}
            setVolume={props.setVolume}
          />
        </div>
      </div>
    </footer>
  );
}

function VolumeControl(props) {
  let trackEl;
  let listening = false;

  const setFromX = (clientX) => {
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const next = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    props.setVolume(next);
    if (next > 0 && props.muted) props.setMuted(false);
  };

  const onMove = (event) => setFromX(event.touches ? event.touches[0].clientX : event.clientX);
  const removeListeners = () => {
    if (!listening) return;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", removeListeners);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", removeListeners);
    window.removeEventListener("touchcancel", removeListeners);
    listening = false;
  };
  const addListeners = () => {
    if (listening) return;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", removeListeners);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", removeListeners);
    window.addEventListener("touchcancel", removeListeners);
    listening = true;
  };
  onCleanup(removeListeners);

  return (
    <div class="vol">
      <button class="icon-btn small" title={props.muted ? "Unmute" : "Mute"} onClick={() => props.setMuted(!props.muted)}>
        <Icon name={props.muted || props.volume === 0 ? "volume-mute" : "volume"} size={15} />
      </button>
      <div
        class="vol-track"
        ref={trackEl}
        onMouseDown={(e) => { setFromX(e.clientX); addListeners(); }}
        onTouchStart={(e) => { setFromX(e.touches[0].clientX); addListeners(); }}
      >
        <div class="vol-fill" style={{ width: `${props.muted ? 0 : props.volume}%` }} />
        <div class="vol-handle" style={{ left: `${props.muted ? 0 : props.volume}%` }} />
      </div>
      <span class="mono vol-num">{Math.round(props.muted ? 0 : props.volume)}</span>
    </div>
  );
}

// ─── Mobile mini player ──────────────────────────────────────────
export function MiniPlayer(props) {
  const duration = () => props.duration || parseDur(props.track.duration);
  const pct = () => duration() > 0 ? (props.position / duration()) * 100 : 0;
  return (
    <div class="mini-player" onClick={() => props.onExpand()}>
      <div class="mini-progress"><div class="mini-progress-fill" style={{ width: `${pct()}%` }} /></div>
      <div class="mini-content">
        <div class="mini-meta">
          <div class="mini-title">{props.track.title}</div>
          <div class="mini-sub">{props.track.singer}</div>
        </div>
        <div class="mini-actions" onClick={(e) => e.stopPropagation()}>
          <button class="mini-btn" onClick={() => props.setIsPlaying(!props.isPlaying)}>
            <Icon name={props.isPlaying ? "pause" : "play"} size={18} />
          </button>
          <button class="mini-btn" onClick={() => props.onNext()}>
            <Icon name="next" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile player sheet ─────────────────────────────────────────
export function FullPlayer(props) {
  const duration = () => props.duration || parseDur(props.track.duration);
  return (
    <div class="full-player">
      <div class="fp-content">
        <div class="fp-header">
          <button class="fp-icon" onClick={() => props.onCollapse()}>
            <Icon name="chevron-down" size={20} />
          </button>
          <div class="fp-header-meta">
            <div class="fp-header-kicker">Album</div>
            <button class="fp-header-title fp-album-title" onClick={() => props.onOpenAlbum?.()}>{props.track.movie}</button>
          </div>
          <button class="fp-icon" onClick={() => props.onSaveToPlaylist?.()}><Icon name="dots" size={18} /></button>
        </div>

        <div class="fp-info">
          <div class="fp-title-row">
            <div class="fp-info-text">
              <div class="fp-song-title">{props.track.title}</div>
              <div class="fp-song-sub">{props.track.singer}</div>
              <Show when={props.track.movie}>
                <button class="fp-album-link" onClick={() => props.onOpenAlbum?.()}>
                  <span>Album</span>
                  <strong>{props.track.movie}</strong>
                </button>
              </Show>
            </div>
            <button class="fp-icon big" classList={{ active: props.track.fav }} onClick={() => props.onFav()}>
              <Icon name={props.track.fav ? "heart-fill" : "heart"} size={20} />
            </button>
          </div>

          <div class="fp-scrub">
            <Scrubber value={props.position} max={duration()} onChange={props.setPosition} size="large" />
            <div class="fp-times mono">
              <span>{fmtTime(props.position)}</span>
              <span>-{fmtTime(Math.max(0, duration() - props.position))}</span>
            </div>
          </div>

          <div class="fp-transport">
            <button class="fp-tr-btn" classList={{ active: props.shuffle }} onClick={() => props.setShuffle(!props.shuffle)}>
              <Icon name="shuffle" size={18} />
            </button>
            <button class="fp-tr-btn" onClick={() => props.onPrev()}>
              <Icon name="prev" size={26} />
            </button>
            <button class="fp-tr-play" onClick={() => props.setIsPlaying(!props.isPlaying)}>
              <Icon name={props.isPlaying ? "pause" : "play"} size={22} />
            </button>
            <button class="fp-tr-btn" onClick={() => props.onNext()}>
              <Icon name="next" size={26} />
            </button>
            <button class="fp-tr-btn" classList={{ active: props.repeat !== "off" }} onClick={() => props.cycleRepeat()}>
              <Icon name="repeat" size={16} />
              <Show when={props.repeat === "one"}><span class="tr-badge mobile">1</span></Show>
            </button>
          </div>

          <div class="fp-actions">
            <button class="fp-action" onClick={() => props.onAddToQueue?.()}>
              <Icon name="queue" size={16} />
              <span>Add</span>
            </button>
            <button class="fp-action" onClick={() => props.onShare?.()}>
              <Icon name="share" size={16} />
              <span>Share</span>
            </button>
            <button class="fp-action" onClick={() => props.cycleSpeed()}>
              <span class="mono">{props.speed}×</span>
              <span>Speed</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
