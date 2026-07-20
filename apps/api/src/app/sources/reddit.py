"""Reddit search via the public JSON endpoint — free, no key. Community discussion is
often the only real signal for small businesses and consumer products."""
from app.sources.base import ArticleRecord
from app.sources.http import fetcher

HOUR = 3600


async def search(query: str, limit: int = 15) -> list[ArticleRecord]:
    data = await fetcher.get_json(
        "reddit",
        "https://www.reddit.com/search.json",
        params={"q": query, "sort": "relevance", "t": "year", "limit": limit},
        headers={"User-Agent": "web:lynx-business-research:0.1 (research tool)"},
        ttl=HOUR,
    )
    if not isinstance(data, dict):
        return []
    children = ((data.get("data") or {}).get("children")) or []
    out: list[ArticleRecord] = []
    for child in children:
        post = child.get("data") if isinstance(child, dict) else None
        if not isinstance(post, dict):
            continue
        permalink = post.get("permalink")
        url = f"https://www.reddit.com{permalink}" if permalink else post.get("url")
        if not url or not post.get("title"):
            continue
        created = post.get("created_utc")
        published = None
        if isinstance(created, (int, float)):
            from datetime import datetime, timezone

            published = datetime.fromtimestamp(created, tz=timezone.utc).strftime("%Y-%m-%d")
        out.append(
            ArticleRecord(
                source_id="reddit",
                source_url=url,
                title=post.get("title", ""),
                url=url,
                published_at=published,
                publisher=f"r/{post.get('subreddit')}" if post.get("subreddit") else None,
                points=int(post.get("score") or 0),
                comments=int(post.get("num_comments") or 0),
            )
        )
    return out
