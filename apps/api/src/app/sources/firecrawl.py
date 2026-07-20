"""Firecrawl: web search + page scrape. This is what lets Lynx research ANY business,
even one with no Wikipedia/SEC/Wikidata footprint — we find its site and read it.

Free tier is credit-limited, so every call is cached via Fetcher.post_json (7-day TTL);
re-researching the same company reuses results instead of spending credits."""
import logging
from urllib.parse import urlparse

from app.config import settings
from app.sources.base import SearchResultRecord
from app.sources.http import fetcher

log = logging.getLogger(__name__)

API = "https://api.firecrawl.dev/v2"


def available() -> bool:
    return bool(settings.firecrawl_api_key)


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.firecrawl_api_key}",
        "Content-Type": "application/json",
    }


async def scrape(url: str) -> str | None:
    """Return the main content of a page as markdown, or None on failure."""
    if not available():
        return None
    data = await fetcher.post_json(
        "firecrawl",
        f"{API}/scrape",
        {"url": url, "formats": ["markdown"], "onlyMainContent": True},
        headers=_headers(),
    )
    if not isinstance(data, dict):
        return None
    payload = data.get("data") if isinstance(data.get("data"), dict) else data
    md = (payload or {}).get("markdown")
    return md if isinstance(md, str) and md.strip() else None


async def map_site(url: str, limit: int = 40) -> list[str]:
    """List the URLs on a site (fast, one credit) so we can pick the pages worth reading."""
    if not available():
        return []
    data = await fetcher.post_json(
        "firecrawl", f"{API}/map", {"url": url, "limit": limit}, headers=_headers()
    )
    if not isinstance(data, dict):
        return []
    links = data.get("links")
    if links is None and isinstance(data.get("data"), dict):
        links = data["data"].get("links")
    out: list[str] = []
    for item in links or []:
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, dict) and item.get("url"):
            out.append(item["url"])
    return out


# pages that carry the real substance of a small-business site
_DEEP_KEYWORDS = (
    "about", "service", "product", "solution", "team", "people", "leadership",
    "pricing", "plan", "work", "portfolio", "case", "client", "customer",
    "company", "who-we-are", "what-we-do", "expertise", "capabilities",
)


async def deep_scrape(url: str, max_pages: int = 6) -> str | None:
    """Crawl a site in depth: read the homepage plus its most substantive subpages
    (about / services / team / pricing / work), concatenated into one document.
    This is how Lynx gets real, deep information on small businesses."""
    home = await scrape(url)
    parts: list[str] = []
    if home:
        parts.append(f"# PAGE: {url}\n\n{home}")

    links = await map_site(url)
    base = urlparse(url).netloc.removeprefix("www.")
    picked: list[str] = []
    seen = {url.rstrip("/")}
    for link in links:
        if len(picked) >= max_pages - 1:
            break
        if urlparse(link).netloc.removeprefix("www.") != base:
            continue
        norm = link.rstrip("/")
        if norm in seen:
            continue
        if any(k in link.lower() for k in _DEEP_KEYWORDS):
            picked.append(link)
            seen.add(norm)

    for link in picked:
        md = await scrape(link)
        if md:
            parts.append(f"# PAGE: {link}\n\n{md}")

    if not parts:
        return None
    return "\n\n---\n\n".join(parts)[:24000]


async def search(query: str, limit: int = 6) -> list[SearchResultRecord]:
    """Web search for a query; returns titled results with URLs and snippets."""
    if not available():
        return []
    data = await fetcher.post_json(
        "firecrawl",
        f"{API}/search",
        {"query": query, "limit": limit, "sources": ["web"]},
        headers=_headers(),
    )
    if not isinstance(data, dict):
        return []
    raw = data.get("data")
    # v2 groups by source ({"web": [...]}); older shapes return a flat list
    if isinstance(raw, dict):
        items = raw.get("web") or raw.get("results") or []
    elif isinstance(raw, list):
        items = raw
    else:
        items = []
    out: list[SearchResultRecord] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        if not url:
            continue
        out.append(
            SearchResultRecord(
                source_id="firecrawl",
                source_url=url,
                title=item.get("title") or url,
                url=url,
                description=item.get("description") or item.get("snippet"),
            )
        )
    return out


async def find_official_site(name: str, domain: str | None) -> str | None:
    """Best-effort homepage URL for a company: known domain first, else a web search."""
    if domain:
        return f"https://{domain}"
    results = await search(f"{name} official website", limit=5)
    return results[0].url if results else None
