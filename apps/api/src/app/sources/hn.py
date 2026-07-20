"""Hacker News via Algolia — tech-community coverage and sentiment signal (points/comments)."""
from app.sources.base import ArticleRecord
from app.sources.http import fetcher

HOUR = 3600


async def search(query: str, limit: int = 15) -> list[ArticleRecord]:
    data = await fetcher.get_json(
        "hn_algolia",
        "https://hn.algolia.com/api/v1/search",
        params={"query": query, "tags": "story", "hitsPerPage": limit},
        ttl=HOUR,
    )
    if not isinstance(data, dict):
        return []
    out: list[ArticleRecord] = []
    for hit in data.get("hits", []):
        title = hit.get("title")
        if not title:
            continue
        hn_url = f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
        out.append(
            ArticleRecord(
                source_id="hn_algolia",
                source_url=hn_url,
                title=title,
                url=hit.get("url") or hn_url,
                published_at=(hit.get("created_at") or "")[:10] or None,
                publisher="Hacker News",
                points=hit.get("points"),
                comments=hit.get("num_comments"),
            )
        )
    return out
