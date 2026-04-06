#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import subprocess
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import requests
from flask import Flask, Response, jsonify, request, send_file, send_from_directory, stream_with_context

import db
import scraper_core
from storage_backends import get_shared_cache


ROOT = Path(__file__).resolve().parent
DIST_DIR = ROOT / "dist"
CACHE_DIR = ROOT / ".cache" / "audio"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def load_local_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_local_env()

app = Flask(__name__, static_folder=str(DIST_DIR), static_url_path="")
download_lock = threading.Lock()
active_downloads: set[str] = set()
status_cache: dict[str, dict] = {}
song_row_cache: dict[str, dict] = {}
song_cache_lock = threading.Lock()
refresh_lock = threading.Lock()
refreshing_albums: set[str] = set()
UPSTREAM_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.masstamilan.dev",
    "Referer": "https://www.masstamilan.dev/",
    "Connection": "keep-alive",
}
SESSION_COOKIE_NAME = "isaibox_session"
SESSION_TTL_DAYS = 30
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
SPOTIFY_CLIENT_ID = os.environ.get("SPOTIFY_CLIENT_ID", "")
SPOTIFY_REDIRECT_URI = os.environ.get("SPOTIFY_REDIRECT_URI", "")
SPOTIFY_SCOPES = "user-library-read playlist-read-private"
SESSION_SECRET = os.environ.get("ISAIBOX_SESSION_SECRET", "isaibox-dev-session-secret")
ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.environ.get("ISAIBOX_ADMIN_EMAILS", "").split(",")
    if email.strip()
}
SPOTIFY_PLAYLIST_RE = re.compile(r"(?:open\.spotify\.com/playlist/|spotify:playlist:)([A-Za-z0-9]+)")
library_match_cache: list[dict] = []
library_match_lock = threading.Lock()
AIRFLOW_HOME = ROOT / "airflow_home"
VENV_BIN = ROOT / "venv" / "bin"
shared_cache = get_shared_cache()


