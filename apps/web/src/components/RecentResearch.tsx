"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ClockCounterClockwise, Scales, Trash, ArrowCounterClockwise } from "@phosphor-icons/react";
import { api } from "@/lib/api";

type Run = {
  job_id: string;
  query: string;
  status: string;
  entity_name: string | null;
  created_at: string;
};

const UNDO_MS = 4000;
const BOOP_MS = 380;

export function RecentResearch({ recent }: { recent: Run[] }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [boopingId, setBoopingId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // actually delete from the DB, then refresh the list
  const commit = async (id: string) => {
    try {
      await api.deleteRun(id);
      qc.invalidateQueries({ queryKey: ["runs"] });
    } catch {
      // on failure, bring the row back so nothing is silently lost
      setHidden((h) => {
        const n = new Set(h);
        n.delete(id);
        return n;
      });
    }
  };

  const flushPending = () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    if (pending) void commit(pending.id);
    setPending(null);
  };

  const remove = (r: Run) => {
    // a second delete while a toast is up commits the first immediately
    if (pending) flushPending();
    const name = r.entity_name ?? r.query;
    setBoopingId(r.job_id);
    setTimeout(() => {
      setHidden((h) => new Set(h).add(r.job_id));
      setBoopingId(null);
      setPending({ id: r.job_id, name });
      commitTimer.current = setTimeout(() => {
        void commit(r.job_id);
        setPending(null);
        commitTimer.current = null;
      }, UNDO_MS);
    }, BOOP_MS);
  };

  const undo = () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    if (pending) {
      setHidden((h) => {
        const n = new Set(h);
        n.delete(pending.id);
        return n;
      });
    }
    setPending(null);
  };

  const visible = recent.filter((r) => !hidden.has(r.job_id) || r.job_id === boopingId).slice(0, 6);
  if (visible.length === 0 && !pending) return null;

  return (
    <>
      {visible.length > 0 && (
        <div className="rise mt-14 w-full max-w-xl pb-16">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
              <ClockCounterClockwise weight="bold" className="h-3.5 w-3.5" />
              Recent research
            </h2>
            <Link
              href="/compare"
              className="press flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] text-[var(--muted)] uppercase hover:text-[var(--accent)]"
            >
              <Scales weight="bold" className="h-3.5 w-3.5" />
              Compare
            </Link>
          </div>
          <ul className="panel divide-y divide-[var(--border)]">
            {visible.map((r) => (
              <li
                key={r.job_id}
                onClick={() => router.push(`/research/${r.job_id}`)}
                className={`group relative flex cursor-pointer items-center justify-between px-4 py-3 text-sm hover:bg-[var(--panel-hover)] ${
                  boopingId === r.job_id ? "recent-boop" : ""
                }`}
              >
                <span className="truncate pr-2 text-[var(--text)] group-hover:text-[var(--text-strong)]">
                  {r.entity_name ?? r.query}
                </span>
                <span className="flex shrink-0 items-center gap-3 font-mono text-xs text-[var(--faint)]">
                  <span>
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="capitalize">{r.status}</span>
                </span>
                {/* delete — sits outside the row on the right, always visible, red */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(r);
                  }}
                  aria-label="Delete this research"
                  title="Delete"
                  className="press absolute top-1/2 -right-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-[var(--neg)]"
                >
                  <Trash weight="bold" className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* undo toast, bottom-right, self-dismisses when the delete commits */}
      {pending && (
        <div className="undo-toast fixed right-5 bottom-5 z-40 w-72 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-xl">
          <div className="flex items-center gap-3 px-4 py-3">
            <Trash weight="fill" className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <span className="min-w-0 flex-1 text-[13px] text-[var(--text)]">
              Removed <span className="font-medium text-[var(--text-strong)]">{pending.name}</span>
            </span>
            <button
              onClick={undo}
              className="press flex shrink-0 items-center gap-1 rounded-md border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)]"
            >
              <ArrowCounterClockwise weight="bold" className="h-3.5 w-3.5" />
              Undo
            </button>
          </div>
          <div
            key={pending.id}
            className="undo-bar h-0.5 bg-[var(--accent)]"
            style={{ animationDuration: `${UNDO_MS}ms` }}
          />
        </div>
      )}
    </>
  );
}
