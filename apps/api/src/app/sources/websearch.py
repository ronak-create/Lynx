"""Layered web search — the search-side twin of `reader.py`.

Every agent that needs to *find* pages (competitors, funding, people, products, social,
official-site discovery) used to call `firecrawl.search()` directly, so the moment Firecrawl
ran out of credits (or no key was set) those agents went blind. This module puts a free layer
in front, mirroring the crawler ladder:

  1. DuckDuckGo HTML endpoint   — FREE, no key, JS-free result page we regex-parse
  2. DuckDuckGo Lite endpoint   — FREE, simpler markup, a second free attempt
  3. Firecrawl search           — credit-limited, so it's the *last* resort (saves credits)

The first layer that yields results wins; we only descend when a layer comes up empty. Results
are the same `SearchResultRecord` the callers already consume, so no agent code changes shape.

Dependency-free by design (regex, not a DOM parser) to match the rest of the source layer."""
import html as _html
import logging
import re
from urllib.parse import parse_qs, unquote, urlparse

from app.sources import firecrawl
from app.sources.base import SearchResultRecord
from app.sources.http import fetcher

log = logging.getLogger(__name__)

DAY = 24 * 3600
_DDG_HTML = "https://html.duckduckgo.com/html/"
_DDG_LITE = "https://lite.duckduckgo.com/lite/"

# result title/link anchors on the two DDG surfaces (single- or double-quoted class attrs)
_HTML_LINK = re.compile(
    r"""<a[^>]+class=["']result__a["'][^>]*href=["'](?P<href>[^"']+)["'][^>]*>(?P<title>.*?)</a>""",
    re.DOTALL | re.IGNORECASE,
)
_HTML_SNIPPET = re.compile(
    r"""class=["']result__snippet["'][^>]*>(?P<snip>.*?)</a>""", re.DOTALL | re.IGNORECASE
)
_LITE_LINK = re.compile(
    r"""<a[^>]+class=["']result-link["'][^>]*href=["'](?P<href>[^"']+)["'][^>]*>(?P<title>.*?)</a>""",
    re.DOTALL | re.IGNORECASE,
)
_LITE_SNIPPET = re.compile(
    r"""class=["']result-snippet["'][^>]*>(?P<snip>.*?)</td>""", re.DOTALL | re.IGNORECASE
)
_TAG = re.compile(r"<[^>]+>")


def _clean(fragment: str | None) -> str | None:
    """Strip HTML tags + unescape entities from a captured fragment."""
    if not fragment:
        return None
    text = _html.unescape(_TAG.sub("", fragment)).strip()
    return text or None


def _real_url(href: str) -> str | None:
    """DDG wraps external links through `/l/?uddg=<encoded>`; unwrap to the true destination."""
    if href.startswith("//"):
        href = "https:" + href
    parsed = urlparse(href)
    if parsed.path.endswith("/l/") or "uddg=" in (parsed.query or ""):
        target = parse_qs(parsed.query).get("uddg", [None])[0]
        if target:
            return unquote(target)
    if parsed.scheme in ("http", "https"):
        return href
    return None


def _parse_ddg(body: str, link_re: re.Pattern, snip_re: re.Pattern, limit: int) -> list[SearchResultRecord]:
    snippets = [_clean(m.group("snip")) for m in snip_re.finditer(body)]
    out: list[SearchResultRecord] = []
    seen: set[str] = set()
    for i, m in enumerate(link_re.finditer(body)):
        url = _real_url(m.group("href"))
        title = _clean(m.group("title"))
        if not url or not title:
            continue
        key = url.rstrip("/")
        if key in seen or "duckduckgo.com" in urlparse(url).netloc:
            continue
        seen.add(key)
        out.append(
            SearchResultRecord(
                source_id="duckduckgo",
                source_url=url,
                title=title,
                url=url,
                description=snippets[i] if i < len(snippets) else None,
            )
        )
        if len(out) >= limit:
            break
    return out


async def _ddg(url: str, link_re: re.Pattern, snip_re: re.Pattern, query: str, limit: int) -> list[SearchResultRecord]:
    body = await fetcher.get_text("duckduckgo", url, params={"q": query, "kl": "us-en"}, ttl=DAY)
    if not body:
        return []
    try:
        return _parse_ddg(body, link_re, snip_re, limit)
    except Exception as exc:  # markup drift must never kill an agent — just fall through
        log.warning("ddg parse failed q=%r err=%s", query, exc)
        return []


async def search(query: str, limit: int = 6) -> list[SearchResultRecord]:
    """Web search for a query, free engines first, Firecrawl only as a last resort."""
    for url, link_re, snip_re in (
        (_DDG_HTML, _HTML_LINK, _HTML_SNIPPET),
        (_DDG_LITE, _LITE_LINK, _LITE_SNIPPET),
    ):
        results = await _ddg(url, link_re, snip_re, query, limit)
        if results:
            return results

    if firecrawl.available():
        return await firecrawl.search(query, limit=limit)
    return []


async def find_official_site(name: str, domain: str | None) -> str | None:
    """Best-effort homepage URL for a company: known domain first, else a free web search."""
    if domain:
        return f"https://{domain}"
    results = await search(f"{name} official website", limit=5)
    return results[0].url if results else None
