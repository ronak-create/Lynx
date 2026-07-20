"use client";
/* Renders the generated documentary. Backend emits Obsidian-style links `[[Text|entity:<id>]]`;
   we rewrite them to markdown links with an entity: protocol and intercept them so hover
   cross-highlights the graph node and click opens the NodePanel. */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { useHighlight } from "@/stores/highlight";
import { DocChat } from "./DocChat";

const WIKI_LINK = /\[\[([^\]|]+)\|entity:([0-9a-f-]{36})\]\]/g;

export function DocumentaryView({ jobId, running }: { jobId: string; running: boolean }) {
  const { setHovered, setSelected } = useHighlight();
  const { data, error } = useQuery({
    queryKey: ["document", jobId],
    queryFn: () => api.document(jobId),
    retry: false,
    refetchInterval: (q) => (q.state.data || !running ? false : 5000),
  });

  const markdown = useMemo(
    () => data?.markdown.replace(WIKI_LINK, (_m, text, id) => `[${text}](entity:${id})`),
    [data],
  );

  // The chat sidebar is available as soon as the run has finished (its corpus is the run's
  // results), even if a documentary was never generated.
  const chat = <DocChat jobId={jobId} disabled={running} />;

  if (!data) {
    return (
      <div className="flex h-full min-h-0 gap-4">
        <div className="panel flex flex-1 items-center justify-center gap-2.5 text-sm text-[var(--muted)]">
          {(running || !error) && <span className="spinner h-4 w-4" />}
          <span>
            {running ? "Writing documentary…" : error ? "No documentary was generated for this run" : "Loading…"}
          </span>
        </div>
        {chat}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="panel rise flex-1 overflow-y-auto px-8 py-6">
      <div className="doc-prose mx-auto max-w-3xl text-[15px]">
        <p className="mb-5 border-b border-[var(--border)] pb-3 text-[11px] tracking-[0.1em] text-[var(--faint)] uppercase">
          {data.method === "llm" ? "LLM narrative + sourced data" : "Template from sourced data"} · entity links
          highlight the graph
        </p>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url) => url /* preserve entity: scheme; content is backend-generated */}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith("entity:")) {
                const id = href.slice(7);
                return (
                  <span
                    className="wiki-link"
                    onMouseEnter={() => setHovered(id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(id)}
                  >
                    {children}
                  </span>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
      </div>
      {chat}
    </div>
  );
}
