import type { Metadata } from "next";
import { A, Callout, Code, CodeBlock, DocTitle, H2, H3, LI, Lead, P, Table, UL } from "@/components/docs/ui";

export const metadata: Metadata = {
  title: "Agents",
  description: "Every research agent, the question it answers, where it looks, and how to add your own.",
};

const AGENTS: [string, string, string][] = [
  ["overview", "Who are they, in one paragraph, with the headline facts", "Wikipedia, Wikidata, GLEIF"],
  ["profile", "What do they actually sell, and how do they make money", "Deep site crawl → LLM extraction"],
  ["stock", "Price, market cap, P/E, 52-week range, a sparkline", "Yahoo Finance"],
  ["financials", "Revenue and net income by fiscal year, plus filings", "SEC EDGAR XBRL facts"],
  ["funding", "Rounds, investors, total raised, valuation", "Web search → LLM extraction"],
  ["products", "The product line", "Wikidata → site offerings → web search"],
  ["web_presence", "Repos, developer footprint, official channels", "GitHub, Hacker News, site + Wikidata links"],
  ["people", "Founders, executives, board", "Wikidata → crawled site → web search"],
  ["news", "Recent coverage and its tone", "Google News RSS, Hacker News"],
  ["social", "What the community is saying", "Reddit → web search fallback"],
  ["patents", "Granted patents and their dates", "PatentsView"],
  ["competitors", "Who they are measured against", "Wikipedia → site + web corpus"],
  ["legitimacy", "Is this a real, established business", "RDAP, TLS, DNS-over-HTTPS, Wayback, GLEIF, site substance"],
  ["signals", "Tech stack, hiring volume, review score", "Homepage fingerprint, ATS boards, Trustpilot"],
  ["careers", "Open roles right now, by department and location", "Greenhouse, Lever, Ashby, SmartRecruiters"],
];

export default function AgentsPage() {
  return (
    <>
      <DocTitle eyebrow="How it works" title="Agents" />
      <Lead>
        An agent owns exactly one question. It walks a ladder of sources for that question, reports
        each rung it tried, writes typed records with provenance, and returns a payload — or returns
        an empty one rather than taking the run down with it.
      </Lead>

      <H2>The fifteen</H2>
      <Table
        head={["Category", "Answers", "Looks in"]}
        rows={AGENTS.map(([id, answers, sources]) => [
          <Code key={id}>{id}</Code>,
          answers,
          <span key={`${id}-s`} className="text-[var(--faint)]">
            {sources}
          </span>,
        ])}
      />
      <P>
        Two more passes run after them and are not selectable categories, because a run without
        either would be missing its conclusion: <Code>synthesis</Code> produces the scorecard, SWOT
        and merged timeline, and <Code>documentary</Code> writes the long-form narrative.
      </P>

      <H2>Source ladders</H2>
      <P>
        Most agents don&rsquo;t have one source, they have a ranked list. The people agent tries
        Wikidata first because it is structured and authoritative; if the company is private and
        nobody has a Wikidata entry, it reads the company&rsquo;s own site; if the site is a landing
        page with no team section, it falls back to web search over press coverage. It stops at the
        first rung that answers.
      </P>
      <P>
        Each rung&rsquo;s outcome is streamed to the UI — hit, empty, skipped or failed, with a
        count — so a thin answer is legible as &ldquo;the two good sources had nothing&rdquo; rather
        than looking like a bug. Results across rungs are deduplicated with the highest-authority
        layer winning, and where entries carry dates, the freshest wins.
      </P>

      <H2>Selecting agents per run</H2>
      <P>
        <strong className="text-[var(--text-strong)]">Model &amp; options</strong> on the search page
        toggles categories; the choice is sent with the request and persisted in the browser. The
        same field exists on the API:
      </P>
      <CodeBlock
        code={`curl -X POST localhost:8000/research \\
  -H 'content-type: application/json' \\
  -d '{"query":"Stripe","options":{"categories":["overview","legitimacy","careers"]}}'`}
      />

      <H2>Writing an agent</H2>
      <P>
        An agent is a module in <Code>apps/api/src/app/agents/</Code> exposing a{" "}
        <Code>category</Code> string and an async <Code>run(ctx)</Code>, registered in the
        orchestrator&rsquo;s agent list. Everything else — scheduling, timeouts, persistence,
        streaming, failure isolation — is handled for you.
      </P>
      <CodeBlock
        code={`# apps/api/src/app/agents/awards.py
from app.agents.base import AgentContext

category = "awards"


async def run(ctx: AgentContext) -> dict:
    name = ctx.root["name"]
    ctx.progress("searching award registries")

    records = await some_source.awards(name)   # shared fetcher
    if not records:
        return {"awards": []}                  # empty beats raising

    with get_session() as session:
        ...                                    # claims + provenance
        session.commit()                       # ALWAYS before emitting

    ctx.progress(f"found {len(records)} awards")
    return {"awards": [r.model_dump() for r in records]}`}
      />
      <UL>
        <LI>
          Register it in <Code>agents/orchestrator.py</Code> and give it a label in{" "}
          <Code>api/config.py</Code> and the frontend&rsquo;s label map so it appears in the picker.
        </LI>
        <LI>
          Return partial results rather than raising. A failed agent costs a card; a raised
          exception inside a write transaction can cost the run.
        </LI>
        <LI>
          If the agent has more than one source, use the layer tracker so its ladder shows up in the
          progress rail like every other agent&rsquo;s.
        </LI>
      </UL>

      <Callout title="Where the LLM belongs">
        Parse anything structured deterministically — it is faster, free, and works in degraded
        mode. Reach for the model only for genuinely unstructured work: pulling entities out of
        prose, or writing prose. Any agent that uses one must still return something sensible when{" "}
        <Code>ctx.llm</Code> is unavailable. See <A href="/docs/models">Models &amp; degraded mode</A>.
      </Callout>

      <H3>Talking to other agents</H3>
      <P>
        <Code>ctx.shared</Code> is the conversation between agents: the profile agent&rsquo;s site
        dossier, the resolved site URL, the offerings list. Read from it before fetching anything —
        several agents get their answer for free that way.
      </P>
    </>
  );
}
