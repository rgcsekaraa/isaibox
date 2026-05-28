// Google ID token verification via Google's JWKS endpoint.
//
// We verify the signature ourselves (with `jose`) instead of calling
// Google's /tokeninfo because:
//   1. JWKS keys are cached at the edge → no extra HTTPS hop per login.
//   2. /tokeninfo is rate-limited and discouraged for production.
//   3. Local verification is the same path Google itself recommends.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { cacheMaxAge: 10 * 60 * 1000 }
);

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleIdToken extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  aud: string | string[];
  iss: string;
  exp: number;
}

export async function verifyGoogleIdToken(
  idToken: string,
  expectedAudience: string
): Promise<GoogleIdToken | null> {
  if (!idToken || !expectedAudience) return null;
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: expectedAudience,
    });
    return payload as GoogleIdToken;
  } catch {
    return null;
  }
}
