"""A short rate-limit cooldown must not silently degrade a run.

Free tiers 429 constantly, and the cooldown is seconds. If every provider happens to be cooling
down at the moment the documentary or synthesis pass asks for a completion, waiting the cooldown
out once is right; giving up would drop a whole LLM-written document for the sake of ~12s. A
circuit-broken provider (a real failure, 5 minutes) is a different thing and must not be waited on.
"""
import time
from types import SimpleNamespace

import pytest

from app.llm.client import CIRCUIT_BREAK_SECONDS, LLMClient
from app.llm.providers import ProviderConfig

CFG = ProviderConfig(id="fake", base_url="http://localhost", api_key="k", model="m")


def _client_returning(text: str, calls: list[int]) -> object:
    async def create(**_kwargs):
        calls.append(1)
        return SimpleNamespace(
            usage=None,
            choices=[SimpleNamespace(message=SimpleNamespace(content=text))],
        )

    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


@pytest.fixture
def client(monkeypatch) -> tuple[LLMClient, list[int]]:
    calls: list[int] = []
    llm = LLMClient(chain=[CFG])
    monkeypatch.setattr(llm, "_client", lambda _cfg: _client_returning("written", calls))
    return llm, calls


async def test_waits_out_a_short_cooldown_then_succeeds(client):
    llm, calls = client
    llm._broken_until[CFG.id] = time.monotonic() + 0.3

    started = time.monotonic()
    out = await llm.generate("sys", "user")

    assert out == "written"
    assert len(calls) == 1
    assert time.monotonic() - started >= 0.3  # it actually waited rather than returning None


async def test_waits_at_most_once(client, monkeypatch):
    """The retry is single-shot: a provider still cooling after the wait returns None, and the
    call does not sit in a loop."""
    llm, calls = client
    monkeypatch.setattr("app.llm.client.RATE_LIMIT_COOLDOWN", 0.2)
    # cooldown is refreshed every time it is inspected, so the retry finds it cooling again
    original = llm._broken_until

    class AlwaysCooling(dict):
        def get(self, _key, _default=0):
            return time.monotonic() + 0.1

    llm._broken_until = AlwaysCooling(original)

    started = time.monotonic()
    assert await llm.generate("sys", "user") is None
    assert calls == []
    assert time.monotonic() - started < 1.5


async def test_does_not_wait_on_a_circuit_broken_provider(client):
    llm, calls = client
    llm._broken_until[CFG.id] = time.monotonic() + CIRCUIT_BREAK_SECONDS

    started = time.monotonic()
    assert await llm.generate("sys", "user") is None
    assert calls == []
    assert time.monotonic() - started < 0.5  # returned immediately, no 5-minute wait
