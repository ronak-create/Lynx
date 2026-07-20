# Lynx — Business Research Platform

*Named for the lynx — proverbially sharp-sighted; the tool's whole job is to see everything about a business at a glance.*

Type a company name (or paste a URL) → 15 research agents fan out across free
data sources → results appear four ways:

1. **Dashboard** — a card per category, filling in live as each agent finishes. Layered into sections (Snapshot / Financials & funding / Coverage & community / People, products & IP) and led by an LLM-synthesised executive summary (scorecard + SWOT + merged timeline). Categories: overview, profile, stock, financials, funding, products, web presence, key people, news, community, patents, competitors, legitimacy, operational signals, careers.
2. **Knowledge graph** — an Obsidian-style force graph of entities and typed relationships (~9 node + ~22 edge types); click any node for its facts (with source citations) and connections.
3. **Documentary** — a generated long-form document whose key entities are wiki-linked and cross-highlight the graph, with a grounded RAG chat assistant alongside it.
4. **Careers** — live-only job postings aggregated across public ATS boards (Greenhouse, Lever, Ashby, SmartRecruiters), faceted by department and location.

Plus a **compare mode** (project two or more finished runs onto shared metric rows, winner
highlighted) and **realtime refresh** (pollable live quote + a diff banner of what changed
since the previous run of the same entity).

"Mirofish, but for researching businesses and digital products."

## Stack
- **Backend** (`apps/api`): Python 3.12 + FastAPI, SQLAlchemy 2 (SQLite/WAL), async multi-agent orchestrator with SSE progress streaming, per-source HTTP cache + rate limiting.
- **Frontend** (`apps/web`): Next.js 15 + TypeScript, Tailwind, TanStack Query, zustand, `react-force-graph-2d`.
- **Data sources** (all free): Wikipedia/Wikidata, SEC EDGAR (XBRL facts + filings), Yahoo Finance (yfinance), Google News RSS, GDELT, Hacker News (Algolia), GitHub, Reddit, public ATS boards (Greenhouse/Lever/Ashby/SmartRecruiters), Trustpilot, homepage tech fingerprinting, and domain trust probes (RDAP registration age + TLS + DNS-over-HTTPS). JS-heavy pages are read via a layered crawler (Jina Reader → Firecrawl → raw httpx). New/paid sources plug into the same adapter interface.
- **LLM** (optional, hybrid): deterministic parsers for structured data; an LLM handles entity/relationship extraction, per-node analysis, and documentary prose. Provider-agnostic (Groq / Cerebras / OpenRouter / Ollama via OpenAI-compatible APIs) with a fallback chain and a full **no-LLM degraded mode** (metadata-only graph + template documentary).

## Prerequisites
- Node 20+ and `pnpm` (`corepack enable pnpm`)
- [`uv`](https://docs.astral.sh/uv/) (provisions Python 3.12 automatically)

## Setup
```bash
cp .env.example .env          # optional: add an LLM key to enable narrative/graph extraction
cd apps/api && uv sync && cd ../..
pnpm install
```

## Run
```bash
pnpm dev        # starts FastAPI on :8000 and Next.js on :3000
```
Open http://localhost:3000, type a company, hit enter.

Runs work with **no API keys at all** — you get the full dashboard, a metadata graph, and a
template documentary. Add a free LLM key (e.g. Groq) in `.env` to unlock the narrative
history, competitor extraction, per-node analysis, and richer documentary.

### Config (per search)
Click **Model & options** on the search page to choose:
- **Model** — Auto (best configured provider), No LLM (template mode), or a specific provider.
- **Research categories** — which agents to run.
Choices persist in the browser and are sent with each research request.

## Verify
```bash
cd apps/api && uv run pytest        # normalizer/dedup/LLM-fallback unit tests
```
End-to-end smoke: research "Microsoft" (public, full data), "Anthropic" (private → stock
gracefully absent), and a URL like `https://figma.com`.

## Layout
```
apps/api/src/app/
  sources/      # one adapter per data source (fetch -> normalize -> typed record)
  agents/       # orchestrator + one agent per category + entity resolution
  jobs/         # async job manager, SSE fan-out with event replay
  graph/        # entity resolution/dedup + LLM extraction schema
  llm/          # provider-agnostic client, fallback chain, per-run selection
  documentary/  # documentary generator (LLM + template fallback)
  rag/          # grounded retrieval for the Documentary-tab chat assistant
  db/           # SQLAlchemy models (Postgres-portable)
apps/web/src/
  app/          # / (search), /research/[jobId] (Dashboard|Graph|Documentary|Careers), /compare
  components/   # cards, GraphView, NodePanel, DocumentaryView, DocChat, CareersView, SettingsPanel
  hooks/        # useJobEvents (SSE with Last-Event-ID replay)
  stores/       # highlight (cross-view), settings + theme (persisted)
```

## Known refinements
- SEC XBRL parsing for **older** fiscal years occasionally picks a mis-tagged value; recent years are accurate. Isolated in `sources/sec_edgar.py`.
- yfinance is scraping-based and can break; it degrades to "quote unavailable" rather than failing the run.
