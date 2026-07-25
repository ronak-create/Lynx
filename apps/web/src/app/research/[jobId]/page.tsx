"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle, WarningCircle, ArrowsClockwise, CaretLeft, Columns } from "@phosphor-icons/react";
import { useJobEvents } from "@/hooks/useJobEvents";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GithubButton } from "@/components/GithubButton";
import { DocsLink } from "@/components/DocsLink";
import { UsageDropdown } from "@/components/UsagePanel";
import { ProgressRail } from "@/components/ProgressRail";
import { DashboardGrid } from "@/components/cards";
import { CompanyLogo } from "@/components/CompanyLogo";
import { ChangesBanner } from "@/components/ChangesBanner";
import { CareersView } from "@/components/CareersView";
import { GraphView } from "@/components/GraphView";
import { NodePanel } from "@/components/NodePanel";
import { DocumentaryView } from "@/components/DocumentaryView";
import { NotesView } from "@/components/NotesView";
import { useHighlight } from "@/stores/highlight";

const TABS = ["Dashboard", "Graph", "Documentary", "Notes", "Careers"] as const;
type Tab = (typeof TABS)[number];

export default function ResearchPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const state = useJobEvents(jobId);
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [refreshing, setRefreshing] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const selectedEntityId = useHighlight((s) => s.selectedEntityId);
  const running = state.jobStatus === "running" || state.jobStatus === "queued";

  // resizable split between the graph/documentary content and the node panel
  const splitRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(360);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (rect) setPanelWidth(Math.max(280, Math.min(680, rect.right - ev.clientX)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  // split-screen: show two tabs side by side (max two panes), with a resizable divider
  const [split, setSplit] = useState(false);
  const [tabB, setTabB] = useState<Tab>("Graph");
  const [splitRatio, setSplitRatio] = useState(0.5); // left pane's fraction of the width
  const paneSplitRef = useRef<HTMLDivElement>(null);
  const startPaneResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const rect = paneSplitRef.current?.getBoundingClientRect();
      if (rect) setSplitRatio(Math.max(0.25, Math.min(0.75, (ev.clientX - rect.left) / rect.width)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // a run that failed before any agent finished has nothing to show — render an
  // explanation + re-run instead of a grid of empty cards
  const deadRun = state.jobStatus === "failed" && Object.keys(state.categories).length === 0;

  // news/community items for the node panel to surface per-node mentions
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const newsPayload = (state.categories.news?.payload ?? {}) as any;
  const socialPayload = (state.categories.social?.payload ?? {}) as any;
  const newsItems = [
    ...(newsPayload.articles ?? []),
    ...(newsPayload.hn_stories ?? []),
    ...(socialPayload.posts ?? []),
  ].map((a: any) => ({ title: a.title, url: a.url ?? a.source_url, date: a.published_at }));

  // best resolved domain for the header logo: legitimacy reports a bare domain; else the
  // profile site's hostname. Only ever our own resolved data, never user-typed text.
  const legitDomain = (state.categories.legitimacy?.payload as any)?.domain as string | undefined;
  const profileSite = (state.categories.profile?.payload as any)?.site as string | undefined;
  let logoDomain: string | null = null;
  if (legitDomain) logoDomain = legitDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  else if (profileSite) {
    try {
      logoDomain = new URL(profileSite).hostname.replace(/^www\./, "");
    } catch {
      logoDomain = null;
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const refresh = async () => {
    const query = state.entity?.name ?? state.query;
    if (!query || refreshing) return;
    setRefreshing(true);
    try {
      const { job_id } = await api.startResearch(query);
      router.push(`/research/${job_id}`);
    } catch {
      setRefreshing(false);
    }
  };

  // content for a single tab — reused by both the normal view and each split-screen pane
  const renderTab = (t: Tab) => {
    if (t === "Dashboard")
      return deadRun ? (
        <div className="panel flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <WarningCircle weight="fill" className="h-8 w-8 text-[var(--neg)]" />
          <p className="text-sm font-medium text-[var(--text-strong)]">This run didn&apos;t finish</p>
          <p className="max-w-md text-sm text-[var(--muted)]">
            {state.error ?? "The research was interrupted before any agent could report results."}
          </p>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="press mt-2 flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-4 py-1.5 text-[13px] font-medium text-[var(--text-strong)] hover:border-[var(--border-strong)] disabled:opacity-40"
          >
            {refreshing ? <span className="spinner h-3 w-3" /> : <ArrowsClockwise weight="bold" className="h-3.5 w-3.5" />}
            Re-run research
          </button>
        </div>
      ) : (
        <>
          {/* sticky company-name block — pinned above the Executive Summary while the dashboard scrolls */}
          <div
            className="sticky top-0 z-20 mb-5 flex items-center justify-center gap-3 rounded-t-2xl border border-[var(--glass-border)] px-5 py-3.5 text-center"
            style={{
              background: "var(--glass-sheen), var(--glass-bg)",
              backdropFilter: "blur(30px) saturate(1.9)",
              WebkitBackdropFilter: "blur(30px) saturate(1.9)",
              boxShadow: "var(--glass-shadow), inset 0 1px 0 var(--glass-highlight)",
            }}
          >
            {state.entity?.name && <CompanyLogo name={state.entity.name} domain={logoDomain} />}
            <h1 className="truncate text-xl font-semibold text-[var(--text-strong)]">
              {state.entity?.name ?? "Resolving…"}
            </h1>
            {state.entity?.ticker && (
              <span className="rounded-md border border-[var(--glass-border)] bg-[var(--panel-2)]/60 px-2 py-0.5 font-mono text-xs text-[var(--muted)]">
                ${state.entity.ticker}
              </span>
            )}
          </div>
          <ChangesBanner jobId={jobId} enabled={state.jobStatus === "completed"} />
          <DashboardGrid categories={state.categories} running={running} />
        </>
      );
    if (t === "Graph") return <GraphView jobId={jobId} />;
    if (t === "Documentary")
      return (
        <DocumentaryView
          jobId={jobId}
          running={running}
          people={(state.categories.people?.payload?.people ?? []) as { name: string; role?: string; url?: string; wikidata_url?: string }[]}
        />
      );
    if (t === "Notes") return <NotesView jobId={jobId} entityName={state.entity?.name} />;
    if (t === "Careers") return <CareersView state={state.categories.careers} running={running} />;
    return null;
  };

  // a compact tab switcher used inside each split pane's header
  const PaneTabs = ({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) => (
    <div className="mb-2 flex shrink-0 gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-0.5">
      {TABS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`press flex-1 rounded-md px-2 py-1 text-[11px] font-medium ${
            value === t ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--text-strong)]"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );

  return (
    <main className="flex h-screen flex-col overflow-hidden px-5 py-4">
      <header className="mb-4 flex items-center gap-3">
        <Link href="/" className="press wordmark ml-2 text-2xl font-bold">
          Lynx<span>.</span>
        </Link>
        <div className="mx-auto flex items-center gap-2">
        <nav className="glass-bar flex h-8 items-center gap-0.5 rounded-xl border px-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`press rounded-lg px-3.5 py-1 text-[13px] font-medium ${
                tab === t
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--text-strong)]"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
        <button
          onClick={() => {
            setSplit((s) => {
              if (!s && tabB === tab) setTabB(TABS.find((t) => t !== tab) ?? "Graph");
              return !s;
            });
          }}
          title={split ? "Exit split screen" : "Split screen"}
          aria-label="Toggle split screen"
          aria-pressed={split}
          className={`glass-bar press flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
            split ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-strong)]"
          }`}
        >
          <Columns weight="bold" className="h-4 w-4" />
        </button>
        </div>
        <div
          title={state.jobStatus}
          className="glass-bar ml-auto flex h-8 w-8 items-center justify-center rounded-full border"
        >
          {running ? (
            <span className="spinner h-3.5 w-3.5" />
          ) : state.jobStatus === "failed" ? (
            <WarningCircle weight="fill" className="h-4 w-4 text-[var(--neg)]" />
          ) : (
            <CheckCircle weight="fill" className="h-4 w-4 text-[var(--accent)]" />
          )}
        </div>
        <button
          onClick={refresh}
          disabled={running || refreshing}
          title="Re-run research for fresh data"
          className="glass-bar press flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-strong)] disabled:opacity-40"
        >
          {refreshing ? (
            <span className="spinner h-3 w-3" />
          ) : (
            <ArrowsClockwise weight="bold" className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
        <UsageDropdown className="h-8" />
        <DocsLink className="hidden h-8 !py-0 lg:flex" />
        <GithubButton className="h-8 !py-0" />
        <ThemeToggle />
      </header>

      <div ref={splitRef} className="flex min-h-0 flex-1 gap-4">
        <ProgressRail agents={state.agents} layers={state.layers} running={running} collapsed={railCollapsed} />
        <button
          onClick={() => setRailCollapsed((c) => !c)}
          title={railCollapsed ? "Show agents" : "Hide agents"}
          aria-label={railCollapsed ? "Show agent sidebar" : "Hide agent sidebar"}
          className="group -mx-2 flex w-4 shrink-0 items-center justify-center self-stretch"
        >
          <span className="flex h-10 w-4 items-center justify-center rounded-full text-[var(--faint)] transition-colors group-hover:text-[var(--accent)]">
            <CaretLeft weight="bold" className={`h-3.5 w-3.5 transition-transform duration-300 ${railCollapsed ? "rotate-180" : ""}`} />
          </span>
        </button>
        {split ? (
          // two panes side by side, each with its own tab switcher + a draggable divider
          <div ref={paneSplitRef} className="flex min-h-0 min-w-0 flex-1">
            <div style={{ width: `${splitRatio * 100}%` }} className="flex min-h-0 min-w-0 flex-col pr-1">
              <PaneTabs value={tab} onChange={setTab} />
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{renderTab(tab)}</div>
            </div>
            <div
              onPointerDown={startPaneResize}
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize"
              className="group flex w-3 shrink-0 cursor-col-resize items-center justify-center"
            >
              <div className="h-10 w-1 rounded-full bg-[var(--border)] transition-colors group-hover:bg-[var(--accent-line)]" />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-1">
              <PaneTabs value={tabB} onChange={setTabB} />
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{renderTab(tabB)}</div>
            </div>
          </div>
        ) : (
          <>
            <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${tab === "Dashboard" ? "overflow-y-auto" : ""}`}>
              {renderTab(tab)}
            </div>
            {selectedEntityId && (tab === "Graph" || tab === "Documentary") && (
              <>
                <div
                  onPointerDown={startResize}
                  role="separator"
                  aria-orientation="vertical"
                  title="Drag to resize"
                  className="group -mx-2.5 flex w-3 shrink-0 cursor-col-resize items-center justify-center"
                >
                  <div className="h-10 w-1 rounded-full bg-[var(--border)] transition-colors group-hover:bg-[var(--accent-line)]" />
                </div>
                <NodePanel key={selectedEntityId} width={panelWidth} news={newsItems} />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
