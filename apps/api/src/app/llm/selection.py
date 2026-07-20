"""Build a per-run LLMClient from a user's model selection.

Selection values:
  None / "auto" -> full configured chain (best available first)
  "none"        -> empty chain (deterministic / degraded mode, template documentary)
  "<provider>"  -> pin to a single provider (e.g. "groq", "cerebras", "ollama")
"""
from app.llm.client import LLMClient
from app.llm.providers import ProviderConfig, build_chain

# All providers we know how to talk to, whether or not a key is configured.
KNOWN_PROVIDERS = ["groq", "cerebras", "openrouter", "ollama"]


def available_providers() -> list[dict]:
    """What the UI offers: each known provider + whether it's actually configured."""
    configured = {c.id: c for c in build_chain()}
    out = [
        {"id": "auto", "label": "Auto (best available)", "configured": bool(configured)},
        {"id": "none", "label": "No LLM (template mode)", "configured": True},
    ]
    for pid in KNOWN_PROVIDERS:
        cfg = configured.get(pid)
        out.append(
            {
                "id": pid,
                "label": pid.capitalize(),
                "model": cfg.model if cfg else None,
                "configured": cfg is not None,
            }
        )
    return out


def build_client(selection: str | None) -> LLMClient:
    if selection == "none":
        return LLMClient(chain=[])
    full: list[ProviderConfig] = build_chain()
    if selection and selection != "auto":
        return LLMClient(chain=[c for c in full if c.id == selection])
    return LLMClient(chain=full)
