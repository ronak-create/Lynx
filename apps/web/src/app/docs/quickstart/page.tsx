import type { Metadata } from "next";
import { A, Callout, Code, CodeBlock, DocTitle, H2, LI, Lead, P, Step, Steps, UL } from "@/components/docs/ui";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Quickstart",
  description: "Install the toolchain, start both services, and run your first research job.",
};

export default function QuickstartPage() {
  return (
    <>
      <DocTitle eyebrow="Getting started" title="Quickstart" />
      <Lead>
        Two services, one command. Lynx runs with no API keys at all — keys only unlock the
        LLM-written parts, so get it running first and add them later if you want them.
      </Lead>

      <H2>Prerequisites</H2>
      <UL>
        <LI>
          <strong className="text-[var(--text-strong)]">Node 20+</strong> with pnpm —{" "}
          <Code>corepack enable pnpm</Code>
        </LI>
        <LI>
          <A href="https://docs.astral.sh/uv/">uv</A>, which provisions Python 3.12 for the backend
          automatically, so you don&rsquo;t need a system Python
        </LI>
      </UL>

      <H2>Install and run</H2>
      <Steps>
        <Step n={1} title="Clone and configure">
          <CodeBlock
            code={`git clone ${SITE.repo}.git
cd Lynx
cp .env.example .env`}
          />
          <P>
            The defaults in <Code>.env</Code> are fine. Set <Code>CONTACT_EMAIL</Code> to a real
            address — SEC EDGAR requires one in the User-Agent, and Wikipedia prefers it.
          </P>
        </Step>

        <Step n={2} title="Install dependencies">
          <CodeBlock
            code={`cd apps/api && uv sync && cd ../..
pnpm install`}
          />
        </Step>

        <Step n={3} title="Start both services">
          <CodeBlock code={`pnpm dev`} caption="FastAPI on :8000, Next.js on :3000, in one terminal." />
        </Step>

        <Step n={4} title="Run your first research">
          <P>
            Open <A href="http://localhost:3000">localhost:3000</A>, type a company, press enter.
            Good first queries, each exercising a different path:
          </P>
          <UL>
            <LI>
              <Code>Microsoft</Code> — public company: filings, XBRL financials, a live quote, the
              deepest graph
            </LI>
            <LI>
              <Code>Anthropic</Code> — private company: stock is gracefully absent, funding and
              people come from the web tier
            </LI>
            <LI>
              <Code>https://figma.com</Code> — URL input: resolution starts from the site itself
              rather than an encyclopaedia entry
            </LI>
          </UL>
        </Step>
      </Steps>

      <H2>Optional: add a model</H2>
      <P>
        Without a key you get the full dashboard, a metadata graph and a template documentary. Add
        any one free provider key to <Code>.env</Code> and the narrative history, competitor
        extraction, per-node analysis and the written documentary switch on.
      </P>
      <CodeBlock
        code={`GROQ_API_KEY=gsk_...
# or CEREBRAS_API_KEY / OPENROUTER_API_KEY, or point OLLAMA_MODEL at a local model
# FIRECRAWL_API_KEY is optional too: JS-heavy sites already fall back to Jina Reader`}
      />
      <P>
        Keys can also be entered per-browser from <strong className="text-[var(--text-strong)]">Model &amp; options</strong>{" "}
        on the search page — useful when you don&rsquo;t control the server&rsquo;s{" "}
        <Code>.env</Code>. See <A href="/docs/models">Models &amp; degraded mode</A>.
      </P>

      <Callout tone="warn" title="Free tiers rate-limit hard">
        Groq&rsquo;s free tier is roughly 12k tokens/minute. Lynx caps concurrent LLM calls, cools a
        429&rsquo;d provider down briefly, waits that cooldown out once rather than degrading, and
        falls through the chain to the next provider. Back-to-back heavy runs will still throttle.
      </Callout>

      <H2>Verify</H2>
      <CodeBlock
        code={`cd apps/api && uv run pytest              # backend unit tests
cd apps/web && pnpm exec tsc --noEmit     # frontend typecheck
pnpm lint`}
        caption="The same three checks CI runs on every push."
      />

      <H2>Run it in Docker instead</H2>
      <CodeBlock code={`cp .env.example .env
docker compose up --build   # API on :8000, web on :3000`} />
      <P>
        The SQLite database and HTTP cache persist in the <Code>research-data</Code> volume. For a
        real deployment see <A href="/docs/self-hosting">Self-hosting</A>.
      </P>
    </>
  );
}
