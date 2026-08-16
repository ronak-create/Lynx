"""Benchmark harness — measures a real Lynx run end to end and writes a JSON record.

Everything in the README's metrics section comes from this script, so any number there can
be reproduced (or falsified) with one command. It drives the public HTTP API only; the one
DB read is provenance rows created during the run, which is how "citations captured" is counted.

    # backend must already be running on :8000
    cd apps/api
    uv run python ../../docs/bench.py "Microsoft" --label microsoft
    uv run python ../../docs/bench.py "Anthropic" --label anthropic
    uv run python ../../docs/bench.py "https://figma.com" --label figma
    uv run python ../../docs/bench.py "Anthropic" --label anthropic-no-llm --provider none

Flags:
    --provider auto|none|groq|...   model selection sent with the run (default: auto)
    --label NAME                    output file name (docs/benchmarks/NAME.json)
    --api URL                       API base (default http://127.0.0.1:8000)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import httpx

OUT_DIR = Path(__file__).resolve().parent / "benchmarks"


def _now() -> float:
    return time.monotonic()


def _stream_events(client: httpx.Client, api: str, job_id: str, t0: float) -> list[dict]:
    """Consume the run's SSE stream, stamping every event with seconds since the request."""
    events: list[dict] = []
    with client.stream("GET", f"{api}/jobs/{job_id}/events", timeout=None) as resp:
        resp.raise_for_status()
        etype = None
        for line in resp.iter_lines():
            if line.startswith("event:"):
                etype = line[6:].strip()
            elif line.startswith("data:"):
                try:
                    data = json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    data = {}
                events.append({"t": round(_now() - t0, 3), "type": etype, **data})
                if etype == "job_completed":
                    return events
                if etype == "job_failed":
                    return events
    return events


def _agent_spans(events: list[dict]) -> list[dict]:
    """agent_started → agent_completed/agent_failed, per category."""
    started: dict[str, float] = {}
    spans: dict[str, dict] = {}
    for ev in events:
        agent = ev.get("agent")
        if not agent:
            continue
        if ev["type"] == "agent_started":
            started[agent] = ev["t"]
        elif ev["type"] in ("agent_completed", "agent_failed"):
            start = started.get(agent, ev["t"])
            spans[agent] = {
                "category": agent,
                "start": start,
                "end": ev["t"],
                "seconds": round(ev["t"] - start, 3),
                "status": "completed" if ev["type"] == "agent_completed" else "failed",
            }
    return sorted(spans.values(), key=lambda s: s["start"])


def _layer_stats(events: list[dict]) -> dict:
    """Source-ladder rungs reported by the layered agents: how many were hit vs empty/skipped."""
    rungs: dict[tuple[str, str], str] = {}
    for ev in events:
        if ev.get("type") != "agent_layers":
            continue
        for layer in ev.get("layers", []) or []:
            rungs[(ev.get("agent", "?"), layer.get("name", "?"))] = layer.get("status", "?")
    counts = Counter(rungs.values())
    return {"total": len(rungs), "by_status": dict(counts)}


def _provenance_since(started_at: datetime) -> dict:
    """Citations captured during this run, grouped by source and extraction method."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api" / "src"))
        from sqlalchemy import func, select  # noqa: PLC0415

        from app.db.engine import get_session  # noqa: PLC0415
        from app.db.models import Provenance  # noqa: PLC0415
    except Exception as exc:  # pragma: no cover - optional enrichment
        return {"error": f"unavailable: {exc}"}

    with get_session() as session:
        rows = session.execute(
            select(Provenance.source_id, Provenance.extraction_method, func.count())
            .where(Provenance.retrieved_at >= started_at.replace(tzinfo=None))
            .group_by(Provenance.source_id, Provenance.extraction_method)
        ).all()
    by_source: Counter[str] = Counter()
    by_method: Counter[str] = Counter()
    for source_id, method, count in rows:
        by_source[source_id] += count
        by_method[method or "deterministic"] += count
    return {
        "total": sum(by_source.values()),
        "by_source": dict(by_source.most_common()),
        "by_method": dict(by_method),
    }


def run(query: str, label: str, provider: str, api: str) -> dict:
    started_at = datetime.now(timezone.utc)
    with httpx.Client(timeout=60.0) as client:
        health = client.get(f"{api}/health").json()

        t0 = _now()
        job_id = client.post(
            f"{api}/research",
            json={"query": query, "options": {"llm_provider": provider}},
        ).json()["job_id"]

        events = _stream_events(client, api, job_id, t0)
        wall = round(_now() - t0, 3)

        job = client.get(f"{api}/jobs/{job_id}").json()
        graph = client.get(f"{api}/graph/{job_id}").json()
        try:
            doc = client.get(f"{api}/jobs/{job_id}/document").json()
        except Exception:
            doc = {}

    resolved = next((e["t"] for e in events if e["type"] == "entity_resolved"), None)
    categories = job.get("categories", {})
    spans = _agent_spans(events)

    record = {
        "label": label,
        "query": query,
        "provider": provider,
        "llm_providers_configured": health.get("llm_providers", []),
        "job_id": job_id,
        "started_at": started_at.isoformat(),
        "entity": (job.get("entity") or {}).get("name"),
        "wall_seconds": wall,
        "resolve_seconds": round(resolved, 3) if resolved is not None else None,
        "agents": spans,
        "agents_completed": sum(1 for s in spans if s["status"] == "completed"),
        "agents_failed": sum(1 for s in spans if s["status"] == "failed"),
        "categories": {
            name: {
                "status": state.get("status"),
                "payload_bytes": len(json.dumps(state.get("payload") or {})),
            }
            for name, state in sorted(categories.items())
        },
        "graph": {
            "nodes": len(graph.get("nodes", [])),
            "edges": len(graph.get("links", [])),
            "node_types": dict(Counter(n["type"] for n in graph.get("nodes", []))),
            "edge_types": dict(Counter(e["type"] for e in graph.get("links", []))),
        },
        "documentary": {
            "method": doc.get("method"),
            "words": len((doc.get("markdown") or "").split()),
        },
        "layers": _layer_stats(events),
        "provenance": _provenance_since(started_at),
        "events": len(events),
    }
    return record


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query")
    parser.add_argument("--label", required=True)
    parser.add_argument("--provider", default="auto")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    record = run(args.query, args.label, args.provider, args.api)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{args.label}.json"
    path.write_text(json.dumps(record, indent=2), encoding="utf-8")

    # plain ASCII: Windows consoles default to cp1252 and choke on box-drawing/arrow glyphs
    print(
        f"{record['label']}: {record['entity'] or record['query']} - {record['wall_seconds']}s, "
        f"{record['agents_completed']}/{len(record['agents'])} agents, "
        f"{record['graph']['nodes']} nodes / {record['graph']['edges']} edges, "
        f"{record['documentary']['words']} doc words ({record['documentary']['method']}), "
        f"{record['provenance'].get('total', 0)} citations -> {path}"
    )


if __name__ == "__main__":
    main()
