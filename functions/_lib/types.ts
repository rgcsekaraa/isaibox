// Shared CF Pages Functions types.
// `Env` lists every binding declared in wrangler.toml so functions get
// autocomplete and the compiler catches missing bindings before deploy.

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  // Public vars
  HF_BASE_URL: string;
  COOKIE_DOMAIN: string;
  SESSION_TTL_DAYS: string;
  // Secrets (set via `wrangler pages secret put`)
  GOOGLE_CLIENT_ID: string;
  SESSION_SECRET: string;
}

export interface SessionUser {
  user_id: string;
  email: string;
  name: string;
  picture: string;
  is_admin: boolean;
  is_banned: boolean;
  ban_reason: string;
  session_id: string;
}
