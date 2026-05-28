// Session lookup + creation.
//
// Sessions are opaque random 32-byte tokens stored in D1. We also cache
// the user payload in KV keyed by session_id for ~60s so hot reads skip
// the D1 hop. Revocation is immediate via DELETE FROM user_sessions +
// KV delete.

import { hmacSign, hmacUnsign, randomToken } from "./crypto";
import {
  SESSION_COOKIE_NAME,
  buildClearCookie,
  buildSetCookie,
  readCookie,
} from "./cookies";
import type { Env, SessionUser } from "./types";

const KV_CACHE_TTL_SECONDS = 60;
const KV_CACHE_PREFIX = "sess:";

function ttlDays(env: Env): number {
  const raw = Number.parseInt(env.SESSION_TTL_DAYS || "30", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

export async function getSessionUser(
  request: Request,
  env: Env
): Promise<SessionUser | null> {
  const cookieValue = readCookie(request, SESSION_COOKIE_NAME);
  if (!cookieValue) return null;
  const sessionId = await hmacUnsign(cookieValue, env.SESSION_SECRET);
  if (!sessionId) return null;

  // Hot path: KV cache.
  if (env.SESSIONS) {
    const cached = await env.SESSIONS.get(KV_CACHE_PREFIX + sessionId, {
      type: "json",
    });
    if (cached) {
      return cached as SessionUser;
    }
  }

  // Cold path: D1.
  const row = await env.DB.prepare(
    `SELECT u.user_id, u.email, u.name, u.picture, s.expires_at,
            u.is_admin, u.is_banned, u.ban_reason
       FROM user_sessions s
       JOIN users u ON u.user_id = s.user_id
      WHERE s.session_id = ?`
  )
    .bind(sessionId)
    .first<{
      user_id: string;
      email: string | null;
      name: string | null;
      picture: string | null;
      expires_at: number;
      is_admin: number;
      is_banned: number;
      ban_reason: string | null;
    }>();

  if (!row) return null;
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at && row.expires_at <= now) return null;
  if (row.is_banned) return null;

  const user: SessionUser = {
    user_id: row.user_id,
    email: row.email || "",
    name: row.name || "",
    picture: row.picture || "",
    is_admin: !!row.is_admin,
    is_banned: !!row.is_banned,
    ban_reason: row.ban_reason || "",
    session_id: sessionId,
  };

  if (env.SESSIONS) {
    await env.SESSIONS.put(KV_CACHE_PREFIX + sessionId, JSON.stringify(user), {
      expirationTtl: KV_CACHE_TTL_SECONDS,
    });
  }

  return user;
}

export async function createSession(
  env: Env,
  userId: string
): Promise<{ sessionId: string; expiresAt: number; cookie: string }> {
  const sessionId = randomToken(32);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlDays(env) * 24 * 60 * 60;

  await env.DB.prepare(
    `INSERT INTO user_sessions (session_id, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(sessionId, userId, expiresAt, now)
    .run();

  const signed = await hmacSign(sessionId, env.SESSION_SECRET);
  const cookie = buildSetCookie(SESSION_COOKIE_NAME, signed, {
    maxAgeSeconds: ttlDays(env) * 24 * 60 * 60,
    domain: env.COOKIE_DOMAIN || undefined,
  });

  return { sessionId, expiresAt, cookie };
}

export async function destroySession(
  env: Env,
  sessionId: string
): Promise<string> {
  await env.DB.prepare(`DELETE FROM user_sessions WHERE session_id = ?`)
    .bind(sessionId)
    .run();
  if (env.SESSIONS) {
    await env.SESSIONS.delete(KV_CACHE_PREFIX + sessionId).catch(() => {});
  }
  return buildClearCookie(SESSION_COOKIE_NAME, {
    domain: env.COOKIE_DOMAIN || undefined,
  });
}

export async function requireUser(
  request: Request,
  env: Env
): Promise<{ user: SessionUser } | { response: Response }> {
  const user = await getSessionUser(request, env);
  if (!user) {
    const { unauthorized } = await import("./response");
    return { response: unauthorized() };
  }
  return { user };
}
