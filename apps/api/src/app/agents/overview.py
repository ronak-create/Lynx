"""Overview agent: Wikipedia summary + Wikidata structured facts -> claims + graph nodes."""
from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_claim, add_edge, get_or_create_entity, make_provenance

category = "overview"


async def run(ctx: AgentContext) -> dict:
    root = ctx.root
    profile = ctx.profile
    facts = profile.get("facts", [])
    related = profile.get("related", {})
    ctx.progress(category, f"Collected {len(facts)} structured facts")

    with get_session() as session:
        entity = session.get(Entity, root["entity_id"])
        prov_wd = make_provenance(session, "wikidata", f"https://www.wikidata.org/wiki/{root['wikidata_id']}") if root.get("wikidata_id") else None
        fact_dicts = []
        for fact in facts:
            add_claim(session, entity, fact.predicate, {"text": fact.text, "raw": fact.raw}, provenance=prov_wd)
            fact_dicts.append({"predicate": fact.predicate, "text": fact.text, "source_url": fact.source_url})

        prov = prov_wd or make_provenance(session, "wikipedia", root.get("url"))
        for sub_name in related.get("subsidiaries", []):
            sub = get_or_create_entity(session, "company", sub_name)
            add_edge(session, sub, entity, "SUBSIDIARY_OF", provenance=prov)
        for parent_name in related.get("parent", []):
            parent = get_or_create_entity(session, "company", parent_name)
            add_edge(session, entity, parent, "SUBSIDIARY_OF", provenance=prov)
        session.commit()

    return {
        "name": root["name"],
        "description": root.get("description"),
        "summary": _summary_text(root),
        "wikipedia_url": root.get("url"),
        "facts": fact_dicts,
        "subsidiaries": related.get("subsidiaries", []),
        "parent": related.get("parent", []),
    }


def _summary_text(root: dict) -> str | None:
    from app.db.engine import get_session
    from app.db.models import Entity

    with get_session() as session:
        entity = session.get(Entity, root["entity_id"])
        return entity.summary if entity else None
