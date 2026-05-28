-- D1 (SQLite) schema for isaibox user data.
-- Ported from backend/db.py DuckDB schema.
-- Timestamps are Unix epoch seconds (INTEGER) so we can use unixepoch().
-- Booleans are INTEGER 0/1.

PRAGMA foreign_keys = ON;

-- ── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    user_id        TEXT PRIMARY KEY,
    google_sub     TEXT UNIQUE,
    email          TEXT,
    name           TEXT,
    picture        TEXT,
    is_admin       INTEGER NOT NULL DEFAULT 0,
    is_banned      INTEGER NOT NULL DEFAULT 0,
    ban_reason     TEXT,
    last_login_at  INTEGER,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_email      ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub);

-- ── Sessions ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions (expires_at);

-- ── Favorites ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS favorite_songs (
    user_id    TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    song_id    TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_songs_user_id ON favorite_songs (user_id);

CREATE TABLE IF NOT EXISTS favorite_albums (
    user_id    TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    album_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, album_name)
);

CREATE INDEX IF NOT EXISTS idx_favorite_albums_user_id ON favorite_albums (user_id);

CREATE TABLE IF NOT EXISTS favorite_album_entities (
    user_id    TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    album_url  TEXT NOT NULL,
    album_name TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, album_url)
);

CREATE INDEX IF NOT EXISTS idx_favorite_album_entities_user_id ON favorite_album_entities (user_id);

CREATE TABLE IF NOT EXISTS favorite_music_directors (
    user_id        TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    music_director TEXT NOT NULL,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, music_director)
);

CREATE INDEX IF NOT EXISTS idx_favorite_music_directors_user_id ON favorite_music_directors (user_id);

-- ── Playlists ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS playlists (
    playlist_id TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    name        TEXT,
    is_global   INTEGER NOT NULL DEFAULT 0,
    source      TEXT DEFAULT 'manual',
    source_url  TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists (user_id);

CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id TEXT NOT NULL REFERENCES playlists (playlist_id) ON DELETE CASCADE,
    song_id     TEXT NOT NULL,
    position    INTEGER NOT NULL,
    added_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (playlist_id, position)
);

CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_id ON playlist_songs (playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_song_id     ON playlist_songs (song_id);

-- ── Preferences ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id            TEXT PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,
    theme_preference   TEXT     DEFAULT 'system',
    main_tab           TEXT     DEFAULT 'library',
    recent_song_ids    TEXT,
    player_volume      REAL     DEFAULT 0.9,
    player_muted       INTEGER  NOT NULL DEFAULT 0,
    playback_speed     REAL     DEFAULT 1.0,
    repeat_mode        TEXT     DEFAULT 'off',
    autoplay_next      INTEGER  NOT NULL DEFAULT 1,
    updated_at         INTEGER  NOT NULL DEFAULT (unixepoch())
);

-- ── Audit log ────────────────────────────────────────────────────────────────
-- Keeps a trail of sensitive operations (login, logout, account delete, etc.)
-- so we can investigate abuse. Prune via cron if it grows.

CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT,
    event       TEXT NOT NULL,
    ip_hash     TEXT,
    user_agent  TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id    ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);
