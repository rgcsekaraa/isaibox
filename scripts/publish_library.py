#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ensure the repository root (parent of scripts/) is importable so ``import db`` works
# regardless of the working directory Python uses to populate sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import duckdb
import db


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def collect_stats(path: Path) -> dict[str, object]:
    conn = duckdb.connect(str(path), read_only=True)
    try:
        songs = int(conn.execute("SELECT COUNT(*) FROM songs").fetchone()[0])
        albums = int(conn.execute("SELECT COUNT(*) FROM albums").fetchone()[0])
        latest_updated_at = conn.execute(
            "SELECT MAX(updated_at) FROM songs WHERE updated_at IS NOT NULL"
        ).fetchone()[0]
    finally:
        conn.close()
    return {
        "songs": songs,
        "albums": albums,
        "latest_song_updated_at": latest_updated_at.isoformat() if latest_updated_at else "",
    }


def _duckdb_literal(path: Path) -> str:
    return str(path).replace("'", "''")


def _get_shared_columns(conn: duckdb.DuckDBPyConnection, table: str, source_schema: str = "source") -> list[str]:
    """Return the list of column names present in both the target and source table."""
    target_cols = {
        row[1]
        for row in conn.execute(f"PRAGMA table_info('{table}')").fetchall()
    }
    source_cols = [
        row[1]
        for row in conn.execute(f"PRAGMA table_info('{source_schema}.{table}')").fetchall()
    ]
    # Preserve source ordering, keep only columns that exist in both schemas.
    return [c for c in source_cols if c in target_cols]


def export_library_snapshot(source_db: Path, output_db: Path) -> None:
    temp_output = output_db.with_suffix(".tmp")
    if temp_output.exists():
        temp_output.unlink()
    if output_db.exists():
        output_db.unlink()

    conn = db.get_conn(str(temp_output))
    try:
        conn.execute(f"ATTACH '{_duckdb_literal(source_db)}' AS source (READ_ONLY)")

        for table in ("albums", "songs", "scrape_runs"):
            cols = _get_shared_columns(conn, table)
            col_list = ", ".join(cols)
            conn.execute(f"INSERT INTO {table} ({col_list}) SELECT {col_list} FROM source.{table}")

        # Playlists: only global ones
        pl_cols = _get_shared_columns(conn, "playlists")
        pl_col_list = ", ".join(pl_cols)
        conn.execute(
            f"""
            INSERT INTO playlists ({pl_col_list})
            SELECT {pl_col_list}
            FROM source.playlists
            WHERE COALESCE(is_global, FALSE) = TRUE
            """
        )

        # Playlist songs: only from global playlists
        ps_cols = _get_shared_columns(conn, "playlist_songs")
        ps_col_list = ", ".join(f"ps.{c}" for c in ps_cols)
        ps_target_list = ", ".join(ps_cols)
        conn.execute(
            f"""
            INSERT INTO playlist_songs ({ps_target_list})
            SELECT {ps_col_list}
            FROM source.playlist_songs ps
            JOIN source.playlists p ON p.playlist_id = ps.playlist_id
            WHERE COALESCE(p.is_global, FALSE) = TRUE
            """
        )

        conn.execute("DETACH source")
    finally:
        conn.close()

    temp_output.replace(output_db)


def build_manifest(stats_db: Path, download_path: Path, repo: str, ref: str, version: str) -> dict[str, object]:
    stats = collect_stats(stats_db)
    return {
        "version": version,
        "updated_at": version,
        "size": stats_db.stat().st_size,
        "sha256": sha256_file(stats_db),
        "download_url": f"https://raw.githubusercontent.com/{repo}/{ref}/{download_path.as_posix()}",
        "songs": stats["songs"],
        "albums": stats["albums"],
        "latest_song_updated_at": stats["latest_song_updated_at"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Copy and publish the packaged DuckDB manifest.")
    parser.add_argument("--db-path", required=True, help="Source DuckDB path")
    parser.add_argument("--output-db", required=True, help="Destination DuckDB path committed to Git")
    parser.add_argument("--manifest", required=True, help="Destination manifest JSON path")
    parser.add_argument("--repo", required=True, help="GitHub owner/repo")
    parser.add_argument("--ref", default="main", help="Git ref used for raw download URLs")
    parser.add_argument("--version", default="", help="Manifest version timestamp; defaults to current UTC time")
    parser.add_argument("--dry-run", action="store_true", help="Validate inputs and print the manifest without writing files")
    args = parser.parse_args()

    source_db = Path(args.db_path).resolve()
    output_db = Path(args.output_db)
    manifest_path = Path(args.manifest)
    version = args.version or iso_now()

    if not source_db.exists():
        raise FileNotFoundError(f"Source DuckDB not found: {source_db}")

    if args.dry_run:
        manifest_source = source_db
    else:
        output_db.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        export_library_snapshot(source_db, output_db)
        manifest_source = output_db

    manifest = build_manifest(manifest_source, output_db, args.repo, args.ref, version)

    if args.dry_run:
        print(json.dumps(manifest, indent=2, sort_keys=True))
        return 0

    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"output_db": output_db.as_posix(), "manifest": manifest}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
