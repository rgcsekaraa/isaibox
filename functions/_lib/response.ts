// JSON response helpers. Keeps consistent { ok, ... } shape so the
// existing frontend code that already speaks the FastAPI dialect works
// without changes.

export function json(
  body: unknown,
  init: ResponseInit & { headers?: HeadersInit } = {}
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function ok<T extends Record<string, unknown>>(extra: T = {} as T): Response {
  return json({ ok: true, ...extra });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, message, ...extra }, { status });
}

export function unauthorized(message = "Authentication required"): Response {
  return fail(message, 401);
}

export function forbidden(message = "Forbidden"): Response {
  return fail(message, 403);
}

export function notFound(message = "Not found"): Response {
  return fail(message, 404);
}

export function serverError(message = "Internal error"): Response {
  return fail(message, 500);
}
