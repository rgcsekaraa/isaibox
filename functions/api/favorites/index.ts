// GET /api/favorites
//
// Returns the full favorites payload (songs + albums + album entities +
// music directors) for the signed-in user. Same wire shape as the
// FastAPI version so the frontend doesn't change.

import { json, unauthorized } from "../../_lib/response";
import { getSessionUser } from "../../_lib/session";
import type { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();

  const [songs, albumEntities, albums, directors] = await Promise.all([
    env.DB.prepare(
      `SELECT song_id FROM favorite_songs
        WHERE user_id = ?
        ORDER BY created_at DESC, song_id ASC`
    )
      .bind(user.user_id)
      .all<{ song_id: string }>(),
    env.DB.prepare(
      `SELECT album_url, album_name FROM favorite_album_entities
        WHERE user_id = ?
        ORDER BY created_at DESC, album_name ASC, album_url ASC`
    )
      .bind(user.user_id)
      .all<{ album_url: string; album_name: string | null }>(),
    env.DB.prepare(
      `SELECT album_name FROM favorite_albums
        WHERE user_id = ?
        ORDER BY created_at DESC, album_name ASC`
    )
      .bind(user.user_id)
      .all<{ album_name: string }>(),
    env.DB.prepare(
      `SELECT music_director FROM favorite_music_directors
        WHERE user_id = ?
        ORDER BY created_at DESC, music_director ASC`
    )
      .bind(user.user_id)
      .all<{ music_director: string }>(),
  ]);

  const albumFavorites: { albumUrl: string; albumName: string }[] = [];
  const seen = new Set<string>();
  for (const row of albumEntities.results || []) {
    const key = row.album_url || row.album_name || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    albumFavorites.push({
      albumUrl: row.album_url || "",
      albumName: row.album_name || "",
    });
  }
  for (const row of albums.results || []) {
    const name = row.album_name || "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    albumFavorites.push({ albumUrl: "", albumName: name });
  }

  return json({
    ok: true,
    songIds: (songs.results || []).map((r) => r.song_id).filter(Boolean),
    albums: albumFavorites,
    musicDirectors: (directors.results || [])
      .map((r) => r.music_director)
      .filter(Boolean),
  });
};
