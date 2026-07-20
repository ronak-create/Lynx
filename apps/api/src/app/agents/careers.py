"""Careers agent — every currently-open job posting for the company, aggregated across the
major public ATS platforms. Because those APIs only serve live roles, everything returned is a
valid, open posting (no closed/expired listings). Powers the dedicated Careers tab."""
from app.agents.base import AgentContext
from app.agents.legitimacy import _domain_for
from app.sources import jobs

category = "careers"


async def run(ctx: AgentContext) -> dict:
    domain = _domain_for(ctx)
    ctx.progress(category, "Aggregating live job postings across ATS platforms")
    data = await jobs.live_jobs(ctx.root["name"], domain.removeprefix("www.") if domain else None)
    if not data["available"]:
        data["message"] = "No live job postings found on public ATS platforms."
    return data
