import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { Icon } from "./Icon.jsx";

function parseLrc(lrc) {
  if (!lrc) return [];
  const lines = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(/^\[(\d+):(\d+\.\d+)\](.*)/);
    if (!m) continue;
    const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
    lines.push({ time, text: m[3].trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function LyricsPanel(props) {
  const [lyrics, setLyrics] = createSignal(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [activeIndex, setActiveIndex] = createSignal(-1);
  let lyricsEl;
  let prevTrackId = null;

  const fetchLyrics = async (track) => {
    if (!track) return;
    if (track.id === prevTrackId) return;
    prevTrackId = track.id;
    setLoading(true);
    setError("");
    setLyrics(null);
    try {
      const params = new URLSearchParams({
        title: track.title || "",
        artist: track.singer || "",
        album: track.movie || "",
      });
      const res = await fetch(`/api/lyrics?${params}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError("Lyrics not found for this track.");
        return;
      }
      const synced = parseLrc(data.synced);
      setLyrics({ synced, plain: data.plain || "", hasSynced: synced.length > 0 });
    } catch {
      setError("Unable to load lyrics.");
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    fetchLyrics(props.track);
  });

  // Sync active line with playback position
  createEffect(() => {
    const pos = props.position;
    const data = lyrics();
    if (!data?.hasSynced) return;
    const lines = data.synced;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= pos) idx = i;
      else break;
    }
    if (idx !== activeIndex()) {
      setActiveIndex(idx);
      if (idx >= 0 && lyricsEl) {
        const el = lyricsEl.querySelector(`[data-line="${idx}"]`);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  });

  const lines = () => lyrics()?.hasSynced ? lyrics().synced : (lyrics()?.plain ? [{ time: -1, text: lyrics().plain }] : []);
  const track = () => props.track;

  return (
    <div class="lyrics-panel">
      <div class="lyrics-header">
        <div>
          <div class="lyrics-kicker">Lyrics</div>
          <div class="lyrics-title">{track()?.title}</div>
        </div>
        <button class="icon-btn" onClick={() => props.onClose?.()} title="Close lyrics">
          <Icon name="x" size={15} />
        </button>
      </div>
      <div class="lyrics-body" ref={lyricsEl}>
        <Show when={loading()}>
          <div class="lyrics-loading"><Icon name="spinner" size={18} /></div>
        </Show>
        <Show when={!loading() && error()}>
          <div class="lyrics-empty">{error()}</div>
        </Show>
        <Show when={!loading() && !error() && lyrics()}>
          <Show
            when={lyrics()?.hasSynced}
            fallback={<pre class="lyrics-plain">{lyrics()?.plain}</pre>}
          >
            <For each={lines()}>
              {(line, i) => (
                <div
                  class="lyrics-line"
                  classList={{ active: i() === activeIndex() }}
                  data-line={i()}
                >
                  {line.text || " "}
                </div>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  );
}
