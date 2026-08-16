import type { Metadata } from "next";
import { A, Callout, Code, CodeBlock, DocTitle, H2, H3, LI, Lead, P, Table, UL } from "@/components/docs/ui";

export const metadata: Metadata = {
  title: "HTTP API",
  description: "Every endpoint the Lynx backend exposes, the SSE event stream, and the shapes they return.",
};

function M({ children }: { children: string }) {
  return (
    <span className="font-mono text-[11px] font-semibold tracking-wide text-[var(--accent)]">{children}</span>
  );
}

const ENDPOINTS: [string, string, string][] = [
  ["GET", "/health", "Liveness, plus which LLM providers are configured"],
  ["GET", "/config", "Selectable models and research categories for the UI"],
  ["GET", "/autocomplete?q=", "Wikipedia opensearch merged with SEC ticker matches"],
  ["POST", "/research", "Start a run; returns a job id immediately"],
  ["GET", "/runs?limit=", "Recent runs, newest first"],
  ["DELETE", "/runs/{job_id}", "Delete a run and its events, results and document"],
  ["GET", "/jobs/{job_id}", "Run state: entity, per-category status and payloads"],
  ["GET", "/jobs/{job_id}/events", "SSE progress stream with replay"],
  ["GET", "/jobs/{job_id}/document", "The generated documentary markdown and its method"],
  ["POST", "/jobs/{job_id}/ask", "Grounded question answering over one run"],
  ["GET", "/graph/{job_id}", "Subgraph around the run's root entity"],
  ["GET", "/entities/{entity_id}", "One node: attrs, claims with sources, edges"],
  ["POST", "/entities/{entity_id}/analysis", "On-demand LLM analysis of a node, cached"],
  ["GET", "/compare?jobs=a,b", "Two or more finished runs projected onto shared metric rows"],
  ["GET", "/quote/{ticker}", "Live price for polling"],
  ["GET", "/runs/{job_id}/changes", "Diff against the previous completed run of the same entity"],
  ["GET", "/updates?handle=", "Recent posts from a company's X handle"],
  ["GET", "/usage", "Rolling per-source request usage and Firecrawl credits"],
];

export default function ApiPage() {
  return (
    <>
      <DocTitle eyebrow="Reference" title="HTTP API" />
      <Lead>
        The backend is a plain FastAPI service on <Code>:8000</Code>. Interactive docs are generated
        at <Code>/docs</Code> and the schema at <Code>/openapi.json</Code> — everything below is the
        short version, in the order you would actually call it.
      </Lead>

      <Callout tone="warn" title="There is no authentication">
        Lynx is built as a single-user local tool: any caller who can reach the port can start runs
        and read every stored run. Do not expose the API directly to the internet — put it behind
        your own auth proxy, and keep <Code>CORS_ORIGINS</Code> pinned to the web origin you serve.
      </Callout>

      <H2>Endpoints</H2>
      <Table
        head={["", "Path", "Does"]}
        rows={ENDPOINTS.map(([method, path, does]) => [
          <M key={path}>{method}</M>,
          <Code key={`${path}-p`}>{path}</Code>,
          does,
        ])}
      />

      <H2>Starting a run</H2>
      <CodeBlock
        code={`curl -X POST localhost:8000/research \\
  -H 'content-type: application/json' \\
  -d '{
    "query": "Anthropic",
    "options": {
      "llm_provider": "auto",   // auto | none | <provider id>
      "categories": null        // null = all 15, or a subset
    }
  }'

{"job_id":"9f0c...-...."}`}
      />
      <P>
        The response returns as soon as the job is registered — the work happens in-process and is
        observed through the event stream. <Code>query</Code> accepts a company name or a URL.
      </P>

      <H2>Watching it happen</H2>
      <CodeBlock
        code={`curl -N localhost:8000/jobs/$JOB/events

id: 1
event: job_started
data: {"agent":null,"query":"Anthropic","message":"Resolving entity..."}

id: 2
event: entity_resolved
data: {"agent":null,"entity_id":"...","name":"Anthropic","ticker":null}

id: 7
event: agent_layers
data: {"agent":"people","layers":[
        {"name":"Wikidata","status":"hit","count":5}, ...]}

id: 21
event: category_data
data: {"agent":"legitimacy","score":92,"verdict":"established"}

id: 44
event: job_completed
data: {"agent":null,"status":"completed"}`}
      />
      <UL>
        <LI>
          Every event has a monotonic id. Reconnect with a <Code>Last-Event-ID</Code> header — or{" "}
          <Code>?after=</Code> if you can&rsquo;t set headers — to replay only what you missed.
        </LI>
        <LI>
          The stream is per-job and ends at <Code>job_completed</Code>. Event types are listed in{" "}
          <A href="/docs/architecture">Architecture</A>.
        </LI>
        <LI>
          Closing the stream does not cancel the run. Poll <Code>GET /jobs/{"{id}"}</Code> instead if
          you prefer polling to streaming.
        </LI>
      </UL>

      <H2>Reading the result</H2>
      <CodeBlock
        code={`curl localhost:8000/jobs/$JOB            # entity + every category payload
curl localhost:8000/graph/$JOB           # {root_id, nodes[], links[]}
curl localhost:8000/jobs/$JOB/document   # {markdown, method: "llm" | "template"}
curl "localhost:8000/compare?jobs=$A,$B" # shared metric rows, with a winner index`}
      />
      <P>
        <Code>/graph</Code> takes <Code>depth</Code> (default 1) and <Code>min_confidence</Code>. It
        walks outward to that depth, then keeps every edge whose endpoints are both in the resulting
        node set — so you see how the neighbours relate to each other, without dragging in a
        neighbour&rsquo;s entire subsidiary tree. The node set is capped for rendering sanity.
      </P>

      <H3>Asking questions about a run</H3>
      <CodeBlock
        code={`curl -X POST localhost:8000/jobs/$JOB/ask \\
  -H 'content-type: application/json' \\
  -d '{"question":"How do they make money?","history":[]}'

{"answer":"...","grounded":true,"sources":[{"label":"profile","snippet":"..."}]}`}
      />
      <P>
        Retrieval is lexical over the run&rsquo;s documentary and category payloads. With no model
        configured the answer is extractive rather than written, and <Code>grounded</Code> tells you
        whether the answer came from retrieved context at all.
      </P>
    </>
  );
}
