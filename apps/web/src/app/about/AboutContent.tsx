"use client";
import Link from "next/link";
import {
  ArrowRight,
  Books,
  Broadcast,
  Browsers,
  Buildings,
  ChartLineUp,
  ChatCircleDots,
  Cube,
  Detective,
  Eye,
  FileText,
  GitBranch,
  Graph,
  Lightning,
  ListMagnifyingGlass,
  Lock,
  type Icon,
  Scales,
  ShieldCheck,
  Stack,
  Users,
} from "@phosphor-icons/react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SITE } from "@/lib/site";

/* ---------- small local primitives, so the page reads as one system ---------- */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[var(--border)] pt-12">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-[26px] font-bold tracking-tight text-[var(--text-strong)]">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[27px] leading-none font-bold tracking-tight text-[var(--text-strong)]">
        {value}
      </span>
      <span className="text-[12px] leading-snug text-[var(--faint)]">{label}</span>
    </div>
  );
}

function Phase({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: string;
  icon: Icon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      <span
        aria-hidden
        className="absolute top-10 bottom-0 left-[19px] w-px bg-[var(--border)] last:hidden"
      />
      <span className="panel-2 relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
        <Icon weight="duotone" className="h-[19px] w-[19px] text-[var(--accent)]" />
      </span>
      <div className="pt-1">
        <h3 className="flex items-baseline gap-2 text-[15px] font-semibold text-[var(--text-strong)]">
          {title}
          <span className="font-mono text-[11px] font-normal text-[var(--faint)]">{n}</span>
        </h3>
        <div className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">{children}</div>
      </div>
    </li>
  );
}

function ViewCard({
  icon: Icon,
  title,
  children,
}: {
  icon: Icon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel p-5">
      <Icon weight="duotone" className="h-6 w-6 text-[var(--accent)]" />
      <h3 className="mt-3 text-[15px] font-semibold text-[var(--text-strong)]">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--muted)]">{children}</p>
    </div>
  );
}

function SourceGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-[var(--text-strong)]">{title}</h3>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--muted)]"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export function AboutContent() {
  return (
    <>
      <SiteHeader width="max-w-3xl" />
      <main className="mx-auto w-full max-w-3xl px-6 pt-16">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          About
        </p>
        <h1 className="mt-3 text-[40px] leading-[1.08] font-bold tracking-tight text-[var(--text-strong)] sm:text-[46px]">
          Everything public about a company,
          <br className="hidden sm:block" /> assembled in one pass.
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-[var(--muted)]">
          Lynx is an open-source research tool. You type a company name or paste a URL; fifteen
          agents fan out across public sources — filings, registries, archives, news, code hosts,
          hiring boards, the company&rsquo;s own site — and the findings assemble themselves into a
          dashboard, a knowledge graph, a written documentary, and a live careers board while you
          watch.
        </p>
        <p className="mt-4 text-[16px] leading-relaxed text-[var(--muted)]">
          It is named for the lynx, proverbially sharp-sighted. That is the whole job: see a
          business clearly, quickly, and with a citation behind every claim.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-6 border-y border-[var(--border)] py-7 sm:grid-cols-4">
          <Stat value="15" label="research agents per run" />
          <Stat value="20+" label="public data sources" />
          <Stat value="4" label="ways to read the result" />
          <Stat value="0" label="API keys required" />
        </div>

        <Section eyebrow="Why" title="Research is assembly, not search">
          <p className="text-[15px] leading-relaxed text-[var(--muted)]">
            Looking a company up properly means the same twenty tabs every time: Wikipedia for the
            outline, EDGAR for the numbers, the site for what they actually sell, news for what just
            happened, a jobs board to see whether they&rsquo;re really hiring, a registry to check
            they exist at all. The work isn&rsquo;t finding any one of those. It&rsquo;s holding them
            side by side and noticing what they say about each other.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted)]">
            Lynx does the assembly. Each agent owns one question, runs against a ladder of sources
            from most authoritative to most improvised, stops at the first rung that answers, and
            hands what it found to the agents that come after it. Nothing is presented without a
            source you can click.
          </p>
        </Section>

        <Section eyebrow="Mechanics" title="How a run works">
          <ol className="mt-2">
            <Phase n="phase 0" icon={ListMagnifyingGlass} title="Resolve">
              Work out which entity you actually meant. &ldquo;Lilly&rdquo; is a disambiguation page,
              a person, and a fruit before it is a pharmaceutical company — resolution re-ranks
              candidates towards organisations and cross-checks the SEC company directory before
              committing to a root entity.
            </Phase>
            <Phase n="phase 1" icon={Detective} title="Discovery">
              Two agents read the company&rsquo;s own material first — the overview and a deep crawl
              of the site — because everything downstream is better when it starts from what the
              company says about itself rather than from a search engine&rsquo;s guess.
            </Phase>
            <Phase n="phase 2" icon={Lightning} title="Investigation">
              Thirteen agents run concurrently on top of that shared context: stock, financials,
              funding, products, web presence, key people, news, community, patents, competitors,
              legitimacy, operational signals, careers. Failures are isolated — an agent that
              can&rsquo;t reach its source returns empty instead of ending the run.
            </Phase>
            <Phase n="phase 3" icon={Books} title="Synthesis &amp; documentary">
              Two passes read everything the agents collected and run at the same time: one produces
              the executive summary — scorecard, SWOT, and a merged timeline stitched from founding,
              funding, filings, news and patents — the other writes the long-form documentary with
              its entities wiki-linked back into the graph.
            </Phase>
          </ol>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted)]">
            Progress streams over Server-Sent Events with replay on reconnect, so cards fill in as
            each agent lands and a dropped connection resumes where it left off rather than
            restarting the run.
          </p>
        </Section>

        <Section eyebrow="Output" title="Four ways to read the same run">
          <div className="grid gap-4 sm:grid-cols-2">
            <ViewCard icon={ChartLineUp} title="Dashboard">
              A card per category, filling in live, layered into sections and led by a synthesised
              executive summary with a scorecard, SWOT and merged timeline.
            </ViewCard>
            <ViewCard icon={Graph} title="Knowledge graph">
              A force-directed map of roughly nine entity types and twenty-two relationship types.
              Click any node for its facts, its citations, and its connections.
            </ViewCard>
            <ViewCard icon={FileText} title="Documentary">
              A generated long-form write-up whose key entities are wiki-linked and cross-highlight
              the graph, with a grounded chat assistant that answers only from the run&rsquo;s data.
            </ViewCard>
            <ViewCard icon={Buildings} title="Careers">
              Open roles pulled live from public applicant-tracking boards, faceted by department
              and location. Boards only serve open roles, so every listing is verified live.
            </ViewCard>
          </div>
          <p className="mt-5 text-[14px] leading-relaxed text-[var(--muted)]">
            Two finished runs can also be projected onto shared metric rows in{" "}
            <Link href="/compare" className="text-[var(--accent)] hover:underline">
              compare mode
            </Link>
            , and re-running an entity produces a diff banner of what moved since last time.
          </p>
        </Section>

        <Section eyebrow="Provenance" title="Where the facts come from">
          <div className="grid gap-7 sm:grid-cols-2">
            <SourceGroup
              title="Registries & filings"
              items={["SEC EDGAR (XBRL + filings)", "GLEIF LEI registry", "RDAP", "PatentsView"]}
            />
            <SourceGroup
              title="Reference & archive"
              items={["Wikipedia", "Wikidata", "Wayback Machine"]}
            />
            <SourceGroup
              title="Markets & money"
              items={["Yahoo Finance", "Funding from web + LLM extraction"]}
            />
            <SourceGroup
              title="Coverage & community"
              items={["Google News RSS", "Hacker News (Algolia)", "Reddit", "X syndication", "Trustpilot"]}
            />
            <SourceGroup
              title="The company itself"
              items={["Site crawl (Jina → Firecrawl → httpx)", "Tech fingerprint", "TLS + DNS-over-HTTPS", "Social channels"]}
            />
            <SourceGroup
              title="Code & hiring"
              items={["GitHub", "Greenhouse", "Lever", "Ashby", "SmartRecruiters"]}
            />
          </div>
          <p className="mt-6 text-[14px] leading-relaxed text-[var(--muted)]">
            Every fetch goes through one HTTP layer with a shared cache and a per-source rate limit,
            and every stored fact carries its source id, URL and retrieval time. Adding a source —
            including a paid one — is a single module that returns the same typed records; the agents
            never change.
          </p>
        </Section>

        <Section eyebrow="Degraded mode" title="It runs with no keys at all">
          <p className="text-[15px] leading-relaxed text-[var(--muted)]">
            Structured data is parsed deterministically, so the dashboard, the metadata graph and a
            template documentary all work with an empty <code className="rounded bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-[12.5px]">.env</code>.
            A language model is optional and only does the jobs a parser can&rsquo;t: entity and
            relationship extraction, per-node analysis, and prose. Point it at Groq, Cerebras,
            OpenRouter or a local Ollama — whichever you have — and Lynx falls down the chain when
            one is rate-limited.
          </p>
        </Section>

        <Section id="privacy" eyebrow="Privacy" title="Your keys and your data stay yours">
          <ul className="flex flex-col gap-4">
            {[
              {
                icon: Lock,
                title: "Keys never leave your browser",
                body: "Provider keys you enter are held in memory for the session, or in this browser's localStorage if you tick Save config. They are sent with a request only to reach the provider on your behalf, and are never stored server-side.",
              },
              {
                icon: Cube,
                title: "No accounts, no tracking",
                body: "There is no sign-up, no analytics and no third-party tracking. Runs are keyed by an opaque job id.",
              },
              {
                icon: Stack,
                title: "Everything local by default",
                body: "Runs, entities, claims and the HTTP cache live in a SQLite file on the machine running the backend. Self-host it and nothing ever leaves your network except the source fetches themselves.",
              },
              {
                icon: Eye,
                title: "Public information only",
                body: "Lynx reads sources that are already public. It does not attempt to access private data, and it is not a tool for profiling private individuals.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <Icon weight="duotone" className="mt-0.5 h-[19px] w-[19px] shrink-0 text-[var(--accent)]" />
                <div>
                  <h3 className="text-[14.5px] font-semibold text-[var(--text-strong)]">{title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-[var(--muted)]">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[13.5px] text-[var(--faint)]">
            The full terms are on the{" "}
            <Link href="/terms" className="text-[var(--accent)] hover:underline">
              terms page
            </Link>
            .
          </p>
        </Section>

        <Section eyebrow="Honesty" title="What Lynx is not">
          <ul className="flex flex-col gap-3.5 text-[14.5px] leading-relaxed text-[var(--muted)]">
            {[
              [Scales, "Not advice.", "It is a starting point for your own diligence — not legal, financial or investment advice, and not a substitute for reading the primary sources it cites."],
              [ShieldCheck, "Not a verdict on a company.", "The legitimacy score is a weighted read of domain age, TLS, DNS, site substance and third-party corroboration. A low score means thin public evidence, not wrongdoing."],
              [Broadcast, "Not real-time.", "Most sources are refreshed on their own schedules and cached; the live quote and the careers board are the exceptions."],
              [ChatCircleDots, "Not infallible.", "Extraction from unstructured pages can be wrong. Older SEC fiscal years occasionally pick up a mis-tagged XBRL value, and scraping-based market data can break. Both degrade visibly rather than silently."],
            ].map(([Icon, bold, rest]) => {
              const I = Icon as Icon;
              return (
                <li key={bold as string} className="flex gap-3.5">
                  <I weight="duotone" className="mt-0.5 h-[19px] w-[19px] shrink-0 text-[var(--faint)]" />
                  <p>
                    <span className="font-semibold text-[var(--text-strong)]">{bold as string}</span>{" "}
                    {rest as string}
                  </p>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section eyebrow="Colophon" title="Built with">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-strong)]">
                <Lightning weight="duotone" className="h-4 w-4 text-[var(--accent)]" /> Backend
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted)]">
                Python 3.12, FastAPI, SQLAlchemy 2 on SQLite in WAL mode, an async orchestrator with
                SSE fan-out, and one shared HTTP layer with caching and per-source rate limits.
              </p>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-strong)]">
                <Browsers weight="duotone" className="h-4 w-4 text-[var(--accent)]" /> Frontend
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted)]">
                Next.js 16, TypeScript, Tailwind, TanStack Query, zustand, and a force-directed
                canvas graph. One violet accent, full light/dark theming, no status blinkers.
              </p>
            </div>
          </div>
          <p className="mt-6 text-[14px] leading-relaxed text-[var(--muted)]">
            Lynx is MIT licensed and built by{" "}
            <a href={SITE.author.url} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
              {SITE.author.name}
            </a>
            . Contributions are welcome — the{" "}
            <Link href="/docs" className="text-[var(--accent)] hover:underline">
              docs
            </Link>{" "}
            cover how to add a source or an agent, and the{" "}
            <a href={SITE.deepwiki} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
              code wiki
            </a>{" "}
            goes module by module.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/"
              className="press btn-accent flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-medium"
            >
              Research a company
              <ArrowRight weight="bold" className="h-4 w-4" />
            </Link>
            <a
              href={SITE.repo}
              target="_blank"
              rel="noreferrer"
              className="press flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-[14px] font-medium text-[var(--muted)] hover:text-[var(--text-strong)]"
            >
              <GitBranch weight="bold" className="h-4 w-4" />
              Read the source
            </a>
          </div>
        </Section>

        <div className="mt-4 flex items-center gap-2 pt-10 text-[13px] text-[var(--faint)]">
          <Users weight="duotone" className="h-4 w-4" />
          Questions, ideas, or something Lynx got wrong?{" "}
          <a href={SITE.discord} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
            Say so in Discord
          </a>
        </div>
      </main>
      <SiteFooter width="max-w-3xl" stack />
    </>
  );
}
