"""Turn the JSON records written by bench.py into the charts and tables the README shows.

    cd apps/api && uv run python ../../docs/bench_report.py

Writes docs/benchmarks/*.svg and docs/benchmarks/summary.md. Nothing here invents a number:
every value is read straight out of a run record, so regenerating after your own benchmark run
replaces the README's figures with yours.

The SVGs are deliberately theme-neutral — no background fill, mid-tone label colours — so the
same file is legible on a light or a dark README.
"""
from __future__ import annotations

import json
from pathlib import Path

BENCH_DIR = Path(__file__).resolve().parent / "benchmarks"

INK = "#8b8fa3"  # labels: readable on white and on near-black
INK_STRONG = "#a9adbe"
ACCENT = "#8b7bff"
ACCENT_SOFT = "#8b7bff55"
GRID = "#8b8fa333"
FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"

ORDER = ["microsoft", "anthropic", "duolingo", "figma", "anthropic-no-llm"]


def load() -> dict[str, dict]:
    runs: dict[str, dict] = {}
    for path in sorted(BENCH_DIR.glob("*.json")):
        runs[path.stem] = json.loads(path.read_text(encoding="utf-8"))
    return runs


def _esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _svg(width: int, height: int, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" font-family="{FONT}" role="img">\n{body}\n</svg>\n'
    )


def timeline_chart(run: dict) -> str:
    """Gantt of one run: when each agent started and how long it held the floor."""
    agents = run["agents"]
    total = run["wall_seconds"]
    row_h, pad_l, pad_t, pad_r, pad_b = 22, 116, 34, 58, 34
    width = 900
    plot_w = width - pad_l - pad_r
    height = pad_t + row_h * len(agents) + pad_b

    parts = [
        f'<text x="0" y="16" fill="{INK_STRONG}" font-size="13" font-weight="600">'
        f'{_esc(run["entity"] or run["query"])} — {len(agents)} agents in {total:.0f}s</text>'
    ]

    # x grid every 10s (or 20s for long runs)
    step = 20 if total > 90 else 10
    tick = 0
    while tick <= total:
        x = pad_l + plot_w * (tick / total)
        parts.append(f'<line x1="{x:.1f}" y1="{pad_t - 8}" x2="{x:.1f}" y2="{height - pad_b + 4}" stroke="{GRID}"/>')
        parts.append(
            f'<text x="{x:.1f}" y="{height - pad_b + 20}" fill="{INK}" font-size="10" '
            f'font-family="{MONO}" text-anchor="middle">{tick}s</text>'
        )
        tick += step

    for i, agent in enumerate(agents):
        y = pad_t + i * row_h
        x0 = pad_l + plot_w * (agent["start"] / total)
        x1 = pad_l + plot_w * (agent["end"] / total)
        bar_w = max(x1 - x0, 2.0)
        parts.append(
            f'<text x="{pad_l - 10}" y="{y + 12}" fill="{INK}" font-size="11" '
            f'font-family="{MONO}" text-anchor="end">{_esc(agent["category"])}</text>'
        )
        parts.append(
            f'<rect x="{x0:.1f}" y="{y + 3}" width="{bar_w:.1f}" height="13" rx="3" '
            f'fill="{ACCENT if agent["seconds"] >= 1 else ACCENT_SOFT}"/>'
        )
        parts.append(
            f'<text x="{x1 + 6:.1f}" y="{y + 13}" fill="{INK}" font-size="10" '
            f'font-family="{MONO}">{agent["seconds"]:.1f}s</text>'
        )

    return _svg(width, height, "\n".join(parts))


def runs_chart(runs: dict[str, dict]) -> str:
    """Wall-clock time per benchmarked run, longest first."""
    rows = [(label, runs[label]) for label in ORDER if label in runs]
    row_h, pad_l, pad_t, pad_r, pad_b = 34, 150, 30, 120, 16
    width = 900
    plot_w = width - pad_l - pad_r
    height = pad_t + row_h * len(rows) + pad_b
    longest = max(run["wall_seconds"] for _, run in rows)

    parts = [
        f'<text x="0" y="14" fill="{INK_STRONG}" font-size="13" font-weight="600">'
        f"End-to-end wall time per run</text>"
    ]
    for i, (label, run) in enumerate(rows):
        y = pad_t + i * row_h
        bar_w = plot_w * (run["wall_seconds"] / longest)
        graph = run["graph"]
        doc = run["documentary"]
        parts.append(
            f'<text x="{pad_l - 12}" y="{y + 15}" fill="{INK_STRONG}" font-size="12" '
            f'text-anchor="end">{_esc(label)}</text>'
        )
        parts.append(f'<rect x="{pad_l}" y="{y + 3}" width="{bar_w:.1f}" height="16" rx="3" fill="{ACCENT}"/>')
        parts.append(
            f'<text x="{pad_l + bar_w + 8:.1f}" y="{y + 16}" fill="{INK}" font-size="11" '
            f'font-family="{MONO}">{run["wall_seconds"]:.1f}s</text>'
        )
        parts.append(
            f'<text x="{pad_l}" y="{y + 30}" fill="{INK}" font-size="10">'
            f'{graph["nodes"]} nodes · {graph["edges"]} edges · {doc["words"]} doc words '
            f'({doc["method"]}) · {run["provenance"].get("total", 0)} citations</text>'
        )
    return _svg(width, height, "\n".join(parts))


