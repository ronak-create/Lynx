"use client";
import { CheckCircle, WarningCircle, Circle, MinusCircle } from "@phosphor-icons/react";
import { AGENT_LABELS } from "@/lib/api";
import { JobLiveState } from "@/hooks/useJobEvents";

type RailStatus = "pending" | "running" | "completed" | "failed" | "skipped";

function StatusIcon({ status }: { status: RailStatus }) {
  if (status === "running") return <span className="spinner h-[13px] w-[13px] shrink-0" aria-label="running" />;
  if (status === "completed")
    return <CheckCircle weight="fill" className="h-[15px] w-[15px] shrink-0 text-[var(--accent)]" />;
  if (status === "failed")
    return <WarningCircle weight="fill" className="h-[15px] w-[15px] shrink-0 text-[var(--neg)]" />;
  if (status === "skipped")
    return <MinusCircle weight="regular" className="h-[13px] w-[13px] shrink-0 text-[var(--faint)]" />;
  return <Circle weight="regular" className="h-[13px] w-[13px] shrink-0 text-[var(--faint)]" />;
}

export function ProgressRail({ agents, running = true }: { agents: JobLiveState["agents"]; running?: boolean }) {
  // once the run is over, any agent still "pending" was never part of this run — mark it skipped
  const entries = Object.entries(agents).map(
    ([id, a]) =>
      [id, !running && a.status === "pending" ? { ...a, status: "skipped" as RailStatus } : a] as const,
  );
  const counted = entries.filter(([, a]) => a.status !== "skipped");
  const total = counted.length;
  const done = counted.filter(([, a]) => a.status === "completed" || a.status === "failed").length;

  return (
    <aside className="panel flex w-64 shrink-0 flex-col self-start overflow-hidden p-1.5">
      <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
          Research agents
        </h3>
        <span className="font-mono text-[11px] text-[var(--faint)]">
          {done}/{total}
        </span>
      </div>
      <div className="mx-2.5 mb-1.5 h-px overflow-hidden rounded-full bg-[var(--panel-2)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
          style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
        />
      </div>
      <ul className="flex flex-col">
        {entries.map(([id, a]) => {
          const active = a.status === "running";
          const dim = a.status === "pending" || a.status === "skipped";
          return (
            <li
              key={id}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                active ? "bg-[var(--panel-2)]" : "hover:bg-[var(--panel-hover)]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <StatusIcon status={a.status} />
                <span
                  className={`text-[13px] ${
                    dim ? "text-[var(--muted)]" : "text-[var(--text)]"
                  } ${a.status === "skipped" ? "text-[var(--faint)]" : ""}`}
                >
                  {AGENT_LABELS[id] ?? id}
                </span>
              </div>
              {a.message && active && (
                <p className="mt-0.5 truncate pl-[23px] text-[11px] text-[var(--muted)]">{a.message}</p>
              )}
              {a.message && a.status === "failed" && (
                <p className="mt-0.5 truncate pl-[23px] text-[11px] text-[var(--neg)]/80">{a.message}</p>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
