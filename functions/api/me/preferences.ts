// GET  /api/me/preferences  → returns the user's prefs (defaults if absent)
// PUT  /api/me/preferences  → upserts the user's prefs (validated)

import { json, unauthorized } from "../../_lib/response";
import {
  defaultPreferences,
  normalizePreferences,
  type PreferencesPayload,
} from "../../_lib/preferences";
import { getSessionUser } from "../../_lib/session";
import type { Env } from "../../_lib/types";

interface Row {
  theme_preference: string | null;
  main_tab: string | null;
  recent_song_ids: string | null;
  player_volume: number | null;
  player_muted: number | null;
  playback_speed: number | null;
  repeat_mode: string | null;
  autoplay_next: number | null;
}

function rowToPrefs(row: Row | null): PreferencesPayload {
  if (!row) return defaultPreferences();
  let recents: string[] = [];
  try {
    recents = row.recent_song_ids ? JSON.parse(row.recent_song_ids) : [];
    if (!Array.isArray(recents)) recents = [];
  } catch {
    recents = [];
  }
  return {
    themePreference: row.theme_preference || "system",
    mainTab: row.main_tab || "library",
    recentSongIds: recents.filter((id): id is string => typeof id === "string" && !!id).slice(0, 20),
    playerVolume: row.player_volume ?? 0.9,
    playerMuted: !!row.player_muted,
    playbackSpeed: row.playback_speed ?? 1,
    repeatMode: row.repeat_mode || "off",
    autoplayNext: row.autoplay_next === null ? true : !!row.autoplay_next,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const row = await env.DB.prepare(
    `SELECT theme_preference, main_tab, recent_song_ids, player_volume,
            player_muted, playback_speed, repeat_mode, autoplay_next
       FROM user_preferences
      WHERE user_id = ?`
  )
    .bind(user.user_id)
    .first<Row>();
  return json({ ok: true, preferences: rowToPrefs(row) });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as Partial<PreferencesPayload>;
  const prefs = normalizePreferences(body);
  await env.DB.prepare(
    `INSERT INTO user_preferences (
       user_id, theme_preference, main_tab, recent_song_ids, player_volume,
       player_muted, playback_speed, repeat_mode, autoplay_next, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
     ON CONFLICT(user_id) DO UPDATE SET
       theme_preference = excluded.theme_preference,
       main_tab         = excluded.main_tab,
       recent_song_ids  = excluded.recent_song_ids,
       player_volume    = excluded.player_volume,
       player_muted     = excluded.player_muted,
       playback_speed   = excluded.playback_speed,
       repeat_mode      = excluded.repeat_mode,
       autoplay_next    = excluded.autoplay_next,
       updated_at       = excluded.updated_at`
  )
    .bind(
      user.user_id,
      prefs.themePreference,
      prefs.mainTab,
      JSON.stringify(prefs.recentSongIds),
      prefs.playerVolume,
      prefs.playerMuted ? 1 : 0,
      prefs.playbackSpeed,
      prefs.repeatMode,
      prefs.autoplayNext ? 1 : 0
    )
    .run();
  return json({ ok: true, preferences: prefs });
};
