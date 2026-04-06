import os
import sys
import logging

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

def main():
    parser = argparse.ArgumentParser(description="isaibox standalone scraper")
    parser.add_argument("--full", action="store_true", help="Scrape entire site (all pages)")
    args = parser.parse_args()

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info(f"  isaibox standalone scraper — {'FULL SCAN' if args.full else 'INCREMENTAL'}")
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    conn = None
    try:
        # 1. Setup DB
        logger.info("[1/4] Connecting to DuckDB...")
        conn = db.get_conn()

        # 2. Discover urls
        logger.info("[2/4] Discovering latest albums...")
        known = db.get_known_album_urls(conn)
        conn.close() # Release lock BEFORE starting long discovery walk
        
        new_urls, total_pages = scraper_core.discover_new_album_urls(
            start_page=1, 
            known_urls=known,
            full_scan=args.full
        )
        
        if not new_urls:
            logger.info("✅  No new albums to scrape. Database is up to date.")
            return

        # 3. Scrape batch
        if args.full:
            to_scrape = new_urls
            logger.info(f"[3/4] Scraping ALL {len(to_scrape)} discovered albums...")
        else:
            batch_size = 50
            to_scrape = new_urls[:batch_size]
            logger.info(f"[3/4] Scraping first {len(to_scrape)} albums...")
        
        # Scrape in chunks to save progressively and release locks
        chunk_size = 20
        for i in range(0, len(to_scrape), chunk_size):
            chunk = to_scrape[i:i + chunk_size]
            logger.info(f"   Batch {i//chunk_size + 1}: Processing {len(chunk)} albums...")
            
            albums, songs, failed = scraper_core.scrape_albums(chunk)

            # 4. Save results (Connect just for this write)
            batch_conn = db.get_conn()
            try:
                for a in albums:
                    db.upsert_album(batch_conn, a)
                
                if songs:
                    db.upsert_songs(batch_conn, songs)
                
                for url in failed:
                    db.mark_album_failed(batch_conn, url)
            finally:
                batch_conn.close()
            
            # Small delay between album batches to be respectful
            if i + chunk_size < len(to_scrape):
                import time
                time.sleep(1.5)

        logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        logger.info("  ✅  Scrape Complete!")
        db.print_stats(conn)
        logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
    except Exception as e:
        logger.error(f"❌  Standalone scraper failed: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    main()