def get_read_conn():
    return db.get_conn(read_only=True)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def normalize_text(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", " ", (value or "").lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def get_library_match_cache() -> list[dict]:
    if library_match_cache:
        return library_match_cache
    with library_match_lock:
        if library_match_cache:
            return library_match_cache
        with get_read_conn() as conn:
            rows = conn.execute(
                """
                SELECT song_id, track_name, singers, movie_name, music_director
                FROM songs
                WHERE url_320kbps IS NOT NULL AND url_320kbps != ''
                """
            ).fetchall()
        library_match_cache.extend(
            {
                "id": row[0],
                "track": row[1] or "",
                "singers": row[2] or "",
                "movie": row[3] or "",
                "music_director": row[4] or "",
                "track_norm": normalize_text(row[1] or ""),
                "singers_norm": normalize_text(row[2] or ""),
                "movie_norm": normalize_text(row[3] or ""),
                "music_director_norm": normalize_text(row[4] or ""),
            }
            for row in rows
        )
    return library_match_cache


def invalidate_library_match_cache() -> None:
    with library_match_lock:
        library_match_cache.clear()


def sign_value(value: str) -> str:
    digest = hmac.new(SESSION_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()
    return f"{value}.{digest}"


def unsign_value(value: str) -> str | None:
    try:
        payload, digest = value.rsplit(".", 1)
    except ValueError:
        return None
    expected = hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(digest, expected):
        return None
    return payload


def get_session_user():
    cookie = request.cookies.get(SESSION_COOKIE_NAME)
    if not cookie:
        return None
    session_id = unsign_value(cookie)
    if not session_id:
        return None
    with get_read_conn() as conn:
        row = conn.execute(
            """
            SELECT u.user_id, u.email, u.name, u.picture, s.expires_at, u.is_admin, u.is_banned, u.ban_reason
            FROM user_sessions s
            JOIN users u ON u.user_id = s.user_id
            WHERE s.session_id = ?
            """,
            [session_id],
        ).fetchone()
    if not row or (row[4] and row[4] <= now_utc()) or row[6]:
        return None
    return {
        "user_id": row[0],
        "email": row[1] or "",
        "name": row[2] or "",
        "picture": row[3] or "",
        "is_admin": bool(row[5]),
        "is_banned": bool(row[6]),
        "ban_reason": row[7] or "",
        "session_id": session_id,
    }


def require_session_user():
    user = get_session_user()
    if not user:
        return None, (jsonify({"ok": False, "message": "Authentication required"}), 401)
    return user, None


def require_admin_user():
    user, error_response = require_session_user()
    if error_response:
        return None, error_response
    if not user["is_admin"]:
        return None, (jsonify({"ok": False, "message": "Admin access required"}), 403)
    return user, None


def issue_session_response(user_id: str, user_payload: dict):
    session_id = secrets.token_urlsafe(32)
    expires_at = now_utc() + timedelta(days=SESSION_TTL_DAYS)
    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO user_sessions (session_id, user_id, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            """,
            [session_id, user_id, expires_at, now_utc()],
        )
    response = jsonify({"ok": True, "user": user_payload})
    response.set_cookie(
        SESSION_COOKIE_NAME,
        sign_value(session_id),
        httponly=True,
        samesite="Lax",
        secure=False,
        expires=expires_at,
    )
    return response


def clear_session_response():
    response = jsonify({"ok": True})
    response.delete_cookie(SESSION_COOKIE_NAME)
    return response


def run_local_command(args: list[str]) -> tuple[int, str, str]:
    result = subprocess.run(
        args,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "AIRFLOW_HOME": str(AIRFLOW_HOME),
            "PATH": f"{VENV_BIN}:{os.environ.get('PATH', '')}",
            "OBJC_DISABLE_INITIALIZE_FORK_SAFETY": "YES",
            "AIRFLOW__CORE__MP_START_METHOD": "spawn",
            "NO_PROXY": "*",
        },
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def read_pid_file(name: str) -> int | None:
    path = AIRFLOW_HOME / name
    if not path.exists():
        return None
    try:
        value = path.read_text().strip()
        return int(value) if value else None
    except (OSError, ValueError):
        return None


def pid_running(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def airflow_cli(args: list[str]) -> tuple[int, str, str]:
    return run_local_command([str(VENV_BIN / "airflow"), *args])


def airflow_process_status() -> dict:
    webserver_pid = read_pid_file("airflow-webserver.pid")
    scheduler_pid = read_pid_file("airflow-scheduler.pid")
    monitor_pid = read_pid_file("airflow-webserver-monitor.pid")
    scheduler_log = AIRFLOW_HOME / "airflow-scheduler.out"
    lsof_code, lsof_stdout, _ = run_local_command(["lsof", "-iTCP:8080", "-sTCP:LISTEN", "-n", "-P"])
    dags_code, dags_stdout, dags_stderr = airflow_cli(["dags", "list"])
    webserver_running = lsof_code == 0 and bool(lsof_stdout)
    scheduler_running = pid_running(scheduler_pid) or (scheduler_pid is not None and scheduler_log.exists())
    process_lines = []
    for label, pid, running in (
        ("webserver", webserver_pid, webserver_running),
        ("scheduler", scheduler_pid, scheduler_running),
        ("monitor", monitor_pid, pid_running(monitor_pid)),
    ):
        if pid:
            process_lines.append(f"{label}:{pid}:{'running' if running else 'stopped'}")
    with get_read_conn() as conn:
        latest_run = conn.execute(
            """
            SELECT run_id, started_at, finished_at, pages_scraped, albums_new, albums_updated, albums_failed, songs_total, status
            FROM scrape_runs
            ORDER BY started_at DESC
            LIMIT 1
            """
        ).fetchone()
        recent_runs = conn.execute(
            """
            SELECT run_id, started_at, finished_at, pages_scraped, albums_new, albums_updated, albums_failed, songs_total, status
            FROM scrape_runs
            ORDER BY started_at DESC
            LIMIT 8
            """
        ).fetchall()
    return {
        "webserverRunning": webserver_running,
        "schedulerRunning": scheduler_running,
        "processes": process_lines[:10],
        "dagsOk": dags_code == 0,
        "dagError": dags_stderr if dags_code != 0 else "",
        "latestRun": {
            "runId": latest_run[0],
            "startedAt": latest_run[1].isoformat() if latest_run and latest_run[1] else "",
            "finishedAt": latest_run[2].isoformat() if latest_run and latest_run[2] else "",
            "pagesScraped": latest_run[3] if latest_run else 0,
            "albumsNew": latest_run[4] if latest_run else 0,
            "albumsUpdated": latest_run[5] if latest_run else 0,
            "albumsFailed": latest_run[6] if latest_run else 0,
            "songsTotal": latest_run[7] if latest_run else 0,
            "status": latest_run[8] if latest_run else "unknown",
        } if latest_run else None,
        "recentRuns": [
            {
                "runId": row[0],
                "startedAt": row[1].isoformat() if row[1] else "",
                "finishedAt": row[2].isoformat() if row[2] else "",
                "pagesScraped": row[3] or 0,
                "albumsNew": row[4] or 0,
                "albumsUpdated": row[5] or 0,
                "albumsFailed": row[6] or 0,
                "songsTotal": row[7] or 0,
                "status": row[8] or "unknown",
            }
            for row in recent_runs
        ],
    }


def favorite_song_ids_for_user(user_id: str) -> set[str]:
    with get_read_conn() as conn:
        rows = conn.execute("SELECT song_id FROM favorite_songs WHERE user_id = ?", [user_id]).fetchall()
    return {row[0] for row in rows}


def playlists_for_user(user_id: str) -> list[dict]:
    with get_read_conn() as conn:
        rows = conn.execute(
            """
            SELECT p.playlist_id, p.name, p.is_global, p.source, p.source_url, p.updated_at, COUNT(ps.song_id) AS track_count
            FROM playlists p
            LEFT JOIN playlist_songs ps ON ps.playlist_id = p.playlist_id
            WHERE p.user_id = ? AND p.is_global = FALSE
            GROUP BY 1,2,3,4,5,6
            ORDER BY p.updated_at DESC, p.created_at DESC
            """,
            [user_id],
        ).fetchall()
    return [
        {
            "id": row[0],
            "name": row[1] or "",
            "isGlobal": bool(row[2]),
            "source": row[3] or "manual",
            "sourceUrl": row[4] or "",
            "updatedAt": row[5].isoformat() if row[5] else "",
            "trackCount": row[6] or 0,
        }
        for row in rows
    ]


def global_playlists() -> list[dict]:
    with get_read_conn() as conn:
        rows = conn.execute(
            """
            SELECT p.playlist_id, p.name, p.source, p.source_url, p.updated_at, COUNT(ps.song_id) AS track_count
            FROM playlists p
            LEFT JOIN playlist_songs ps ON ps.playlist_id = p.playlist_id
            WHERE p.is_global = TRUE
            GROUP BY 1,2,3,4,5
            ORDER BY p.updated_at DESC, p.created_at DESC
            """
        ).fetchall()
    return [
        {
            "id": row[0],
            "name": row[1] or "",
            "isGlobal": True,
            "source": row[2] or "manual",
            "sourceUrl": row[3] or "",
            "updatedAt": row[4].isoformat() if row[4] else "",
            "trackCount": row[5] or 0,
        }
        for row in rows
    ]


def playlist_tracks(playlist_id: str) -> list[dict]:
    with get_read_conn() as conn:
        rows = conn.execute(
            """
            SELECT s.song_id, s.track_name, s.singers, s.movie_name, s.music_director, s.year
            FROM playlist_songs ps
            JOIN songs s ON s.song_id = ps.song_id
            WHERE ps.playlist_id = ?
            ORDER BY ps.position
            """,
            [playlist_id],
        ).fetchall()
    return [
        {
            "id": row[0],
            "track": row[1] or "",
            "singers": row[2] or "",
            "movie": row[3] or "",
            "musicDirector": row[4] or "",
            "year": row[5] or "",
            "audioUrl": f"/api/stream/{row[0]}",
        }
        for row in rows
    ]


def simplify_track_name(value: str) -> str:
    cleaned = value or ""
    patterns = (
        r"\([^)]*(feat|featuring|from|version|video|lyric|lyrics|remaster|remastered|original|official)[^)]*\)",
        r"\[[^\]]*(feat|featuring|from|version|video|lyric|lyrics|remaster|remastered|original|official)[^\]]*\]",
        r"\s+-\s+(from|feat|featuring|video|lyric|lyrics|remaster|remastered|original|official).*$",
        r"\s+(feat|featuring)\.?\s+.*$",
    )
    for pattern in patterns:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace("&", " ")
    return normalize_text(cleaned)


def token_set(value: str) -> set[str]:
    return {token for token in simplify_track_name(value).split() if len(token) > 1}


def token_overlap_score(left: set[str], right: set[str], weight: int) -> int:
    if not left or not right:
        return 0
    overlap = len(left & right)
    if not overlap:
        return 0
    ratio = overlap / max(len(left), len(right))
    return int(weight * ratio * 10)


def match_spotify_track(track_name: str, artists: list[str], album_name: str = "") -> str | None:
    track_norm = simplify_track_name(track_name)
    track_tokens = token_set(track_name)
    artists_norm = normalize_text(" ".join(artists))
    artist_tokens = {
        token
        for artist in artists
        for token in normalize_text(artist).split()
        if len(token) > 1
    }
    album_norm = simplify_track_name(album_name)
    album_tokens = token_set(album_name)

    candidates = []
    for song in get_library_match_cache():
        score = 0

        if song["track_norm"] == track_norm and track_norm:
            score += 120
        elif track_norm and (track_norm in song["track_norm"] or song["track_norm"] in track_norm):
            score += 70
        score += token_overlap_score(track_tokens, set(song["track_norm"].split()), 9)

        if artists_norm and artists_norm == song["singers_norm"]:
            score += 45
        score += token_overlap_score(artist_tokens, set(song["singers_norm"].split()), 7)
        score += token_overlap_score(artist_tokens, set(song["music_director_norm"].split()), 4)

        if album_norm and album_norm == song["movie_norm"]:
            score += 40
        elif album_norm and (album_norm in song["movie_norm"] or song["movie_norm"] in album_norm):
            score += 24
        score += token_overlap_score(album_tokens, set(song["movie_norm"].split()), 5)

        if score:
            candidates.append((score, song["id"]))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0], reverse=True)
    best_score, best_id = candidates[0]
    second_score = candidates[1][0] if len(candidates) > 1 else -1

    if best_score < 60:
        return None
    if second_score >= 0 and best_score - second_score < 8:
        return None
    return best_id


def resolve_spotify_playlist_tracks(playlist_url: str) -> tuple[str, list[dict]]:
    match = SPOTIFY_PLAYLIST_RE.search(playlist_url)
    if not match:
        raise ValueError("Invalid Spotify playlist link")
    playlist_id = match.group(1)
    token_response = requests.get(
        "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
        timeout=15,
    )
    token_response.raise_for_status()
    access_token = token_response.json().get("accessToken")
    if not access_token:
        raise ValueError("Spotify access token unavailable")
    playlist_response = requests.get(
        f"https://api.spotify.com/v1/playlists/{playlist_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "fields": "name,tracks.items(track(name,artists(name),album(name))),tracks.next",
        },
        timeout=20,
    )
    playlist_response.raise_for_status()
    payload = playlist_response.json()
    items = payload.get("tracks", {}).get("items", [])
    tracks = []
    for item in items:
        track = item.get("track") or {}
        artists = [artist.get("name", "") for artist in track.get("artists", []) if artist.get("name")]
        album = (track.get("album") or {}).get("name", "")
        tracks.append({"name": track.get("name", ""), "artists": artists, "album": album})
    return payload.get("name") or "Spotify Playlist", tracks


def spotify_api_paginate(access_token: str, url: str, params: dict | None = None) -> list[dict]:
    items: list[dict] = []
    next_url = url
    next_params = params

    while next_url:
        response = requests.get(
            next_url,
            headers={"Authorization": f"Bearer {access_token}"},
            params=next_params,
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        items.extend(payload.get("items", []))
        next_url = payload.get("next")
        next_params = None

    return items


def resolve_spotify_account_playlists(access_token: str) -> list[dict]:
    items = spotify_api_paginate(
        access_token,
        "https://api.spotify.com/v1/me/playlists",
        {"limit": 50},
    )
    return [
        {
            "id": playlist.get("id", ""),
            "name": playlist.get("name", ""),
            "trackCount": ((playlist.get("tracks") or {}).get("total")) or 0,
            "owner": ((playlist.get("owner") or {}).get("display_name")) or "",
        }
        for playlist in items
        if playlist.get("id") and playlist.get("name")
    ]


def resolve_spotify_saved_tracks(access_token: str) -> list[dict]:
    items = spotify_api_paginate(
        access_token,
        "https://api.spotify.com/v1/me/tracks",
        {"limit": 50},
    )
    tracks: list[dict] = []
    for item in items:
        track = item.get("track") or {}
        artists = [artist.get("name", "") for artist in track.get("artists", []) if artist.get("name")]
        album = (track.get("album") or {}).get("name", "")
        tracks.append({"name": track.get("name", ""), "artists": artists, "album": album})
    return tracks


def resolve_spotify_playlist_tracks_api(access_token: str, playlist_id: str) -> tuple[str, list[dict]]:
    playlist_response = requests.get(
        f"https://api.spotify.com/v1/playlists/{playlist_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"fields": "name"},
        timeout=20,
    )
    playlist_response.raise_for_status()
    playlist_name = (playlist_response.json() or {}).get("name") or "Spotify Playlist"
    items = spotify_api_paginate(
        access_token,
        f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
        {
            "limit": 100,
            "fields": "items(track(name,artists(name),album(name))),next",
        },
    )
    tracks: list[dict] = []
    for item in items:
        track = item.get("track") or {}
        artists = [artist.get("name", "") for artist in track.get("artists", []) if artist.get("name")]
        album = (track.get("album") or {}).get("name", "")
        tracks.append({"name": track.get("name", ""), "artists": artists, "album": album})
    return playlist_name, tracks


def ensure_song_row_cache() -> None:
    if song_row_cache:
        return
    with song_cache_lock:
        if song_row_cache:
            return
        with get_read_conn() as conn:
            rows = conn.execute(
                """
                SELECT song_id, album_url, track_number, track_name, url_320kbps
                FROM songs
                WHERE url_320kbps IS NOT NULL AND url_320kbps != ''
                """
            ).fetchall()
        for row in rows:
            song_row_cache[row[0]] = {
                "song_id": row[0],
                "album_url": row[1],
                "track_number": row[2],
                "track_name": row[3],
                "url_320kbps": row[4],
            }


def get_song_row(song_id: str) -> dict | None:
    ensure_song_row_cache()
    return song_row_cache.get(song_id)


def invalidate_song_cache(song_id: str | None = None) -> None:
    with song_cache_lock:
        if song_id:
            song_row_cache.pop(song_id, None)
            status_cache.pop(song_id, None)
        else:
            song_row_cache.clear()
            status_cache.clear()


def get_cache_path(song_id: str) -> Path:
    return CACHE_DIR / f"{song_id}.mp3"


def get_shared_cache_key(song_id: str) -> str:
    return f"audio/{song_id}.mp3"


def is_audio_content_type(content_type: str | None) -> bool:
    if not content_type:
        return True
    normalized = content_type.lower()
    return normalized.startswith("audio/") or "octet-stream" in normalized


def cache_file_looks_valid(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < 64 * 1024:
        return False
    try:
        with path.open("rb") as handle:
            prefix = handle.read(512).lower()
    except OSError:
        return False
    return b"<!doctype html" not in prefix and b"<html" not in prefix


def is_cached(song_id: str) -> bool:
    path = get_cache_path(song_id)
    if cache_file_looks_valid(path):
        return True
    if path.exists():
        app.logger.warning("Removing invalid cached audio for %s: %s", song_id, path)
        try:
            path.unlink()
        except OSError:
            pass
    return False


def restore_from_shared_cache(song_id: str) -> bool:
    if not shared_cache.enabled:
        return False
    path = get_cache_path(song_id)
    if is_cached(song_id):
        return True
    restored = shared_cache.fetch_to_path(get_shared_cache_key(song_id), path)
    if not restored:
        return False
    if cache_file_looks_valid(path):
        app.logger.info("Restored %s from shared cache", song_id)
        return True
    try:
        path.unlink()
    except OSError:
        pass
    app.logger.warning("Discarded invalid shared-cache object for %s", song_id)
    return False


def upload_to_shared_cache_async(song_id: str, path: Path) -> None:
    if not shared_cache.enabled or not path.exists():
        return

    def upload():
        ok = shared_cache.upload_path(get_shared_cache_key(song_id), path)
        if not ok:
            app.logger.warning("Shared cache upload failed for %s", song_id)

    thread = threading.Thread(target=upload, daemon=True)
    thread.start()


def get_stream_health(song_id: str, url: str) -> dict:
    if is_cached(song_id):
        return {"status": "healthy", "label": "green"}
    if restore_from_shared_cache(song_id):
        return {"status": "healthy", "label": "green"}

    cached = status_cache.get(song_id)
    if cached:
        return cached

    try:
        response = requests.get(
            url,
            headers={**UPSTREAM_HEADERS, "Range": "bytes=0-1"},
            stream=True,
            timeout=(4, 10),
            allow_redirects=True,
        )
        code = response.status_code
        content_type = response.headers.get("Content-Type")
        response.close()
        if code in (200, 206) and is_audio_content_type(content_type):
            result = {"status": "healthy", "label": "green"}
        elif code in (401, 403, 404):
            result = {"status": "unavailable", "label": "red"}
        else:
            result = {"status": "network", "label": "orange"}
    except requests.RequestException:
        app.logger.warning("Health check failed for %s", song_id, exc_info=True)
        result = {"status": "network", "label": "orange"}

    status_cache[song_id] = result
    return result


def try_refresh_song_link(song_id: str) -> dict | None:
    row = get_song_row(song_id)
    if not row:
        return None

    album_url = row["album_url"]

    with refresh_lock:
        if album_url in refreshing_albums:
            return get_song_row(song_id)
        refreshing_albums.add(album_url)

    try:
        album, songs = scraper_core.refresh_single_album(album_url)
        with db.get_conn() as conn:
            db.upsert_album(conn, album)
            db.upsert_songs(conn, songs)
        invalidate_song_cache()
        invalidate_library_match_cache()
        return get_song_row(song_id)
    except Exception:
        return row
    finally:
        with refresh_lock:
            refreshing_albums.discard(album_url)


def download_song_to_cache(song_id: str, url: str) -> None:
    final_path = get_cache_path(song_id)
    temp_path = final_path.with_suffix(".part")

    if is_cached(song_id):
        return

    with download_lock:
        if song_id in active_downloads:
            return
        active_downloads.add(song_id)

    try:
        with requests.get(
            url,
            headers=UPSTREAM_HEADERS,
            stream=True,
            timeout=(5, 60),
            allow_redirects=True,
        ) as upstream:
            upstream.raise_for_status()
            if not is_audio_content_type(upstream.headers.get("Content-Type")):
                app.logger.warning(
                    "Refusing to cache non-audio upstream response for %s: status=%s content_type=%s",
                    song_id,
                    upstream.status_code,
                    upstream.headers.get("Content-Type"),
                )
                return
            with temp_path.open("wb") as output:
                for chunk in upstream.iter_content(chunk_size=128 * 1024):
                    if chunk:
                        output.write(chunk)
        if cache_file_looks_valid(temp_path):
            temp_path.replace(final_path)
        elif temp_path.exists():
            app.logger.warning("Discarding invalid temp audio cache for %s: %s", song_id, temp_path)
            temp_path.unlink()
    except Exception:
        app.logger.warning("Cache download failed for %s", song_id, exc_info=True)
        if temp_path.exists():
            temp_path.unlink()
    finally:
        with download_lock:
            active_downloads.discard(song_id)


def ensure_song_cached_async(song_id: str, url: str) -> None:
    if is_cached(song_id):
        return
    if restore_from_shared_cache(song_id):
        return
    with download_lock:
        if song_id in active_downloads:
            return
    thread = threading.Thread(target=download_song_to_cache, args=(song_id, url), daemon=True)
    thread.start()


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/stats")
def stats():
    with get_read_conn() as conn:
        songs = conn.execute("SELECT COUNT(*) FROM songs").fetchone()[0]
        albums = conn.execute("SELECT COUNT(*) FROM albums").fetchone()[0]
        latest_year = conn.execute(
            "SELECT MAX(TRY_CAST(year AS INTEGER)) FROM songs WHERE year IS NOT NULL AND year != ''"
        ).fetchone()[0]
    return jsonify(
        {
            "songs": songs,
            "albums": albums,
            "latestYear": latest_year,
        }
    )


@app.get("/api/library")
def library():
    with get_read_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                song_id,
                movie_name,
                track_name,
                singers,
                music_director,
                year,
                track_number,
                url_320kbps,
                updated_at
            FROM songs
            WHERE url_320kbps IS NOT NULL AND url_320kbps != ''
            ORDER BY TRY_CAST(year AS INTEGER) DESC NULLS LAST, movie_name, track_number
            """
        ).fetchall()

    songs = [
        {
            "id": row[0],
            "movie": row[1] or "",
            "track": row[2] or "",
            "singers": row[3] or "",
            "musicDirector": row[4] or "",
            "year": row[5] or "",
            "trackNumber": row[6] or 0,
            "audioUrl": f"/api/stream/{row[0]}",
            "updatedAt": row[8].isoformat() if row[8] else "",
        }
        for row in rows
    ]

    return jsonify({"songs": songs})


@app.post("/api/prefetch")
def prefetch_songs():
    payload = request.get_json(silent=True) or {}
    ids = payload.get("ids") or []
    queued = 0

    for song_id in ids[:8]:
        row = get_song_row(song_id)
        if not row:
            continue
        if is_cached(song_id):
            continue
        ensure_song_cached_async(row["song_id"], row["url_320kbps"])
        queued += 1

    return jsonify({"ok": True, "queued": queued})


@app.get("/api/song-status/<song_id>")
def song_status(song_id: str):
    row = get_song_row(song_id)
    if not row:
        return jsonify({"status": "unavailable", "label": "red"}), 404
    url = row["url_320kbps"]
    return jsonify(get_stream_health(song_id, url))


def open_upstream_stream(song_id: str, url: str):
    headers = dict(UPSTREAM_HEADERS)
    requested_headers = ("Range", "If-Range", "If-Modified-Since", "If-None-Match")
    for header in requested_headers:
        value = request.headers.get(header)
        if value:
            headers[header] = value

    upstream = requests.get(url, headers=headers, stream=True, timeout=(5, 30), allow_redirects=True)

    if upstream.status_code in (401, 403, 404) or not is_audio_content_type(upstream.headers.get("Content-Type")):
        app.logger.warning(
            "Upstream stream rejected for %s: status=%s content_type=%s",
            song_id,
            upstream.status_code,
            upstream.headers.get("Content-Type"),
        )
        upstream.close()
        refreshed = try_refresh_song_link(song_id)
        refreshed_url = refreshed["url_320kbps"] if refreshed else None
        if refreshed_url and refreshed_url != url:
            upstream = requests.get(
                refreshed_url,
                headers=headers,
                stream=True,
                timeout=(5, 30),
                allow_redirects=True,
            )
            url = refreshed_url
            app.logger.info(
                "Retried refreshed stream for %s: status=%s content_type=%s",
                song_id,
                upstream.status_code,
                upstream.headers.get("Content-Type"),
            )

    if upstream.status_code in (200, 206) and is_audio_content_type(upstream.headers.get("Content-Type")):
        status_cache[song_id] = {"status": "healthy", "label": "green"}
    elif upstream.status_code in (401, 403, 404):
        status_cache[song_id] = {"status": "unavailable", "label": "red"}
    else:
        status_cache[song_id] = {"status": "network", "label": "orange"}

    return upstream, url


@app.get("/api/stream/<song_id>")
def stream_song(song_id: str):
    row = get_song_row(song_id)
    if not row:
        app.logger.warning("Stream request for unknown song_id=%s", song_id)
        return jsonify({"ok": False, "message": "Song not found"}), 404
    url = row["url_320kbps"]

    cached_path = get_cache_path(song_id)
    if is_cached(song_id):
        return send_file(cached_path, mimetype="audio/mpeg", conditional=True, etag=True, max_age=3600)
    if restore_from_shared_cache(song_id):
        return send_file(cached_path, mimetype="audio/mpeg", conditional=True, etag=True, max_age=3600)

    upstream, url = open_upstream_stream(song_id, url)
    if upstream.status_code not in (200, 206) or not is_audio_content_type(upstream.headers.get("Content-Type")):
        app.logger.warning(
            "Stream unavailable for %s: status=%s content_type=%s",
            song_id,
            upstream.status_code,
            upstream.headers.get("Content-Type"),
        )
        upstream.close()
        return jsonify({"ok": False, "message": "Upstream stream unavailable"}), 502

    passthrough_headers = {}
    for header in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"):
        value = upstream.headers.get(header)
        if value:
            passthrough_headers[header] = value

    passthrough_headers.setdefault("Content-Type", "audio/mpeg")
    passthrough_headers.setdefault("Accept-Ranges", "bytes")
    passthrough_headers["Cache-Control"] = "public, max-age=3600"

    should_cache = not request.headers.get("Range") or request.headers.get("Range") == "bytes=0-"
    temp_path = cached_path.with_suffix(".part")

    def generate():
        output = None
        try:
            if should_cache and not is_cached(song_id):
                with download_lock:
                    if song_id not in active_downloads:
                        active_downloads.add(song_id)
                        output = temp_path.open("wb")
            for chunk in upstream.iter_content(chunk_size=64 * 1024):
                if not chunk:
                    continue
                if output:
                    output.write(chunk)
                yield chunk
            if output:
                output.close()
                temp_path.replace(cached_path)
                upload_to_shared_cache_async(song_id, cached_path)
                output = None
        finally:
            upstream.close()
            if output:
                output.close()
            if temp_path.exists() and not is_cached(song_id):
                try:
                    temp_path.unlink()
                except OSError:
                    pass
            if should_cache:
                with download_lock:
                    active_downloads.discard(song_id)

    return Response(
        stream_with_context(generate()),
        status=upstream.status_code,
        headers=passthrough_headers,
        direct_passthrough=True,
    )


@app.get("/api/config")
def config():
    origin = request.headers.get("Origin", "").rstrip("/")
    return jsonify(
        {
            "googleClientId": GOOGLE_CLIENT_ID,
            "spotifyClientId": SPOTIFY_CLIENT_ID,
            "spotifyRedirectUri": SPOTIFY_REDIRECT_URI or origin,
            "spotifyScopes": SPOTIFY_SCOPES,
        }
    )


@app.get("/api/auth/session")
def auth_session():
    user = get_session_user()
    return jsonify({"ok": True, "user": user})


@app.post("/api/auth/google")
def auth_google():
    payload = request.get_json(silent=True) or {}
    credential = payload.get("credential", "")
    if not credential:
        return jsonify({"ok": False, "message": "Missing credential"}), 400
    try:
        response = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": credential},
            timeout=15,
        )
        response.raise_for_status()
        token = response.json()
    except requests.RequestException:
        return jsonify({"ok": False, "message": "Google verification failed"}), 400

    if token.get("email_verified") not in ("true", True):
        return jsonify({"ok": False, "message": "Google account is not verified"}), 400
    if GOOGLE_CLIENT_ID and token.get("aud") != GOOGLE_CLIENT_ID:
        return jsonify({"ok": False, "message": "Invalid Google client"}), 400

    user_id = hashlib.md5((token.get("sub") or token.get("email") or "").encode()).hexdigest()
    email = token.get("email", "")
    is_admin = email.lower() in ADMIN_EMAILS if email else False
    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO users (user_id, google_sub, email, name, picture, is_admin, last_login_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (user_id) DO UPDATE SET
                google_sub = excluded.google_sub,
                email = excluded.email,
                name = excluded.name,
                picture = excluded.picture,
                is_admin = CASE WHEN users.is_admin THEN TRUE ELSE excluded.is_admin END,
                last_login_at = excluded.last_login_at,
                updated_at = excluded.updated_at
            """,
            [
                user_id,
                token.get("sub", ""),
                email,
                token.get("name", ""),
                token.get("picture", ""),
                is_admin,
                now_utc(),
                now_utc(),
                now_utc(),
            ],
        )
        user_row = conn.execute(
            "SELECT is_admin, is_banned, ban_reason FROM users WHERE user_id = ?",
            [user_id],
        ).fetchone()
    if user_row and user_row[1]:
        return jsonify({"ok": False, "message": user_row[2] or "Account has been banned"}), 403
    user_payload = {
        "user_id": user_id,
        "email": email,
        "name": token.get("name", ""),
        "picture": token.get("picture", ""),
        "is_admin": bool(user_row[0]) if user_row else False,
        "is_banned": bool(user_row[1]) if user_row else False,
        "ban_reason": user_row[2] or "" if user_row else "",
    }
    return issue_session_response(user_id, user_payload)


@app.post("/api/auth/logout")
def auth_logout():
    user = get_session_user()
    if user:
        with db.get_conn() as conn:
            conn.execute("DELETE FROM user_sessions WHERE session_id = ?", [user["session_id"]])
    return clear_session_response()


@app.get("/api/favorites")
def favorites():
    user, error_response = require_session_user()
    if error_response:
        return error_response
    favorite_ids = sorted(favorite_song_ids_for_user(user["user_id"]))
    return jsonify({"ok": True, "songIds": favorite_ids})


@app.post("/api/favorites/<song_id>")
def add_favorite(song_id: str):
    user, error_response = require_session_user()
    if error_response:
        return error_response
    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO favorite_songs (user_id, song_id, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT (user_id, song_id) DO NOTHING
            """,
            [user["user_id"], song_id, now_utc()],
        )
    return jsonify({"ok": True})


@app.delete("/api/favorites/<song_id>")
def remove_favorite(song_id: str):
    user, error_response = require_session_user()
    if error_response:
        return error_response
    with db.get_conn() as conn:
        conn.execute("DELETE FROM favorite_songs WHERE user_id = ? AND song_id = ?", [user["user_id"], song_id])
    return jsonify({"ok": True})


@app.get("/api/playlists")
def playlists():
    user, error_response = require_session_user()
    if error_response:
        return error_response
    return jsonify({"ok": True, "playlists": playlists_for_user(user["user_id"]), "globalPlaylists": global_playlists()})


@app.post("/api/playlists")
def create_playlist():
    user, error_response = require_session_user()
    if error_response:
        return error_response
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "message": "Playlist name is required"}), 400
    playlist_id = secrets.token_hex(16)
    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO playlists (playlist_id, user_id, name, is_global, source, source_url, created_at, updated_at)
            VALUES (?, ?, ?, FALSE, 'manual', '', ?, ?)
            """,
            [playlist_id, user["user_id"], name, now_utc(), now_utc()],
        )
    return jsonify({"ok": True, "playlist": {"id": playlist_id, "name": name, "isGlobal": False, "source": "manual", "sourceUrl": "", "trackCount": 0}})


@app.get("/api/playlists/<playlist_id>")
def get_playlist(playlist_id: str):
    user, error_response = require_session_user()
    if error_response:
        return error_response
    with get_read_conn() as conn:
        playlist = conn.execute(
            "SELECT playlist_id, name, is_global, source, source_url, user_id FROM playlists WHERE playlist_id = ?",
            [playlist_id],
        ).fetchone()
    if not playlist or (playlist[5] != user["user_id"] and not playlist[2]):
        return jsonify({"ok": False, "message": "Playlist not found"}), 404
    return jsonify(
        {
            "ok": True,
            "playlist": {
                "id": playlist[0],
                "name": playlist[1] or "",
                "isGlobal": bool(playlist[2]),
                "source": playlist[3] or "manual",
                "sourceUrl": playlist[4] or "",
                "tracks": playlist_tracks(playlist_id),
            },
        }
    )


@app.post("/api/playlists/<playlist_id>/songs")
def add_song_to_playlist(playlist_id: str):
    user, error_response = require_session_user()
    if error_response:
        return error_response
    payload = request.get_json(silent=True) or {}
    song_id = payload.get("songId", "")
    if not song_id:
        return jsonify({"ok": False, "message": "songId is required"}), 400
    with db.get_conn() as conn:
        playlist = conn.execute(
            "SELECT playlist_id, is_global, user_id FROM playlists WHERE playlist_id = ?",
            [playlist_id],
        ).fetchone()
        if not playlist or (playlist[1] and not user["is_admin"]) or (not playlist[1] and playlist[2] != user["user_id"]):
            return jsonify({"ok": False, "message": "Playlist not found"}), 404
        next_position = conn.execute(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM playlist_songs WHERE playlist_id = ?",
            [playlist_id],
        ).fetchone()[0]
        conn.execute(
            """
            INSERT INTO playlist_songs (playlist_id, song_id, position, added_at)
            VALUES (?, ?, ?, ?)
            """,
            [playlist_id, song_id, next_position, now_utc()],
        )
        conn.execute("UPDATE playlists SET updated_at = ? WHERE playlist_id = ?", [now_utc(), playlist_id])
    return jsonify({"ok": True})


@app.delete("/api/playlists/<playlist_id>/songs/<song_id>")
def remove_song_from_playlist(playlist_id: str, song_id: str):
    user, error_response = require_session_user()
    if error_response:
        return error_response
    with db.get_conn() as conn:
        playlist = conn.execute(
            "SELECT playlist_id, is_global, user_id FROM playlists WHERE playlist_id = ?",
            [playlist_id],
        ).fetchone()
        if not playlist or (playlist[1] and not user["is_admin"]) or (not playlist[1] and playlist[2] != user["user_id"]):
            return jsonify({"ok": False, "message": "Playlist not found"}), 404
        conn.execute("DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?", [playlist_id, song_id])
        rows = conn.execute(
            "SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY position, added_at",
            [playlist_id],
        ).fetchall()
        conn.execute("DELETE FROM playlist_songs WHERE playlist_id = ?", [playlist_id])
        conn.executemany(
            "INSERT INTO playlist_songs (playlist_id, song_id, position, added_at) VALUES (?, ?, ?, ?)",
            [[playlist_id, row[0], index + 1, now_utc()] for index, row in enumerate(rows)],
        )
        conn.execute("UPDATE playlists SET updated_at = ? WHERE playlist_id = ?", [now_utc(), playlist_id])
    return jsonify({"ok": True})


@app.delete("/api/playlists/<playlist_id>")
def delete_playlist(playlist_id: str):
    user, error_response = require_session_user()
    if error_response:
        return error_response
    with db.get_conn() as conn:
        playlist = conn.execute(
            "SELECT playlist_id, is_global, user_id FROM playlists WHERE playlist_id = ?",
            [playlist_id],
        ).fetchone()
        if not playlist or (playlist[1] and not user["is_admin"]) or (not playlist[1] and playlist[2] != user["user_id"]):
            return jsonify({"ok": False, "message": "Playlist not found"}), 404
        conn.execute("DELETE FROM playlist_songs WHERE playlist_id = ?", [playlist_id])
        conn.execute("DELETE FROM playlists WHERE playlist_id = ?", [playlist_id])
    return jsonify({"ok": True})


@app.post("/api/playlists/import/spotify")
def import_spotify_playlist():
    user, error_response = require_session_user()
    if error_response:
        return error_response
    payload = request.get_json(silent=True) or {}
    playlist_url = (payload.get("url") or "").strip()
    if not playlist_url:
        return jsonify({"ok": False, "message": "Spotify playlist URL is required"}), 400
    try:
        playlist_name, tracks = resolve_spotify_playlist_tracks(playlist_url)
    except Exception as exc:
        app.logger.warning("Spotify import failed", exc_info=True)
        return jsonify({"ok": False, "message": str(exc) or "Spotify import failed"}), 400

    matched_ids = []
    unmatched = []
    for track in tracks:
        song_id = match_spotify_track(track["name"], track["artists"], track.get("album", ""))
        if song_id:
            matched_ids.append(song_id)
        else:
            unmatched.append(track)

    playlist_id = secrets.token_hex(16)
    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO playlists (playlist_id, user_id, name, is_global, source, source_url, created_at, updated_at)
            VALUES (?, ?, ?, FALSE, 'spotify', ?, ?, ?)
            """,
            [playlist_id, user["user_id"], playlist_name, playlist_url, now_utc(), now_utc()],
        )
        conn.executemany(
            "INSERT INTO playlist_songs (playlist_id, song_id, position, added_at) VALUES (?, ?, ?, ?)",
            [[playlist_id, song_id, index + 1, now_utc()] for index, song_id in enumerate(matched_ids)],
        )
    return jsonify(
        {
            "ok": True,
            "playlist": {
                "id": playlist_id,
                "name": playlist_name,
                "isGlobal": False,
                "source": "spotify",
                "sourceUrl": playlist_url,
                "trackCount": len(matched_ids),
            },
            "matchedCount": len(matched_ids),
            "unmatched": unmatched[:20],
        }
    )


