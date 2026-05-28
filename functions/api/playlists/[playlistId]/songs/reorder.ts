// PUT /api/playlists/:playlistId/songs/reorder { songIds: string[] }
//
// Replaces the playlist's ordering. songIds must be a permutation of the
// existing track set (we don't allow adding/removing through reorder).
// We DELETE + bulk INSERT inside a single D1 batch so it's atomic.

import { fail, json, notFound, unauthorized } from "../../../../_lib/response";
import { getSessionUser } from "../../../../_lib/session";
import type { Env } from "../../../../_lib/types";

interface Body {
  songIds?: unknown;
}

export const onRequestPut: PagesFunction<Env, "playlistId"> = async ({
  request,
  env,
  params,
}) => {
  const id = (params.playlistId || "").toString();
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();

  const meta = await env.DB.prepare(
    `SELECT user_id, is_global FROM playlists WHERE playlist_id = ?`
  )
    .bind(id)
    .first<{ user_id: string; is_global: number }>();
  if (!meta) return notFound("Playlist not found");
  if (meta.is_global || meta.user_id !== user.user_id) {
    return notFound("Playlist not found");
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!Array.isArray(body.songIds)) return fail("songIds must be an array");
  const nextIds = body.songIds
    .filter((v): v is string => typeof v === "string" && !!v.trim())
    .map((v) => v.trim());

  const current = await env.DB.prepare(
    `SELECT song_id FROM playlist_songs WHERE playlist_id = ?`
  )
    .bind(id)
    .all<{ song_id: string }>();
  const currentSet = new Set((current.results || []).map((r) => r.song_id));
  const nextSet = new Set(nextIds);

  if (nextSet.size !== currentSet.size || ![...currentSet].every((s) => nextSet.has(s))) {
    return fail("songIds must match the current playlist contents exactly");
  }

  const now = Math.floor(Date.now() / 1000);
  const statements = [
    env.DB.prepare(`DELETE FROM playlist_songs WHERE playlist_id = ?`).bind(id),
  ];
  nextIds.forEach((songId, position) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO playlist_songs (playlist_id, song_id, position, added_at)
         VALUES (?, ?, ?, ?)`
      ).bind(id, songId, position, now)
    );
  });
  statements.push(
    env.DB.prepare(`UPDATE playlists SET updated_at = ? WHERE playlist_id = ?`).bind(
      now,
      id
    )
  );
  await env.DB.batch(statements);

  return json({ ok: true, songIds: nextIds });
};
