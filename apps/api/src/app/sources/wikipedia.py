"""Wikipedia REST + action API: summaries, opensearch autocomplete, full plaintext."""
from app.sources.http import fetcher

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_REST = "https://en.wikipedia.org/api/rest_v1"
WEEK = 7 * 24 * 3600


async def opensearch(query: str, limit: int = 8) -> list[dict]:
    """Returns [{title, description, url}]."""
    data = await fetcher.get_json(
        "wikipedia",
        WIKI_API,
        params={
            "action": "opensearch",
            "search": query,
            "limit": limit,
            "namespace": 0,
            "format": "json",
        },
        ttl=24 * 3600,
    )
    if not isinstance(data, list) or len(data) < 4:
        return []
    titles, urls = data[1], data[3]
    return [{"title": t, "url": u} for t, u in zip(titles, urls)]


async def summary(title: str) -> dict | None:
    """REST summary: extract, description, wikibase_item, thumbnail url, page url."""
    data = await fetcher.get_json(
        "wikipedia", f"{WIKI_REST}/page/summary/{title.replace(' ', '_')}", ttl=WEEK
    )
    if not isinstance(data, dict) or data.get("type") == "https://mediawiki.org/wiki/HyperSwitch/errors/not_found":
        return None
    return {
        "title": data.get("title"),
        "extract": data.get("extract"),
        "description": data.get("description"),
        "wikidata_id": data.get("wikibase_item"),
        "thumbnail_url": (data.get("thumbnail") or {}).get("source"),
        "url": ((data.get("content_urls") or {}).get("desktop") or {}).get("page"),
        # disambiguation pages ("Lilly may refer to:…") are not a real entity — flag them so
        # the resolver can skip them and re-resolve with a more specific name.
        "disambiguation": data.get("type") == "disambiguation",
    }


async def full_text(title: str, max_chars: int = 24000) -> str | None:
    """Full article plaintext (for LLM extraction of competitors/history)."""
    data = await fetcher.get_json(
        "wikipedia",
        WIKI_API,
        params={
            "action": "query",
            "prop": "extracts",
            "explaintext": 1,
            "redirects": 1,
            "titles": title,
            "format": "json",
        },
        ttl=WEEK,
    )
    if not isinstance(data, dict):
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values():
        text = page.get("extract")
        if text:
            return text[:max_chars]
    return None
