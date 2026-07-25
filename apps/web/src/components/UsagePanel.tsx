"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Lightning, Database, Coins, Gauge } from "@phosphor-icons/react";
import { api, type UsageService } from "@/lib/api";
import { useApiKeys } from "@/stores/apiKeys";

function pct(used: number, limit: number | null): number {
  if (!limit || limit <= 0) return 0;
  return Math.max(0, Math.min(1, used / limit));
}

function Bar({ used, limit, unit }: { used: number; limit: number | null; unit: string }) {
  const p = pct(used, limit);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] text-[var(--faint)]">
          {limit ? `${used.toLocaleString()} / ${limit.toLocaleString()}` : used.toLocaleString()}
          <span className="ml-1 opacity-70">{unit}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-2)]">
        {limit ? (
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(p * 100, used > 0 ? 4 : 0)}%` }}
          />
        ) : (
          // unknown ceiling — a faint sliver marks live activity without implying a limit
          <div
            className="h-full rounded-full bg-[var(--accent-line)] transition-[width] duration-500"
            style={{ width: used > 0 ? "18%" : "0%" }}
          />
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[12px] text-[var(--text)]">
        <span className="text-[var(--muted)]">{icon}</span>
        {label}
      </span>
      {children}
    </div>
  );
}

/** Live usage bars for every service the session has touched, plus the Firecrawl credit balance.
 *  Self-contained: does its own polling query so it can drop into the panel or the header dropdown. */
export function UsageBars({ poll = true }: { poll?: boolean }) {
  const fcKey = useApiKeys((s) => s.keys.firecrawl);
  const { data } = useQuery({
    queryKey: ["usage", fcKey ?? ""],
    queryFn: () => api.usage(fcKey),
    refetchInterval: poll ? 3000 : false,
    staleTime: 2000,
    // keep the last snapshot on screen during background polls so the bars never flash skeleton
    placeholderData: keepPreviousData,
  });

  const services = data?.services ?? [];
  const credits = data?.firecrawl_credits ?? null;
  const models = services.filter((s) => s.group === "model");
  const sources = services.filter((s) => s.group === "source");

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-9 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!credits && services.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-[var(--faint)]">
        No API activity yet. Usage appears here as agents call each service.
      </p>
    );
  }

  const sect = (title: string, items: UsageService[]) =>
    items.length > 0 && (
      <div className="flex flex-col gap-3">
        <span className="text-[10px] font-semibold tracking-wider text-[var(--muted)] uppercase">
          {title}
        </span>
        {items.map((s) => (
          <Row
            key={s.id}
            icon={
              s.group === "model" ? (
                <Lightning weight="fill" className="h-3.5 w-3.5" />
              ) : (
                <Database weight="fill" className="h-3.5 w-3.5" />
              )
            }
            label={s.label}
          >
            <Bar used={s.used} limit={s.limit} unit={s.unit} />
          </Row>
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {credits && (
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-semibold tracking-wider text-[var(--muted)] uppercase">
            Account balance
          </span>
          <Row icon={<Coins weight="fill" className="h-3.5 w-3.5" />} label="Firecrawl credits">
            <Bar used={credits.used ?? 0} limit={credits.limit} unit="credits" />
            <span className="font-mono text-[10px] text-[var(--faint)]">
              {credits.remaining.toLocaleString()} remaining
            </span>
          </Row>
        </div>
      )}
      {sect("Model", models)}
      {sect("Data sources", sources)}
    </div>
  );
}

/** Header affordance: a Gauge button that opens a popover of the live usage bars. */
export function UsageDropdown({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="API usage"
        title="API usage"
        className={`glass-bar press flex items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-colors ${
          open
            ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-strong)]"
        } ${className}`}
      >
        <Gauge weight="bold" className="h-3.5 w-3.5" />
        Usage
      </button>
      <div
        className={`pop-top absolute right-0 top-[calc(100%+8px)] z-30 w-72 origin-top-right ${
          open ? "" : "pointer-events-none hidden"
        }`}
      >
        <div className="max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--border-strong)] bg-[var(--panel)]/95 p-4 shadow-2xl backdrop-blur-xl">
          <UsageBars poll={open} />
        </div>
      </div>
    </div>
  );
}
