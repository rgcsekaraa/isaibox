// POST   /api/favorites/music-directors   { name: string } → add
// DELETE /api/favorites/music-directors   { name: string } → remove

import { fail, ok, unauthorized } from "../../_lib/response";
import { getSessionUser } from "../../_lib/session";
import type { Env } from "../../_lib/types";

interface Body {
  name?: string;
  musicDirector?: string;
}

function pickName(body: Body): string {
  return ((body.musicDirector || body.name) || "").trim();
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as Body;
  const director = pickName(body);
  if (!director) return fail("name required");
  await env.DB.prepare(
    `INSERT OR IGNORE INTO favorite_music_directors (user_id, music_director, created_at)
     VALUES (?, ?, unixepoch())`
  )
    .bind(user.user_id, director)
    .run();
  return ok({ musicDirector: director });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as Body;
  const director = pickName(body);
  if (!director) return fail("name required");
  await env.DB.prepare(
    `DELETE FROM favorite_music_directors WHERE user_id = ? AND music_director = ?`
  )
    .bind(user.user_id, director)
    .run();
  return ok({ musicDirector: director });
};
