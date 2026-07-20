"use client";
import { useMemo, useState } from "react";
import { Briefcase, MapPin, ArrowUpRight, MagnifyingGlass, SealCheck } from "@phosphor-icons/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Payload = Record<string, any>;

/* Careers tab: every currently-open posting aggregated from the company's ATS platforms.
   ATS boards only serve live roles, so all of these are valid/open — surfaced as "verified
   live". Filterable by department and free-text. */
export function CareersView({
  state,
  running,
}: {
  state?: { status: string; payload: Payload };
  running: boolean;
}) {
  const [dept, setDept] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const p = state?.payload;

  const jobs: Payload[] = useMemo(() => {
    let list: Payload[] = p?.jobs ?? [];
    if (dept) list = list.filter((j) => j.department === dept);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(
        (j) =>
          j.title?.toLowerCase().includes(s) ||
          j.location?.toLowerCase().includes(s) ||
          j.department?.toLowerCase().includes(s),
      );
    }
    return list;
  }, [p, dept, q]);

  if (!state) {
    return (
      <div className="panel flex h-full items-center justify-center gap-2.5 text-sm text-[var(--muted)]">
        {running && <span className="spinner h-4 w-4" />}
        <span>{running ? "Finding live job postings…" : "Loading…"}</span>
      </div>
    );
  }
  if (!p?.available) {
    return (
      <div className="panel flex h-full items-center justify-center text-sm text-[var(--muted)]">
        {p?.message ?? "No live job postings found."}
      </div>
    );
  }

  return (
    <div className="panel rise flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-strong)]">
          <Briefcase weight="duotone" className="h-5 w-5 text-[var(--accent)]" />
          {p.count} live opening{p.count === 1 ? "" : "s"}
        </h2>
        <span className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
          <SealCheck weight="fill" className="h-3.5 w-3.5 text-[var(--accent)]" />
          verified open · {(p.sources ?? []).join(", ")}
        </span>
        <div className="relative ml-auto">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter roles…"
            className="w-52 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] py-1.5 pr-3 pl-8 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent-line)]"
          />
        </div>
      </div>

      {(p.by_department ?? []).length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] px-5 py-2.5">
          <button
            onClick={() => setDept(null)}
            className={`press rounded-full border px-2.5 py-1 text-[11px] ${
              dept === null
                ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text-strong)]"
            }`}
          >
            All ({p.count})
          </button>
          {p.by_department.slice(0, 12).map((d: Payload) => (
            <button
              key={d.name}
              onClick={() => setDept(dept === d.name ? null : d.name)}
              className={`press rounded-full border px-2.5 py-1 text-[11px] ${
                dept === d.name
                  ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:border-[var(--border-strong)]"
              }`}
            >
              {d.name} ({d.count})
            </button>
          ))}
        </div>
      )}

      <ul className="flex min-h-0 flex-1 flex-col divide-y divide-[var(--border)] overflow-y-auto">
        {jobs.map((j, i) => (
          <li key={j.url + i}>
            <a
              href={j.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 px-5 py-3 hover:bg-[var(--panel-hover)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--text)] group-hover:text-[var(--text-strong)]">
                  <span className="truncate">{j.title}</span>
                  <ArrowUpRight weight="bold" className="h-3.5 w-3.5 shrink-0 text-[var(--faint)] group-hover:text-[var(--accent)]" />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted)]">
                  {j.location && (
                    <span className="flex items-center gap-1">
                      <MapPin weight="fill" className="h-3 w-3" />
                      {j.location}
                    </span>
                  )}
                  {j.department && <span>{j.department}</span>}
                  {j.employment_type && <span>{j.employment_type}</span>}
                  <span className="ml-auto font-mono text-[var(--faint)]">{j.source}</span>
                </div>
              </div>
            </a>
          </li>
        ))}
        {jobs.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-[var(--muted)]">No roles match that filter.</li>
        )}
      </ul>
    </div>
  );
}
