from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.agents.orchestrator import run_job
from app.db.engine import get_session
from app.db.models import CategoryResult, Document, Entity, Job, JobEvent
from app.jobs.manager import manager

router = APIRouter()


class ResearchOptions(BaseModel):
    llm_provider: str | None = None  # None/"auto" | "none" | provider id
    categories: list[str] | None = None  # subset of categories to run; None = all


class ResearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=512)
    options: ResearchOptions = Field(default_factory=ResearchOptions)


@router.post("/research")
async def start_research(req: ResearchRequest) -> dict:
    with get_session() as session:
        job = Job(query=req.query.strip())
        session.add(job)
        session.commit()
        job_id = job.id
    manager.start(
        job_id,
        run_job(
            job_id,
            req.query.strip(),
            llm_provider=req.options.llm_provider,
            categories=req.options.categories,
        ),
    )
    return {"job_id": job_id}


@router.get("/runs")
async def list_runs(limit: int = 20) -> list[dict]:
    with get_session() as session:
        jobs = session.scalars(select(Job).order_by(Job.created_at.desc()).limit(limit)).all()
        out = []
        for job in jobs:
            entity = session.get(Entity, job.entity_id) if job.entity_id else None
            out.append(
                {
                    "job_id": job.id,
                    "query": job.query,
                    "status": job.status,
                    "entity_name": entity.name if entity else None,
                    "created_at": job.created_at.isoformat(),
                }
            )
        return out


@router.delete("/runs/{job_id}")
async def delete_run(job_id: str) -> dict:
    """Remove a run and its data (events, category results, document) from the DB. The entity is
    left intact since other runs may reference it."""
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Run not found")
        session.execute(delete(JobEvent).where(JobEvent.job_id == job_id))
        session.execute(delete(CategoryResult).where(CategoryResult.job_id == job_id))
        session.execute(delete(Document).where(Document.job_id == job_id))
        session.delete(job)
        session.commit()
    return {"deleted": job_id}
