"""Layered page reader — maximise coverage by trying several free crawlers and taking the
first that yields real content, instead of relying on any single one.

Order is deliberate:
  1. Jina Reader (r.jina.ai) — FREE, no key, renders JS, returns clean markdown; can also
     append a full link summary (footers/socials) that a raw fetch misses.
  2. Firecrawl — JS-capable but credit-limited, so it's the *second* choice (saves credits).
  3. Raw httpx — last resort for static pages.

This means JS-heavy sites (Stripe, Vercel, Sarvam) get read deeply even with no Firecrawl
credits, and Firecrawl usage drops."""
import asyncio
import logging
from urllib.parse import urlparse

from app.sources import firecrawl
from app.sources.http import fetcher

log = logging.getLogger(__name__)

WEEK = 7 * 24 * 3600
JINA = "https://r.jina.ai/"

# common paths that carry a company's substance, tried when discovering subpages
_SUBPATHS = ("/about", "/about-us", "/company", "/team", "/leadership", "/people",
             "/careers", "/product", "/products", "/services", "/solutions", "/pricing")


async def read_markdown(url: str, links: bool = False) -> str | None:
    """Best-effort clean markdown for a URL via the crawler ladder. `links=True` asks Jina to
    append every link on the page (used to harvest footer socials)."""
    headers = {"X-With-Links-Summary": "true"} if links else None
    # params only exist to keep the links / no-links variants in separate cache entries
    md = await fetcher.get_text(
        "jina", f"{JINA}{url}", params={"ls": 1} if links else None, headers=headers, ttl=WEEK
    )
    if md and len(md) > 300:
        return md

    if firecrawl.available():
        fc = await firecrawl.scrape(url)
        if fc:
            return fc

    return await fetcher.get_text("generic", url, ttl=24 * 3600)


async def deep_read(url: str, max_pages: int = 5) -> str | None:
    """Firecrawl-free deep read: the homepage plus a few substantive subpaths, via Jina. Used as
    a fallback when Firecrawl is unavailable or returned only a thin, single-page crawl.

    Subpaths are fetched concurrently (bounded by the shared fetch semaphore + Jina rate limiter)
    so discovery isn't gated on a serial page-by-page crawl. The candidate window is capped just
    above `max_pages` so a Firecrawl key isn't drained probing paths we'd never keep."""
    home = await read_markdown(url, links=True)
    parts: list[str] = []
    if home:
        parts.append(f"# PAGE: {url}\n\n{home}")

    root = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    candidates = _SUBPATHS[: max_pages + 2]  # front-loaded most-substantive paths; over-fetch ≤ 2
    fetched = await asyncio.gather(*(read_markdown(root + path) for path in candidates))
    accepted = 0
    for path, md in zip(candidates, fetched):
        if accepted >= max_pages - 1:
            break
        if md and len(md) > 400 and md not in (home or ""):
            parts.append(f"# PAGE: {root + path}\n\n{md}")
            accepted += 1

    if not parts:
        return None
    return "\n\n---\n\n".join(parts)[:24000]
