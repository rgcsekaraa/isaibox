// POST   /api/favorites/albums   { albumUrl?: string, albumName?: string } → add
// DELETE /api/favorites/albums   { albumUrl?: string, albumName?: string } → remove
//
// Same payload shape as the FastAPI version: callers can pass either or
// both fields. albumUrl is the canonical key (an entity) and albumName
// is the loose-text fallback.

import { fail, ok, unauthorized } from "../../_lib/response";
import { getSessionUser } from "../../_lib/session";
import type { Env } from "../../_lib/types";

interface Body {
  albumUrl?: string;
  albumName?: string;
}

function readBody(request: Request): Promise<Body> {
  return request
    .json()
    .then((b) => (b && typeof b === "object" ? (b as Body) : {}))
    .catch(() => ({} as Body));
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const body = await readBody(request);
  const albumUrl = (body.albumUrl || "").trim();
  const albumName = (body.albumName || "").trim();
  if (!albumUrl && !albumName) return fail("albumUrl or albumName required");
  if (albumUrl) {
    await env.DB.prepare(
      `INSERT INTO favorite_album_entities (user_id, album_url, album_name, created_at)
       VALUES (?, ?, ?, unixepoch())
       ON CONFLICT(user_id, album_url) DO UPDATE SET
         album_name = excluded.album_name`
    )
      .bind(user.user_id, albumUrl, albumName)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO favorite_albums (user_id, album_name, created_at)
       VALUES (?, ?, unixepoch())`
    )
      .bind(user.user_id, albumName)
      .run();
  }
  return ok({ albumUrl, albumName });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const body = await readBody(request);
  const albumUrl = (body.albumUrl || "").trim();
  const albumName = (body.albumName || "").trim();
  if (!albumUrl && !albumName) return fail("albumUrl or albumName required");
  if (albumUrl) {
    await env.DB.prepare(
      `DELETE FROM favorite_album_entities WHERE user_id = ? AND album_url = ?`
    )
      .bind(user.user_id, albumUrl)
      .run();
  }
  if (albumName) {
    await env.DB.prepare(
      `DELETE FROM favorite_albums WHERE user_id = ? AND album_name = ?`
    )
      .bind(user.user_id, albumName)
      .run();
  }
  return ok({ albumUrl, albumName });
};
