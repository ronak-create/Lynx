import type { Metadata } from "next";
import { A, Callout, Code, CodeBlock, DocTitle, H2, H3, LI, Lead, P, Table, UL } from "@/components/docs/ui";

export const metadata: Metadata = {
  title: "Self-hosting",
  description: "Docker, environment variables, CORS, persistence and production notes for running Lynx yourself.",
};

export default function SelfHostingPage() {
  return (
    <>
      <DocTitle eyebrow="Reference" title="Self-hosting" />
      <Lead>
        Two independent images, no external services, no database server. The whole thing is happy
        on one small box — and with Ollama configured, nothing but the source fetches ever leaves it.
      </Lead>

      <H2>Docker</H2>
      <CodeBlock
        code={`cp .env.example .env       # optional keys; it also runs with none
docker compose up --build  # API on :8000, web on :3000`}
      />
      <P>
        The backend&rsquo;s SQLite database and HTTP cache persist in the <Code>research-data</Code>{" "}
        volume, so restarts keep your runs and your cache. The two images are independent —{" "}
        <Code>apps/api/Dockerfile</Code> (uvicorn) and <Code>apps/web/Dockerfile</Code> (Next
        standalone) — so you can deploy them separately on any container host.
      </P>

      <H2>The two settings that actually matter</H2>
      <Table
        head={["Variable", "Set it to", "Why"]}
        rows={[
          [
            <Code key="a">NEXT_PUBLIC_API_URL</Code>,
            "The API origin the browser will call",
            "Baked into the web bundle at build time — it must be set when you build the web image, not just at runtime",
          ],
          [
            <Code key="b">CORS_ORIGINS</Code>,
            "Your web origin(s), comma-separated",
            "The API rejects browser calls from anywhere else",
          ],
        ]}
      />
      <CodeBlock
        code={`NEXT_PUBLIC_API_URL=https://api.example.com docker compose up --build web
CORS_ORIGINS=https://lynx.example.com`}
      />

      <Callout tone="warn" title="Do not put the API on the open internet">
        There is no authentication. Anyone who can reach the port can start runs — spending your
        provider credits — and read every run already stored. Put it behind your own auth proxy, or
        keep it bound to a private network and expose only the web app.
      </Callout>

      <H2>Environment reference</H2>
      <Table
        head={["Variable", "Default", "Notes"]}
        rows={[
          [<Code key="1">CONTACT_EMAIL</Code>, "anonymous@example.com", "Sent in the User-Agent. SEC EDGAR requires a real address — set it."],
          [<Code key="2">DATABASE_PATH</Code>, "data/research.db", "SQLite file; the schema is written to be Postgres-portable"],
          [<Code key="3">LLM_CHAIN</Code>, "groq,cerebras,openrouter,ollama", "Order providers are tried in; unkeyed ones are skipped"],
          [<Code key="4">GROQ_API_KEY</Code> , "—", "With GROQ_MODEL, default llama-3.3-70b-versatile"],
          [<Code key="5">CEREBRAS_API_KEY</Code>, "—", "With CEREBRAS_MODEL"],
          [<Code key="6">OPENROUTER_API_KEY</Code>, "—", "With OPENROUTER_MODEL"],
          [<Code key="7">OLLAMA_BASE_URL</Code>, "http://localhost:11434/v1", "Set OLLAMA_MODEL to enable; no key needed"],
          [<Code key="8">FIRECRAWL_API_KEY</Code>, "—", "Optional. Last rung of the crawl and search ladders"],
          [<Code key="9">CORS_ORIGINS</Code>, "http://localhost:3000,http://127.0.0.1:3000", "Comma-separated browser origins"],
          [<Code key="10">MAX_CONCURRENT_FETCHES</Code>, "16", "Global outbound cap; per-source rate limits are the real guardrail"],
        ]}
      />

      <H2>Operating it</H2>
      <H3>Jobs live in the process</H3>
      <P>
        Runs execute in the API process rather than a queue. A restart therefore orphans anything
        in flight — on boot, leftover queued or running jobs are marked failed with a clear reason
        so the UI shows a real state instead of streaming forever. Finished runs are unaffected.
        If you expect to restart often, finish or abandon runs first.
      </P>

      <H3>Backups and resets</H3>
      <UL>
        <LI>
          Everything lives in the SQLite file. Back up the volume, or copy{" "}
          <Code>data/research.db</Code> (with its <Code>-wal</Code> file) while the service is
          stopped.
        </LI>
        <LI>
          The HTTP cache lives in the same database. Deleting the file resets both your cache and
          your run history — the next run of each entity will be slow but current.
        </LI>
        <LI>
          Individual runs can be deleted from the UI, or with{" "}
          <Code>DELETE /runs/{"{job_id}"}</Code>. Entities are kept, since other runs may reference
          them.
        </LI>
      </UL>

      <H3>Fully local</H3>
      <P>
        Point <Code>OLLAMA_MODEL</Code> at a local model and leave every hosted key empty. The only
        outbound traffic is then the public sources themselves — no prompt or page content is sent
        to a third-party model provider. See <A href="/docs/models">Models</A>.
      </P>

      <H3>Scaling notes</H3>
      <UL>
        <LI>
          One process handles the fan-out comfortably: the work is network-bound, and concurrency is
          bounded by the global fetch cap and the per-source limiters.
        </LI>
        <LI>
          Running several API replicas against one SQLite file is not supported. If you need that,
          move to Postgres — the models are written for it — and give the job manager a real queue.
        </LI>
        <LI>
          Be a good citizen of the free sources: they are shared infrastructure, and the rate limits
          in this codebase are deliberately conservative.
        </LI>
      </UL>
    </>
  );
}
