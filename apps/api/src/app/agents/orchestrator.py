"""Runs all category agents concurrently for one job; failures are isolated so a run
always finishes with whatever it could gather. Ends by generating the documentary."""
import asyncio
import logging

from app.agents import (
    careers,
    competitors,
    financials,
    funding,
    legitimacy,
    news,
    overview,
    patents,
    products,
    profile,
    people,
    signals,
    social,
    stock,
    web_presence,
)
from app.agents.base import AgentContext
from app.agents.resolve import resolve_query
from app.agents.synthesis import run_synthesis
from app.db.engine import get_session
from app.db.models import CategoryResult, Document, Job, utcnow
from app.documentary.generator import generate_documentary
from app.jobs.manager import manager
from app.llm.selection import build_client
from app.sources import wikidata

log = logging.getLogger(__name__)

AGENTS = [
    overview,
    profile,
    stock,
    financials,
    funding,
    products,
    web_presence,
    people,
    news,
    social,
    patents,
    competitors,
    legitimacy,
    signals,
    careers,
]

# Phase 1 agents read the company's own material first; their findings seed the shared
# context that every other agent then builds on.
DISCOVERY_AGENTS = {"overview", "profile"}


def _save_category(job_id: str, category: str, status: str, payload: dict) -> None:
    with get_session() as session:
        existing = (
            session.query(CategoryResult)
            .filter_by(job_id=job_id, category=category)
            .one_or_none()
        )
        if existing is None:
            session.add(CategoryResult(job_id=job_id, category=category, status=status, payload=payload))
        else:
            existing.status = status
            existing.payload = payload
        session.commit()


async def _run_agent(agent, ctx: AgentContext, collected: dict[str, dict]) -> None:
    category = agent.category
    ctx.emit("agent_started", agent=category)
    try:
        payload = await asyncio.wait_for(agent.run(ctx), timeout=180)
        _save_category(ctx.job_id, category, "completed", payload)
        collected[category] = payload  # authoritative in-memory copy for the documentary
        ctx.emit("category_data", agent=category, payload=payload)
        ctx.emit("agent_completed", agent=category)
    except Exception as exc:
        log.exception("agent %s failed", category)
        _save_category(ctx.job_id, category, "failed", {"error": str(exc)})
        ctx.emit("agent_failed", agent=category, payload={"error": str(exc)})


async def run_job(
    job_id: str,
    query: str,
    llm_provider: str | None = None,
    categories: list[str] | None = None,
) -> None:
    llm = build_client(llm_provider)
    selected_agents = [a for a in AGENTS if not categories or a.category in categories]

    with get_session() as session:
        job = session.get(Job, job_id)
        job.status = "running"
        session.commit()

    def emit(type_: str, agent: str | None = None, payload: dict | None = None) -> None:
        manager.emit(job_id, type_, agent=agent, payload=payload)

    emit("job_started", payload={"query": query, "message": "Resolving entity..."})
    root = await resolve_query(query)

    with get_session() as session:
        job = session.get(Job, job_id)
        job.entity_id = root["entity_id"]
        session.commit()

    emit(
        "entity_resolved",
        payload={
            "entity_id": root["entity_id"],
            "name": root["name"],
            "description": root.get("description"),
            "ticker": root.get("ticker"),
            "wikidata_id": root.get("wikidata_id"),
        },
    )

    # one Wikidata profile fetch shared by overview/products/people/web_presence/financials
    profile: dict = {}
    if root.get("wikidata_id"):
        profile = await wikidata.company_profile(root["wikidata_id"])

    ctx = AgentContext(job_id=job_id, root=root, profile=profile, llm=llm, emit=emit)

    collected: dict[str, dict] = {}
    discovery = [a for a in selected_agents if a.category in DISCOVERY_AGENTS]
    investigation = [a for a in selected_agents if a.category not in DISCOVERY_AGENTS]

    # Phase 1 — Discovery: read the company's own material (deep site crawl) and core
    # facts first, so the rest of the pipeline works from real, grounded context.
    if discovery:
        emit("job_started", payload={"message": "Discovery: reading the company's own sources…"})
        async with asyncio.TaskGroup() as tg:
            for agent in discovery:
                tg.create_task(_run_agent(agent, ctx, collected))

    # Fold discovery findings into the shared context so later agents build on them
    # instead of starting blind. This is the "conversation" between agents.
    if not (ctx.root.get("description") or "").strip():
        # a clean one-liner for the header/subtitle; full dossier stays in shared for grounding
        what = (ctx.shared.get("site_profile") or {}).get("what_they_do")
        if what:
            ctx.root["description"] = what.split(". ")[0].strip().rstrip(".") + "."

    # Phase 2 — Investigation: everything else, now grounded in the dossier.
    if investigation:
        async with asyncio.TaskGroup() as tg:
            for agent in investigation:
                tg.create_task(_run_agent(agent, ctx, collected))

    # Phases 3 & 4 — Synthesis (scorecard/SWOT/timeline) and the Documentary both consume the
    # agents' in-memory results read-only and don't depend on each other, so they run
    # concurrently: the run finishes as soon as the slower of the two (not their sum) is done.
    async def _synthesis() -> None:
        emit("agent_started", agent="synthesis")
        try:
            synthesis = await run_synthesis(root, llm, collected)
            _save_category(job_id, "synthesis", "completed", synthesis)
            emit("category_data", agent="synthesis", payload=synthesis)
            emit("agent_completed", agent="synthesis", payload={"method": synthesis.get("method")})
        except Exception as exc:
            log.exception("synthesis failed")
            _save_category(job_id, "synthesis", "failed", {"error": str(exc)})
            emit("agent_failed", agent="synthesis", payload={"error": str(exc)})

    async def _documentary() -> None:
        emit("agent_started", agent="documentary")
        try:
            markdown, method = await generate_documentary(job_id, root, llm, results=collected)
            with get_session() as session:
                session.add(Document(job_id=job_id, entity_id=root["entity_id"], markdown=markdown, method=method))
                session.commit()
            emit("agent_completed", agent="documentary", payload={"method": method})
        except Exception as exc:
            log.exception("documentary generation failed")
            emit("agent_failed", agent="documentary", payload={"error": str(exc)})

    async with asyncio.TaskGroup() as tg:
        tg.create_task(_synthesis())
        tg.create_task(_documentary())

    with get_session() as session:
        job = session.get(Job, job_id)
        job.status = "completed"
        job.finished_at = utcnow()
        session.commit()
    emit("job_completed", payload={"status": "completed"})
