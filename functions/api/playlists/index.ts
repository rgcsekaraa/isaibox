// GET  /api/playlists           list user's playlists
// POST /api/playlists  { name } create a new playlist
//
// `globalPlaylists` is returned as an empty array in Phase 1: server-
// curated globals depend on the song catalog which still lives on HF.
// Phase 2 either reads them from D1 or proxies just that one call to HF.

import { fail, json, unauthorized } from "../../_lib/response";
import { randomToken } from "../../_lib/crypto";
import { getSessionUser } from "../../_lib/session";
import type { Env } from "../../_lib/types";

interface CreateBody {
  name?: string;
}

interface Row {
  playlist_id: string;
  name: string | null;
  is_global: number;
  source: string | null;
  source_url: string | null;
  updated_at: number | null;
  track_count: number;
}

function normalizeName(input: unknown): string {
  if (typeof input !== "string") throw new Error("name is required");
  const trimmed = input.trim();
  if (!trimmed) throw new Error("name is required");
  if (trimmed.length > 80) throw new Error("name must be 80 characters or fewer");
  return trimmed;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user) {
    return json({ ok: true, playlists: [], globalPlaylists: [] });
  }
  const rows = await env.DB.prepare(
    `SELECT p.playlist_id, p.name, p.is_global, p.source, p.source_url,
            p.updated_at,
            (SELECT COUNT(*) FROM playlist_songs s WHERE s.playlist_id = p.playlist_id) AS track_count
       FROM playlists p
      WHERE p.user_id = ?
      ORDER BY p.updated_at DESC, p.created_at DESC`
  )
    .bind(user.user_id)
    .all<Row>();

  const playlists = (rows.results || []).map((r) => ({
    id: r.playlist_id,
    name: r.name || "",
    isGlobal: !!r.is_global,
    source: r.source || "manual",
    sourceUrl: r.source_url || "",
    updatedAt: r.updated_at
      ? new Date(r.updated_at * 1000).toISOString()
      : "",
    trackCount: r.track_count || 0,
  }));

  return json({ ok: true, playlists, globalPlaylists: [] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as CreateBody;
  let name: string;
  try {
    name = normalizeName(body.name);
  } catch (err) {
    return fail((err as Error).message);
  }
  const id = randomToken(16);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO playlists (playlist_id, user_id, name, is_global, source,
                            source_url, created_at, updated_at)
     VALUES (?, ?, ?, 0, 'manual', '', ?, ?)`
  )
    .bind(id, user.user_id, name, now, now)
    .run();
  return json({
    ok: true,
    playlist: {
      id,
      name,
      isGlobal: false,
      source: "manual",
      sourceUrl: "",
      trackCount: 0,
    },
  });
};
