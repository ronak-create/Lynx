"""News agent: Google News RSS (recency) + HN Algolia (tech-community angle).
Optionally LLM-classifies tone per headline and extracts graph relationships from headlines."""
import asyncio

from pydantic import BaseModel

from app.agents.base import AgentContext
from app.agents.relevance import distinctive_tokens, filter_items
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.extraction import extract_graph, persist_extraction
from app.sources import google_news, hn

category = "news"


class ToneResult(BaseModel):
    tones: list[str] = []  # positive|negative|neutral, aligned with input order


async def run(ctx: AgentContext) -> dict:
    name = ctx.root["name"]
    ctx.progress(category, "Searching Google News and Hacker News")
    gn, hn_hits = await asyncio.gather(google_news.search(f'"{name}"'), hn.search(name))

    # free news search matches loosely (a common name pulls in unrelated headlines);
    # keep only stories that actually name the entity.
    tokens = distinctive_tokens(name)
    articles = filter_items([a.model_dump(mode="json") for a in gn], tokens, fields=("title", "publisher"))
    hn_stories = filter_items([a.model_dump(mode="json") for a in hn_hits], tokens, fields=("title",))
    ctx.progress(category, f"{len(articles)} relevant articles, {len(hn_stories)} HN stories")

    # LLM tone classification (best-effort; neutral when unavailable)
    tones: list[str] = []
    if ctx.llm and ctx.llm.available and articles:
        headlines = "\n".join(f"{i + 1}. {a['title']}" for i, a in enumerate(articles[:20]))
        result = await ctx.llm.extract(
            "Classify the tone of each headline about the company as positive, negative, or neutral. "
            "Return {\"tones\": [...]} aligned with input order.",
            headlines,
            ToneResult,
        )
        if result:
            tones = result.tones
    for i, article in enumerate(articles):
        article["tone"] = tones[i] if i < len(tones) else "neutral"

    # graph extraction from recent headlines (acquisitions, partnerships, launches)
    if ctx.llm and ctx.llm.available and articles:
        text = "\n".join(a["title"] for a in articles[:25])
        extraction = await extract_graph(ctx.llm, name, text)
        if extraction and (extraction.relationships or extraction.entities):
            with get_session() as session:
                root_entity = session.get(Entity, ctx.root["entity_id"])
                n = persist_extraction(session, root_entity, extraction, "google_news")
                session.commit()
            ctx.progress(category, f"Extracted {n} relationships from headlines")
            ctx.emit("graph_delta", agent=category, payload={})

    positive = sum(1 for a in articles if a.get("tone") == "positive")
    negative = sum(1 for a in articles if a.get("tone") == "negative")
    return {
        "articles": articles,
        "hn_stories": hn_stories,
        "tone_summary": {"positive": positive, "negative": negative,
                         "neutral": len(articles) - positive - negative},
    }
