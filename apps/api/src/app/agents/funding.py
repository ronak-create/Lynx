"""Funding agent: reconstruct funding history from public coverage. There is no free
structured funding API (Crunchbase is paid), so we search the web (Firecrawl), then let the
LLM assemble rounds/investors/valuation and wire investors into the graph as RAISED_FROM edges."""
from pydantic import BaseModel, Field

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_edge, get_or_create_entity, make_provenance
from app.sources import websearch

category = "funding"


class Round(BaseModel):
    stage: str = Field(default="", description="e.g. Seed, Series A, Series B, IPO, Grant")
    amount: str = Field(default="", description="e.g. $10M, undisclosed")
    date: str = ""
    lead_investors: list[str] = Field(default_factory=list)


class FundingResult(BaseModel):
    is_funded: bool = Field(default=False, description="true if any external funding is evidenced")
    total_raised: str = ""
    valuation: str = ""
    rounds: list[Round] = Field(default_factory=list)
    investors: list[str] = Field(default_factory=list, description="all named investors")


async def run(ctx: AgentContext) -> dict:
    name = ctx.root["name"]
    if not (ctx.llm and ctx.llm.available):
        return {"available": False, "message": "Funding analysis needs an LLM provider (none configured)."}

    ctx.progress(category, "Searching funding coverage")
    results = await websearch.search(f"{name} funding round investors valuation raised", limit=8)
    if not results:
        return {"available": True, "is_funded": False, "message": "No funding coverage found."}

    corpus = "\n".join(
        f"- {r.title}: {r.description or ''} ({r.url})" for r in results
    )
    ctx.progress(category, "Reconstructing funding history")
    funding = await ctx.llm.extract(
        f"From the search results below about {name}, reconstruct its funding history. "
        "Only include facts the snippets support; do not invent amounts. If there is no evidence of "
        "external funding, set is_funded false and leave lists empty.",
        corpus,
        FundingResult,
    )
    if funding is None:
        return {"available": True, "is_funded": False, "message": "Could not parse funding coverage."}

    # wire investors into the graph
    if funding.investors:
        with get_session() as session:
            root_entity = session.get(Entity, ctx.root["entity_id"])
            prov = make_provenance(session, "firecrawl", results[0].url, method="llm")
            for investor in funding.investors[:20]:
                node = get_or_create_entity(session, "investor", investor)
                add_edge(session, root_entity, node, "RAISED_FROM", confidence=0.7, provenance=prov)
            session.commit()
        ctx.emit("graph_delta", agent=category, payload={})

    result = funding.model_dump()
    result["available"] = True
    result["sources"] = [{"title": r.title, "url": r.url} for r in results[:5]]
    return result
