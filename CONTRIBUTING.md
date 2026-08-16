# Contributing to Lynx

Thanks for your interest in improving Lynx. This is a monorepo with a Python/FastAPI backend
(`apps/api`) and a Next.js frontend (`apps/web`).

## Local setup

Prerequisites: **Node 20+** with `pnpm` (`corepack enable pnpm`) and [`uv`](https://docs.astral.sh/uv/).

```bash
cp .env.example .env          # optional: add an LLM key to enable narrative/graph extraction
cd apps/api && uv sync && cd ../..
pnpm install
pnpm dev                      # FastAPI on :8000, Next.js on :3000
```

The app runs with **no API keys** (degraded no-LLM mode). Add a free LLM key (e.g. Groq) and/or
a Firecrawl key in `.env` to unlock narrative, competitor extraction, and JS-heavy site reads.

## Before you open a PR

Run the same checks CI runs (see `.github/workflows/ci.yml`):

```bash
cd apps/api && uv run pytest        # backend unit tests
cd apps/web && pnpm exec tsc --noEmit && pnpm lint   # frontend typecheck + lint
```

If your change could affect how long a run takes or how much it finds, re-run the benchmark and say
what moved:

```bash
cd apps/api
uv run python ../../docs/bench.py "Microsoft" --label microsoft
uv run python ../../docs/bench_report.py        # regenerates the README's charts + summary
```

## Architecture notes

- **Adding a data source:** implement a module in `apps/api/src/app/sources/` that fetches and
  normalizes into the typed `SourceRecord` union. Go through `app.sources.http.fetcher` so you
  inherit caching, per-source rate limiting, and retries.
- **Adding a research agent:** add a module in `apps/api/src/app/agents/` exposing `category` and
  `async def run(ctx)`, then register it in `agents/orchestrator.py`. **Always `session.commit()`
  before calling `ctx.progress`/`ctx.emit`** — holding a write transaction open across an emit
  self-deadlocks SQLite. Failures are isolated, so return partial results rather than raising.
- **Frontend conventions:** one violet accent themed via CSS vars in `globals.css`; real
  iconography (`@phosphor-icons/react`); no colored status dots; honour `prefers-reduced-motion`.

## Guidelines

- Keep changes focused and covered by tests where practical (normalizers are pure and easy to test).
- Only free data sources in the default path; paid/keyed sources must degrade gracefully when the
  key is absent.
- Never commit secrets. `.env` is gitignored; put example keys only in `.env.example`.
- User-facing documentation lives in the app itself, under `apps/web/src/app/docs/` — a new page is
  a file there plus one entry in `apps/web/src/lib/docs-nav.ts`. Keep it accurate to the code;
  outdated docs are worse than none.
- Be excellent to each other: this project follows a [Code of Conduct](CODE_OF_CONDUCT.md).
  Security problems go through [SECURITY.md](SECURITY.md), not public issues.
