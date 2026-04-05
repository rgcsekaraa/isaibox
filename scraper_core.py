"""
scraper_core.py — HTTP fetch + HTML parsing (no Airflow dependency)
--------------------------------------------------------------------
Imported by both the Airflow DAG and the standalone CLI.
"""

import re
import time
import logging
from urllib.parse import urljoin

import requests
import cloudscraper
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_exponential, before_sleep_log

log = logging.getLogger(__name__)

BASE_URL   = "https://www.masstamilan.dev"
LIST_URL   = BASE_URL + "/tamil-songs?page={page}"

_SESSION = None

def get_session() -> cloudscraper.CloudScraper:
    global _SESSION
    if _SESSION is None:
        s = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'mobile': False
            }
        )
        s.headers.update({
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": BASE_URL,
        })
        _SESSION = s
    return _SESSION


# ── Fetch with retry ──────────────────────────────────────────────────────────

@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    before_sleep=before_sleep_log(log, logging.WARNING),
    reraise=True,
)
def fetch(url: str) -> BeautifulSoup:
    resp = get_session().get(url, timeout=25)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "lxml")


# ── Listing page ──────────────────────────────────────────────────────────────

def get_total_pages(soup: BeautifulSoup) -> int:
    """Read last page number from pagy pagination nav."""
    nav = soup.select_one("nav.pagy")
    if not nav:
        return 1
    max_page = 1
    for a in nav.select("a[href]"):
        m = re.search(r"page=(\d+)", a.get("href", ""))
        if m:
            max_page = max(max_page, int(m.group(1)))
    return max_page


def parse_listing_page(soup: BeautifulSoup) -> list[str]:
    """Return absolute album URLs from a listing page."""
    urls = []
    for a in soup.select("div.a-i a[href]"):
        href = a["href"].strip()
        if not href.startswith("http"):
            href = BASE_URL + href
        if href not in urls:
            urls.append(href)
    return urls


def discover_new_album_urls(
    start_page: int,
    known_urls: set[str],
    max_pages: int | None = None,
    delay: float = 1.5,
    full_scan: bool = False,
) -> tuple[list[str], int]:
    """
    Walk listing pages starting from start_page.
    Instead of relying on a fixed 'total' count, we crawl until:
      a) We hit an empty page.
      b) We hit a page fully known (incremental mode).
      c) We hit max_pages limit.
    """
    log.info(f"Starting discovery from page {start_page}...")
    new_urls: list[str] = []
    page_num = start_page
    pages_processed = 0

    while True:
        if max_pages and pages_processed >= max_pages:
            log.info(f"Reached max_pages limit ({max_pages}).")
            break

        log.info(f"  Fetching listing page {page_num}...")
        try:
            soup = fetch(LIST_URL.format(page=page_num))
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                log.info(f"  → Page {page_num} returned 404. Reached end of catalog.")
                break
            raise
            
        page_urls = parse_listing_page(soup)

        if not page_urls:
            log.info(f"  → Page {page_num} is empty. Reached end of catalog.")
            break

        page_new = [u for u in page_urls if u not in known_urls]
        new_urls.extend(page_new)

        log.info(f"  Page {page_num}: {len(page_new)} new / {len(page_urls)} total")

        # Incremental logic: stop if we find no new albums on a page,
        # UNLESS we are in full_scan mode.
        if not full_scan and not page_new and known_urls:
            log.info(f"  → All albums on page {page_num} already known. Stopping early.")
            break

        page_num += 1
        pages_processed += 1
        time.sleep(delay)

    log.info(f"Discovery done: {len(new_urls)} total new album(s) discovered.")
    return new_urls, page_num - 1


# ── Album detail page ─────────────────────────────────────────────────────────

def _text_after(label: str, text: str) -> str:
    """Extract value after 'Label:' up to the next label or end."""
    m = re.search(
        rf"{label}:\s*(.+?)(?=\s+(?:Lyricist|Year|Language|Music|Director|Starring)\s*:|$)",
        text, re.DOTALL | re.IGNORECASE
    )
    return m.group(1).strip() if m else ""