@app.post("/api/spotify/playlists")
def spotify_playlists():
    user, error_response = require_session_user()
    if error_response:
        return error_response
    payload = request.get_json(silent=True) or {}
    access_token = (payload.get("accessToken") or "").strip()
    if not access_token:
        return jsonify({"ok": False, "message": "Spotify access token is required"}), 400
    try:
        playlists = resolve_spotify_account_playlists(access_token)
    except requests.RequestException:
        app.logger.warning("Spotify playlist listing failed", exc_info=True)
        return jsonify({"ok": False, "message": "Unable to load Spotify playlists"}), 400
    return jsonify({"ok": True, "playlists": playlists})


@app.post("/api/spotify/import/liked-songs")
def spotify_import_liked_songs():
    user, error_response = require_session_user()
    if error_response:
        return error_response
    payload = request.get_json(silent=True) or {}
    access_token = (payload.get("accessToken") or "").strip()
    if not access_token:
        return jsonify({"ok": False, "message": "Spotify access token is required"}), 400
    try:
        tracks = resolve_spotify_saved_tracks(access_token)
    except requests.RequestException:
        app.logger.warning("Spotify liked songs import failed", exc_info=True)
        return jsonify({"ok": False, "message": "Unable to load Spotify liked songs"}), 400

    matched_ids: list[str] = []
    unmatched: list[dict] = []
    for track in tracks:
        song_id = match_spotify_track(track["name"], track["artists"], track.get("album", ""))
        if song_id and song_id not in matched_ids:
            matched_ids.append(song_id)
        else:
            unmatched.append(track)

    with db.get_conn() as conn:
        conn.executemany(
            """
            INSERT INTO favorite_songs (user_id, song_id, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT (user_id, song_id) DO NOTHING
            """,
            [[user["user_id"], song_id, now_utc()] for song_id in matched_ids],
        )

    return jsonify(
        {
            "ok": True,
            "matchedCount": len(matched_ids),
            "totalCount": len(tracks),
            "unmatched": unmatched[:20],
        }
    )


