from collections import deque

from fastapi import APIRouter, HTTPException
from sqlalchemy import or_, select

from app.db.engine import get_session
from app.db.models import Claim, Edge, Entity, Job, Provenance
from app.llm.client import llm

router = APIRouter()

MAX_NODES = 300


@router.get("/graph/{job_id}")
async def get_graph(job_id: str, depth: int = 2, min_confidence: float = 0.0) -> dict:
    """Subgraph around the job's root entity via BFS over edges."""
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None or job.entity_id is None:
            raise HTTPException(404, "job or root entity not found")
        root_id = job.entity_id

        visited: set[str] = {root_id}
        frontier = deque([(root_id, 0)])
        edges_out: list[Edge] = []
        while frontier:
            node_id, d = frontier.popleft()
            if d >= depth or len(visited) >= MAX_NODES:
                continue
            edges = session.scalars(
                select(Edge).where(
                    or_(Edge.src_id == node_id, Edge.dst_id == node_id),
                    Edge.confidence >= min_confidence,
                )
            ).all()
            for edge in edges:
                other = edge.dst_id if edge.src_id == node_id else edge.src_id
                edges_out.append(edge)
                if other not in visited and len(visited) < MAX_NODES:
                    visited.add(other)
                    frontier.append((other, d + 1))

        entities = session.scalars(select(Entity).where(Entity.id.in_(visited))).all()
        seen_edges: set[str] = set()
        links = []
        for edge in edges_out:
            if edge.id in seen_edges or edge.src_id not in visited or edge.dst_id not in visited:
                continue
            seen_edges.add(edge.id)
            links.append(
                {
                    "id": edge.id,
                    "source": edge.src_id,
                    "target": edge.dst_id,
                    "type": edge.type,
                    "confidence": edge.confidence,
                    "attrs": edge.attrs,
                }
            )
        return {
            "root_id": root_id,
            "nodes": [
                {"id": e.id, "name": e.name, "type": e.type, "is_root": e.id == root_id}
                for e in entities
            ],
            "links": links,
        }


@router.get("/entities/{entity_id}")
async def get_entity(entity_id: str) -> dict:
    with get_session() as session:
        entity = session.get(Entity, entity_id)
        if entity is None:
            raise HTTPException(404, "entity not found")
        claims = session.scalars(select(Claim).where(Claim.entity_id == entity_id)).all()
        edges = session.scalars(
            select(Edge).where(or_(Edge.src_id == entity_id, Edge.dst_id == entity_id))
        ).all()
        claim_dicts = []
        for claim in claims:
            prov = session.get(Provenance, claim.provenance_id) if claim.provenance_id else None
            claim_dicts.append(
                {
                    "predicate": claim.predicate,
                    "value": claim.value,
                    "confidence": claim.confidence,
                    "source": {"id": prov.source_id, "url": prov.url} if prov else None,
                }
            )
        edge_dicts = []
        for edge in edges:
            other_id = edge.dst_id if edge.src_id == entity_id else edge.src_id
            other = session.get(Entity, other_id)
            edge_dicts.append(
                {
                    "type": edge.type,
                    "direction": "out" if edge.src_id == entity_id else "in",
                    "other": {"id": other.id, "name": other.name, "type": other.type} if other else None,
                    "confidence": edge.confidence,
                    "attrs": edge.attrs,
                }
            )
        return {
            "id": entity.id,
            "name": entity.name,
            "type": entity.type,
            "summary": entity.summary,
            "attrs": entity.attrs,
            "analysis": (entity.attrs or {}).get("analysis"),
            "claims": claim_dicts,
            "edges": edge_dicts,
        }


@router.post("/entities/{entity_id}/analysis")
async def analyze_entity(entity_id: str) -> dict:
    """On-demand LLM analysis of a node, cached in entity.attrs."""
    with get_session() as session:
        entity = session.get(Entity, entity_id)
        if entity is None:
            raise HTTPException(404, "entity not found")
        cached = (entity.attrs or {}).get("analysis")
        if cached:
            return {"analysis": cached, "cached": True}
        name, type_, summary = entity.name, entity.type, entity.summary
        claims = session.scalars(select(Claim).where(Claim.entity_id == entity_id)).all()
        edges = session.scalars(
            select(Edge).where(or_(Edge.src_id == entity_id, Edge.dst_id == entity_id))
        ).all()
        edge_lines = []
        for edge in edges[:25]:
            other_id = edge.dst_id if edge.src_id == entity_id else edge.src_id
            other = session.get(Entity, other_id)
            if other:
                edge_lines.append(f"- {edge.type}: {other.name} ({other.type})")

    if not llm.available:
        raise HTTPException(503, "no LLM provider configured — analysis unavailable in degraded mode")

    claim_lines = [f"- {c.predicate}: {(c.value or {}).get('text')}" for c in claims[:25]]
    analysis = await llm.generate(
        "You analyze one node of a business knowledge graph. Write 2 short markdown paragraphs: "
        "what this entity is and why it matters in this graph's context, then notable connections. "
        "Factual, neutral, no preamble.",
        f"Entity: {name} (type: {type_})\nSummary: {summary or 'n/a'}\n"
        f"Known facts:\n{chr(10).join(claim_lines) or 'none'}\n"
        f"Connections:\n{chr(10).join(edge_lines) or 'none'}",
        max_tokens=500,
    )
    if analysis is None:
        raise HTTPException(502, "LLM providers unavailable, try again later")

    with get_session() as session:
        entity = session.get(Entity, entity_id)
        entity.attrs = {**(entity.attrs or {}), "analysis": analysis}
        session.commit()
    return {"analysis": analysis, "cached": False}