def parse_album_page(soup: BeautifulSoup, album_url: str) -> tuple[dict, list[dict]]:
    """
    Returns:
        album  — dict matching albums table columns
        songs  — list of dicts matching songs table columns
    """
    album = {
        "album_url":     album_url,
        "movie_name":    "",
        "starring":      "",
        "music_director": "",
        "director":      "",
        "lyricists":     "",
        "year":          "",
        "language":      "Tamil",
        "track_count":   0,
        "scrape_ok":     True,
    }

    # ── Movie metadata from fieldset ──
    fieldset = soup.select_one("fieldset")
    if fieldset:
        raw_text = fieldset.get_text(" ", strip=True)

        starring_links, music_links, year_links = [], [], []
        for a in fieldset.select("a[rel='category tag']"):
            href = a.get("href", "")
            txt  = a.get_text(strip=True)
            if "/artist/" in href:
                starring_links.append(txt)
            elif "/music/" in href:
                music_links.append(txt)
            elif "/browse-by-year/" in href:
                year_links.append(txt)
            elif "/tamil-songs" in href:
                album["language"] = txt

        album["starring"]       = ", ".join(starring_links)
        album["music_director"] = ", ".join(music_links)
        album["year"]           = year_links[0] if year_links else ""
        album["director"]       = _text_after("Director",  raw_text)
        album["lyricists"]      = _text_after("Lyricist",  raw_text)

    # ── Movie name from h1 ──
    h1 = soup.select_one("h1")
    if h1:
        raw = h1.get_text(strip=True)
        raw = re.sub(
            r"\s+(Tamil|Malayalam|Telugu|Hindi|Kannada)\s+mp3.*$",
            "", raw, flags=re.IGNORECASE
        )
        album["movie_name"] = raw.strip()

    # ── Tracks ──
    songs = []
    table = soup.select_one("table#tl")
    if table:
        for row in table.select("tr[itemprop='itemListElement']"):
            song: dict = {
                "album_url":     album_url,
                "movie_name":    album["movie_name"],
                "music_director": album["music_director"],
                "director":      album["director"],
                "year":          album["year"],
                "track_number":  0,
                "track_name":    "",
                "singers":       "",
                "url_128kbps":   "",
                "url_320kbps":   "",
            }

            pos = row.select_one("span[itemprop='position']")
            if pos:
                try:
                    song["track_number"] = int(pos.get_text(strip=True))
                except ValueError:
                    pass

            name_el = row.select_one("span[itemprop='name']")
            if name_el:
                song["track_name"] = name_el.get_text(strip=True)

            artist_el = row.select_one("span[itemprop='byArtist']")
            if artist_el:
                song["singers"] = artist_el.get_text(strip=True)

            # Download links — match by title attribute (most reliable)
            for dl in row.select("a.dlink[href]"):
                href  = dl["href"]
                if not href.startswith("http"):
                    href = BASE_URL + href
                title = (dl.get("title", "") + " " + dl.get_text()).lower()
                if "128" in title and not song["url_128kbps"]:
                    song["url_128kbps"] = href
                elif "320" in title and not song["url_320kbps"]:
                    song["url_320kbps"] = href

            songs.append(song)

    album["track_count"] = len(songs)
    return album, songs


# ── Batch scrape a list of album URLs ─────────────────────────────────────────

def scrape_albums(
    album_urls: list[str],
    delay: float = 0.9,
) -> tuple[list[dict], list[dict], list[str]]:
    """
    Scrape each album URL.
    Returns (albums, all_songs, failed_urls).
    """
    albums, all_songs, failed = [], [], []

    for idx, url in enumerate(album_urls, 1):
        log.info(f"  [{idx}/{len(album_urls)}] {url}")
        try:
            soup = fetch(url)
            album, songs = parse_album_page(soup, url)
            albums.append(album)
            all_songs.extend(songs)
            log.info(f"    → {album['movie_name']} | {len(songs)} track(s)")
        except Exception as e:
            log.error(f"    FAILED: {e}")
            failed.append(url)

        if idx < len(album_urls):
            time.sleep(delay)

    return albums, all_songs, failed
