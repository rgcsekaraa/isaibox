// GET /api/auth/session
//
// Returns the current user or { ok: true, user: null }. Same wire
// format as the FastAPI endpoint.

import { json } from "../../_lib/response";
import { getSessionUser } from "../../_lib/session";
import type { Env } from "../../_lib/types";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env);
  if (!user) return json({ ok: true, user: null });
  // Don't leak the session_id back to the client; it's only useful server-side.
  const { session_id: _omit, ...safeUser } = user;
  return json({ ok: true, user: safeUser });
};
