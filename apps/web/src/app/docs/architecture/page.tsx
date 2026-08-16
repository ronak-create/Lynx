import type { Metadata } from "next";
import { A, Callout, Code, CodeBlock, DocTitle, H2, H3, LI, Lead, P, Table, UL } from "@/components/docs/ui";

export const metadata: Metadata = {
  title: "Architecture",
  description: "The four phases of a run, the streaming layer, concurrency, and the graph data model.",
};

export default function ArchitecturePage() {
  return (
    <>
      <DocTitle eyebrow="How it works" title="Architecture" />
      <Lead>
        One backend owns everything to do with the outside world — fetching, normalising, storing,
        streaming. The frontend renders a run and never touches a data source. Between them sits a
        single job: a query in, a stream of events out, a graph and a document at rest.
      </Lead>

      <H2>Lifecycle of a run</H2>
      <CodeBlock
        code={`POST /research        -> job id, work starts in-process
  |
  +-- 0 resolve       which entity did you mean?
  |
  +-- 1 discovery     overview + profile — their own material
  |                   -> shared context for everyone below
  |
  +-- 2 investigation 13 agents, concurrent, failures isolated
  |                   stock financials funding products
  |                   web_presence people news social patents
  |                   competitors legitimacy signals careers
  |
  +-- 3 synthesis     scorecard / SWOT / merged timeline
  +-- 3 documentary   long-form prose, wiki-linked
  |                   (both run at the same time)
  |
  +-- job_completed

GET /jobs/{id}/events -> every step above, streamed live`}
      />
      <P>
        Phase 1 exists because everything downstream is better when it starts from what a company
        says about itself. The overview and profile agents run first and write into a shared context
        — the site dossier, the resolved description, the offerings list — which the other thirteen
        agents then read instead of starting blind. The products agent, for example, reuses the
        profile agent&rsquo;s already-extracted offerings rather than paying for a second LLM call.
      </P>

      <H2>Streaming and replay</H2>
      <P>
        Progress is pushed over Server-Sent Events. Every event is persisted with a monotonic
        sequence number before it is fanned out, so a reconnecting client sends{" "}
        <Code>Last-Event-ID</Code> and gets the gap replayed rather than restarting the run. Closing
        the tab does not cancel the job; reopening it catches up.
      </P>
      <Table
        head={["Event", "When", "Carries"]}
        rows={[
          ["job_started", "Run begins, and at each phase boundary", "A human-readable status message"],
          ["entity_resolved", "Resolution picks a root entity", "Entity id, name, description, ticker, Wikidata id"],
          ["agent_started", "An agent begins", "Category id"],
          ["agent_layers", "An agent moves down its source ladder", "Every rung with status, count and detail"],
          ["category_data", "An agent finishes with a payload", "The whole category payload"],
          ["agent_completed / agent_failed", "An agent ends", "Category id, or the error for a failure"],
          ["job_completed", "Synthesis and documentary are both done", "Final status"],
        ]}
      />

      <H2>Concurrency and failure isolation</H2>
      <UL>
        <LI>
          Agents run inside an <Code>asyncio.TaskGroup</Code> with a per-agent timeout. An agent that
          raises is caught, recorded as a failed category, and streamed as{" "}
          <Code>agent_failed</Code> — the run continues and finishes with everything else.
        </LI>
        <LI>
          Outbound HTTP goes through one shared fetcher with a global concurrency cap and per-source
          rate limiters, so a fifteen-way fan-out overlaps network waits without hammering any one
          host.
        </LI>
        <LI>
          LLM calls are capped at two in flight to stay under free-tier tokens-per-minute ceilings,
          with a chain fallback and a brief cooldown on 429.
        </LI>
        <LI>
          Synthesis and the documentary both read the collected results and don&rsquo;t depend on
          each other, so they run at the same time — a run ends when the slower of the two finishes,
          not their sum.
        </LI>
      </UL>

      <Callout tone="warn" title="If you write an agent: commit before you emit">
        Emitting an event persists it on a second connection. Doing that while holding an open write
        transaction makes SQLite wait on itself until the busy timeout fires and the agent dies.
        Always <Code>session.commit()</Code> before <Code>ctx.progress</Code> or <Code>ctx.emit</Code>.
      </Callout>

      <H2>The data model</H2>
      <P>
        Typed SQLAlchemy 2 models, UUID string keys, JSON columns and UTC timestamps — SQLite in WAL
        mode by default, and deliberately portable to Postgres without a schema rewrite.
      </P>
      <Table
        head={["Table", "Holds"]}
        rows={[
          ["entities", "Every node: company, person, product, technology, organization, investor, event, location, industry, article"],
          ["edges", "Typed relationships with confidence and provenance; unique on (src, dst, type)"],
          ["claims", "Atomic facts about an entity — predicate, value, confidence, provenance"],
          ["provenance", "Source id, URL, retrieval time, and whether the fact was extracted deterministically or by an LLM"],
          ["jobs / job_events", "A run and its full replayable event log"],
          ["category_results", "One finished agent payload per category, per job"],
          ["documents", "The generated documentary, tagged llm or template"],
          ["http_cache", "Response bodies keyed by request, with per-source TTLs"],
        ]}
      />

      <H3>Entity resolution</H3>
      <P>
        Nodes are deduplicated on a canonical key first and a normalised name second — legal
        suffixes stripped, so <em>Stripe</em>, <em>Stripe, Inc.</em> and <em>STRIPE LLC</em> collapse
        into one node instead of three. Enrichment never clobbers existing values, self-loops are
        rejected, and a root entity created from a disambiguation page is overwritten once the real
        article is found.
      </P>
      <P>
        Resolution itself is the quiet hard part. A bare name often lands on a disambiguation page,
        a person, or a fruit. When the top hit looks ambiguous, candidates are re-ranked by whether
        their description reads like an organisation and cross-checked against the SEC company
        directory — which is how <em>Lilly</em> becomes Eli Lilly and Company rather than a given
        name.
      </P>

      <H3>Graph extraction</H3>
      <P>
        Deterministic sources contribute their own typed edges. On top of that, one shared extraction
        schema — roughly nine entity types and twenty-two relationship types, capped per run — is
        reused by the news, competitors, profile, social and funding agents, so the graph densifies
        from several angles without each agent inventing its own vocabulary.
      </P>

      <H2>Frontend</H2>
      <UL>
        <LI>
          <Code>useJobEvents</Code> owns the SSE connection, tracks per-agent status and source
          ladders, and hydrates from the REST payload when you open a finished run.
        </LI>
        <LI>
          A highlight store is shared across views, which is what makes a wiki-link in the
          documentary light up the matching node in the graph.
        </LI>
        <LI>
          Settings and theme are persisted per browser; provider keys are held in memory unless you
          explicitly opt into saving them. See <A href="/docs/models">Models</A>.
        </LI>
      </UL>
    </>
  );
}
