// Constant-time-ish HMAC helpers built on WebCrypto. Used to sign the
// session cookie value so even if an attacker controls a CDN node they
// can't forge a cookie without the secret.

const enc = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSign(value: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return `${value}.${toHex(sig)}`;
}

export async function hmacUnsign(signed: string, secret: string): Promise<string | null> {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  const provided = signed.slice(dot + 1);
  const expected = await hmacSign(value, secret);
  // Constant-time string compare
  const a = expected.slice(expected.lastIndexOf(".") + 1);
  if (a.length !== provided.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0 ? value : null;
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf.buffer);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return toHex(buf);
}
