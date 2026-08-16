import type { Metadata } from "next";
import { A, Callout, Code, CodeBlock, DocTitle, H2, H3, LI, Lead, P, Table, UL } from "@/components/docs/ui";

export const metadata: Metadata = {
  title: "Models & degraded mode",
  description: "The provider chain, per-run model selection, and exactly what still works with no LLM at all.",
};

export default function ModelsPage() {
  return (
    <>
      <DocTitle eyebrow="How it works" title="Models & degraded mode" />
      <Lead>
        The model is a component, not the product. Everything structured is parsed deterministically;
        a model is used only where a parser genuinely can&rsquo;t help — pulling entities out of
        prose, and writing prose. Which is why an empty <Code>.env</Code> still produces a real run.
      </Lead>

      <H2>The provider chain</H2>
      <P>
        Groq, Cerebras, OpenRouter and Ollama all speak the OpenAI chat-completions dialect, so one
        client covers them and the chain is just an ordered list. A provider with no key is skipped
        entirely; a provider that fails is passed over for the rest of the call.
      </P>
      <CodeBlock
        code={`LLM_CHAIN=groq,cerebras,openrouter,ollama

GROQ_API_KEY=            GROQ_MODEL=llama-3.3-70b-versatile
CEREBRAS_API_KEY=        CEREBRAS_MODEL=llama-3.3-70b
OPENROUTER_API_KEY=      OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=            # empty = skip Ollama entirely`}
      />
      <Table
        head={["Failure", "What happens"]}
        rows={[
          ["429 rate limit", "That provider cools down for ~12 seconds and the call moves to the next in the chain"],
          [
            "Every provider cooling down",
            "The call waits the shortest cooldown out once, then retries — rather than dropping the whole documentary to template output for the sake of a few seconds",
          ],
          ["A real error or timeout", "That provider is circuit-broken for five minutes; the chain continues without it"],
          ["Nothing left in the chain", "The call returns nothing and the caller takes its deterministic path"],
          ["Unparseable JSON from extraction", "One repair round-trip, then the deterministic path"],
        ]}
      />

      <H2>Choosing a model per run</H2>
      <P>
        <strong className="text-[var(--text-strong)]">Model &amp; options</strong> on the search page
        sets the selection for that run, and it is sent with the request:
      </P>
      <UL>
        <LI>
          <Code>auto</Code> — the whole configured chain, best available first (the default)
        </LI>
        <LI>
          <Code>none</Code> — no model at all, deterministic mode, template documentary
        </LI>
        <LI>
          <Code>groq</Code> / <Code>cerebras</Code> / <Code>openrouter</Code> / <Code>ollama</Code> —
          pin one provider, with no fallback
        </LI>
      </UL>
      <CodeBlock
        code={`curl -X POST localhost:8000/research \\
  -H 'content-type: application/json' \\
  -d '{"query":"Stripe","options":{"llm_provider":"none"}}'`}
      />

      <H2>Where keys live</H2>
      <UL>
        <LI>
          <strong className="text-[var(--text-strong)]">Server side.</strong> Keys in{" "}
          <Code>.env</Code> are read by the backend and never sent to the browser as values you can
          read back — the config endpoint only reports <em>which</em> providers are configured.
        </LI>
        <LI>
          <strong className="text-[var(--text-strong)]">Browser side.</strong> You can paste your own
          keys into the app instead. They stay in memory for the session, or in this
          browser&rsquo;s <Code>localStorage</Code> if you tick <strong>Save config</strong>. They
          are never persisted server-side.
        </LI>
      </UL>
      <Callout tone="warn" title="localStorage is not a vault">
        Anything with access to that browser profile can read a saved key. On a shared machine,
        leave <strong>Save config</strong> unticked — the key then lives only until you reload.
      </Callout>

      <H2>What you lose with no model</H2>
      <Table
        head={["Capability", "No LLM", "With LLM"]}
        rows={[
          ["Dashboard cards, filings, financials, stock, careers, legitimacy, signals", "Full", "Full"],
          ["Knowledge graph", "Metadata graph from structured sources", "Densified with extracted entities and relationships"],
          ["Documentary", "Template narrative from the collected data", "Written long-form prose"],
          ["Executive summary", "Scorecard + timeline, deterministic SWOT", "Adds an LLM-written SWOT and assessment"],
          ["Per-node analysis", "Unavailable", "On-demand, cached on the node"],
          ["Documentary chat", "Extractive answers from the corpus", "Grounded answers with citations"],
          ["Private-company people, products, funding", "Wikidata tier only", "Site and web tiers unlock too"],
        ]}
      />
      <P>
        The degraded path is a first-class mode, not an error state: it is unit-tested, and every
        call site is written so that &ldquo;no model available&rdquo; is a normal branch.
      </P>

      <H3>Practical notes on free tiers</H3>
      <UL>
        <LI>
          Groq&rsquo;s free tier is roughly 12k tokens per minute. Lynx caps itself at two concurrent
          LLM calls to stay under it; back-to-back heavy runs will still 429.
        </LI>
        <LI>
          Pin a model your key can actually access. A provider that returns{" "}
          <Code>model_not_found</Code> is treated as a failure and skipped, which looks like
          &ldquo;the LLM didn&rsquo;t run&rdquo; unless you check the logs.
        </LI>
        <LI>
          Ollama is the way to run this with no third party at all — set{" "}
          <Code>OLLAMA_MODEL</Code>, and nothing but the source fetches leaves your machine. See{" "}
          <A href="/docs/self-hosting">Self-hosting</A>.
        </LI>
      </UL>
    </>
  );
}
