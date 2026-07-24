"""Layered research primitive — hit sources one at a time, in priority order, and show it.

Several agents (people, products, competitors, legitimacy) already gather the same kind of
fact from a *ladder* of sources: an authoritative one first, then progressively looser
fallbacks for entities the good sources don't cover. This module makes that ladder explicit so:

  * **one layer is hit at a time, in order** — the caller drives control flow and only
    descends to the next layer when the current one leaves a gap;
  * **no duplicates** — `Deduper` keeps the first (higher-authority) record for a key and
    drops later repeats, so a founder found on Wikidata isn't shown again from a web snippet;
  * **no stale data** — `freshest()` keeps the most recently-dated record when two layers
    disagree, and per-source cache TTLs bound how old any single fetch can be;
  * **it's tracked on the dashboard** — `LayerTracker` emits a structured `agent_layers`
    event (the whole ladder + each rung's status/count) that the ProgressRail renders live.

IMPORTANT (see the SQLite self-deadlock note): tracker calls emit to job_events on a second
connection, so — exactly like `ctx.progress` — never call them while holding an open write
transaction. Commit first."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Callable, Hashable, Iterable, TypeVar

T = TypeVar("T")

# rung lifecycle: pending → running → (hit | empty | skipped | failed)
Status = str


@dataclass
class Layer:
    name: str          # human label shown on the rail, e.g. "Wikidata"
    source: str        # source_id for provenance, e.g. "wikidata"
    status: Status = "pending"
    count: int = 0     # NEW records this rung contributed (post-dedup)
    detail: str | None = None  # optional one-liner, e.g. "LEI 5493001KJTIIGC8Y1R12"


class LayerTracker:
    """Reports an ordered source ladder for one agent to the dashboard.

    The agent owns the loop; it calls `start`/`hit`/`empty`/`skip`/`fail` as it walks the
    ladder, and each call re-emits the *whole* ladder so the frontend can just replace its
    copy (no client-side merge). `emit` is a no-op-safe telemetry channel, so a tracker call
    never changes an agent's result."""

    def __init__(self, ctx: Any, category: str, layers: Iterable[tuple[str, str]]):
        self.ctx = ctx
        self.category = category
        self.layers: list[Layer] = [Layer(name=n, source=s) for n, s in layers]
        self._idx = {layer.name: layer for layer in self.layers}

    def _emit(self) -> None:
        self.ctx.emit(
            "agent_layers",
            agent=self.category,
            payload={"layers": [asdict(layer) for layer in self.layers]},
        )

    def start(self, name: str, message: str | None = None) -> None:
        layer = self._idx[name]
        layer.status = "running"
        self._emit()
        # also drive the existing single-line progress text under the agent
        self.ctx.progress(self.category, message or f"Checking {name}…")

    def hit(self, name: str, count: int, detail: str | None = None) -> None:
        layer = self._idx[name]
        layer.status = "hit" if count else "empty"
        layer.count = count
        layer.detail = detail
        self._emit()

    def empty(self, name: str, detail: str | None = None) -> None:
        layer = self._idx[name]
        layer.status = "empty"
        layer.detail = detail
        self._emit()

    def skip(self, name: str, detail: str | None = None) -> None:
        """Mark a rung we never ran (precondition unmet — e.g. no LLM, no domain)."""
        layer = self._idx[name]
        layer.status = "skipped"
        layer.detail = detail
        self._emit()

    def fail(self, name: str, detail: str | None = None) -> None:
        layer = self._idx[name]
        layer.status = "failed"
        layer.detail = detail
        self._emit()

    def summary(self) -> list[dict]:
        """Final ladder snapshot to embed in the agent's payload, so the layers stay
        visible after the run completes (SSE events aren't in the category snapshot)."""
        return [asdict(layer) for layer in self.layers]


class Deduper:
    """First-wins dedup across layers: the earliest (highest-authority) layer to yield a key
    keeps it; later layers only fill genuinely new keys. `add` returns just the fresh items so
    the caller can persist/emit only those."""

    def __init__(self, initial: Iterable[Hashable] = ()):
        self.seen: set[Hashable] = set(initial)

    def add(self, items: Iterable[T], key: Callable[[T], Hashable | None]) -> list[T]:
        fresh: list[T] = []
        for item in items:
            k = key(item)
            if k is None or k in self.seen:
                continue
            self.seen.add(k)
            fresh.append(item)
        return fresh

    def __contains__(self, k: Hashable) -> bool:
        return k in self.seen


def freshest(items: Iterable[T], key: Callable[[T], Hashable], when: Callable[[T], Any]) -> list[T]:
    """Collapse items sharing a key to the one with the newest `when` (None sorts oldest).
    Used for dated records (news, filings) so a refreshed run never surfaces a stale copy
    alongside its newer version."""
    best: dict[Hashable, T] = {}
    for item in items:
        k = key(item)
        cur = best.get(k)
        if cur is None or (when(item) or "") > (when(cur) or ""):
            best[k] = item
    return list(best.values())
