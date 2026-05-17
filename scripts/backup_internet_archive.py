#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import shutil
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import duckdb
import requests


AUDIO_MIN_BYTES = 64 * 1024
AUDIO_SUFFIXES = {".mp3", ".m4a", ".aac", ".ogg", ".flac", ".wav"}
PUBLIC_TABLES = {
    "albums",
    "songs",
    "scrape_runs",
    "playlists",
    "playlist_songs",
}
DEFAULT_HEADERS = {
    "User-Agent": "isaibox-archive-backup/1.0 (+https://github.com/rgchandrasekaraa/isaibox)",
    "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
}


@dataclass(frozen=True)
class SongSource:
    song_id: str
    album_url: str
    url: str


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sql_literal(value: Path | str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def table_exists(connection: duckdb.DuckDBPyConnection, table_name: str) -> bool:
    rows = connection.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'main'
          AND table_name = ?
        LIMIT 1
        """,
        [table_name],
    ).fetchall()
    return bool(rows)


def source_table_exists(connection: duckdb.DuckDBPyConnection, table_name: str) -> bool:
    try:
        connection.execute(f"SELECT 1 FROM source_db.{table_name} LIMIT 1").fetchone()
        return True
    except duckdb.Error:
        return False


def copy_csv(connection: duckdb.DuckDBPyConnection, table_name: str, output_path: Path) -> bool:
    if not table_exists(connection, table_name):
        return False
    output_path.parent.mkdir(parents=True, exist_ok=True)
    connection.execute(
        f"COPY (SELECT * FROM {table_name}) TO {sql_literal(output_path)} (FORMAT CSV, HEADER TRUE)"
    )
    return True


def create_sanitized_duckdb(source_db: Path, output_db: Path) -> dict:
    if not source_db.exists():
        raise FileNotFoundError(f"DuckDB not found: {source_db}")
    output_db.parent.mkdir(parents=True, exist_ok=True)
    if output_db.exists():
        output_db.unlink()

    public = duckdb.connect(str(output_db))
    public.execute(f"ATTACH {sql_literal(source_db)} AS source_db (READ_ONLY)")
    public.execute(
        """
        CREATE TABLE albums AS
        SELECT album_url, movie_name, starring, music_director, director, lyricists,
               year, language, track_count, scrape_ok, first_seen_at, updated_at
        FROM source_db.albums
        """
    )
    public.execute(
        """
        CREATE TABLE songs AS
        SELECT song_id, album_url, movie_name, music_director, director, year,
               track_number, track_name, singers, url_128kbps, url_320kbps,
               first_seen_at, updated_at
        FROM source_db.songs
        """
    )
    if source_table_exists(public, "scrape_runs"):
        public.execute("CREATE TABLE scrape_runs AS SELECT * FROM source_db.scrape_runs")
    if source_table_exists(public, "playlists"):
        public.execute(
            """
            CREATE TABLE playlists AS
            SELECT playlist_id, name, source, source_url, created_at, updated_at, is_global
            FROM source_db.playlists
            WHERE COALESCE(is_global, false) = true
            """
        )
        if source_table_exists(public, "playlist_songs"):
            public.execute(
                """
                CREATE TABLE playlist_songs AS
                SELECT ps.playlist_id, ps.song_id, ps.position, ps.added_at
                FROM source_db.playlist_songs ps
                JOIN playlists p ON p.playlist_id = ps.playlist_id
                """
            )
    counts: dict[str, int] = {}
    for table in PUBLIC_TABLES:
        if table_exists(public, table):
            counts[table] = int(public.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    public.execute("CHECKPOINT")
    public.close()
    return counts


def export_public_metadata(source_db: Path, manifest_path: Path, work_dir: Path) -> tuple[dict[str, Path], dict]:
    metadata_dir = work_dir / "metadata"
    metadata_dir.mkdir(parents=True, exist_ok=True)
    sanitized_db = metadata_dir / "isaibox-public.duckdb"
    counts = create_sanitized_duckdb(source_db, sanitized_db)

    exported: dict[str, Path] = {
        "metadata/isaibox-public.duckdb": sanitized_db,
    }
    public = duckdb.connect(str(sanitized_db), read_only=True)
    for table_name, remote_name in (
        ("songs", "metadata/songs.csv"),
        ("albums", "metadata/albums.csv"),
        ("playlists", "metadata/global-playlists.csv"),
        ("playlist_songs", "metadata/global-playlist-songs.csv"),
    ):
        csv_path = metadata_dir / Path(remote_name).name
        if copy_csv(public, table_name, csv_path):
            exported[remote_name] = csv_path
    public.close()

    if manifest_path.exists():
        copied_manifest = metadata_dir / "library-manifest.json"
        shutil.copyfile(manifest_path, copied_manifest)
        exported["metadata/library-manifest.json"] = copied_manifest

    backup_manifest = {
        "generated_at": utc_now(),
        "source_db": str(source_db),
        "public_tables": sorted(counts),
        "counts": counts,
        "files": {
            remote: {
                "size": path.stat().st_size,
                "sha256": sha256_file(path),
            }
            for remote, path in sorted(exported.items())
        },
        "privacy": "Sanitized public library backup. User, session, favorite, and preference tables are excluded.",
    }
    backup_manifest_path = metadata_dir / "backup-manifest.json"
    backup_manifest_path.write_text(json.dumps(backup_manifest, indent=2, sort_keys=True) + "\n")
    exported["metadata/backup-manifest.json"] = backup_manifest_path
    return exported, backup_manifest


def load_song_sources(db_path: Path) -> dict[str, SongSource]:
    connection = duckdb.connect(str(db_path), read_only=True)
    rows = connection.execute(
        """
        SELECT song_id,
               COALESCE(album_url, '') AS album_url,
               COALESCE(NULLIF(url_320kbps, ''), NULLIF(url_128kbps, '')) AS url
        FROM songs
        WHERE COALESCE(NULLIF(url_320kbps, ''), NULLIF(url_128kbps, '')) IS NOT NULL
        ORDER BY COALESCE(updated_at, first_seen_at) DESC NULLS LAST, song_id
        """
    ).fetchall()
    connection.close()
    return {row[0]: SongSource(song_id=row[0], album_url=row[1] or "", url=row[2]) for row in rows}


def file_looks_audio(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < AUDIO_MIN_BYTES:
        return False
    try:
        prefix = path.read_bytes()[:512].lower()
    except OSError:
        return False
    return b"<!doctype html" not in prefix and b"<html" not in prefix


def is_audio_response(response: requests.Response) -> bool:
    content_type = (response.headers.get("Content-Type") or "").lower()
    if "text/html" in content_type or "text/plain" in content_type:
        return False
    return response.status_code in (200, 206) and (
        content_type.startswith("audio/") or "octet-stream" in content_type or not content_type
    )


def collect_cached_audio(audio_dir: Path, song_sources: dict[str, SongSource], existing_remote_names: set[str]) -> dict[str, Path]:
    if not audio_dir.exists():
        return {}
    pending: dict[str, Path] = {}
    for path in sorted(audio_dir.rglob("*")):
        if path.suffix.lower() not in AUDIO_SUFFIXES or not path.is_file():
            continue
        if path.stem not in song_sources:
            continue
        if not file_looks_audio(path):
            continue
        remote_name = f"audio/{path.stem}.mp3"
        if remote_name in existing_remote_names:
            continue
        pending[remote_name] = path
    return pending


def download_audio(song: SongSource, destination: Path, timeout: int) -> bool:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destination.with_suffix(".part")
    headers = dict(DEFAULT_HEADERS)
    if song.album_url:
        headers["Referer"] = song.album_url
    try:
        with requests.get(song.url, headers=headers, stream=True, timeout=(10, timeout), allow_redirects=True) as response:
            if not is_audio_response(response):
                print(
                    f"Skipping {song.song_id}: non-audio response "
                    f"status={response.status_code} content_type={response.headers.get('Content-Type')}",
                    file=sys.stderr,
                )
                return False
            with temp_path.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=256 * 1024):
                    if chunk:
                        handle.write(chunk)
        if file_looks_audio(temp_path):
            temp_path.replace(destination)
            return True
        print(f"Skipping {song.song_id}: downloaded file did not look like audio", file=sys.stderr)
    except Exception as exc:
        print(f"Skipping {song.song_id}: download failed: {exc}", file=sys.stderr)
    finally:
        if temp_path.exists():
            temp_path.unlink()
    return False


def hydrate_missing_audio(
    audio_dir: Path,
    song_sources: dict[str, SongSource],
    existing_remote_names: set[str],
    already_pending: set[str],
    limit: int,
    delay: float,
    timeout: int,
) -> dict[str, Path]:
    pending: dict[str, Path] = {}
    remaining = limit
    for song_id, song in song_sources.items():
        remote_name = f"audio/{song_id}.mp3"
        if remote_name in existing_remote_names or remote_name in already_pending:
            continue
        if limit and remaining <= 0:
            break
        destination = audio_dir / f"{song_id}.mp3"
        if file_looks_audio(destination):
            pending[remote_name] = destination
        elif download_audio(song, destination, timeout):
            pending[remote_name] = destination
            if delay > 0:
                time.sleep(delay)
        else:
            continue
        if limit:
            remaining -= 1
    return pending


def archive_existing_names(item) -> set[str]:
    try:
        item.reload()
    except Exception:
        return set()
    names: set[str] = set()
    for file_meta in item.files or []:
        if isinstance(file_meta, dict) and file_meta.get("name"):
            names.add(str(file_meta["name"]))
    return names


def upload_to_archive(
    *,
    item_identifier: str,
    files: dict[str, Path],
    access_key: str,
    secret_key: str,
    title: str,
    subject: str,
    collection: str,
) -> None:
    if not files:
        print("No files to upload.")
        return
    try:
        import internetarchive
    except ImportError as exc:
        raise RuntimeError("Install the internetarchive package before running this script.") from exc

    session = internetarchive.get_session(
        {
            "s3": {"access": access_key, "secret": secret_key},
            "general": {"user_agent_suffix": "isaibox-archive-backup/1.0"},
        }
    )
    item = session.get_item(item_identifier)
    metadata = {
        "title": title,
        "mediatype": "data",
        "subject": subject,
        "description": "Public Isaibox library backup containing sanitized metadata and public audio files.",
    }
    if collection:
        metadata["collection"] = collection
    print(f"Uploading {len(files)} file(s) to archive.org item {item_identifier}...")
    responses = item.upload(
        {remote: str(path) for remote, path in files.items()},
        metadata=metadata,
        access_key=access_key,
        secret_key=secret_key,
        queue_derive=False,
        checksum=True,
        retries=3,
        retries_sleep=30,
        verbose=True,
    )
    failed = []
    for response in responses:
        status_code = getattr(response, "status_code", 200)
        if status_code and int(status_code) >= 400:
            failed.append(status_code)
    if failed:
        raise RuntimeError(f"Internet Archive upload failed with status codes: {failed}")


def write_upload_plan(path: Path, files: dict[str, Path]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["remote_name", "local_path", "size"])
        for remote, local in sorted(files.items()):
            writer.writerow([remote, str(local), local.stat().st_size])


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish a sanitized Isaibox backup to Internet Archive.")
    parser.add_argument("--db-path", default="packages/isaibox-local/app/data/masstamilan.duckdb")
    parser.add_argument("--manifest-path", default="packages/isaibox-local/app/data/library-manifest.json")
    parser.add_argument("--audio-dir", default="packages/isaibox-local/app/.cache/audio")
    parser.add_argument("--work-dir", default=".ia-backup")
    parser.add_argument("--item", default=os.environ.get("IA_ITEM", "isaibox-public-library"))
    parser.add_argument("--title", default=os.environ.get("IA_TITLE", "Isaibox Public Library Backup"))
    parser.add_argument("--subject", default=os.environ.get("IA_SUBJECT", "isaibox;tamil music;metadata;audio backup"))
    parser.add_argument("--collection", default=os.environ.get("IA_COLLECTION", ""))
    parser.add_argument("--include-audio", action="store_true")
    parser.add_argument("--download-missing-audio", action="store_true")
    parser.add_argument("--audio-limit", type=int, default=int(os.environ.get("IA_AUDIO_LIMIT", "200") or "0"))
    parser.add_argument("--download-delay", type=float, default=float(os.environ.get("IA_DOWNLOAD_DELAY", "1.0") or "0"))
    parser.add_argument("--download-timeout", type=int, default=int(os.environ.get("IA_DOWNLOAD_TIMEOUT", "90") or "90"))
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    db_path = Path(args.db_path)
    manifest_path = Path(args.manifest_path)
    audio_dir = Path(args.audio_dir)
    work_dir = Path(args.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    metadata_files, backup_manifest = export_public_metadata(db_path, manifest_path, work_dir)
    files_to_upload = dict(metadata_files)
    access_key = os.environ.get("IA_ACCESS_KEY", "").strip()
    secret_key = os.environ.get("IA_SECRET_KEY", "").strip()

    existing_names: set[str] = set()
    if access_key and secret_key and not args.dry_run:
        import internetarchive

        session = internetarchive.get_session({"s3": {"access": access_key, "secret": secret_key}})
        existing_names = archive_existing_names(session.get_item(args.item))

    song_sources = load_song_sources(db_path)
    audio_candidates: dict[str, Path] = {}
    if args.include_audio:
        audio_candidates.update(collect_cached_audio(audio_dir, song_sources, existing_names))
        remaining_limit = max(0, args.audio_limit - len(audio_candidates)) if args.audio_limit else 0
        if args.download_missing_audio and (not args.audio_limit or remaining_limit > 0):
            hydrated = hydrate_missing_audio(
                audio_dir=audio_dir,
                song_sources=song_sources,
                existing_remote_names=existing_names,
                already_pending=set(audio_candidates),
                limit=remaining_limit,
                delay=args.download_delay,
                timeout=args.download_timeout,
            )
            audio_candidates.update(hydrated)
        if args.audio_limit:
            audio_candidates = dict(list(sorted(audio_candidates.items()))[: args.audio_limit])
        files_to_upload.update(audio_candidates)

    backup_manifest["audio"] = {
        "include_audio": bool(args.include_audio),
        "download_missing_audio": bool(args.download_missing_audio),
        "existing_remote_audio_count": sum(1 for name in existing_names if name.startswith("audio/")),
        "pending_audio_upload_count": len(audio_candidates),
        "audio_limit": args.audio_limit,
    }
    backup_manifest_path = Path(metadata_files["metadata/backup-manifest.json"])
    backup_manifest_path.write_text(json.dumps(backup_manifest, indent=2, sort_keys=True) + "\n")
    upload_plan_path = work_dir / "upload-plan.csv"
    write_upload_plan(upload_plan_path, files_to_upload)
    print(f"Prepared {len(metadata_files)} metadata file(s) and {len(audio_candidates)} audio file(s).")
    print(f"Upload plan: {upload_plan_path}")

    if args.dry_run:
        return 0
    if not access_key or not secret_key:
        raise RuntimeError("IA_ACCESS_KEY and IA_SECRET_KEY are required for upload.")
    upload_to_archive(
        item_identifier=args.item,
        files=files_to_upload,
        access_key=access_key,
        secret_key=secret_key,
        title=args.title,
        subject=args.subject,
        collection=args.collection,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
