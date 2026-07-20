"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle, WarningCircle, ArrowsClockwise } from "@phosphor-icons/react";
import { useJobEvents } from "@/hooks/useJobEvents";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProgressRail } from "@/components/ProgressRail";
import { DashboardGrid } from "@/components/cards";
import { ChangesBanner } from "@/components/ChangesBanner";
import { CareersView } from "@/components/CareersView";
import { GraphView } from "@/components/GraphView";
import { NodePanel } from "@/components/NodePanel";
import { DocumentaryView } from "@/components/DocumentaryView";
import { useHighlight } from "@/stores/highlight";

const TABS = ["Dashboard", "Graph", "Documentary", "Careers"] as const;
type Tab = (typeof TABS)[number];

export default function ResearchPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const state = useJobEvents(jobId);
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [refreshing, setRefreshing] = useState(false);
  const selectedEntityId = useHighlight((s) => s.selectedEntityId);
  const running = state.jobStatus === "running" || state.jobStatus === "queued";

  const refresh = async () => {
    if (!state.entity?.name || refreshing) return;
    setRefreshing(true);
    try {
      const { job_id } = await api.startResearch(state.entity.name);
      router.push(`/research/${job_id}`);
    } catch {
      setRefreshing(false);
    }
  };

  return (
    <main className="flex h-screen flex-col overflow-hidden px-5 py-4">
      <header className="mb-4 flex items-center gap-4">
        <Link href="/" className="press text-lg font-bold text-[var(--text-strong)]">
          Lynx<span className="text-[var(--accent)]">.</span>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold text-[var(--text-strong)]">
            {state.entity?.name ?? "Resolving…"}
            {state.entity?.ticker && (
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">${state.entity.ticker}</span>
            )}
          </h1>
          {state.entity?.description && (
            <p className="truncate text-xs text-[var(--muted)]">{state.entity.description}</p>
          )}
        </div>
        <nav className="mx-auto flex gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`press rounded-lg px-4 py-1.5 text-[13px] font-medium ${
                tab === t
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--text-strong)]"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11px] font-medium">
          {running ? (
            <span className="spinner h-3 w-3" />
          ) : state.jobStatus === "failed" ? (
            <WarningCircle weight="fill" className="h-3.5 w-3.5 text-[var(--neg)]" />
          ) : (
            <CheckCircle weight="fill" className="h-3.5 w-3.5 text-[var(--accent)]" />
          )}
          <span className="capitalize text-[var(--muted)]">{state.jobStatus}</span>
        </div>
        <button
          onClick={refresh}
          disabled={running || refreshing}
          title="Re-run research for fresh data"
          className="press flex h-[30px] items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 text-[11px] font-medium text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-strong)] disabled:opacity-40"
        >
          {refreshing ? (
            <span className="spinner h-3 w-3" />
          ) : (
            <ArrowsClockwise weight="bold" className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
        <ThemeToggle />
      </header>

      {tab === "Dashboard" && <ChangesBanner jobId={jobId} enabled={state.jobStatus === "completed"} />}

      <div className="flex min-h-0 flex-1 gap-4">
        <ProgressRail agents={state.agents} running={running} />
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${tab === "Dashboard" ? "overflow-y-auto" : ""}`}
        >
          {tab === "Dashboard" && <DashboardGrid categories={state.categories} running={running} />}
          {tab === "Graph" && <GraphView jobId={jobId} />}
          {tab === "Documentary" && <DocumentaryView jobId={jobId} running={running} />}
          {tab === "Careers" && <CareersView state={state.categories.careers} running={running} />}
        </div>
        {selectedEntityId && (tab === "Graph" || tab === "Documentary") && <NodePanel />}
      </div>
    </main>
  );
}
