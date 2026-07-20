"""Agent contract: each research agent covers one category, receives a shared context,
and returns the JSON payload that becomes that category's dashboard card."""
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Protocol

from app.llm.client import LLMClient

Emit = Callable[..., None]  # emit(type, agent=None, payload=None)


@dataclass
class AgentContext:
    job_id: str
    root: dict  # {entity_id, name, wikipedia_title, wikidata_id, ticker, cik, domain, description, url}
    profile: dict = field(default_factory=dict)  # pre-fetched wikidata company_profile
    llm: LLMClient | None = None
    emit: Emit = lambda *a, **k: None
    # Shared research context: the "conversation" between agents. Discovery-phase agents
    # (deep site crawl, overview) write findings here; later agents read them so the
    # research compounds instead of each agent working blind. Keys used:
    #   site_content: str  – deep-crawled markdown of the company's own site
    #   site_profile: dict – structured profile the LLM pulled from the site
    #   dossier: str       – a short synthesized brief on the company
    shared: dict = field(default_factory=dict)

    def progress(self, agent: str, message: str, **data: Any) -> None:
        self.emit("agent_progress", agent=agent, payload={"message": message, **data})

    def context_brief(self) -> str:
        """A compact description of the company for grounding downstream LLM agents."""
        bits = []
        if self.root.get("description"):
            bits.append(self.root["description"])
        if self.shared.get("dossier"):
            bits.append(self.shared["dossier"])
        return "\n".join(bits)


class ResearchAgent(Protocol):
    category: str

    def run(self, ctx: AgentContext) -> Awaitable[dict]: ...
