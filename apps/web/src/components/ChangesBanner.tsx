"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/* "What changed since you last researched this" — diffs the current run against the previous
   completed run of the same entity. Renders nothing when there's no prior run to compare to.
   Styled as a terminal/console strip: deep bg + monospace, so it reads as a diff and
   contrasts against the surrounding glass panels in both light and dark themes. */
export function ChangesBanner({ jobId, enabled }: { jobId: string; enabled: boolean }) {
  const { data } = useQuery({
    queryKey: ["changes", jobId],
    queryFn: () => api.changes(jobId),
    enabled,
  });
  if (!data?.has_previous || data.changes.length === 0) return null;

  return (
    <div className="rise mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#2e3a58] bg-[#080b14] px-4 py-2.5 font-mono text-[12px] text-[#dbe3f2] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <span className="flex items-center gap-1.5 whitespace-nowrap text-[#5be3a3]">
        <span aria-hidden className="text-[#5be3a3]">❯</span>
        since-last-run
      </span>
      {data.changes.map((c) => {
        const color =
          c.favorable === true
            ? "text-[#4ee6a6]"
            : c.favorable === false
              ? "text-[#ff8fa3]"
              : "text-[#c2cce0]";
        return (
          <span key={c.key} className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-[#c2cbdf]">{c.label}:</span>
            <span className="text-[#9aa4bb] line-through">{c.from}</span>
            <span className={color}>{c.direction === "up" ? "↑" : c.direction === "down" ? "↓" : "→"}</span>
            <span className="text-[#f2f5fc]">{c.to}</span>
            {c.delta_pct != null && (
              <span className={color}>
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
