"""Google News RSS search — free, no key, good recency."""
import asyncio

import feedparser

from app.sources.base import ArticleRecord
from app.sources.http import fetcher

HOUR = 3600


async def search(query: str, limit: int = 20) -> list[ArticleRecord]:
    url = "https://news.google.com/rss/search"
    text = await fetcher.get_text(
        "google_news", url, params={"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}, ttl=HOUR
    )
    if text is None:
        return []
    feed = await asyncio.to_thread(feedparser.parse, text)
    out: list[ArticleRecord] = []
    for entry in feed.entries[:limit]:
        published = None
        if getattr(entry, "published_parsed", None):
            p = entry.published_parsed
            published = f"{p.tm_year:04d}-{p.tm_mon:02d}-{p.tm_mday:02d}"
        out.append(
            ArticleRecord(
                source_id="google_news",
                source_url=entry.get("link"),
                title=entry.get("title", "").rsplit(" - ", 1)[0],
                url=entry.get("link", ""),
                published_at=published,
                publisher=(entry.get("source") or {}).get("title") if isinstance(entry.get("source"), dict) else None,
            )
        )
    return out
