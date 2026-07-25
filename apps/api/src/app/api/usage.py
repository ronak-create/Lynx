"""Live API-usage telemetry for the UI's usage bars.

Hybrid model: per-service live rate-limit usage (requests/tokens this process made in the last
minute vs each service's known limit) plus Firecrawl's real remaining-credit balance when a key
is available (server env, or the client's own key passed as ?firecrawl_key=)."""
from fastapi import APIRouter

from app import usage

router = APIRouter()


@router.get("/usage")
async def get_usage(firecrawl_key: str | None = None) -> dict:
    services = usage.tracker.snapshot()
    credits = await usage.firecrawl_credits(firecrawl_key)
    return {"services": services, "firecrawl_credits": credits, "window_seconds": int(usage.WINDOW)}
