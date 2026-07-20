"""Operational signals agent — the "is this a real, running operation?" evidence that
complements legitimacy: what tech they ship, whether they're actively hiring, and how
customers rate them. All deterministic and free (no LLM, no API keys)."""
import asyncio
import logging

from app.agents.base import AgentContext
from app.agents.legitimacy import _domain_for
from app.sources import webtech
from app.sources.http import fetcher

log = logging.getLogger(__name__)

category = "signals"


async def run(ctx: AgentContext) -> dict:
    root = ctx.root
    domain = _domain_for(ctx)
    if not domain:
        return {"available": False, "message": "No official domain found to profile."}
    domain = domain.removeprefix("www.")

    ctx.progress(category, f"Reading {domain}: tech stack, hiring, reviews")
    html = await fetcher.get_text("generic", f"https://{domain}", ttl=24 * 3600)
    tech = webtech.fingerprint_tech(html) if html else []

    hiring, reviews = await asyncio.gather(
        webtech.hiring(root["name"], domain),
        webtech.reviews(domain),
    )

    available = bool(tech) or hiring.get("available") or reviews.get("available")
    return {
        "available": available,
        "domain": domain,
        "tech": tech,
        "hiring": hiring,
        "reviews": reviews,
    }
