"""In-process job manager: one asyncio task per research run, SSE fan-out with DB-backed replay.

Every event is persisted to job_events with a monotonic seq before being pushed to live
subscribers, so a browser refresh mid-run reconnects with Last-Event-ID and loses nothing.
Swapping this for Redis/arq later changes nothing in the API contract.
"""
import asyncio
import logging
from dataclasses import dataclass, field
from typing import AsyncIterator

from sqlalchemy import select

from app.db.engine import get_session
from app.db.models import Job, JobEvent, utcnow

log = logging.getLogger(__name__)

_SENTINEL = None


@dataclass
class JobHandle:
    job_id: str
    task: asyncio.Task | None = None
    seq: int = 0
    subscribers: list[asyncio.Queue] = field(default_factory=list)
    done: bool = False


class JobManager:
    def __init__(self) -> None:
        self._handles: dict[str, JobHandle] = {}

    def handle(self, job_id: str) -> JobHandle | None:
        return self._handles.get(job_id)

    def start(self, job_id: str, coro) -> None:
        handle = JobHandle(job_id=job_id)
        self._handles[job_id] = handle
        handle.task = asyncio.create_task(self._run(job_id, coro))

    async def _run(self, job_id: str, coro) -> None:
        try:
            await coro
        except Exception as exc:
            log.exception("job %s crashed", job_id)
            with get_session() as session:
                job = session.get(Job, job_id)
                if job is not None:
                    job.status = "failed"
                    job.error = str(exc)
                    job.finished_at = utcnow()
                    session.commit()
            self.emit(job_id, "job_completed", payload={"status": "failed", "error": str(exc)})
        finally:
            self.finish(job_id)

    def emit(self, job_id: str, type_: str, agent: str | None = None, payload: dict | None = None) -> None:
        handle = self._handles.get(job_id)
        payload = payload or {}
        seq = (handle.seq + 1) if handle else 1
        if handle:
            handle.seq = seq
        with get_session() as session:
            session.add(JobEvent(job_id=job_id, seq=seq, type=type_, agent=agent, payload=payload))
            session.commit()
        event = {"seq": seq, "type": type_, "agent": agent, "payload": payload}
        if handle:
            for queue in list(handle.subscribers):
                queue.put_nowait(event)

    def finish(self, job_id: str) -> None:
        handle = self._handles.get(job_id)
        if handle is None:
            return
        handle.done = True
        for queue in list(handle.subscribers):
            queue.put_nowait(_SENTINEL)

    async def subscribe(self, job_id: str, after_seq: int = 0) -> AsyncIterator[dict]:
        """Replay persisted events after `after_seq`, then stream live until the job ends."""
        handle = self._handles.get(job_id)
        queue: asyncio.Queue = asyncio.Queue()
        if handle is not None and not handle.done:
            handle.subscribers.append(queue)
        try:
            with get_session() as session:
                rows = session.scalars(
                    select(JobEvent)
                    .where(JobEvent.job_id == job_id, JobEvent.seq > after_seq)
                    .order_by(JobEvent.seq)
                ).all()
            last_seq = after_seq
            for row in rows:
                last_seq = max(last_seq, row.seq)
                yield {"seq": row.seq, "type": row.type, "agent": row.agent, "payload": row.payload}
                if row.type == "job_completed":
                    return
            if handle is None or handle.done:
                return
            while True:
                event = await queue.get()
                if event is _SENTINEL:
                    return
                if event["seq"] <= last_seq:
                    continue
                last_seq = event["seq"]
                yield event
                if event["type"] == "job_completed":
                    return
        finally:
            if handle is not None and queue in handle.subscribers:
                handle.subscribers.remove(queue)


manager = JobManager()
