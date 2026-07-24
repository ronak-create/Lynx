"use client";
import { CheckCircle, WarningCircle, Circle, MinusCircle, DotOutline } from "@phosphor-icons/react";
import { AGENT_LABELS, LayerInfo, LayerStatus } from "@/lib/api";
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

// the source-ladder rung icon vocabulary — same monochrome language, no coloured status dots
function LayerIcon({ status }: { status: LayerStatus }) {
  if (status === "running") return <span className="spinner h-[10px] w-[10px] shrink-0" aria-label="checking" />;
  if (status === "hit")
    return <CheckCircle weight="fill" className="h-[12px] w-[12px] shrink-0 text-[var(--accent)]" />;
  if (status === "failed")
    return <WarningCircle weight="regular" className="h-[12px] w-[12px] shrink-0 text-[var(--neg)]/80" />;
  if (status === "empty" || status === "skipped")
    return <MinusCircle weight="regular" className="h-[11px] w-[11px] shrink-0 text-[var(--faint)]" />;
  return <DotOutline weight="fill" className="h-[12px] w-[12px] shrink-0 text-[var(--faint)]" />;
}

function LayerRow({ layer }: { layer: LayerInfo }) {
  const muted = layer.status === "empty" || layer.status === "skipped" || layer.status === "pending";
  return (
    <li className="flex items-center gap-2 py-[3px] pl-[30px] pr-1">
      <LayerIcon status={layer.status} />
      <span className={`text-[11.5px] ${muted ? "text-[var(--faint)]" : "text-[var(--muted)]"}`}>
        {layer.name}
      </span>
      {layer.status === "hit" && layer.count > 0 && (
        <span className="ml-auto rounded bg-[var(--panel-2)] px-1 font-mono text-[10px] text-[var(--muted)]">
          +{layer.count}
        </span>
      )}
      {layer.detail && layer.status !== "hit" && (
        <span className="ml-auto max-w-[110px] truncate text-[10px] text-[var(--faint)]" title={layer.detail}>
          {layer.detail}
        </span>
      )}
    </li>
  );
}

export function ProgressRail({
  agents,
  layers = {},
  running = true,
}: {
  agents: JobLiveState["agents"];
  layers?: JobLiveState["layers"];
  running?: boolean;
}) {
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
          // show the source ladder while the agent runs and after it finishes (persisted)
          const rungs = !dim ? layers[id] : undefined;
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
              {rungs && rungs.length > 0 && (
                <ul className="mt-1 flex flex-col border-l border-[var(--panel-2)] pl-0">{rungs.map((l) => (
                  <LayerRow key={l.name} layer={l} />
                ))}</ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
