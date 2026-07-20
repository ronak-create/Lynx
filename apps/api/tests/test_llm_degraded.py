"""No-LLM (degraded) mode: an empty provider chain must make every call a clean no-op that
returns None, so agents deterministically take the template path instead of crashing."""
from pydantic import BaseModel

from app.llm.client import LLMClient


class _Schema(BaseModel):
    x: str = ""


def test_empty_chain_is_unavailable():
    assert LLMClient(chain=[]).available is False


async def test_generate_returns_none_without_provider():
    assert await LLMClient(chain=[]).generate("sys", "user") is None


async def test_extract_returns_none_without_provider():
    assert await LLMClient(chain=[]).extract("sys", "user", _Schema) is None
