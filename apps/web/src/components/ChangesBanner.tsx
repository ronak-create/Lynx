"use client";
import { useQuery } from "@tanstack/react-query";
import { TrendUp, TrendDown, ArrowsClockwise } from "@phosphor-icons/react";
import { api } from "@/lib/api";

/* "What changed since you last researched this" — diffs the current run against the previous
   completed run of the same entity. Renders nothing when there's no prior run to compare to. */
export function ChangesBanner({ jobId, enabled }: { jobId: string; enabled: boolean }) {
  const { data } = useQuery({
    queryKey: ["changes", jobId],
    queryFn: () => api.changes(jobId),
    enabled,
  });
  if (!data?.has_previous || data.changes.length === 0) return null;

  return (
    <div className="panel rise mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-[13px]">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] text-[var(--muted)] uppercase">
        <ArrowsClockwise weight="bold" className="h-3.5 w-3.5 text-[var(--accent)]" />
        Since last run
      </span>
      {data.changes.map((c) => {
        const color =
          c.favorable === true
            ? "text-[var(--accent)]"
            : c.favorable === false
              ? "text-[var(--neg)]"
              : "text-[var(--muted)]";
        return (
          <span key={c.key} className="flex items-center gap-1">
            <span className="text-[var(--muted)]">{c.label}:</span>
            <span className="font-mono text-[var(--faint)] line-through">{c.from}</span>
            {c.direction === "up" ? (
              <TrendUp weight="bold" className={`h-3.5 w-3.5 ${color}`} />
            ) : c.direction === "down" ? (
              <TrendDown weight="bold" className={`h-3.5 w-3.5 ${color}`} />
            ) : (
              <span className="text-[var(--faint)]">→</span>
            )}
            <span className="font-mono text-[var(--text-strong)]">{c.to}</span>
            {c.delta_pct != null && (
              <span className={`font-mono text-[11px] ${color}`}>
                ({c.delta_pct > 0 ? "+" : ""}
                {c.delta_pct}%)
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