def sources_chart(run: dict) -> str:
    """Which sources actually produced cited facts in one run."""
    by_source = run["provenance"]["by_source"]
    rows = sorted(by_source.items(), key=lambda kv: -kv[1])
    row_h, pad_l, pad_t, pad_r, pad_b = 20, 110, 30, 60, 12
    width = 560
    plot_w = width - pad_l - pad_r
    height = pad_t + row_h * len(rows) + pad_b
    top = max(by_source.values())

    parts = [
        f'<text x="0" y="14" fill="{INK_STRONG}" font-size="13" font-weight="600">'
        f'Cited facts by source — {_esc(run["entity"] or run["query"])}</text>'
    ]
    for i, (source, count) in enumerate(rows):
        y = pad_t + i * row_h
        bar_w = max(plot_w * (count / top), 2.0)
        parts.append(
            f'<text x="{pad_l - 10}" y="{y + 12}" fill="{INK}" font-size="11" '
            f'font-family="{MONO}" text-anchor="end">{_esc(source)}</text>'
        )
        parts.append(f'<rect x="{pad_l}" y="{y + 2}" width="{bar_w:.1f}" height="12" rx="3" fill="{ACCENT}"/>')
        parts.append(
            f'<text x="{pad_l + bar_w + 6:.1f}" y="{y + 12}" fill="{INK}" font-size="10" '
            f'font-family="{MONO}">{count}</text>'
        )
    return _svg(width, height, "\n".join(parts))


def summary_md(runs: dict[str, dict]) -> str:
    rows = [(label, runs[label]) for label in ORDER if label in runs]
    lines = [
        "# Benchmark summary",
        "",
        "Generated by `docs/bench_report.py` from the run records in this directory.",
        "Each record is one real run against live sources — see `docs/bench.py`.",
        "",
        "| run | query | wall | agents | graph | documentary | cited facts |",
        "| --- | --- | ---: | ---: | ---: | --- | ---: |",
    ]
    for label, run in rows:
        graph = run["graph"]
        doc = run["documentary"]
        lines.append(
            f'| `{label}` | {run["query"]} | {run["wall_seconds"]:.1f}s | '
            f'{run["agents_completed"]}/{len(run["agents"])} | '
            f'{graph["nodes"]}n / {graph["edges"]}e | '
            f'{doc["words"]} words ({doc["method"]}) | {run["provenance"].get("total", 0)} |'
        )

    lines += ["", "## Slowest agent per run", "", "| run | agent | seconds |", "| --- | --- | ---: |"]
    for label, run in rows:
        slowest = max(run["agents"], key=lambda a: a["seconds"])
        lines.append(f'| `{label}` | `{slowest["category"]}` | {slowest["seconds"]:.1f}s |')

    lines += ["", "## Source ladder rungs reported", "", "| run | rungs | hit | empty | skipped |", "| --- | ---: | ---: | ---: | ---: |"]
    for label, run in rows:
        by_status = run["layers"]["by_status"]
        lines.append(
            f'| `{label}` | {run["layers"]["total"]} | {by_status.get("hit", 0)} | '
            f'{by_status.get("empty", 0)} | {by_status.get("skipped", 0)} |'
        )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    runs = load()
    if not runs:
        raise SystemExit("no benchmark records found — run docs/bench.py first")

    primary = runs.get("microsoft") or next(iter(runs.values()))
    outputs = {
        "agent-timeline.svg": timeline_chart(primary),
        "runs.svg": runs_chart(runs),
        "sources.svg": sources_chart(primary),
        "summary.md": summary_md(runs),
    }
    for name, content in outputs.items():
        (BENCH_DIR / name).write_text(content, encoding="utf-8")
        print(f"wrote docs/benchmarks/{name}")


if __name__ == "__main__":
    main()
