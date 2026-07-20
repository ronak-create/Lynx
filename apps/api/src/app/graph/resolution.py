"""Entity get-or-create with dedup: canonical_key exact match → normalized name+type match → new node."""
import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Claim, Edge, Entity, Provenance, utcnow


def _norm(name: str) -> str:
    name = re.sub(r"[^\w\s]", "", name.lower())
    name = re.sub(r"\b(inc|corp|corporation|company|co|ltd|llc|plc|sa|ag|holdings)\b", "", name)
    return re.sub(r"\s+", " ", name).strip()


def get_or_create_entity(
    session: Session,
    type_: str,
    name: str,
    canonical_key: str | None = None,
    attrs: dict | None = None,
    summary: str | None = None,
) -> Entity:
    entity = None
    if canonical_key:
        entity = session.scalar(select(Entity).where(Entity.canonical_key == canonical_key))
    if entity is None:
        candidates = session.scalars(
            select(Entity).where(Entity.type == type_, func.lower(Entity.name) == name.lower())
        ).all()
        entity = candidates[0] if candidates else None
    if entity is None:
        normed = _norm(name)
        if normed:
            for cand in session.scalars(select(Entity).where(Entity.type == type_)).all():
                if _norm(cand.name) == normed:
                    entity = cand
                    break
    if entity is None:
        entity = Entity(type=type_, name=name, canonical_key=canonical_key, attrs=attrs or {}, summary=summary)
        session.add(entity)
        session.flush()
        return entity
    # enrich existing node without clobbering
    if canonical_key and not entity.canonical_key:
        entity.canonical_key = canonical_key
    if attrs:
        entity.attrs = {**(entity.attrs or {}), **attrs}
    if summary and not entity.summary:
        entity.summary = summary
    entity.updated_at = utcnow()
    session.flush()
    return entity


def add_edge(
    session: Session,
    src: Entity,
    dst: Entity,
    type_: str,
    confidence: float = 1.0,
    attrs: dict | None = None,
    provenance: Provenance | None = None,
) -> Edge | None:
    if src.id == dst.id:
        return None
    existing = session.scalar(
        select(Edge).where(Edge.src_id == src.id, Edge.dst_id == dst.id, Edge.type == type_)
    )
    if existing is not None:
        if confidence > existing.confidence:
            existing.confidence = confidence
        return existing
    edge = Edge(
        src_id=src.id,
        dst_id=dst.id,
        type=type_,
        confidence=confidence,
        attrs=attrs or {},
        provenance_id=provenance.id if provenance else None,
    )
    session.add(edge)
    session.flush()
    return edge


def add_claim(
    session: Session,
    entity: Entity,
    predicate: str,
    value: dict,
    confidence: float = 1.0,
    provenance: Provenance | None = None,
) -> Claim:
    claim = Claim(
        entity_id=entity.id,
        predicate=predicate,
        value=value,
        confidence=confidence,
        provenance_id=provenance.id if provenance else None,
    )
    session.add(claim)
    session.flush()
    return claim


def make_provenance(session: Session, source_id: str, url: str | None, method: str = "deterministic") -> Provenance:
    prov = Provenance(source_id=source_id, url=url, extraction_method=method)
    session.add(prov)
    session.flush()
    return prov
