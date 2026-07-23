import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import autocomplete, chat, compare, config, entities, jobs, realtime, research
from app.config import settings
from app.db.engine import init_db
from app.sources.http import fetcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    _fail_stale_jobs()
    yield
    await fetcher.close()


def _fail_stale_jobs() -> None:
    """The job manager runs tasks in-process, so a restart orphans any in-flight job. Mark
    leftover queued/running jobs as failed on boot so the UI shows a clear state instead of
    spinning on a stream that will never produce events."""
    from sqlalchemy import update

    from app.db.engine import get_session
    from app.db.models import Job, utcnow

    with get_session() as session:
        session.execute(
            update(Job)
            .where(Job.status.in_(("queued", "running")))
            .values(status="failed", error="interrupted by a server restart", finished_at=utcnow())
        )
        session.commit()


app = FastAPI(title="Business Research API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config.router)
app.include_router(autocomplete.router)
app.include_router(research.router)
app.include_router(jobs.router)
app.include_router(entities.router)
app.include_router(compare.router)
app.include_router(realtime.router)
app.include_router(chat.router)


@app.get("/health")
async def health() -> dict:
    from app.llm.client import llm

    return {"status": "ok", "llm_providers": [p.id for p in llm.chain]}
