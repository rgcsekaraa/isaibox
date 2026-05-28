// Cookie helpers — session cookie is HttpOnly + Secure + SameSite=Lax so
// it survives the Google OAuth round-trip but isn't sent on cross-site
// POSTs that haven't been initiated by the user.

export const SESSION_COOKIE_NAME = "isaibox_session";

interface SetCookieOptions {
  maxAgeSeconds?: number;
  domain?: string;
  path?: string;
}

export function buildSetCookie(
  name: string,
  value: string,
  options: SetCookieOptions = {}
): string {
  const parts: string[] = [`${name}=${value}`];
  parts.push("Path=" + (options.path || "/"));
  parts.push("HttpOnly");
  parts.push("Secure");
  parts.push("SameSite=Lax");
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (typeof options.maxAgeSeconds === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  }
  return parts.join("; ");
}

export function buildClearCookie(name: string, options: SetCookieOptions = {}): string {
  return buildSetCookie(name, "", { ...options, maxAgeSeconds: 0 });
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  const target = `${name}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) return decodeURIComponent(trimmed.slice(target.length));
  }
  return null;
}
