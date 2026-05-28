// POST   /api/favorites/:songId   → mark a song as favorited
// DELETE /api/favorites/:songId   → un-favorite a song
//
// Idempotent on both sides (INSERT OR IGNORE / DELETE WHERE matches).

import { fail, ok, unauthorized } from "../../_lib/response";
import { getSessionUser } from "../../_lib/session";
import type { Env } from "../../_lib/types";

interface Params {
  songId: string;
}

export const onRequestPost: PagesFunction<Env, "songId"> = async ({
  request,
  env,
  params,
}) => {
  const songId = (params.songId || "").toString().trim();
  if (!songId) return fail("songId required");
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO favorite_songs (user_id, song_id, created_at)
     VALUES (?, ?, unixepoch())`
  )
    .bind(user.user_id, songId)
    .run();
  return ok({ songId });
};

export const onRequestDelete: PagesFunction<Env, "songId"> = async ({
  request,
  env,
  params,
}) => {
  const songId = (params.songId || "").toString().trim();
  if (!songId) return fail("songId required");
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  await env.DB.prepare(
    `DELETE FROM favorite_songs WHERE user_id = ? AND song_id = ?`
  )
    .bind(user.user_id, songId)
    .run();
  return ok({ songId });
};
