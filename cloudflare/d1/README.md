# Phase 1 deploy — auth + user data on Cloudflare

This guide gets `/api/auth/*`, `/api/auth/session`, `/api/auth/logout`,
and (in the next batch) `/api/me/*`, `/api/favorites/*`, `/api/playlists/*`
running on Cloudflare Pages + D1, with everything else (catalog, search,
audio, lyrics) proxied through to the existing HF Space.

End state of Phase 1:
- Frontend is served from CF Pages at your custom domain.
- Auth + user-data requests hit CF Pages Functions → D1.
- Catalog/audio/lyrics requests fall through to HF.
- HF is no longer on the hot path for sign-in or "my data".

---

## 0. Prereqs (one-time)

- Cloudflare account (free): https://dash.cloudflare.com/sign-up
- Wrangler CLI: `npm install -g wrangler` then `wrangler login`
- Custom domain registered (you said you have one). Add it to Cloudflare:
  Dashboard → Add Site → enter the domain → choose **Free** plan →
  follow the nameserver instructions at your registrar. Wait for DNS
  propagation (usually <10 min).

## 1. Create the D1 database

```sh
wrangler d1 create isaibox
```

The command prints something like:

```
database_id = "11111111-2222-3333-4444-555555555555"
```

Copy that UUID into `wrangler.toml` (the `<PASTE_DATABASE_ID_AFTER_CREATE>`
placeholder).

Apply the schema:

```sh
wrangler d1 execute isaibox --remote --file=cloudflare/d1/schema/0001_init.sql
```

Verify:

```sh
wrangler d1 execute isaibox --remote --command="SELECT name FROM sqlite_master WHERE type='table'"
```

You should see `users`, `user_sessions`, `favorite_songs`, `playlists`, etc.

## 2. Create the KV namespace for session cache

```sh
wrangler kv namespace create SESSIONS
```

Copy the printed `id` into `wrangler.toml` (the `<PASTE_KV_NAMESPACE_ID_AFTER_CREATE>`
placeholder).

## 3. Create the Google OAuth client

1. https://console.cloud.google.com/ → create a project (free).
2. **APIs & Services → OAuth consent screen**
   - User type: External
   - App name: `isaibox`
   - Support email: yours
   - Scopes: email, profile, openid
   - Test users: add your email until you submit for verification
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: Web application
   - Name: `isaibox-web`
   - Authorized JavaScript origins: `https://YOUR_DOMAIN`
   - Authorized redirect URIs: leave blank (we use the One-Tap credential
     flow, no redirect)
4. Copy the **Client ID** (looks like `1234-abc.apps.googleusercontent.com`).
   The Client Secret is NOT needed for the One-Tap flow.

## 4. Create the Cloudflare Pages project

In the dashboard: **Workers & Pages → Create application → Pages → Connect to Git**.

- Select this GitHub repo.
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave empty (repo root)
- Production branch: `main`

Hit **Save and Deploy**. The first deploy will fail because the secrets
aren't set yet — that's fine. Fix in step 5.

## 5. Set environment variables / secrets

In the Pages project: **Settings → Environment variables → Production**.

| Name              | Type   | Value                                                       |
|-------------------|--------|-------------------------------------------------------------|
| `GOOGLE_CLIENT_ID`| Secret | `1234-abc.apps.googleusercontent.com` (from step 3)          |
| `SESSION_SECRET`  | Secret | Run `openssl rand -hex 32` and paste the result              |
| `HF_BASE_URL`     | Plain  | `https://chanrg-isaibox.hf.space` (or your HF Space URL)     |
| `COOKIE_DOMAIN`   | Plain  | leave empty (defaults to request host)                       |
| `SESSION_TTL_DAYS`| Plain  | `30`                                                         |

Then attach the bindings — same screen, scroll down to **Bindings**:

- D1: `DB` → `isaibox`
- KV: `SESSIONS` → the namespace you created in step 2

Re-trigger deploy: **Deployments → Retry deployment** on the latest one.

## 6. Attach the custom domain

**Pages project → Custom domains → Set up a custom domain** → enter
`YOUR_DOMAIN`. CF wires the DNS and SSL automatically. Wait ~1 min.

## 7. Update the Google OAuth client origin

Back in Google Cloud Console, edit the OAuth client and make sure the
**Authorized JavaScript origin** matches the custom domain (it might
currently be the `*.pages.dev` URL).

## 8. Migrate existing user data from HF DuckDB → D1

Grab the live DuckDB:

```sh
# Either copy it out of the HF Space or pull the dev one
curl -L -o /tmp/masstamilan.duckdb \
  https://huggingface.co/datasets/<your-account>/isaibox-db/resolve/main/masstamilan.duckdb
# OR if you can SSH into the Space:
# scp space:/app/data/masstamilan.duckdb /tmp/
```

Generate the SQL:

```sh
pip install duckdb
python cloudflare/d1/migrate/migrate_from_duckdb.py \
  --duckdb /tmp/masstamilan.duckdb \
  --out    /tmp/user_data.sql
```

Apply to D1:

```sh
wrangler d1 execute isaibox --remote --file=/tmp/user_data.sql
```

Sanity-check:

```sh
wrangler d1 execute isaibox --remote \
  --command="SELECT COUNT(*) AS n FROM users"
wrangler d1 execute isaibox --remote \
  --command="SELECT COUNT(*) AS n FROM favorite_songs"
```

## 9. Smoke test the auth flow

```sh
# Should return { ok: true, user: null }
curl https://YOUR_DOMAIN/api/auth/session

# Should hit the HF proxy
curl https://YOUR_DOMAIN/api/health
```

Then sign in through the web app and confirm:
- The `isaibox_session` cookie is set (HttpOnly, Secure, SameSite=Lax)
- `/api/auth/session` now returns your user
- Refresh the page — favorites/playlists load from D1

## 10. Done — what's now where

| Endpoint                  | Lives on    |
|---------------------------|-------------|
| `/api/auth/*`             | CF Pages    |
| `/api/auth/session`       | CF Pages    |
| `/api/me/preferences`     | (next PR) CF Pages |
| `/api/favorites/*`        | (next PR) CF Pages |
| `/api/playlists/*`        | (next PR) CF Pages |
| `/api/library`            | HF Space    |
| `/api/search`             | HF Space    |
| `/api/lyrics/*`           | HF Space    |
| `/api/stream/*`           | HF Space → CF audio-proxy worker |
| frontend assets           | CF Pages    |

Phase 2 ports the HF-Space endpoints to CF Pages Functions + R2 so HF can
be turned off entirely.

## Local development

```sh
# Boots Vite (frontend) and runs Functions against the wrangler.toml
# bindings, pointed at the *remote* D1 by default. To use a local D1:
# wrangler d1 execute isaibox --local --file=cloudflare/d1/schema/0001_init.sql
npm run pages:dev
```

To deploy from your machine instead of GitHub:

```sh
npm run pages:deploy
```
