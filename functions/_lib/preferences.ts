// Preference helpers shared between the GET and PUT handlers. Defaults
// and normalization rules mirror backend/services.py:save_user_preferences
// so client-side validation in App.jsx still applies.

const ALLOWED_THEMES = new Set(["system", "light", "dark"]);
const ALLOWED_MAIN_TABS = new Set([
  "library",
  "recents",
  "favorites",
  "queue",
  "radio",
]);
const ALLOWED_REPEAT_MODES = new Set(["off", "one", "album", "random"]);
const ALLOWED_SPEEDS = new Set([1, 1.25, 1.5, 2]);

export interface PreferencesPayload {
  themePreference: string;
  mainTab: string;
  recentSongIds: string[];
  playerVolume: number;
  playerMuted: boolean;
  playbackSpeed: number;
  repeatMode: string;
  autoplayNext: boolean;
}

export function defaultPreferences(): PreferencesPayload {
  return {
    themePreference: "system",
    mainTab: "library",
    recentSongIds: [],
    playerVolume: 0.9,
    playerMuted: false,
    playbackSpeed: 1,
    repeatMode: "off",
    autoplayNext: true,
  };
}

function numberOrDefault(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function normalizePreferences(input: Partial<PreferencesPayload>): PreferencesPayload {
  const defaults = defaultPreferences();
  const playerVolume = Math.max(0, Math.min(1, numberOrDefault(input.playerVolume, defaults.playerVolume)));
  const playbackSpeedRaw = numberOrDefault(input.playbackSpeed, defaults.playbackSpeed);
  const playbackSpeed = ALLOWED_SPEEDS.has(playbackSpeedRaw)
    ? playbackSpeedRaw
    : defaults.playbackSpeed;
  const themePreference = ALLOWED_THEMES.has((input.themePreference as string) || "")
    ? (input.themePreference as string)
    : defaults.themePreference;
  const mainTab = ALLOWED_MAIN_TABS.has((input.mainTab as string) || "")
    ? (input.mainTab as string)
    : defaults.mainTab;
  const repeatMode = ALLOWED_REPEAT_MODES.has((input.repeatMode as string) || "")
    ? (input.repeatMode as string)
    : defaults.repeatMode;
  const recents = Array.isArray(input.recentSongIds) ? input.recentSongIds : [];
  const recentSongIds = recents
    .filter((id): id is string => typeof id === "string" && !!id)
    .slice(0, 20);
  return {
    themePreference,
    mainTab,
    recentSongIds,
    playerVolume,
    playerMuted: !!input.playerMuted,
    playbackSpeed,
    repeatMode,
    autoplayNext: input.autoplayNext === undefined ? defaults.autoplayNext : !!input.autoplayNext,
  };
}
