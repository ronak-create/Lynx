"""LLM-based entity/relationship extraction over unstructured text (news, scraped sites,
Reddit, funding coverage). The goal is a DENSE graph: capture every association — people,
orgs, products, technologies, investors, locations, industries, and events — not just a
handful. Deterministic sources own confidence 1.0; LLM-derived edges are capped lower."""
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.models import Entity
from app.llm.client import LLMClient

EntityType = Literal[
    "company",
    "person",
    "product",
    "technology",
    "organization",
    "event",
    "location",
    "industry",
    "investor",
]
EdgeType = Literal[
    "FOUNDED_BY",
    "LED_BY",
    "EMPLOYS",
    "MAKES",
    "OFFERS",
    "COMPETES_WITH",
    "ACQUIRED",
    "ACQUIRED_BY",
    "INVESTED_IN",
    "RAISED_FROM",
    "PARTNERED_WITH",
    "INTEGRATES_WITH",
    "CUSTOMER_OF",
    "SUPPLIES",
    "USES_TECH",
    "SUBSIDIARY_OF",
    "PARENT_OF",
    "LAUNCHED",
    "HEADQUARTERED_IN",
    "OPERATES_IN",
    "PARTICIPATED_IN",
    "MENTIONS",
]

# node types the LLM may invent that we colour distinctly in the UI
LLM_ENTITY_TYPES = set(EntityType.__args__)  # type: ignore[attr-defined]


class ExtractedEntity(BaseModel):
    name: str
    type: EntityType


class ExtractedRelationship(BaseModel):
    src: str
    dst: str
    type: EdgeType
    evidence: str = Field(default="", description="short quote supporting this relationship")
    confidence: float = Field(default=0.7, ge=0, le=1)


class ExtractionResult(BaseModel):
    entities: list[ExtractedEntity] = []
    relationships: list[ExtractedRelationship] = []


EXTRACT_SYSTEM = """You extract a knowledge graph from text about a company.
Rules:
- Capture EVERY concrete association: people, companies, products, technologies, investors,
  partners, customers, competitors, parent/subsidiary orgs, locations (HQ, offices, markets),
  industries, and notable events (funding rounds, acquisitions, launches, lawsuits).
- Only include entities/relationships explicitly supported by the text.
- Use the exact company name '{root}' when referring to the researched company.
- Prefer well-known canonical names (e.g. 'Microsoft' not 'the Redmond giant').
- Skip vague generic terms ('AI', 'software', 'the cloud') unless a specific named technology or product.
- Up to 30 entities and 40 relationships. Be thorough — a rich, connected graph is the goal.
"""


async def extract_graph(llm: LLMClient, root_name: str, text: str) -> ExtractionResult | None:
    if not llm.available or not text.strip():
        return None
    result = await llm.extract(
        EXTRACT_SYSTEM.format(root=root_name),
        text[:14000],
        ExtractionResult,
    )
    if result is None:
        return None
    # cap LLM-derived confidence at 0.8; deterministic sources own 1.0
    for rel in result.relationships:
        rel.confidence = min(rel.confidence, 0.8)
    return result


def persist_extraction(
    session: Session,
    root_entity: Entity,
    result: ExtractionResult,
    source_id: str,
    url: str | None = None,
    method: str = "llm",
) -> int:
    """Materialise an ExtractionResult into entities + edges around the root.
    Returns the number of edges written. Reused by every agent that extracts a graph."""
    from app.graph.resolution import add_edge, get_or_create_entity, make_provenance

    if not result.relationships and not result.entities:
        return 0
    prov = make_provenance(session, source_id, url, method=method)
    nodes: dict[str, Entity] = {root_entity.name.lower(): root_entity}
    for ent in result.entities:
        nodes[ent.name.lower()] = get_or_create_entity(session, ent.type, ent.name)
    written = 0
    for rel in result.relationships:
        src = nodes.get(rel.src.lower()) or get_or_create_entity(session, "organization", rel.src)
        dst = nodes.get(rel.dst.lower()) or get_or_create_entity(session, "organization", rel.dst)
        edge = add_edge(
            session,
            src,
            dst,
            rel.type,
            confidence=rel.confidence,
            attrs={"evidence": rel.evidence} if rel.evidence else None,
            provenance=prov,
        )
        if edge is not None:
            written += 1
    return written
