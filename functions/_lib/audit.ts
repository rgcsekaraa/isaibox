// Append a row to audit_log. Best-effort — never throws into the
// caller because logging shouldn't break a request.

import { sha256Hex } from "./crypto";
import type { Env } from "./types";

export async function audit(
  env: Env,
  event: string,
  options: { userId?: string; request?: Request } = {}
): Promise<void> {
  try {
    let ipHash: string | null = null;
    let userAgent: string | null = null;
    if (options.request) {
      const ip =
        options.request.headers.get("CF-Connecting-IP") ||
        options.request.headers.get("X-Forwarded-For") ||
        "";
      if (ip) ipHash = await sha256Hex(ip);
      userAgent = options.request.headers.get("User-Agent");
    }
    await env.DB.prepare(
      `INSERT INTO audit_log (user_id, event, ip_hash, user_agent)
       VALUES (?, ?, ?, ?)`
    )
      .bind(options.userId ?? null, event, ipHash, userAgent)
      .run();
  } catch {
    // swallow
  }
}