@app.post("/api/spotify/import/playlist")
def spotify_import_account_playlist():
    user, error_response = require_session_user()
    if error_response:
        return error_response
    payload = request.get_json(silent=True) or {}
    access_token = (payload.get("accessToken") or "").strip()
    playlist_id = (payload.get("playlistId") or "").strip()
    if not access_token or not playlist_id:
        return jsonify({"ok": False, "message": "Spotify access token and playlistId are required"}), 400

    try:
        playlist_name, tracks = resolve_spotify_playlist_tracks_api(access_token, playlist_id)
    except requests.RequestException:
        app.logger.warning("Spotify account playlist import failed", exc_info=True)
        return jsonify({"ok": False, "message": "Unable to import Spotify playlist"}), 400

    matched_ids: list[str] = []
    unmatched: list[dict] = []
    for track in tracks:
        song_id = match_spotify_track(track["name"], track["artists"], track.get("album", ""))
        if song_id and song_id not in matched_ids:
            matched_ids.append(song_id)
        else:
            unmatched.append(track)

    playlist_id_local = secrets.token_hex(16)
    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO playlists (playlist_id, user_id, name, is_global, source, source_url, created_at, updated_at)
            VALUES (?, ?, ?, FALSE, 'spotify', ?, ?, ?)
            """,
            [playlist_id_local, user["user_id"], playlist_name, f"spotify:playlist:{playlist_id}", now_utc(), now_utc()],
        )
        conn.executemany(
            "INSERT INTO playlist_songs (playlist_id, song_id, position, added_at) VALUES (?, ?, ?, ?)",
            [[playlist_id_local, song_id, index + 1, now_utc()] for index, song_id in enumerate(matched_ids)],
        )

    return jsonify(
        {
            "ok": True,
            "playlist": {
                "id": playlist_id_local,
                "name": playlist_name,
                "isGlobal": False,
                "source": "spotify",
                "sourceUrl": f"spotify:playlist:{playlist_id}",
                "trackCount": len(matched_ids),
            },
            "matchedCount": len(matched_ids),
            "totalCount": len(tracks),
            "unmatched": unmatched[:20],
        }
    )


@app.post("/api/admin/playlists")
def admin_create_global_playlist():
    admin_user, error_response = require_admin_user()
    if error_response:
        return error_response
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "message": "Playlist name is required"}), 400
    playlist_id = secrets.token_hex(16)
    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO playlists (playlist_id, user_id, name, is_global, source, source_url, created_at, updated_at)
            VALUES (?, ?, ?, TRUE, 'manual', '', ?, ?)
            """,
            [playlist_id, admin_user["user_id"], name, now_utc(), now_utc()],
        )
    return jsonify({"ok": True, "playlist": {"id": playlist_id, "name": name, "isGlobal": True, "source": "manual", "sourceUrl": "", "trackCount": 0}})


