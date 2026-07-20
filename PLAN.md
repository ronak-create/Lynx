# Business Research Platform — Implementation Plan

## Vision
A tech-business research platform: type a company/product name (autocomplete) or paste a URL → a multi-agent pipeline gathers everything about that entity from free sources → results are shown three ways:

1. **Paneled dashboard** — one card per data category, filling in live as agents finish
2. **Obsidian-style knowledge graph** — entities as nodes, typed relationships as edges, click a node for per-node analysis with citations
3. **Documentary** — a long-form generated document where keywords are wiki-linked (`[[...]]`) to entities, cross-highlighted with the graph

"Mirofish, but for researching businesses and digital products."

## Decisions (agreed)
- **MVP = vertical slice**, 8 categories: overview, news, financials, products, web presence, stock, key people, competitors.
- **Data**: free APIs first — Wikipedia/Wikidata, SEC EDGAR, yfinance, GDELT DOC 2.0, Google News RSS, HN Algolia, GitHub — plus Firecrawl/Apify free tiers for JS-heavy pages. Paid enrichment (Apollo, etc.) plugs in later through the same adapter interface. No custom ban-evasion tooling.
- **Stack**: Next.js 15 + TypeScript frontend; Python 3.12 FastAPI backend (via uv); SQLite in WAL mode (schema kept Postgres-portable); `react-force-graph-2d` for the graph (same d3-force model as Obsidian's graph).
- **LLM**: hybrid rules + LLM. Deterministic parsers for structured data; LLM only for entity/relationship extraction, per-node analysis, documentary prose. Provider-agnostic layer — free OpenAI-compatible providers first (Groq, Cerebras, OpenRouter free models, local Ollama) with a fallback chain, and a full **no-LLM degraded mode** (metadata-only graph + template documentary). Claude API pluggable later as a paid tier.

## Repo layout
```
C:\Business-research\
├── package.json               # root scripts (concurrently)
├── pnpm-workspace.yaml
├── apps/
│   ├── web/                   # Next.js 15 App Router, Tailwind, TanStack Query, zustand
│   │   └── src/
│   │       ├── app/           # / (search), /research/[runId] (Dashboard|Graph|Documentary)
│   │       ├── components/    # cards, graph view, node panel, documentary renderer
│   │       ├── lib/api/       # typed fetch + SSE client
│   │       └── stores/        # cross-view highlight state
│   └── api/                   # FastAPI (uv, Python 3.12)
│       └── src/app/
│           ├── main.py  config.py
│           ├── api/           # routers: research, jobs (SSE), entities, autocomplete
│           ├── db/            # SQLAlchemy 2 models, engine (WAL), repo
│           ├── jobs/          # JobManager: asyncio tasks + SSE fan-out + event replay
│           ├── agents/        # orchestrator + one agent per category
│           ├── sources/       # SourceAdapter protocol + registry + one module per source
│           ├── llm/           # provider-agnostic client, fallback chain, degraded mode
│           ├── graph/         # LLM extraction schema, entity resolution/dedup
│           └── documentary/   # generator + Jinja2 template fallback
└── data/                      # research.db, gitignored
```

## Backend architecture
- `POST /research` → creates job → `asyncio.create_task`; orchestrator runs all agents in a `TaskGroup`, each failure isolated (partial results are first-class). Global semaphore caps outbound fetches.
- **Progress = SSE** (`sse-starlette`): events persisted to `job_events` with monotonic `seq`, so `Last-Event-ID` replay survives page refresh. Event types: `job_started`, `agent_started/progress/completed/failed`, `category_data` (finished card payload), `graph_delta`, `job_completed`.
- **SourceAdapter protocol**: `fetch(query) → RawResponse` (I/O) + `normalize(raw) → list[SourceRecord]` (pure, unit-testable). Records are a discriminated union (Article, PriceSeries, Filing, Funding, Product, Person, Repo, Link, Fact) each carrying `source_id`, `source_url`, `retrieved_at`.
- **Caching**: `http_cache` table keyed by request hash, per-source TTL (stock 15 min, Wikipedia 7 d, news 1 h). **Rate limiting**: `aiolimiter` per source; SEC/Wikipedia get proper User-Agent + contact email.
- **Graph model**: `entities` (dedup via `canonical_key`: `wikidata:Q95`, `ticker:MSFT`, `domain:x.com`), `edges` (typed: FOUNDED_BY, MAKES, COMPETES_WITH, ACQUIRED, INVESTED_IN, USES_TECH…, with confidence + provenance), `claims` (atomic cited facts), `provenance`, plus `jobs`, `job_events`, `category_results`, `documents`, `http_cache`.

## Source map (MVP)
| Category | Sources |
|---|---|
| Overview | Wikipedia REST summary + Wikidata claims |
| News | GDELT 2.0 (tone = free pos/neg signal) + Google News RSS + HN Algolia |
| Financials | SEC EDGAR (tickers, submissions, XBRL companyfacts); Wikipedia for private cos |
| Products | Wikidata P1056 + official-site scrape (Firecrawl free tier) |
| Web presence | Wikidata social-property claims + GitHub org API + HN |
| Stock | yfinance (deterministic only) |
| People | Wikidata P169/P112 + SEC DEF 14A |
| Competitors | LLM extraction over Wikipedia/news; Wikidata same-industry fallback |

Autocomplete: Wikipedia opensearch merged with SEC `company_tickers.json` (cached, rapidfuzz). URL input → homepage title/OG tags → same resolution.

## LLM layer
Groq/Cerebras/OpenRouter/Ollama are all OpenAI-compatible → one thin client (`openai` SDK + base_url override). `LLMClient.extract()` returns schema-validated pydantic (one repair-retry) or `None`; `None` → agent takes the deterministic path. Chain fallback on 429/5xx, 5-min circuit breaker per provider. Documentary: per-section LLM generation with entity alias list injected (`[[...]]` links), Jinja2 template fallback when no LLM available.

## Build order
- **Phase 0** — scaffold: workspace, Next app, FastAPI hello, DB schema, dev proxy, `pnpm dev` runs both
- **Phase 1** — vertical slice: resolution, jobs + SSE, overview + stock agents, search page, first cards
- **Phase 2** — all 8 agents + full dashboard + normalizer unit tests
- **Phase 3** — LLM layer + graph extraction + graph view + node panel
- **Phase 4** — documentary (template first, then LLM) + cross-highlighting
- **Phase 5** — polish: run history, refresh, private-company edge cases, README

## Verification
1. `pnpm install && pnpm dev` → open http://localhost:3000
2. `uv run pytest` in apps/api (normalizer fixtures, dedup, LLM fallback mocks, SSE replay)
3. Smoke matrix: "Microsoft" (public), "Anthropic" (private → stock gracefully absent), URL input (figma.com); refresh mid-run must resume stream
4. Degraded mode: no LLM keys set → runs still complete with metadata graph + template documentary
5. Re-run same company → completes fast from http_cache

## Known risks
- yfinance breaks occasionally → isolated behind adapter (swap to Stooq/Alpha Vantage free)
- GDELT slow → tight timeout, Google News RSS co-source
- Free LLM tiers rate-limit hard → small batches, chain fallback, degraded mode as safety net
