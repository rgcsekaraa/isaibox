// Catch-all proxy for /api/* routes not handled by a dedicated function
// (catalog, search, audio stream, lyrics, song-status, etc.).
//
// Phase 1 keeps these on the existing HF Space; this proxy makes that
// invisible to the frontend (still calls relative /api/* paths). When
// Phase 2 ports the catalog to D1/R2 we drop this file and HF is gone.
//
// Important: we stream the response body straight through so audio
// `/api/stream/*` doesn't get buffered into memory.

import type { Env } from "../_lib/types";

// Headers that should never be forwarded.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  // The session cookie is for our domain only; HF doesn't need it and
  // shouldn't see it.
  "cookie",
]);

function buildOutboundHeaders(request: Request): Headers {
  const out = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower.startsWith("cf-")) return;
    if (lower === "host") return;
    out.set(key, value);
  });
  return out;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.HF_BASE_URL) {
    return new Response(JSON.stringify({ ok: false, message: "Upstream not configured" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const inboundUrl = new URL(request.url);
  const upstreamBase = env.HF_BASE_URL.replace(/\/+$/, "");
  const upstreamUrl = `${upstreamBase}${inboundUrl.pathname}${inboundUrl.search}`;

  const init: RequestInit = {
    method: request.method,
    headers: buildOutboundHeaders(request),
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  };

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, message: "Upstream fetch failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  // Pass through the upstream response. We do strip CF-internal headers
  // and the upstream's own session cookies (HF has no concept of our
  // sessions; let our own /api/auth/* be the only thing setting them).
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("set-cookie");
  responseHeaders.delete("strict-transport-security");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
};