@app.get("/api/admin/overview")
def admin_overview():
    _, error_response = require_admin_user()
    if error_response:
        return error_response
    with get_read_conn() as conn:
        users = conn.execute(
            """
            SELECT user_id, email, name, picture, is_admin, is_banned, ban_reason, last_login_at, created_at
            FROM users
            ORDER BY updated_at DESC, created_at DESC
            """
        ).fetchall()
    return jsonify(
        {
            "ok": True,
            "users": [
                {
                    "userId": row[0],
                    "email": row[1] or "",
                    "name": row[2] or "",
                    "picture": row[3] or "",
                    "isAdmin": bool(row[4]),
                    "isBanned": bool(row[5]),
                    "banReason": row[6] or "",
                    "lastLoginAt": row[7].isoformat() if row[7] else "",
                    "createdAt": row[8].isoformat() if row[8] else "",
                }
                for row in users
            ],
            "airflow": airflow_process_status(),
        }
    )


@app.post("/api/admin/users/<user_id>/ban")
def admin_ban_user(user_id: str):
    _, error_response = require_admin_user()
    if error_response:
        return error_response
    payload = request.get_json(silent=True) or {}
    reason = (payload.get("reason") or "Banned by admin").strip()
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE users SET is_banned = TRUE, ban_reason = ?, updated_at = ? WHERE user_id = ?",
            [reason, now_utc(), user_id],
        )
        conn.execute(
            "DELETE FROM user_sessions WHERE user_id = ?",
            [user_id],
        )
    return jsonify({"ok": True})


