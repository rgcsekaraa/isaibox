// GET    /api/playlists/:playlistId        return playlist meta + song_ids
// PUT    /api/playlists/:playlistId  { name }  rename
// DELETE /api/playlists/:playlistId         delete (cascades to songs)
//
// Phase 1 returns `songIds: string[]` instead of the full track objects
// the FastAPI version returns. The frontend already has the catalog
// loaded client-side (via /api/library), so it can materialize tracks
// from those IDs without a server-side join.

import { fail, json, notFound, unauthorized } from "../../../_lib/response";
import { getSessionUser } from "../../../_lib/session";
import type { Env } from "../../../_lib/types";

interface RenameBody {
  name?: string;
}

interface Meta {
  playlist_id: string;
  user_id: string;
  name: string | null;
  is_global: number;
  source: string | null;
  source_url: string | null;
  updated_at: number | null;
}

function normalizeName(input: unknown): string {
  if (typeof input !== "string") throw new Error("name is required");
  const trimmed = input.trim();
  if (!trimmed) throw new Error("name is required");
  if (trimmed.length > 80) throw new Error("name must be 80 characters or fewer");
  return trimmed;
}

async function loadMeta(env: Env, id: string): Promise<Meta | null> {
  return env.DB.prepare(
    `SELECT playlist_id, user_id, name, is_global, source, source_url, updated_at
       FROM playlists WHERE playlist_id = ?`
  )
    .bind(id)
    .first<Meta>();
}

function authorizeRead(meta: Meta, userId: string | null): boolean {
  if (meta.is_global) return true;
  if (!userId) return false;
  return meta.user_id === userId;
}

function authorizeWrite(meta: Meta, userId: string): boolean {
  return meta.user_id === userId && !meta.is_global;
}

function serialize(meta: Meta, songIds: string[]) {
  return {
    id: meta.playlist_id,
    name: meta.name || "",
    isGlobal: !!meta.is_global,
    source: meta.source || "manual",
    sourceUrl: meta.source_url || "",
    updatedAt: meta.updated_at
      ? new Date(meta.updated_at * 1000).toISOString()
      : "",
    songIds,
  };
}

export const onRequestGet: PagesFunction<Env, "playlistId"> = async ({
  request,
  env,
  params,
}) => {
  const id = (params.playlistId || "").toString();
  if (!id) return notFound();
  const meta = await loadMeta(env, id);
  if (!meta) return notFound("Playlist not found");
  const user = await getSessionUser(request, env);
  if (!authorizeRead(meta, user?.user_id ?? null)) {
    if (!user) return unauthorized();
    return notFound("Playlist not found");
  }
  const songs = await env.DB.prepare(
    `SELECT song_id FROM playlist_songs
      WHERE playlist_id = ?
      ORDER BY position ASC`
  )
    .bind(id)
    .all<{ song_id: string }>();
  const songIds = (songs.results || []).map((r) => r.song_id).filter(Boolean);
  return json({ ok: true, playlist: serialize(meta, songIds) });
};

export const onRequestPut: PagesFunction<Env, "playlistId"> = async ({
  request,
  env,
  params,
}) => {
  const id = (params.playlistId || "").toString();
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const meta = await loadMeta(env, id);
  if (!meta) return notFound("Playlist not found");
  if (!authorizeWrite(meta, user.user_id)) return notFound("Playlist not found");
  const body = (await request.json().catch(() => ({}))) as RenameBody;
  let name: string;
  try {
    name = normalizeName(body.name);
  } catch (err) {
    return fail((err as Error).message);
  }
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE playlists SET name = ?, updated_at = ? WHERE playlist_id = ?`
  )
    .bind(name, now, id)
    .run();
  return json({
    ok: true,
    playlist: { ...serialize({ ...meta, name, updated_at: now }, []), songIds: undefined as never },
  });
};

export const onRequestDelete: PagesFunction<Env, "playlistId"> = async ({
  request,
  env,
  params,
}) => {
  const id = (params.playlistId || "").toString();
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const meta = await loadMeta(env, id);
  if (!meta) return notFound("Playlist not found");
  if (!authorizeWrite(meta, user.user_id)) return notFound("Playlist not found");
  await env.DB.prepare(`DELETE FROM playlists WHERE playlist_id = ?`)
    .bind(id)
    .run();
  return json({ ok: true });
};
