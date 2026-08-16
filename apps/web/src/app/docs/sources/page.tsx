import type { Metadata } from "next";
import { A, Callout, Code, CodeBlock, DocTitle, H2, H3, LI, Lead, P, Table, UL } from "@/components/docs/ui";

export const metadata: Metadata = {
  title: "Data sources",
  description: "Every source Lynx reads, how caching and rate limiting work, and how to add an adapter.",
};

const SOURCES: [string, string, string][] = [
  ["SEC EDGAR", "Filings + XBRL company facts", "free · keyless"],
  ["Wikipedia", "Summary, article text, disambiguation handling", "free · keyless"],
  ["Wikidata", "Structured facts: founding, HQ, people, products, links", "free · keyless"],
  ["Yahoo Finance", "Quote, market cap, ratios, price series", "free · scraping-based"],
  ["Google News RSS", "Recent coverage", "free · keyless"],
  ["Hacker News (Algolia)", "Discussion and developer coverage", "free · keyless"],
  ["GitHub", "Public repos, stars, languages", "free · keyless"],
  ["Reddit", "Community sentiment", "free · often 403s, falls back to web search"],
  ["PatentsView", "Granted patents", "free · endpoint availability varies"],
  ["GLEIF", "Legal Entity Identifier registry", "free · keyless"],
  ["RDAP", "Domain registration age", "free · keyless"],
  ["DNS-over-HTTPS", "A and MX records", "free · keyless"],
  ["TLS handshake", "Certificate issuer and expiry", "free · stdlib"],
  ["Wayback Machine", "First archived capture, years active", "free · keyless"],
  ["Trustpilot", "Review score", "free · needs a scrape fallback"],
  ["X syndication", "Recent posts from a company handle", "free · unauthenticated, rate-limited"],
  ["Greenhouse / Lever / Ashby / SmartRecruiters", "Live open roles", "free · keyless"],
  ["Jina Reader", "Renders JS-heavy pages to markdown", "free · keyless"],
  ["DuckDuckGo", "Web search (HTML, then Lite)", "free · keyless"],
  ["Firecrawl", "Deep crawl and search, last resort", "freemium · optional key"],
];

export default function SourcesPage() {
  return (
    <>
      <DocTitle eyebrow="How it works" title="Data sources" />
      <Lead>
        Twenty-odd adapters, all of them free by default, most of them needing no key at all. Each
        one fetches, normalises into a typed record, and attaches provenance. Agents never see an
        HTTP response — only records that already know where they came from.
      </Lead>

      <H2>What Lynx reads</H2>
      <Table
        head={["Source", "Provides", "Cost"]}
        rows={SOURCES.map(([name, provides, cost]) => [
          <span key={name} className="font-medium text-[var(--text)]">
            {name}
          </span>,
          provides,
          <span key={`${name}-c`} className="text-[var(--faint)]">
            {cost}
          </span>,
        ])}
      />

      <H2>Free-first ladders</H2>
      <P>
        Two shared ladders exist because the same problem shows up everywhere: a page that needs
        JavaScript, and a question that needs a search engine. Both start with the free option and
        only reach for a metered one when the free ones come back empty.
      </P>
      <CodeBlock
        code={`read a page:    Jina Reader  ->  Firecrawl  ->  raw httpx
web search:     DuckDuckGo HTML  ->  DuckDuckGo Lite  ->  Firecrawl`}
        caption="Firecrawl is last in both, so an optional key stretches much further."
      />
      <P>
        The consequence worth knowing: Lynx researches JS-heavy sites and private companies with{" "}
        <strong className="text-[var(--text-strong)]">no Firecrawl key at all</strong>. The key only
        raises the ceiling on hard pages.
      </P>

      <H2>The HTTP layer</H2>
      <UL>
        <LI>
          <strong className="text-[var(--text-strong)]">One fetcher.</strong> Every request in the
          codebase goes through it, which is what makes caching, limiting and telemetry universal
          rather than per-adapter.
        </LI>
        <LI>
          <strong className="text-[var(--text-strong)]">Response cache.</strong> Bodies are stored
          with per-source TTLs, so re-running an entity mostly replays from disk. This is why a
          second run of the same company is dramatically faster than the first.
        </LI>
        <LI>
          <strong className="text-[var(--text-strong)]">Per-source rate limits.</strong> Each source
          gets its own budget — DuckDuckGo one request every two seconds, GLEIF and Wayback two per
          second, and so on — plus a global cap on simultaneous outbound requests.
        </LI>
        <LI>
          <strong className="text-[var(--text-strong)]">Identifiable traffic.</strong> Requests carry
          a User-Agent naming the tool and your <Code>CONTACT_EMAIL</Code>, which SEC EDGAR requires
          and other sources appreciate.
        </LI>
        <LI>
          <strong className="text-[var(--text-strong)]">Failures are data.</strong> A non-200 is
          logged with its source and surfaced as an empty rung, not raised into the agent.
        </LI>
      </UL>

      <H2>Adding a source</H2>
      <P>
        A source is one module in <Code>apps/api/src/app/sources/</Code> that returns the shared
        typed records. No agent changes — including for a paid source, which is the point of the
        registry carrying a cost field.
      </P>
      <CodeBlock
        code={`# apps/api/src/app/sources/awards_registry.py
from app.sources.base import FactRecord
from app.sources.http import fetcher


async def awards(name: str) -> list[FactRecord]:
    data = await fetcher.get_json(
        "https://api.example.org/awards",
        params={"q": name},
        source_id="awards_registry",   # keys cache + limiter + usage
    )
    return [
        FactRecord(
            source_id="awards_registry",
            source_url=item["url"],
            predicate="award",
            text=item["title"],
        )
        for item in data.get("results", [])
    ]`}
      />
      <UL>
        <LI>
          Add a <Code>REGISTRY</Code> entry in <Code>sources/base.py</Code> declaring which
          categories it serves and whether it is free, freemium or paid.
        </LI>
        <LI>
          Add a rate limiter entry for the new <Code>source_id</Code>, and a label so it appears in
          the usage panel.
        </LI>
        <LI>
          Normalisers are pure functions — the easiest thing in this codebase to unit test, and the
          thing most likely to break when a provider changes its shape. Test them.
        </LI>
      </UL>

      <Callout tone="warn" title="Keep the default path free and polite">
        A paid or keyed source is welcome, but it must degrade to nothing when the key is absent —
        never break a keyless run. Respect each provider&rsquo;s terms and rate limits: Lynx is a
        research tool, and behaving like one is what keeps these sources open to everybody.
      </Callout>

      <H3>Watching it live</H3>
      <P>
        The usage panel in the app shows requests per source in a rolling window against each
        service&rsquo;s known limit, plus real remaining Firecrawl credits when a key is present.
        It&rsquo;s the fastest way to see which rung of a ladder actually answered. See also the{" "}
        <A href="/docs/api">HTTP API</A>.
      </P>
    </>
  );
}