@app.post("/api/admin/users/<user_id>/unban")
def admin_unban_user(user_id: str):
    _, error_response = require_admin_user()
    if error_response:
        return error_response
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE users SET is_banned = FALSE, ban_reason = '', updated_at = ? WHERE user_id = ?",
            [now_utc(), user_id],
        )
    return jsonify({"ok": True})


@app.post("/api/admin/users/<user_id>/admin")
def admin_toggle_admin(user_id: str):
    admin_user, error_response = require_admin_user()
    if error_response:
        return error_response
    payload = request.get_json(silent=True) or {}
    is_admin = bool(payload.get("isAdmin"))
    if admin_user["user_id"] == user_id and not is_admin:
        return jsonify({"ok": False, "message": "You cannot remove your own admin access"}), 400
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE users SET is_admin = ?, updated_at = ? WHERE user_id = ?",
            [is_admin, now_utc(), user_id],
        )
    return jsonify({"ok": True})


@app.get("/api/admin/airflow")
def admin_airflow():
    _, error_response = require_admin_user()
    if error_response:
        return error_response
    return jsonify({"ok": True, "airflow": airflow_process_status()})


@app.post("/api/admin/airflow/start")
def admin_airflow_start():
    _, error_response = require_admin_user()
    if error_response:
        return error_response
    code, stdout, stderr = run_local_command(["bash", "start.sh"])
    return jsonify({"ok": code == 0, "stdout": stdout, "stderr": stderr, "airflow": airflow_process_status()}), (200 if code == 0 else 500)


