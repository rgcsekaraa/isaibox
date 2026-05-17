import { createSignal, createEffect, onCleanup, For } from "solid-js";
import { Icon } from "./Icon.jsx";

const BANDS = [
  { freq: 32, label: "32" },
  { freq: 64, label: "64" },
  { freq: 125, label: "125" },
  { freq: 250, label: "250" },
  { freq: 500, label: "500" },
  { freq: 1000, label: "1K" },
  { freq: 2000, label: "2K" },
  { freq: 4000, label: "4K" },
  { freq: 8000, label: "8K" },
  { freq: 16000, label: "16K" },
];

const PRESETS = {
  Flat:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass Boost": [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  Treble:    [0, 0, 0, 0, 0, 2, 4, 6, 8, 8],
  Vocal:     [-2, -2, 0, 4, 6, 6, 4, 0, -2, -2],
  Classical: [4, 3, 2, 0, 0, 0, 0, 2, 3, 4],
  Dance:     [6, 5, 2, 0, 0, 0, 2, 4, 5, 4],
  Rock:      [4, 3, -1, -3, 0, 2, 4, 5, 5, 4],
};

const EQ_STORAGE_KEY = "isaibox-eq";

function loadSavedGains() {
  try {
    const saved = JSON.parse(localStorage.getItem(EQ_STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length === BANDS.length) return saved;
  } catch {}
  return BANDS.map(() => 0);
}

// Singleton AudioContext + filter chain shared across mounts
let _ctx = null;
let _filters = null;
let _sourceNode = null;

function ensureChain(audioEl) {
  if (_ctx && _filters && _sourceNode) return { ctx: _ctx, filters: _filters };
  try {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _filters = BANDS.map(({ freq }, i) => {
      const f = _ctx.createBiquadFilter();
      f.type = i === 0 ? "lowshelf" : i === BANDS.length - 1 ? "highshelf" : "peaking";
      f.frequency.value = freq;
      f.gain.value = 0;
      f.Q.value = 1.4;
      return f;
    });
    for (let i = 0; i < _filters.length - 1; i++) _filters[i].connect(_filters[i + 1]);
    _filters[_filters.length - 1].connect(_ctx.destination);
    if (audioEl) {
      _sourceNode = _ctx.createMediaElementSource(audioEl);
      _sourceNode.connect(_filters[0]);
    }
  } catch {}
  return { ctx: _ctx, filters: _filters };
}

export function Equalizer(props) {
  const [gains, setGains] = createSignal(loadSavedGains());
  const [activePreset, setActivePreset] = createSignal("Flat");

  createEffect(() => {
    const { filters } = ensureChain(props.audioEl);
    if (!filters) return;
    const g = gains();
    g.forEach((gain, i) => { if (filters[i]) filters[i].gain.value = gain; });
    try { localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(g)); } catch {}
    // Detect active preset
    const presetName = Object.keys(PRESETS).find((k) => PRESETS[k].every((v, i) => v === g[i])) || "Custom";
    setActivePreset(presetName);
  });

  onCleanup(() => {
    // Don't destroy the chain on unmount — keep it alive so audio keeps working
  });

  const applyPreset = (name) => {
    if (PRESETS[name]) setGains([...PRESETS[name]]);
  };

  const setGain = (i, value) => {
    setGains((g) => { const next = [...g]; next[i] = value; return next; });
  };

  return (
    <div class="eq-panel">
      <div class="eq-header">
        <div>
          <div class="eq-kicker">Audio</div>
          <div class="eq-title">Equalizer</div>
        </div>
        <button class="icon-btn" onClick={() => props.onClose?.()} title="Close equalizer">
          <Icon name="x" size={15} />
        </button>
      </div>
      <div class="eq-presets">
        <For each={Object.keys(PRESETS)}>
          {(name) => (
            <button
              class="eq-preset"
              classList={{ active: activePreset() === name }}
              onClick={() => applyPreset(name)}
            >
              {name}
            </button>
          )}
        </For>
      </div>
      <div class="eq-bands">
        <For each={BANDS}>
          {(band, i) => (
            <div class="eq-band">
              <span class="eq-gain mono">{gains()[i()] > 0 ? "+" : ""}{gains()[i()]}dB</span>
              <input
                type="range"
                class="eq-slider"
                min="-12"
                max="12"
                step="1"
                value={gains()[i()]}
                orient="vertical"
                onInput={(e) => setGain(i(), Number(e.currentTarget.value))}
              />
              <span class="eq-label">{band.label}</span>
            </div>
          )}
        </For>
      </div>
      <button class="eq-reset" onClick={() => applyPreset("Flat")}>Reset to Flat</button>
    </div>
  );
}
