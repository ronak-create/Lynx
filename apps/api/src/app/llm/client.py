"""Provider-agnostic LLM facade.

Agents only ever see `llm.extract(...)` and `llm.generate(...)`; both return None when
no provider is configured or all fail — callers treat None as "take the deterministic path".
Chain fallback on 429/5xx/timeout with a 5-minute circuit breaker per provider.
"""
import asyncio
import json
import logging
import re
import time
from typing import TypeVar

from openai import AsyncOpenAI, RateLimitError
from pydantic import BaseModel, ValidationError

from app.llm.providers import ProviderConfig, build_chain

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

CIRCUIT_BREAK_SECONDS = 300
RATE_LIMIT_COOLDOWN = 12  # brief, not a 5-min outage — free tiers 429 constantly
MAX_CONCURRENT_LLM = 2  # keep token bursts under free-tier TPM limits


class LLMClient:
    def __init__(self, chain: list[ProviderConfig] | None = None) -> None:
        self.chain = chain if chain is not None else build_chain()
        self._clients: dict[str, AsyncOpenAI] = {}
        self._broken_until: dict[str, float] = {}
        self._sem = asyncio.Semaphore(MAX_CONCURRENT_LLM)

    @property
    def available(self) -> bool:
        return bool(self.chain)

    def _client(self, cfg: ProviderConfig) -> AsyncOpenAI:
        if cfg.id not in self._clients:
            self._clients[cfg.id] = AsyncOpenAI(base_url=cfg.base_url, api_key=cfg.api_key, max_retries=0)
        return self._clients[cfg.id]

    async def _complete(self, system: str, user: str, json_mode: bool, max_tokens: int) -> str | None:
        for cfg in self.chain:
            if self._broken_until.get(cfg.id, 0) > time.monotonic():
                continue
            try:
                kwargs: dict = {}
                if json_mode:
                    kwargs["response_format"] = {"type": "json_object"}
                async with self._sem:  # cap concurrent calls to respect free-tier TPM
                    resp = await asyncio.wait_for(
                        self._client(cfg).chat.completions.create(
                            model=cfg.model,
                            messages=[
                                {"role": "system", "content": system},
                                {"role": "user", "content": user},
                            ],
                            temperature=0.2,
                            max_tokens=max_tokens,
                            **kwargs,
                        ),
                        timeout=60,
                    )
                content = resp.choices[0].message.content
                if content:
                    return content
            except RateLimitError:
                # transient: brief cooldown so other calls try the next provider,
                # but do NOT disable this provider for 5 minutes.
                self._broken_until[cfg.id] = time.monotonic() + RATE_LIMIT_COOLDOWN
                log.info("llm provider %s rate-limited; cooling down %ss", cfg.id, RATE_LIMIT_COOLDOWN)
            except Exception as exc:
                log.warning("llm provider %s failed: %s", cfg.id, exc)
                self._broken_until[cfg.id] = time.monotonic() + CIRCUIT_BREAK_SECONDS
        return None

    async def generate(self, system: str, user: str, max_tokens: int = 1500) -> str | None:
        if not self.available:
            return None
        return await self._complete(system, user, json_mode=False, max_tokens=max_tokens)

    async def extract(self, system: str, user: str, schema: type[T], max_tokens: int = 2000) -> T | None:
        """Schema-validated JSON extraction with one repair retry."""
        if not self.available:
            return None
        prompt = (
            f"{system}\n\nRespond ONLY with a JSON object matching this schema:\n"
            f"{json.dumps(schema.model_json_schema(), indent=1)}"
        )
        raw = await self._complete(prompt, user, json_mode=True, max_tokens=max_tokens)
        for attempt in range(2):
            if raw is None:
                return None
            try:
                return schema.model_validate(_loads_lenient(raw))
            except (ValidationError, json.JSONDecodeError) as exc:
                if attempt == 1:
                    log.warning("llm extraction unparseable after retry: %s", exc)
                    return None
                raw = await self._complete(
                    prompt,
                    f"Your previous output failed validation: {exc}\nPrevious output:\n{raw}\n\nReturn corrected JSON only.",
                    json_mode=True,
                    max_tokens=max_tokens,
                )
        return None


def _loads_lenient(raw: str) -> dict:
    """Strip code fences / leading prose that small models sometimes add."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end > start:
        raw = raw[start : end + 1]
    return json.loads(raw)


llm = LLMClient()
