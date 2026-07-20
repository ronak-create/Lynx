"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass, SlidersHorizontal, ArrowRight, ClockCounterClockwise, Scales } from "@phosphor-icons/react";
import { api, Suggestion } from "@/lib/api";
import { useSettings } from "@/stores/settings";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [starting, setStarting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { llmProvider, categories } = useSettings();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["autocomplete", debounced],
    queryFn: () => api.autocomplete(debounced),
    enabled: debounced.length >= 2 && !debounced.startsWith("http"),
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const start = async (q: string) => {
    if (!q.trim() || starting) return;
    setStarting(true);
    try {
      const { job_id } = await api.startResearch(q.trim(), { llm_provider: llmProvider, categories });
      router.push(`/research/${job_id}`);
    } catch {
      setStarting(false);
    }
  };

  const { data: runs = [] } = useQuery({ queryKey: ["runs"], queryFn: api.runs });

  return (
    <main className="flex min-h-[100dvh] flex-col items-center px-6 pt-[17vh]">
      <div className="fixed top-5 right-5 z-20">
        <ThemeToggle />
      </div>

      <div className="rise flex flex-col items-center">
        <h1 className="text-5xl font-bold tracking-tight text-[var(--text-strong)]">
          Lynx<span className="text-[var(--accent)]">.</span>
        </h1>
        <p className="mt-3 max-w-md text-center text-[15px] text-[var(--muted)]">
          Type a company or paste a URL. Get a live dashboard, a knowledge graph, and a documentary.
        </p>
      </div>

      <div ref={boxRef} className="rise relative mt-8 w-full max-w-xl">
        <div className="relative">
          <MagnifyingGlass
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-[var(--faint)]"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, suggestions.length - 1));
              else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, -1));
              else if (e.key === "Enter") {
                const sel: Suggestion | undefined = active >= 0 ? suggestions[active] : undefined;
                start(sel ? sel.name : query);
              } else if (e.key === "Escape") setOpen(false);
            }}
            placeholder='Try "Microsoft", "Anthropic", or https://figma.com'
            className="panel w-full py-4 pr-14 pl-12 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent-line)]"
            disabled={starting}
          />
          <button
            onClick={() => start(query)}
            disabled={!query.trim() || starting}
            aria-label="Start research"
            className="press absolute top-1/2 right-2.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-bright)] disabled:opacity-30"
          >
            {starting ? <span className="spinner h-4 w-4 border-white/40 border-t-white" /> : <ArrowRight weight="bold" className="h-[18px] w-[18px]" />}
          </button>
        </div>

        {open && suggestions.length > 0 && (
          <ul className="panel pop-top absolute z-10 mt-2 w-full overflow-hidden p-1 shadow-[var(--shadow-pop)]">
            {suggestions.map((s, i) => (
              <li
                key={`${s.name}-${s.kind}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={() => start(s.name)}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-3.5 py-2.5 text-sm ${
                  i === active ? "bg-[var(--panel-2)] text-[var(--text-strong)]" : "text-[var(--text)]"
                }`}
              >
                <span>{s.name}</span>
                <span className="font-mono text-xs text-[var(--faint)]">
                  {s.ticker ? `$${s.ticker}` : s.kind === "wikipedia" ? "wiki" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

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

      {showSettings && (
        <div className="pop-top w-full max-w-xl">
          <SettingsPanel />
        </div>
      )}

      {runs.length > 0 && (
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
            {runs.slice(0, 6).map((r) => (
              <li
                key={r.job_id}
                onClick={() => router.push(`/research/${r.job_id}`)}
                className="group flex cursor-pointer items-center justify-between px-4 py-3 text-sm hover:bg-[var(--panel-hover)]"
              >
                <span className="text-[var(--text)] group-hover:text-[var(--text-strong)]">
                  {r.entity_name ?? r.query}
                </span>
                <span className="font-mono text-xs text-[var(--faint)] capitalize">{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
