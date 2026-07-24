"""Social agent: Reddit discussion as a community-sentiment signal. Often the richest
(sometimes only) public signal for consumer products and small businesses."""
from collections import Counter

from pydantic import BaseModel

from app.agents.base import AgentContext
from app.agents.relevance import distinctive_tokens, filter_items
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.extraction import extract_graph, persist_extraction
from app.sources import reddit, websearch

category = "social"


class ToneResult(BaseModel):
    tones: list[str] = []  # positive|negative|neutral, aligned with input order


async def run(ctx: AgentContext) -> dict:
    name = ctx.root["name"]
    tokens = distinctive_tokens(name)
    ctx.progress(category, "Searching community discussion")
    posts_records = await reddit.search(name)
    posts = filter_items([p.model_dump(mode="json") for p in posts_records], tokens)
    source = "reddit"

    # Reddit blocks some hosts/IPs; fall back to a free web search over discussion sites.
    if not posts:
        ctx.progress(category, "Reddit unavailable — searching the web for discussion")
        results = await websearch.search(f'"{name}" reddit OR review OR discussion', limit=12)
        web_posts = [
            {
                "title": r.title,
                "url": r.url,
                "publisher": _host(r.url),
                "snippet": r.description,
                "points": None,
                "comments": None,
            }
            for r in results
        ]
        # obscure companies return loosely-matched noise; keep only posts that name them
        posts = filter_items(web_posts, tokens)
        source = "web"

    ctx.progress(category, f"Found {len(posts)} relevant discussions")

    if not posts:
        return {"posts": [], "subreddits": [], "tone_summary": {"positive": 0, "negative": 0, "neutral": 0}}

    # LLM tone (best-effort; neutral when unavailable)
    tones: list[str] = []
    if ctx.llm and ctx.llm.available:
        titles = "\n".join(f"{i + 1}. {p['title']}" for i, p in enumerate(posts[:20]))
        result = await ctx.llm.extract(
            f"Classify each Reddit post title's sentiment toward {name} as positive, negative, or neutral. "
            'Return {"tones": [...]} aligned with input order.',
            titles,
            ToneResult,
        )
        if result:
            tones = result.tones
    for i, post in enumerate(posts):
        post["tone"] = tones[i] if i < len(tones) else "neutral"

    # graph extraction over discussion (products, comparisons, competitors mentioned)
    if ctx.llm and ctx.llm.available:
        text = "\n".join(f"{p['title']} {p.get('snippet') or ''}" for p in posts[:25])
        extraction = await extract_graph(ctx.llm, name, text)
        if extraction and (extraction.relationships or extraction.entities):
            with get_session() as session:
                root_entity = session.get(Entity, ctx.root["entity_id"])
                persist_extraction(session, root_entity, extraction, source)
                session.commit()
            ctx.emit("graph_delta", agent=category, payload={})

    subreddit_counts = Counter(p["publisher"] for p in posts if p.get("publisher"))
    positive = sum(1 for p in posts if p.get("tone") == "positive")
    negative = sum(1 for p in posts if p.get("tone") == "negative")
    return {
        "source": source,
        "posts": posts,
        "subreddits": [{"name": s, "count": c} for s, c in subreddit_counts.most_common(6)],
        "total_engagement": sum((p.get("points") or 0) + (p.get("comments") or 0) for p in posts),
        "tone_summary": {
            "positive": positive,
            "negative": negative,
            "neutral": len(posts) - positive - negative,
        },
    }


def _host(url: str) -> str | None:
    from urllib.parse import urlparse

    try:
        return urlparse(url).netloc.removeprefix("www.") or None
    except ValueError:
        return None
