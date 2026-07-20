"""Competitors agent. Researches rivals from the best source available:
Wikipedia when the company has an article, otherwise the company's own site content
(from the discovery phase) plus a targeted web search. Also extracts a dense graph of
associations from whatever material it gathered."""
from pydantic import BaseModel, Field

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.extraction import extract_graph, persist_extraction
from app.graph.resolution import add_edge, get_or_create_entity, make_provenance
from app.sources import firecrawl, wikipedia

category = "competitors"


class Competitor(BaseModel):
    name: str
    reason: str = Field(default="", description="one sentence on why they compete")


class CompetitorResult(BaseModel):
    competitors: list[Competitor] = []


async def run(ctx: AgentContext) -> dict:
    if not (ctx.llm and ctx.llm.available):
        return {"competitors": [], "message": "Competitor analysis needs an LLM provider (none configured)"}

    name = ctx.root["name"]
    corpus = ""
    source_id = "wikipedia"
    source_url = ctx.root.get("url")

    title = ctx.root.get("wikipedia_title")
    if title:
        ctx.progress(category, "Reading Wikipedia article")
        corpus = await wikipedia.full_text(title) or ""

    # No Wikipedia (typical for small businesses): research from the site + a web search
    if len(corpus) < 400:
        ctx.progress(category, "Researching competitors from the site and the web")
        pieces = []
        if ctx.shared.get("site_content"):
            pieces.append(ctx.shared["site_content"][:6000])
        if firecrawl.available():
            results = await firecrawl.search(f"{name} competitors alternatives vs", limit=8)
            pieces.append("\n".join(f"- {r.title}: {r.description or ''}" for r in results))
            source_id = "firecrawl"
            source_url = results[0].url if results else source_url
        corpus = "\n\n".join(p for p in pieces if p)

    if len(corpus) < 120:
        return {"competitors": [], "message": "Not enough public information to identify competitors"}

    ctx.progress(category, "Identifying competitors")
    brief = ctx.context_brief()
    result = await ctx.llm.extract(
        f"Identify direct competitors of {name}"
        + (f" (context: {brief[:400]})" if brief else "")
        + ". Use only companies supported by the material below; do not invent. "
        "Max 8. Use canonical company names.",
        corpus[:14000],
        CompetitorResult,
    )
    if result is None:
        return {"competitors": [], "message": "Could not identify competitors from available sources"}

    # densify the graph from the same material
    extraction = await extract_graph(ctx.llm, name, corpus)

    with get_session() as session:
        root_entity = session.get(Entity, ctx.root["entity_id"])
        prov = make_provenance(session, source_id, source_url, method="llm")
        for comp in result.competitors:
            node = get_or_create_entity(session, "company", comp.name)
            add_edge(session, root_entity, node, "COMPETES_WITH", confidence=0.7,
                     attrs={"reason": comp.reason}, provenance=prov)
        if extraction:
            persist_extraction(session, root_entity, extraction, source_id, source_url)
        session.commit()

    if result.competitors or extraction:
        ctx.emit("graph_delta", agent=category, payload={})
    return {"competitors": [c.model_dump() for c in result.competitors]}
