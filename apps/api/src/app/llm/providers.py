"""Provider chain built from config. Groq / Cerebras / OpenRouter / Ollama all speak the
OpenAI chat-completions dialect, so one client class covers them; Claude or any other
paid tier plugs in later as one more entry with its own adapter."""
from dataclasses import dataclass

from app.config import settings


@dataclass(frozen=True)
class ProviderConfig:
    id: str
    base_url: str
    api_key: str
    model: str


def build_chain() -> list[ProviderConfig]:
    known = {
        "groq": ProviderConfig("groq", "https://api.groq.com/openai/v1", settings.groq_api_key, settings.groq_model),
        "cerebras": ProviderConfig(
            "cerebras", "https://api.cerebras.ai/v1", settings.cerebras_api_key, settings.cerebras_model
        ),
        "openrouter": ProviderConfig(
            "openrouter", "https://openrouter.ai/api/v1", settings.openrouter_api_key, settings.openrouter_model
        ),
        "ollama": ProviderConfig("ollama", settings.ollama_base_url, "ollama", settings.ollama_model),
    }
    chain: list[ProviderConfig] = []
    for pid in [p.strip() for p in settings.llm_chain.split(",") if p.strip()]:
        cfg = known.get(pid)
        if cfg is None:
            continue
        # a provider is usable if it has a key (or is ollama with a model configured)
        if pid == "ollama":
            if cfg.model:
                chain.append(cfg)
        elif cfg.api_key:
            chain.append(cfg)
    return chain
