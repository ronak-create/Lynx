"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { X, Sparkle, ArrowSquareOut, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import { api, NODE_COLORS } from "@/lib/api";
import { useHighlight } from "@/stores/highlight";

export function NodePanel() {
  const { selectedEntityId, setSelected } = useHighlight();
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const { data: entity } = useQuery({
    queryKey: ["entity", selectedEntityId],
    queryFn: () => api.entity(selectedEntityId!),
    enabled: !!selectedEntityId,
  });

  if (!selectedEntityId) return null;

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await api.analyze(selectedEntityId);
      setAnalysis(res.analysis);
    } catch (e) {
      setAnalysisError(e instanceof Error && e.message.includes("503")
        ? "Needs an LLM provider (none configured)"
        : "Analysis failed — try again");
    } finally {
      setAnalyzing(false);
    }
  };

  const shownAnalysis = analysis ?? entity?.analysis ?? null;

  return (
    <aside className="panel pop-right flex w-80 shrink-0 flex-col gap-3 self-stretch overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span
            className="mb-1.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
            style={{ background: `${NODE_COLORS[entity?.type ?? ""] ?? "#94a3b8"}22`, color: NODE_COLORS[entity?.type ?? ""] ?? "#94a3b8" }}
          >
            {entity?.type ?? "…"}
          </span>
          <h3 className="text-lg font-semibold text-[var(--text-strong)]">{entity?.name ?? "Loading…"}</h3>
        </div>
        <button
          onClick={() => setSelected(null)}
          aria-label="Close"
          className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text-strong)]"
        >
          <X weight="bold" className="h-4 w-4" />
        </button>
      </div>

      {entity?.summary && <p className="text-[13px] leading-relaxed text-[var(--muted)]">{entity.summary.slice(0, 400)}</p>}

      {entity && entity.claims.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">Facts</h4>
          <ul className="flex flex-col gap-1 text-[13px]">
            {entity.claims.slice(0, 12).map((c, i) => (
              <li key={i} className="flex flex-col">
                <span>
                  <span className="text-[var(--muted)]">{c.predicate.replace(/_/g, " ")}: </span>
                  {c.value?.text}
                </span>
                {c.source?.url && (
                  <a
                    href={c.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-0.5 text-[10px] text-[var(--accent)]/80 hover:text-[var(--accent)] hover:underline"
                  >
                    <ArrowSquareOut weight="bold" className="h-2.5 w-2.5" />
                    {c.source.id}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {entity && entity.edges.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">Connections</h4>
          <ul className="flex flex-col gap-1 text-[13px]">
            {entity.edges.slice(0, 14).map((e, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {e.direction === "out" ? (
                  <ArrowRight weight="bold" className="h-3 w-3 shrink-0 text-[var(--faint)]" />
                ) : (
                  <ArrowLeft weight="bold" className="h-3 w-3 shrink-0 text-[var(--faint)]" />
                )}
                <span className="rounded-md bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)]">
                  {e.type}
                </span>
                {e.other && (
                  <button
                    onClick={() => setSelected(e.other!.id)}
                    className="press truncate text-[var(--text)] hover:text-[var(--accent)]"
                  >
                    {e.other.name}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto pt-2">
        {shownAnalysis ? (
          <div className="doc-prose text-[13px]">
            <h4 className="mb-1 text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">Analysis</h4>
            <ReactMarkdown>{shownAnalysis}</ReactMarkdown>
          </div>
        ) : (
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="press flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-[13px] font-medium text-[var(--text)] hover:border-[var(--accent-line)] hover:text-[var(--text-strong)] disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <span className="spinner h-3.5 w-3.5" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkle weight="fill" className="h-4 w-4 text-[var(--accent)]" /> Analyze this node
              </>
            )}
          </button>
        )}
        {analysisError && <p className="mt-1 text-[11px] text-[var(--neg)]">{analysisError}</p>}
      </div>
    </aside>
  );
}
