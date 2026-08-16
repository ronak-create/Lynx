import type { Metadata } from "next";
import { A, Callout, Code, CodeBlock, DocTitle, H2, H3, Lead, P } from "@/components/docs/ui";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ & troubleshooting",
  description: "Known limits, common failure modes, and what to do about them.",
};

export default function FaqPage() {
  return (
    <>
      <DocTitle eyebrow="Reference" title="FAQ & troubleshooting" />
      <Lead>
        Most surprises with Lynx come from the sources, not the code — free endpoints throttle,
        block, and occasionally change shape. Here is what that looks like from the inside, and
        which of it is worth reporting.
      </Lead>

      <H2>Using it</H2>

      <H3>Do I need an API key?</H3>
      <P>
        No. Every dashboard card, the metadata graph, the careers board and a template documentary
        work with an empty <Code>.env</Code>. A model key upgrades extraction and prose; a Firecrawl
        key only raises the ceiling on hard pages. Start with neither.
      </P>

      <H3>If I add one key, which?</H3>
      <P>
        A free Groq key. It switches on entity extraction, per-node analysis and the written
        documentary — the biggest visible difference for the least setup. See{" "}
        <A href="/docs/models">Models</A>.
      </P>

      <H3>Can I research a small private company?</H3>
      <P>
        Yes — that is what the profile, people, products and funding ladders exist for. With no
        Wikipedia or SEC footprint, resolution starts from the company&rsquo;s own site, so pasting
        the URL rather than the name gives a better run.
      </P>

      <H2>When a card comes back thin</H2>

      <H3>&ldquo;Not publicly traded&rdquo; for a company I know is listed</H3>
      <P>
        Stock and financials both hang off the SEC directory match. If resolution attaches no
        ticker, both fall back to their private-company message. Historically this also misfired on
        companies whose SEC title is punctuated <Code>&quot;Name, Inc.&quot;</Code> — fixed, with a
        regression test. If you still see it, the entity name that resolved is the thing to check
        first, and it is worth <A href={SITE.issues}>opening an issue</A>.
      </P>

      <H3>Older fiscal years look wrong in financials</H3>
      <P>
        XBRL tagging for older years is inconsistent across filers, and the parser occasionally picks
        a mis-tagged value. Recent years are accurate. The logic is isolated in{" "}
        <Code>sources/sec_edgar.py</Code> if you want to harden it.
      </P>

      <H3>The quote is missing</H3>
      <P>
        Market data is scraping-based and does break. It degrades to &ldquo;quote
        unavailable&rdquo; rather than failing the run.
      </P>

      <H3>Community is empty, or came from the web instead of Reddit</H3>
      <P>
        Reddit returns 403 to a lot of hosts and datacentre IPs. The agent falls through to web
        search, which is why the payload sometimes says the source was the web. Not a bug.
      </P>

      <H3>Patents are always empty</H3>
      <P>
        The free PatentsView endpoint moved behind a key and its legacy host redirects. The agent
        degrades to empty rather than failing.
      </P>

      <H3>Search-backed agents returned nothing</H3>
      <P>
        DuckDuckGo answers a burst of automated requests with a 202 or a 403. The search ladder tries
        the HTML endpoint, then Lite, then Firecrawl if a key exists. Slowing down — or adding a
        Firecrawl key — is the fix.
      </P>

      <H2>The model</H2>

      <H3>I set a key but the documentary is still a template</H3>
      <P>Three usual causes, in order of likelihood:</P>
      <P>
        <strong className="text-[var(--text-strong)]">Rate limits.</strong> Free tiers 429 constantly
        under a fifteen-way fan-out. Lynx cools a provider down briefly, falls through the chain, and
        waits a short cooldown out once rather than degrading — but back-to-back heavy runs can still
        exhaust the window.{" "}
        <strong className="text-[var(--text-strong)]">A model your key can&rsquo;t reach.</strong> A{" "}
        <Code>model_not_found</Code> is treated as a provider failure and skipped, which looks
        identical to having no key.{" "}
        <strong className="text-[var(--text-strong)]">Selection.</strong> Check the run wasn&rsquo;t
        started with <Code>No LLM</Code> still selected in <strong>Model &amp; options</strong>.
      </P>
      <CodeBlock
        code={`curl localhost:8000/health
{"status":"ok","llm_providers":["groq","cerebras"]}   # empty list = nothing configured`}
      />

      <H2>Running it</H2>

      <H3>A run is stuck, or says it was interrupted</H3>
      <P>
        Jobs run inside the API process, so restarting the backend orphans anything in flight. Those
        jobs are marked failed on the next boot rather than streaming forever. Start the run again.
      </P>

      <H3>The frontend can&rsquo;t reach the API</H3>
      <P>
        Check <Code>NEXT_PUBLIC_API_URL</Code> (baked in at build time) and{" "}
        <Code>CORS_ORIGINS</Code> on the API. A blocked browser request is nearly always one of
        those two. See <A href="/docs/self-hosting">Self-hosting</A>.
      </P>

      <H3>Port 8000 is busy after a crash on Windows</H3>
      <P>
        A killed reloader can leave a child process holding the socket, which produces the confusing
        state of two servers on one port and requests randomly hitting stale code. Kill every
        listener on the port — including <Code>multiprocessing</Code> children — and confirm exactly
        one before restarting.
      </P>

      <Callout title="Reporting something">
        Bugs and source breakages are genuinely useful — a source changing shape is the most common
        failure in a tool like this. Open an <A href={SITE.issues}>issue</A> with the query you ran
        and which card was wrong, or come to <A href={SITE.discord}>Discord</A>. Contribution
        conventions live in <A href={`${SITE.repo}/blob/main/CONTRIBUTING.md`}>CONTRIBUTING.md</A>.
      </Callout>
    </>
  );
}
