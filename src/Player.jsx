import { createSignal, Show, onCleanup } from "solid-js";
import { Icon } from "./Icon.jsx";
import { parseDur, fmtTime } from "./utils.js";

function PlaybackSourcePill(props) {
  const source = () => props.source;
  return (
    <Show when={source()}>
      {(item) => (
        <button class={`play-source-pill ${props.compact ? "compact" : ""}`} title={`Open ${item().caption}: ${item().label}`} onClick={(event) => {
          event.stopPropagation();
          props.onOpen?.();
        }}>
          <span>{item().caption}</span>
          <strong>{item().label}</strong>
        </button>
      )}
    </Show>
  );
}

// ─── Scrubber (shared) ───────────────────────────────────────────
export function Scrubber(props) {
  let trackEl;
  const [dragging, setDragging] = createSignal(false);
  const [hoverPct, setHoverPct] = createSignal(null);
  let activePointerId = null;

  const max = () => {
    const value = Number(props.max);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };

  const pct = () => {
    const limit = max();
    if (!limit) return 0;
    return Math.max(0, Math.min(100, (Number(props.value || 0) / limit) * 100));
  };

  const setFromX = (clientX) => {
    if (!trackEl) return;
    const limit = max();
    if (!limit) return;
    const rect = trackEl.getBoundingClientRect();
    if (!rect.width) return;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    props.onChange((x / rect.width) * limit);
  };

  const setHoverFromX = (clientX) => {
    if (!trackEl || dragging()) return;
    const rect = trackEl.getBoundingClientRect();
    if (!rect.width) return;
    const percent = ((clientX - rect.left) / rect.width) * 100;
    setHoverPct(Math.max(0, Math.min(100, percent)));
  };

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    activePointerId = event.pointerId;
    setDragging(false);
    setDragging(true);
    trackEl?.setPointerCapture?.(event.pointerId);
    setFromX(event.clientX);
  };

  const onPointerMove = (event) => {
    if (dragging()) {
      if (activePointerId !== null && event.pointerId !== activePointerId) return;
      event.preventDefault();
      event.stopPropagation();
      setFromX(event.clientX);
      return;
    }
    setHoverFromX(event.clientX);
  };

  const finishDrag = (event) => {
    if (activePointerId !== null && event?.pointerId !== activePointerId) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (activePointerId !== null) {
      trackEl?.releasePointerCapture?.(activePointerId);
    }
    activePointerId = null;
    setDragging(false);
    setHoverPct(null);
  };

  onCleanup(() => {
    if (activePointerId !== null) {
      trackEl?.releasePointerCapture?.(activePointerId);
    }
  });

  return (
    <div
      class={`scrubber ${props.size || "default"}`}
      ref={trackEl}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onPointerLeave={() => {
        if (!dragging()) setHoverPct(null);
      }}
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
            <PlaybackSourcePill source={props.playbackSource} onOpen={props.onOpenPlaybackSource} compact />
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
            <button class="tr-play" classList={{ loading: props.audioLoading }} onClick={() => props.setIsPlaying(!props.isPlaying)}>
              <Show when={props.audioLoading} fallback={<Icon name={props.isPlaying ? "pause" : "play"} size={16} />}>
                <Icon name="spinner" size={17} />
              </Show>
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
          <div class="mini-sub-row">
            <span class="mini-sub">{props.track.singer}</span>
            <PlaybackSourcePill source={props.playbackSource} onOpen={props.onOpenPlaybackSource} compact />
          </div>
        </div>
        <div class="mini-actions" onClick={(e) => e.stopPropagation()}>
          <button class="mini-btn" classList={{ loading: props.audioLoading }} onClick={() => props.setIsPlaying(!props.isPlaying)}>
            <Show when={props.audioLoading} fallback={<Icon name={props.isPlaying ? "pause" : "play"} size={18} />}>
              <Icon name="spinner" size={18} />
            </Show>
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
            <div class="fp-header-kicker">{props.playbackSource?.caption || "Album"}</div>
            <button class="fp-header-title fp-album-title" onClick={() => props.playbackSource ? props.onOpenPlaybackSource?.() : props.onOpenAlbum?.()}>
              {props.playbackSource?.label || props.track.movie}
            </button>
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
            <button class="fp-tr-play" classList={{ loading: props.audioLoading }} onClick={() => props.setIsPlaying(!props.isPlaying)}>
              <Show when={props.audioLoading} fallback={<Icon name={props.isPlaying ? "pause" : "play"} size={22} />}>
                <Icon name="spinner" size={23} />
              </Show>
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
