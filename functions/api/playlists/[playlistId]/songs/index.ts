// POST   /api/playlists/:playlistId/songs   { songId }    add to end
// DELETE /api/playlists/:playlistId/songs   { songId }    remove + compact positions

import { fail, json, notFound, unauthorized } from "../../../../_lib/response";
import { getSessionUser } from "../../../../_lib/session";
import type { Env } from "../../../../_lib/types";

interface SongBody {
  songId?: string;
}

async function loadOwnedPlaylist(env: Env, id: string, userId: string) {
  const meta = await env.DB.prepare(
    `SELECT playlist_id, user_id, is_global FROM playlists WHERE playlist_id = ?`
  )
    .bind(id)
    .first<{ playlist_id: string; user_id: string; is_global: number }>();
  if (!meta) return null;
  if (meta.is_global) return null;
  if (meta.user_id !== userId) return null;
  return meta;
}

export const onRequestPost: PagesFunction<Env, "playlistId"> = async ({
  request,
  env,
  params,
}) => {
  const id = (params.playlistId || "").toString();
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const playlist = await loadOwnedPlaylist(env, id, user.user_id);
  if (!playlist) return notFound("Playlist not found");
  const body = (await request.json().catch(() => ({}))) as SongBody;
  const songId = (body.songId || "").toString().trim();
  if (!songId) return fail("songId is required");

  // Skip if already present.
  const existing = await env.DB.prepare(
    `SELECT 1 FROM playlist_songs WHERE playlist_id = ? AND song_id = ?`
  )
    .bind(id, songId)
    .first();
  if (existing) {
    return json({ ok: true, songId, alreadyPresent: true });
  }
  const next = await env.DB.prepare(
    `SELECT COALESCE(MAX(position), -1) AS max_pos FROM playlist_songs WHERE playlist_id = ?`
  )
    .bind(id)
    .first<{ max_pos: number }>();
  const position = (next?.max_pos ?? -1) + 1;
  const now = Math.floor(Date.now() / 1000);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO playlist_songs (playlist_id, song_id, position, added_at)
       VALUES (?, ?, ?, ?)`
    ).bind(id, songId, position, now),
    env.DB.prepare(
      `UPDATE playlists SET updated_at = ? WHERE playlist_id = ?`
    ).bind(now, id),
  ]);

  return json({ ok: true, songId, position });
};

export const onRequestDelete: PagesFunction<Env, "playlistId"> = async ({
  request,
  env,
  params,
}) => {
  const id = (params.playlistId || "").toString();
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const playlist = await loadOwnedPlaylist(env, id, user.user_id);
  if (!playlist) return notFound("Playlist not found");
  const body = (await request.json().catch(() => ({}))) as SongBody;
  const songId = (body.songId || "").toString().trim();
  if (!songId) return fail("songId is required");
  const now = Math.floor(Date.now() / 1000);
  // Remove then renumber positions so the playlist stays contiguous.
  // SQLite doesn't have ROW_NUMBER() in older builds, but D1 supports it.
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?`
    ).bind(id, songId),
    env.DB.prepare(
      `WITH ordered AS (
         SELECT song_id, ROW_NUMBER() OVER (ORDER BY position ASC) - 1 AS new_pos
           FROM playlist_songs WHERE playlist_id = ?
       )
       UPDATE playlist_songs
          SET position = (SELECT new_pos FROM ordered WHERE ordered.song_id = playlist_songs.song_id)
        WHERE playlist_id = ?`
    ).bind(id, id),
    env.DB.prepare(
      `UPDATE playlists SET updated_at = ? WHERE playlist_id = ?`
    ).bind(now, id),
  ]);
  return json({ ok: true, songId });
};
