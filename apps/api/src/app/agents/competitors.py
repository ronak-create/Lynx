"""Competitors agent — a tracked source ladder for the corpus, then LLM analysis over it.

Rivals are only as good as the material we reason over, so we gather that from the best
available source, in order (see [[layers]]):
  1. Wikipedia article — richest when the company has one.
  2. The company's own site + a targeted web search — the fallback for small businesses.
The competitors the LLM identifies are attributed to whichever layer supplied the corpus, and
each rung's outcome is reported to the dashboard. Also densifies the graph from the material."""
from pydantic import BaseModel, Field

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.extraction import extract_graph, persist_extraction
from app.graph.resolution import add_edge, get_or_create_entity, make_provenance
from app.sources import websearch, wikipedia
from app.sources.layers import LayerTracker

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
    tracker = LayerTracker(ctx, category, [
        ("Wikipedia", "wikipedia"),
        ("Site + web search", "web"),
    ])
    corpus = ""
    source_id = "wikipedia"
    source_url = ctx.root.get("url")
    corpus_layer: str | None = None  # which rung supplied the material we reason over

    # ---- Layer 1: Wikipedia article ----
    title = ctx.root.get("wikipedia_title")
    if not title:
        tracker.skip("Wikipedia", "no Wikipedia article")
    else:
        tracker.start("Wikipedia", "Reading Wikipedia article")
        corpus = await wikipedia.full_text(title) or ""
        if len(corpus) >= 400:
            corpus_layer = "Wikipedia"
        else:
            tracker.empty("Wikipedia", "no usable article")

    # ---- Layer 2: the company's own site + a web search (fallback for small businesses) ----
    if corpus_layer:
        tracker.skip("Site + web search", "Wikipedia already supplied the material")
    else:
        tracker.start("Site + web search", "Researching competitors from the site and the web")
        pieces = []
        if ctx.shared.get("site_content"):
            pieces.append(ctx.shared["site_content"][:6000])
        results = await websearch.search(f"{name} competitors alternatives vs", limit=8)
        if results:
            pieces.append("\n".join(f"- {r.title}: {r.description or ''}" for r in results))
            source_id = results[0].source_id
            source_url = results[0].url
        corpus = "\n\n".join(p for p in pieces if p)
        if len(corpus) >= 120:
            corpus_layer = "Site + web search"

    if len(corpus) < 120:
        if corpus_layer:
            tracker.empty(corpus_layer, "not enough public information")
        return {"competitors": [], "message": "Not enough public information to identify competitors",
                "layers": tracker.summary()}

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
        if corpus_layer:
            tracker.empty(corpus_layer, "no competitors identified")
        return {"competitors": [], "message": "Could not identify competitors from available sources",
                "layers": tracker.summary()}

    if corpus_layer:
        tracker.hit(corpus_layer, len(result.competitors))

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
    return {"competitors": [c.model_dump() for c in result.competitors], "layers": tracker.summary()}
