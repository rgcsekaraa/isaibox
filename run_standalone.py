import os
import sys
import logging
from collections import defaultdict

# Ensure project root is in sys.path
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PROJECT_DIR)

import db
import scraper_core

import argparse

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)


def write_scrape_results(conn, *, kind: str, albums: list[dict], songs: list[dict], failed: list[str]) -> None:
    if kind == "refresh":
        songs_by_album: dict[str, list[dict]] = defaultdict(list)
        for song in songs:
            album_url = song.get("album_url") or ""
            if album_url:
                songs_by_album[album_url].append(song)

        for album in albums:
            album_url = album.get("album_url") or ""
            album_songs = songs_by_album.get(album_url, [])
            if not album_url or not album_songs:
                continue
            db.upsert_album(conn, album)
            db.replace_album_songs(conn, album_url, album_songs)
    else:
        for album in albums:
            db.upsert_album(conn, album)
        if songs:
            db.upsert_songs(conn, songs)

    for url in failed:
        db.mark_album_failed(conn, url)

def main():
    parser = argparse.ArgumentParser(description="isaibox standalone scraper")
    parser.add_argument("--mode", choices=["latest", "alphabet", "year", "all"], default="latest", 
                        help="Discovery mode: latest updates, alphabet index, yearly index, or everything.")
    parser.add_argument("--letter", help="Specific letter for alphabet mode (e.g., A, 0-9)")
    parser.add_argument("--year", type=int, help="Specific year for year mode (e.g., 2024)")
    parser.add_argument("--full", action="store_true", help="Scrape all discovered items (ignore batch limits)")
    parser.add_argument("--delay", type=float, default=1.3, help="Delay between page fetches")
    parser.add_argument("--refresh-existing-limit", type=int, default=240,
                        help="Revisit up to this many known albums each run to catch late-added songs.")
    parser.add_argument("--refresh-min-age-hours", type=float, default=24.0,
                        help="Minimum age before a known album is eligible for revisit.")
    args = parser.parse_args()

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info(f"  isaibox standalone scraper — MODE: {args.mode.upper()}")
    if args.letter: logger.info(f"  Target Letter: {args.letter}")
    if args.year:   logger.info(f"  Target Year  : {args.year}")
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    conn = None
    try:
        # 1. Setup DB / Get Known URLs
        logger.info("[1/4] Connecting to DuckDB...")
        conn = db.get_conn()
        known = db.get_known_album_urls(conn)
        refresh_urls = [] if args.full else db.get_album_urls_for_refresh(
            conn,
            limit=args.refresh_existing_limit,
            min_age_hours=args.refresh_min_age_hours,
        )
        conn.close() 

        # 2. Discover URLs based on mode
        logger.info(f"[2/4] Discovering albums using '{args.mode}' mode...")
        discovery_targets = []

        if args.mode == "latest":
            discovery_targets.append("/tamil-songs?page={page}")
        
        if args.mode in ["alphabet", "all"]:
            letters = [args.letter] if args.letter else ["0-9"] + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
            for lit in letters:
                discovery_targets.append(f"/tag/{lit}?page={{page}}")
        
        if args.mode in ["year", "all"]:
            years = [args.year] if args.year else range(2026, 1951, -1)
            for y in years:
                discovery_targets.append(f"/browse-by-year/{y}?page={{page}}")

        new_urls = []
        for pattern in discovery_targets:
            urls, _ = scraper_core.discover_urls_from_path(
                path_pattern=pattern,
                known_urls=known,
                full_scan=args.full,
                delay=args.delay
            )
            for u in urls:
                if u not in new_urls and u not in known:
                    new_urls.append(u)

        refresh_urls = [url for url in refresh_urls if url not in new_urls]

        if not new_urls and not refresh_urls:
            logger.info("✅  No new albums discovered. Database is up to date.")
            return

        # 3. Scrape batches
        work_items: list[tuple[str, list[str]]] = []
        if args.full:
            logger.info(f"[3/4] Scraping ALL {len(new_urls)} discovered albums...")
            if new_urls:
                work_items.append(("new", new_urls))
        else:
            batch_size = 100
            new_batch = new_urls[:batch_size]
            logger.info(f"[3/4] Scraping {len(new_batch)} new album(s) and {len(refresh_urls)} refresh album(s)...")
            if new_batch:
                work_items.append(("new", new_batch))
            if refresh_urls:
                work_items.append(("refresh", refresh_urls))
        
        # Scrape in chunks to save progressively
        chunk_size = 20
        for kind, urls in work_items:
            for i in range(0, len(urls), chunk_size):
                chunk = urls[i:i + chunk_size]
                logger.info(f"   Batch {i//chunk_size + 1} ({kind}): Processing {len(chunk)} albums...")

                albums, songs, failed = scraper_core.scrape_albums(chunk, delay=args.delay)

                # 4. Save results
                batch_conn = db.get_conn()
                try:
                    write_scrape_results(batch_conn, kind=kind, albums=albums, songs=songs, failed=failed)
                finally:
                    batch_conn.close()

                if i + chunk_size < len(urls):
                    import time
                    time.sleep(1.5)

        logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        logger.info("  ✅  Scrape Complete!")
        # Re-open for final stats
        final_conn = db.get_conn(read_only=True)
        db.print_stats(final_conn)
        final_conn.close()
        logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
    except Exception as e:
        logger.error(f"❌  Standalone scraper failed: {e}")
    finally:
        if conn:
            try: conn.close()
            except: pass

if __name__ == "__main__":
    main()
