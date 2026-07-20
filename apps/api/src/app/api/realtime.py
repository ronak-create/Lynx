"""Realtime updation: a live quote endpoint for polling, and a diff of a run against the
previous run of the same entity so the UI can show "what changed since you last looked"."""
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.compare import _METRICS, _extract
from app.db.engine import get_session
from app.db.models import CategoryResult, Job
from app.sources import yfinance_source

router = APIRouter()

_LABELS = {key: label for key, label, _ in _METRICS}


@router.get("/quote/{ticker}")
async def live_quote(ticker: str) -> dict:
    q = await yfinance_source.quote(ticker.upper())
    if q is None:
        raise HTTPException(503, "quote unavailable")
    return q


def _cats(session, job_id: str) -> dict[str, dict]:
    rows = session.scalars(select(CategoryResult).where(CategoryResult.job_id == job_id)).all()
    return {r.category: (r.payload or {}) for r in rows if r.status == "completed"}


@router.get("/runs/{job_id}/changes")
async def run_changes(job_id: str) -> dict:
    """Diff this run's headline metrics against the most recent earlier completed run of the
    same entity. Returns an empty change set (has_previous=False) when there's nothing to
    compare to — the first time an entity is researched."""
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(404, "job not found")
        if not job.entity_id:
            return {"has_previous": False, "changes": []}

        prev = session.scalar(
            select(Job)
            .where(
                Job.entity_id == job.entity_id,
                Job.status == "completed",
                Job.created_at < job.created_at,
                Job.id != job_id,
            )
            .order_by(Job.created_at.desc())
        )
        if prev is None:
            return {"has_previous": False, "changes": []}

        now = _extract(_cats(session, job_id))
        before = _extract(_cats(session, prev.id))
        prev_created = prev.created_at.isoformat()

    changes: list[dict] = []
    for key, label, higher in _METRICS:
        a = before.get(key)
        b = now.get(key)
        if not a or not b or a["text"] == "—" or b["text"] == "—":
            continue
        if a["text"] == b["text"]:
            continue
        change = {"key": key, "label": label, "from": a["text"], "to": b["text"], "direction": None}
        if a["sort"] is not None and b["sort"] is not None and a["sort"] != 0:
            pct = (b["sort"] - a["sort"]) / abs(a["sort"]) * 100
            change["delta_pct"] = round(pct, 1)
            up = b["sort"] > a["sort"]
            # "good" direction depends on whether higher is better for this metric
            change["direction"] = ("up" if up else "down")
            change["favorable"] = (up == higher) if higher is not None else None
        changes.append(change)

    return {
        "has_previous": True,
        "previous_job_id": prev.id,
        "previous_at": prev_created,
        "changes": changes,
    }
