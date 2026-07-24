"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass, SlidersHorizontal, ArrowRight, ClockCounterClockwise, Scales } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { useSettings } from "@/stores/settings";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import SwarmWave, { SwarmHandle } from "@/components/SwarmWave";

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [ghostIdx, setGhostIdx] = useState(0); // which prefix suggestion the ghost text shows
  const [starting, setStarting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { llmProvider, categories } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const swarmRef = useRef<SwarmHandle>(null);

  // ripple a wave through the swarm from the search box — a visual "agents fanning out"
  const pulseFromSearch = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    swarmRef.current?.pulse(r.left + r.width / 2, r.top + r.height / 2);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // hide the document scrollbar while on the landing page (still scrollable, just no bar)
  useEffect(() => {
    document.documentElement.classList.add("no-scrollbar-page");
    return () => document.documentElement.classList.remove("no-scrollbar-page");
  }, []);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["autocomplete", debounced],
    queryFn: () => api.autocomplete(debounced),
    enabled: debounced.length >= 2 && !debounced.startsWith("http"),
  });

  // inline ghost-text autocomplete (→ accepts, ↑/↓ switch suggestions) instead of a dropdown.
  // only prefix matches can be completed inline; ↑/↓ cycle through those candidates.
  const candidates =
    query.trim().length >= 2
      ? suggestions.filter(
          (s) => s.name.toLowerCase().startsWith(query.toLowerCase()) && s.name.length > query.length,
        )
      : [];
  const gi = candidates.length ? Math.min(ghostIdx, candidates.length - 1) : 0;
  const top = candidates[gi]?.name;
  const ghost = top ? top.slice(query.length) : "";

  const start = async (q: string) => {
    if (!q.trim() || starting) return;
    pulseFromSearch();
    setStarting(true);
    try {
      const { job_id } = await api.startResearch(q.trim(), { llm_provider: llmProvider, categories });
      router.push(`/research/${job_id}`);
    } catch {
      setStarting(false);
    }
  };

  const { data: runs = [] } = useQuery({ queryKey: ["runs"], queryFn: api.runs });
  // latest run per entity — a night of re-runs shouldn't fill the list with duplicates
  const seen = new Set<string>();
  const recent = runs.filter((r) => {
    const key = (r.entity_name ?? r.query).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <main className="flex min-h-[100dvh] flex-col items-center px-6 pt-[17vh]">
      <SwarmWave ref={swarmRef} />
      <div className="fixed top-5 right-5 z-20">
        <ThemeToggle />
      </div>

      <div className="rise flex flex-col items-center">
        <h1 className="wordmark text-5xl font-bold tracking-tight">
          Lynx<span>.</span>
        </h1>
        <p className="mt-3 max-w-md text-center text-[15px] text-[var(--muted)]">
          Type a company or paste a URL. Get a live dashboard, a knowledge graph, and a documentary.
        </p>
      </div>

      <div className="rise relative mt-8 w-full max-w-xl">
        <div className="relative">
          <MagnifyingGlass
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-[var(--faint)]"
          />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onFocus={pulseFromSearch}
            onChange={(e) => {
              setQuery(e.target.value);
              setGhostIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") start(top ?? query);
              // ↑/↓ switch which suggestion the ghost text shows
              else if (e.key === "ArrowDown" && candidates.length) {
                e.preventDefault();
                setGhostIdx((i) => Math.min(i + 1, candidates.length - 1));
              } else if (e.key === "ArrowUp" && candidates.length) {
                e.preventDefault();
                setGhostIdx((i) => Math.max(i - 1, 0));
              }
              // → accepts the ghost completion, but only when the caret is at the end
              else if (e.key === "ArrowRight" && ghost && e.currentTarget.selectionStart === query.length) {
                e.preventDefault();
                setQuery(top!);
                setGhostIdx(0);
              }
            }}
            placeholder='Try "Microsoft", "Anthropic", or https://figma.com'
            className="panel w-full py-4 pr-14 pl-12 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent-line)]"
            disabled={starting}
          />
          {/* inline ghost text: the invisible query span pushes the grey completion to the caret */}
          {ghost && !starting && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center overflow-hidden py-4 pr-14 pl-12 text-[15px] whitespace-pre"
            >
              <span className="invisible">{query}</span>
              <span className="text-[var(--faint)]">
                {ghost}
                <span className="ml-2 rounded border border-[var(--border)] px-1 py-0.5 align-middle font-mono text-[9px] tracking-wide text-[var(--faint)]">
                  →
                </span>
              </span>
            </div>
          )}
          <button
            onClick={() => start(query)}
            disabled={!query.trim() || starting}
            aria-label="Start research"
            className="press btn-accent absolute top-1/2 right-2.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg disabled:opacity-30"
          >
            {starting ? <span className="spinner h-4 w-4 border-white/40 border-t-white" /> : <ArrowRight weight="bold" className="h-[18px] w-[18px]" />}
          </button>
        </div>

        {starting && (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
            <span className="spinner h-3.5 w-3.5" /> Deploying research agents…
          </p>
        )}

        <div className="mt-2.5 flex justify-end">
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="press flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text-strong)]"
          >
            <SlidersHorizontal weight="bold" className="h-3.5 w-3.5" />
            {showSettings ? "Hide options" : "Model & options"}
          </button>
        </div>
      </div>

      {/* always mounted; the .is-open class drives the grid-rows reveal both ways (open + close) */}
      <div className={`reveal-collapse w-full max-w-xl ${showSettings ? "is-open" : ""}`}>
        <div className="min-h-0 overflow-hidden">
          <SettingsPanel />
        </div>
      </div>

      {recent.length > 0 && (
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
          <ul className="panel divide-y divide-[var(--border)] overflow-hidden">
            {recent.slice(0, 6).map((r) => (
              <li
                key={r.job_id}
                onClick={() => router.push(`/research/${r.job_id}`)}
                className="group flex cursor-pointer items-center justify-between px-4 py-3 text-sm hover:bg-[var(--panel-hover)]"
              >
                <span className="text-[var(--text)] group-hover:text-[var(--text-strong)]">
                  {r.entity_name ?? r.query}
                </span>
                <span className="flex items-center gap-3 font-mono text-xs text-[var(--faint)]">
                  <span>
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="capitalize">{r.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
