"""Exposes what the client can configure: LLM models and research categories."""
from fastapi import APIRouter

from app.agents.orchestrator import AGENTS
from app.config import settings
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
    # keys already set in the server .env — surfaced so the UI can prefill the config-keys fields
    # (local single-user tool; secrets never leave the user's own machine).
    env_keys = {
        "groq": settings.groq_api_key,
        "cerebras": settings.cerebras_api_key,
        "openrouter": settings.openrouter_api_key,
        "ollama": settings.ollama_base_url,
        "firecrawl": settings.firecrawl_api_key,
    }
    return {
        "llm_providers": available_providers(),
        "categories": [
            {"id": a.category, "label": CATEGORY_LABELS.get(a.category, a.category)} for a in AGENTS
        ],
        "env_keys": {k: v for k, v in env_keys.items() if v},
    }
