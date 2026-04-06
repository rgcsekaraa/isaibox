#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parent


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


def extract_playlist_id(playlist_url: str) -> str:
    for prefix in ("https://open.spotify.com/playlist/", "http://open.spotify.com/playlist/", "spotify:playlist:"):
        if playlist_url.startswith(prefix):
            tail = playlist_url[len(prefix):]
            return tail.split("?", 1)[0].split("/", 1)[0].strip()
    raise ValueError("Invalid Spotify playlist link")


def fetch_backend_config(base_url: str) -> dict:
    response = requests.get(f"{base_url.rstrip('/')}/api/config", timeout=10)
    response.raise_for_status()
    return response.json()


def fetch_client_credentials_token(client_id: str, client_secret: str) -> str:
    response = requests.post(
        "https://accounts.spotify.com/api/token",
        data={"grant_type": "client_credentials"},
        auth=(client_id, client_secret),
        timeout=15,
    )
    response.raise_for_status()
    payload = response.json() or {}
    return payload.get("access_token", "")


def fetch_playlist_name(playlist_id: str, access_token: str) -> dict:
    response = requests.get(
        f"https://api.spotify.com/v1/playlists/{playlist_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"fields": "name,id,owner(display_name),tracks(total),public"},
        timeout=20,
    )
    payload = {}
    try:
        payload = response.json() or {}
    except Exception:
        pass
    return {
        "status_code": response.status_code,
        "ok": response.ok,
        "payload": payload,
        "text": response.text[:500],
    }


def main() -> int:
    load_local_env()

    parser = argparse.ArgumentParser(description="Check live Spotify config and playlist access for isaibox")
    parser.add_argument("--backend", default="http://127.0.0.1:8000", help="Backend base URL")
    parser.add_argument("--playlist-url", help="Spotify playlist URL to test")
    parser.add_argument("--access-token", help="Optional Spotify user access token to test first")
    args = parser.parse_args()

    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "")
    redirect_uri = os.environ.get("SPOTIFY_REDIRECT_URI", "")

    print("Local env")
    print(json.dumps(
        {
            "SPOTIFY_CLIENT_ID_set": bool(client_id),
            "SPOTIFY_CLIENT_SECRET_set": bool(client_secret),
            "SPOTIFY_REDIRECT_URI": redirect_uri,
        },
        indent=2,
    ))

    try:
        config = fetch_backend_config(args.backend)
        print("\nBackend /api/config")
        print(json.dumps(config, indent=2))
    except Exception as exc:
        print(f"\nBackend /api/config failed: {exc}")

    if not args.playlist_url:
        return 0

    try:
        playlist_id = extract_playlist_id(args.playlist_url)
    except Exception as exc:
        print(f"\nPlaylist URL check failed: {exc}")
        return 1

    print(f"\nPlaylist ID: {playlist_id}")

    if args.access_token:
        try:
            user_result = fetch_playlist_name(playlist_id, args.access_token)
            print("\nSpotify playlist lookup with user token")
            print(json.dumps(user_result, indent=2))
        except Exception as exc:
            print(f"\nSpotify playlist lookup with user token failed: {exc}")

    if client_id and client_secret:
        try:
            client_token = fetch_client_credentials_token(client_id, client_secret)
            print("\nClient credentials token fetched: yes")
            client_result = fetch_playlist_name(playlist_id, client_token)
            print("Spotify playlist lookup with client credentials")
            print(json.dumps(client_result, indent=2))
        except Exception as exc:
            print(f"\nSpotify client credentials flow failed: {exc}")
    else:
        print("\nClient credentials flow skipped: missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
