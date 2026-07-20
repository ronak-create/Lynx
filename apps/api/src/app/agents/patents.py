"""Patents agent: patent output as an R&D / innovation signal (PatentsView, best-effort)."""
from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_claim, make_provenance
from app.sources import patents

category = "patents"


async def run(ctx: AgentContext) -> dict:
    name = ctx.root["name"]
    ctx.progress(category, "Searching patent filings")
    records = await patents.by_assignee(name)
    if not records:
        return {"count": 0, "patents": [], "message": "No patents found under this name."}

    with get_session() as session:
        entity = session.get(Entity, ctx.root["entity_id"])
        prov = make_provenance(session, "patentsview", None)
        add_claim(session, entity, "patents_filed", {"text": str(len(records))}, provenance=prov)
        session.commit()

    ctx.progress(category, f"Found {len(records)} patents")
    return {
        "count": len(records),
        "patents": [p.model_dump(mode="json") for p in records],
    }
