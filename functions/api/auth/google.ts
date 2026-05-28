// POST /api/auth/google
//
// Body: { credential: <Google ID token from One-Tap / GIS button> }
// Verifies the ID token via Google's JWKS, upserts the user, opens a
// session, and sets the httpOnly cookie.
//
// Matches the wire format of the existing FastAPI /api/auth/google
// endpoint so the frontend code (App.jsx → fetch("/api/auth/google", ...))
// keeps working unchanged.

import { audit } from "../../_lib/audit";
import { sha256Hex } from "../../_lib/crypto";
import { createSession } from "../../_lib/session";
import type { Env } from "../../_lib/types";
import { fail, forbidden, json, serverError } from "../../_lib/response";
import { verifyGoogleIdToken } from "../../_lib/verify-id-token";

interface AuthBody {
  credential?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GOOGLE_CLIENT_ID) {
    return serverError("Google OAuth not configured");
  }

  let body: AuthBody;
  try {
    body = (await request.json()) as AuthBody;
  } catch {
    return fail("Invalid JSON");
  }
  const credential = (body.credential || "").trim();
  if (!credential) return fail("Missing credential");

  const token = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
  if (!token) return fail("Google verification failed");
  if (token.email_verified !== true && token.email_verified !== "true") {
    return fail("Google account is not verified");
  }

  // Mirror the existing FastAPI user_id derivation so previously-issued
  // user_ids in DuckDB stay stable post-migration.
  const seed = (token.sub || token.email || "").toString();
  if (!seed) return fail("Token missing subject");
  const userId = (await md5HexFallback(seed)) || seed;

  const email = (token.email || "").toString();
  const name = (token.name || "").toString();
  const picture = (token.picture || "").toString();
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO users (user_id, google_sub, email, name, picture, is_admin,
                        last_login_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       google_sub    = excluded.google_sub,
       email         = excluded.email,
       name          = excluded.name,
       picture       = excluded.picture,
       last_login_at = excluded.last_login_at,
       updated_at    = excluded.updated_at`
  )
    .bind(userId, token.sub, email, name, picture, now, now, now)
    .run();

  const row = await env.DB.prepare(
    `SELECT is_admin, is_banned, ban_reason FROM users WHERE user_id = ?`
  )
    .bind(userId)
    .first<{ is_admin: number; is_banned: number; ban_reason: string | null }>();

  if (row?.is_banned) {
    await audit(env, "auth_login_banned", { userId, request });
    return forbidden(row.ban_reason || "Account has been banned");
  }

  const { cookie } = await createSession(env, userId);
  await audit(env, "auth_login", { userId, request });

  const userPayload = {
    user_id: userId,
    email,
    name,
    picture,
    is_admin: !!row?.is_admin,
    is_banned: !!row?.is_banned,
    ban_reason: row?.ban_reason || "",
  };
  return json(
    { ok: true, user: userPayload },
    { headers: { "Set-Cookie": cookie } }
  );
};

// MD5 is used only because the existing FastAPI code hashed (sub | email)
// with MD5 to derive user_id; we keep that derivation so previously-stored
// favorites/playlists still match after migration. MD5 is not used for any
// security purpose — the user's identity is proven by Google's signed JWT.
async function md5HexFallback(input: string): Promise<string> {
  // CF Workers don't ship MD5 in WebCrypto. We compute it by hand. Tiny
  // implementation, intentionally minimal.
  return md5Hex(input);
}

function md5Hex(s: string): string {
  // Spec-following 128-bit MD5. ~50 LOC, safe at the edge.
  const bytes = new TextEncoder().encode(s);
  const x: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    x.push(
      (bytes[i] || 0) |
        ((bytes[i + 1] || 0) << 8) |
        ((bytes[i + 2] || 0) << 16) |
        ((bytes[i + 3] || 0) << 24)
    );
  }
  const bitLen = bytes.length * 8;
  x[bytes.length >> 2] = (x[bytes.length >> 2] || 0) | (0x80 << ((bytes.length % 4) * 8));
  while (x.length % 16 !== 14) x.push(0);
  x.push(bitLen | 0, 0);

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  const add32 = (m: number, n: number) => (m + n) | 0;
  const rot = (n: number, c: number) => (n << c) | (n >>> (32 - c));
  const cmn = (q: number, a: number, b: number, x: number, s: number, t: number) =>
    add32(rot(add32(add32(a, q), add32(x, t)), s), b);
  const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(c ^ (b | ~d), a, b, x, s, t);

  for (let i = 0; i < x.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[i + 0], 7, -680876936);
    d = ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, x[i + 10], 17, -42063);
    b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, x[i + 15], 22, 1236535329);

    a = gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = gg(b, c, d, a, x[i + 0], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, x[i + 12], 20, -1926607734);

    a = hh(a, b, c, d, x[i + 5], 4, -378558);
    d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = hh(d, a, b, c, x[i + 0], 11, -358537222);
    c = hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = hh(b, c, d, a, x[i + 2], 23, -995338651);

    a = ii(a, b, c, d, x[i + 0], 6, -198630844);
    d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = ii(b, c, d, a, x[i + 9], 21, -343485551);

    a = add32(a, oa); b = add32(b, ob); c = add32(c, oc); d = add32(d, od);
  }
  const toHex = (n: number) =>
    Array.from({ length: 4 }, (_, i) =>
      ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0")
    ).join("");
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}
