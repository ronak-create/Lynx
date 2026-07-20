"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Scales, CheckCircle, Circle } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";

function CompareInner() {
  const params = useSearchParams();
  const initial = (params.get("jobs") ?? "").split(",").filter(Boolean);
  const [selected, setSelected] = useState<string[]>(initial);

  const runs = useQuery({ queryKey: ["runs"], queryFn: api.runs });
  // one entry per entity: /runs is newest-first, so the first completed run wins
  const seen = new Set<string>();
  const completed = (runs.data ?? []).filter((r) => {
    if (r.status !== "completed") return false;
    const key = (r.entity_name ?? r.query).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const cmp = useQuery({
    queryKey: ["compare", selected],
    queryFn: () => api.compare(selected),
    enabled: selected.length >= 2,
  });

  function toggle(jobId: string) {
    setSelected((cur) => {
      const next = cur.includes(jobId) ? cur.filter((j) => j !== jobId) : [...cur, jobId];
      const qs = next.length ? `?jobs=${next.join(",")}` : "";
      window.history.replaceState(null, "", `/compare${qs}`);
      return next;
    });
  }

  return (
    <main className="flex min-h-screen flex-col px-5 py-4">
      <header className="mb-5 flex items-center gap-4">
        <Link href="/" className="press text-lg font-bold text-[var(--text-strong)]">
          Lynx<span className="text-[var(--accent)]">.</span>
        </Link>
        <h1 className="flex items-center gap-2 text-[17px] font-semibold text-[var(--text-strong)]">
          <Scales weight="duotone" className="h-5 w-5 text-[var(--accent)]" />
          Compare
        </h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-5">
        {/* run picker */}
        <aside className="w-64 shrink-0">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
            Pick runs ({selected.length})
          </p>
          <div className="flex flex-col gap-1">
            {completed.map((r) => {
              const on = selected.includes(r.job_id);
              return (
                <button
                  key={r.job_id}
                  onClick={() => toggle(r.job_id)}
                  className={`press flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] ${
                    on
                      ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--text-strong)]"
                      : "border-[var(--border)] bg-[var(--panel)] text-[var(--text)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {on ? (
                    <CheckCircle weight="fill" className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-[var(--faint)]" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{r.entity_name ?? r.query}</span>
                  <span className="shrink-0 text-[10px] text-[var(--faint)]">
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </button>
              );
            })}
            {completed.length === 0 && (
              <p className="text-[13px] text-[var(--muted)]">
                No completed runs yet. <Link href="/" className="text-[var(--accent)]">Research something</Link> first.
              </p>
            )}
          </div>
        </aside>

        {/* matrix */}
        <section className="min-w-0 flex-1 overflow-x-auto">
          {selected.length < 2 ? (
            <div className="panel flex h-40 items-center justify-center text-sm text-[var(--muted)]">
              Select at least two runs to compare.
            </div>
          ) : cmp.isLoading ? (
            <div className="panel flex h-40 items-center justify-center">
              <span className="spinner h-5 w-5" />
            </div>
          ) : cmp.data ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-[var(--bg)] p-2 text-left" />
                  {cmp.data.entities.map((e) => (
                    <th key={e.job_id} className="p-2 text-left align-bottom">
                      <Link
                        href={`/research/${e.job_id}`}
                        className="press text-[15px] font-semibold text-[var(--text-strong)] hover:text-[var(--accent)]"
                      >
                        {e.name}
                      </Link>
                      {e.ticker && <span className="ml-1.5 text-[11px] text-[var(--muted)]">${e.ticker}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cmp.data.metrics.map((m) => (
                  <tr key={m.key} className="border-t border-[var(--border)]">
                    <td className="sticky left-0 bg-[var(--bg)] p-2 text-[12px] tracking-wide text-[var(--muted)] uppercase">
                      {m.label}
                    </td>
                    {m.cells.map((c, i) => (
                      <td
                        key={i}
                        className={`p-2 ${
                          m.best === i
                            ? "rounded-md bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                            : "text-[var(--text)]"
                        }`}
                      >
                        {c.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="panel flex h-40 items-center justify-center text-sm text-[var(--neg)]">
              Could not load comparison.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--muted)]">Loading…</div>}>
      <CompareInner />
    </Suspense>
  );
}
