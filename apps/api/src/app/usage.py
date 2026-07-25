"""In-process usage telemetry for the UI's usage bars.

Two kinds of signal, matching the "hybrid" model:
  • live rate-limit usage — every data-source request and every LLM token this process makes is
    recorded in a rolling 60s window and shown against the service's known sustained limit
    (data sources: the AsyncLimiter budget in http._LIMITERS; LLM: free-tier tokens/min).
  • provider quota — Firecrawl's real remaining-credit balance, fetched live when a key is set.

Best-effort only: recording never blocks or raises, so it can't affect a real call. To avoid a
circular import (http/llm import this module), all heavy imports here are done lazily inside funcs."""
import time
from collections import defaultdict, deque

from app.config import settings

WINDOW = 60.0  # rolling window (seconds) the snapshot reports over

# free-tier tokens-per-minute ceilings; 0 = unknown (bar shows the count with no limit)
_TPM_LIMITS: dict[str, int] = {"groq": 12000, "cerebras": 60000, "openrouter": 0, "ollama": 0}

_SOURCE_LABELS: dict[str, str] = {
    "sec_edgar": "SEC EDGAR",
    "wikipedia": "Wikipedia",
    "wikidata": "Wikidata",
    "google_news": "Google News",
    "hn_algolia": "Hacker News",
    "github": "GitHub",
    "firecrawl": "Firecrawl",
    "reddit": "Reddit",
    "patents": "PatentsView",
    "rdap": "RDAP (domains)",
    "doh": "DNS-over-HTTPS",
    "jina": "Jina Reader",
    "duckduckgo": "DuckDuckGo",
    "gleif": "GLEIF (LEI)",
    "wayback": "Wayback Machine",
    "x_syndication": "X (updates)",
    "generic": "Other HTTP",
}
_LLM_LABELS: dict[str, str] = {
    "groq": "Groq",
    "cerebras": "Cerebras",
    "openrouter": "OpenRouter",
    "ollama": "Ollama",
}


class UsageTracker:
    def __init__(self) -> None:
        self._req: dict[str, deque[float]] = defaultdict(deque)  # source_id -> request timestamps
        self._tok: dict[str, deque[tuple[float, int]]] = defaultdict(deque)  # provider -> (ts, tokens)
        self._seen_sources: set[str] = set()  # every source touched this session (so idle ones persist)
        self._seen_llm: set[str] = set()

    def record_request(self, source_id: str) -> None:
        self._req[source_id].append(time.monotonic())
        self._seen_sources.add(source_id)

    def record_tokens(self, provider: str, tokens: int) -> None:
        self._tok[provider].append((time.monotonic(), int(tokens or 0)))
        self._seen_llm.add(provider)

    def _prune(self, now: float) -> None:
        for dq in self._req.values():
            while dq and now - dq[0] > WINDOW:
                dq.popleft()
        for dqt in self._tok.values():
            while dqt and now - dqt[0][0] > WINDOW:
                dqt.popleft()

    def snapshot(self) -> list[dict]:
        """One row per service touched this session: live usage over the last WINDOW vs its limit."""
        from app.sources.http import _LIMITERS  # lazy: avoids the http -> usage import cycle

        now = time.monotonic()
        self._prune(now)
        rows: list[dict] = []

        # LLM providers — tokens/min vs the free-tier TPM ceiling
        for pid in sorted(self._seen_llm):
            used = sum(tok for _, tok in self._tok.get(pid, ()))
            limit = _TPM_LIMITS.get(pid, 0)
            rows.append(
                {
                    "id": f"llm:{pid}",
                    "label": _LLM_LABELS.get(pid, pid.title()),
                    "group": "model",
                    "used": used,
                    "limit": limit or None,
                    "unit": "tokens/min",
                }
            )

        # data sources — requests/min vs the sustained limiter budget (max_rate/time_period * 60)
        for sid in sorted(self._seen_sources):
            lim = _LIMITERS.get(sid)
            per_min = round(lim.max_rate / lim.time_period * 60) if lim else None
            rows.append(
                {
                    "id": sid,
                    "label": _SOURCE_LABELS.get(sid, sid),
                    "group": "source",
                    "used": len(self._req.get(sid, ())),
                    "limit": per_min,
                    "unit": "req/min",
                }
            )
        return rows


tracker = UsageTracker()


async def firecrawl_credits(key: str | None = None) -> dict | None:
    """Live Firecrawl credit balance for the quota bar. Returns {used, limit, remaining} or None.

    Uses the client-supplied key if given, else the server env key. Cached 60s via the shared
    Fetcher (also counts as one Firecrawl request, which is fine)."""
    from app.sources.http import fetcher  # lazy import to avoid the cycle

    api_key = key or settings.firecrawl_api_key
    if not api_key:
        return None
    data = await fetcher.get_json(
        "firecrawl",
        "https://api.firecrawl.dev/v2/team/credit-usage",
        headers={"Authorization": f"Bearer {api_key}"},
        ttl=60,
    )
    if not isinstance(data, dict):
        return None
    d = data.get("data") if isinstance(data.get("data"), dict) else data
    remaining = d.get("remainingCredits", d.get("remaining_credits"))
    if not isinstance(remaining, (int, float)):
        return None
    plan = d.get("planCredits", d.get("plan_credits"))
    total = plan if isinstance(plan, (int, float)) and plan > 0 else None
    return {
        "remaining": int(remaining),
        "limit": int(total) if total else None,
        "used": int(total - remaining) if total else None,
    }
