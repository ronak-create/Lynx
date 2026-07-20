"""Exposes what the client can configure: LLM models and research categories."""
from fastapi import APIRouter

from app.agents.orchestrator import AGENTS
from app.llm.selection import available_providers

router = APIRouter()

CATEGORY_LABELS = {
    "overview": "Overview",
    "profile": "Profile",
    "stock": "Stock",
    "financials": "Financials",
    "funding": "Funding",
    "products": "Products",
    "web_presence": "Web Presence",
    "people": "Key People",
    "news": "News",
    "social": "Community",
    "patents": "Patents",
    "competitors": "Competitors",
    "legitimacy": "Legitimacy",
    "signals": "Operational Signals",
    "careers": "Careers",
}


@router.get("/config")
async def get_config() -> dict:
    return {
        "llm_providers": available_providers(),
        "categories": [
            {"id": a.category, "label": CATEGORY_LABELS.get(a.category, a.category)} for a in AGENTS
        ],
    }
