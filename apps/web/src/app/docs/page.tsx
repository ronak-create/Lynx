import type { Metadata } from "next";
import Link from "next/link";
import { A, Callout, CodeBlock, DocTitle, H2, LI, Lead, P, Table, UL } from "@/components/docs/ui";
import { DOCS_NAV } from "@/lib/docs-nav";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Overview",
  description: "What Lynx does, what a research run produces, and how the system fits together.",
};

export default function DocsOverviewPage() {
  return (
    <>
      <DocTitle eyebrow="Docs" title="Overview" />
      <Lead>
        Lynx turns a company name or a URL into a researched dossier. Fifteen agents fan out across
        public sources, stream their findings back as they land, and the run ends with a dashboard,
        a knowledge graph, a written documentary and a live careers board — every fact carrying the
        source it came from.
      </Lead>

      <H2>What a run produces</H2>
      <Table
        head={["View", "What it is", "Built from"]}
        rows={[
          [
            "Dashboard",
            "A card per category, filling in live, led by a synthesised executive summary with a scorecard, SWOT and merged timeline.",
            "Every agent + the synthesis pass",
          ],
          [
            "Knowledge graph",
            "A force-directed map of ~9 entity types and ~22 relationship types; click a node for its facts, citations and connections.",
            "Entity resolution + LLM extraction",
          ],
          [
            "Documentary",
            "A long-form write-up with wiki-linked entities that cross-highlight the graph, plus a chat assistant grounded in the run.",
            "Documentary generator + RAG retriever",
          ],
          [
            "Careers",
            "Open roles pulled live from public applicant-tracking boards, faceted by department and location.",
            "The careers agent",
          ],
        ]}
      />
      <P>
        Two finished runs can also be projected onto shared metric rows in compare mode, and
        re-running an entity produces a diff of what moved since the previous run.
      </P>

      <H2>The shape of the system</H2>
      <P>
        A monorepo with two apps. The backend owns fetching, normalising, storing and streaming; the
        frontend owns presentation and never talks to a data source directly.
      </P>
      <CodeBlock
        code={`apps/api/src/app/
  sources/      one adapter per source: fetch -> typed record
  agents/       orchestrator + one agent per category
  jobs/         async job manager, SSE fan-out with replay
  graph/        entity resolution/dedup + extraction schema
  llm/          provider-agnostic client + fallback chain
  documentary/  generator (LLM + template fallback)
  rag/          grounded retrieval for the doc chat
  db/           SQLAlchemy models (Postgres-portable)

apps/web/src/
  app/          / · /research/[jobId] · /compare · /docs · /about
  components/   cards, GraphView, NodePanel, DocChat, Careers
  hooks/        useJobEvents (SSE with Last-Event-ID replay)
  stores/       highlight (cross-view), settings + theme`}
      />

      <H2>Three ideas worth knowing</H2>
      <UL>
        <LI>
          <strong className="text-[var(--text-strong)]">Source ladders.</strong> An agent doesn&rsquo;t
          query one API — it walks a ranked list of sources from most authoritative to most
          improvised and stops at the first rung that answers. The ladder and each rung&rsquo;s
          result are streamed to the UI, so you can see <em>why</em> a fact is thin.
        </LI>
        <LI>
          <strong className="text-[var(--text-strong)]">Isolated failure.</strong> Agents are run in
          a task group with per-agent timeouts and exception isolation. A source being down costs
          you one card, never the run.
        </LI>
        <LI>
          <strong className="text-[var(--text-strong)]">The LLM is optional.</strong> Structured data
          is parsed deterministically. A model is only used for the jobs a parser can&rsquo;t do, and
          the whole app has a fully working no-LLM path.
        </LI>
      </UL>

      <Callout title="Reproducible numbers">
        Every performance figure quoted for Lynx comes from{" "}
        <A href={`${SITE.repo}/blob/main/docs/bench.py`}>docs/bench.py</A>, and the raw run records
        are committed under <code className="font-mono">docs/benchmarks/</code>. Run it yourself and
        the README&rsquo;s tables regenerate from your own machine.
      </Callout>

      <H2>Where to go next</H2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {DOCS_NAV.flatMap((section) => section.pages)
          .filter((page) => page.href !== "/docs")
          .map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="press rounded-xl border border-[var(--border)] p-4 hover:border-[var(--border-strong)]"
            >
              <span className="block text-[14px] font-semibold text-[var(--text-strong)]">{page.label}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-[var(--muted)]">{page.summary}</span>
            </Link>
          ))}
      </div>
    </>
  );
}
