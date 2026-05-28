// POST /api/auth/logout
//
// Revokes the current session (DELETE FROM user_sessions + KV evict) and
// clears the cookie. Idempotent.

import { audit } from "../../_lib/audit";
import { buildClearCookie, SESSION_COOKIE_NAME } from "../../_lib/cookies";
import { json } from "../../_lib/response";
import { destroySession, getSessionUser } from "../../_lib/session";
import type { Env } from "../../_lib/types";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  let cookie: string;
  if (user) {
    cookie = await destroySession(env, user.session_id);
    await audit(env, "auth_logout", { userId: user.user_id, request });
  } else {
    cookie = buildClearCookie(SESSION_COOKIE_NAME, {
      domain: env.COOKIE_DOMAIN || undefined,
    });
  }
  return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
};