@app.post("/api/admin/airflow/stop")
def admin_airflow_stop():
    _, error_response = require_admin_user()
    if error_response:
        return error_response
    code, stdout, stderr = run_local_command(["bash", "stop.sh"])
    return jsonify({"ok": code == 0, "stdout": stdout, "stderr": stderr, "airflow": airflow_process_status()}), (200 if code == 0 else 500)


@app.post("/api/admin/airflow/trigger-full")
def admin_airflow_trigger_full():
    _, error_response = require_admin_user()
    if error_response:
        return error_response
    code, stdout, stderr = run_local_command(["bash", "trigger_full.sh"])
    return jsonify({"ok": code == 0, "stdout": stdout, "stderr": stderr, "airflow": airflow_process_status()}), (200 if code == 0 else 500)


@app.post("/api/admin/airflow/trigger")
def admin_airflow_trigger():
    _, error_response = require_admin_user()
    if error_response:
        return error_response
    code, stdout, stderr = airflow_cli(["dags", "trigger", "masstamilan_daily_scraper"])
    return jsonify({"ok": code == 0, "stdout": stdout, "stderr": stderr, "airflow": airflow_process_status()}), (200 if code == 0 else 500)


@app.get("/")
def serve_index():
    if DIST_DIR.exists():
        return send_from_directory(DIST_DIR, "index.html")
    return jsonify(
        {
            "ok": False,
            "message": "Frontend not built yet. Run `npm install` then `npm run dev` or `npm run build`.",
        }
    ), 503


@app.get("/<path:path>")
def serve_spa(path: str):
    candidate = DIST_DIR / path
    if candidate.exists() and candidate.is_file():
        return send_from_directory(DIST_DIR, path)
    if DIST_DIR.exists():
        return send_from_directory(DIST_DIR, "index.html")
    return serve_index()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
