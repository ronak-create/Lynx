import json

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import select

from app.db.engine import get_session
from app.db.models import CategoryResult, Document, Entity, Job
from app.jobs.manager import manager

router = APIRouter()


@router.get("/jobs/{job_id}")
async def get_job(job_id: str) -> dict:
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(404, "job not found")
        entity = session.get(Entity, job.entity_id) if job.entity_id else None
        results = session.scalars(select(CategoryResult).where(CategoryResult.job_id == job_id)).all()
        doc = session.scalar(
            select(Document).where(Document.job_id == job_id).order_by(Document.created_at.desc())
        )
        return {
            "job_id": job.id,
            "query": job.query,
            "status": job.status,
            "error": job.error,
            "entity": {
                "id": entity.id,
                "name": entity.name,
                "description": (entity.attrs or {}).get("description"),
                "ticker": (entity.attrs or {}).get("ticker"),
                "wikipedia_url": (entity.attrs or {}).get("wikipedia_url"),
            }
            if entity
            else None,
            "categories": {r.category: {"status": r.status, "payload": r.payload} for r in results},
            "has_document": doc is not None,
        }


@router.get("/jobs/{job_id}/events")
async def job_events(job_id: str, request: Request) -> EventSourceResponse:
    with get_session() as session:
        if session.get(Job, job_id) is None:
            raise HTTPException(404, "job not found")

    last_id = request.headers.get("last-event-id") or request.query_params.get("after")
    after_seq = int(last_id) if last_id and last_id.isdigit() else 0

    async def stream():
        async for event in manager.subscribe(job_id, after_seq=after_seq):
            yield {
                "id": str(event["seq"]),
                "event": event["type"],
                "data": json.dumps({"agent": event["agent"], **event["payload"]}),
            }

    return EventSourceResponse(stream())


@router.get("/jobs/{job_id}/document")
async def get_document(job_id: str) -> dict:
    with get_session() as session:
        doc = session.scalar(
            select(Document).where(Document.job_id == job_id).order_by(Document.created_at.desc())
        )
        if doc is None:
            raise HTTPException(404, "no document for this job")
        return {"markdown": doc.markdown, "method": doc.method, "entity_id": doc.entity_id}
