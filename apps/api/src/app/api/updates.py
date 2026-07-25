"""Recent posts from a company's X profile — launches, updates, changelogs. Sourced from X's
public syndication timeline (no auth); returns an empty list when X is unavailable/rate-limited."""
from fastapi import APIRouter

from app.sources import x_updates

router = APIRouter()


@router.get("/updates")
async def updates(handle: str) -> dict:
    posts = await x_updates.recent_posts(handle)
    return {"handle": handle.lstrip("@").strip(), "posts": posts}
