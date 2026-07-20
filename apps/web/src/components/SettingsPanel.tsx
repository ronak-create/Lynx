"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSettings } from "@/stores/settings";

export function SettingsPanel() {
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.config });
  const { llmProvider, setLlmProvider, toggleCategory, isCategoryOn } = useSettings();

  if (!config) return null;
  const allCats = config.categories.map((c) => c.id);

  return (
    <div className="panel mt-3 w-full max-w-xl p-4 text-sm">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">
          Model
        </h3>
        <div className="flex flex-wrap gap-2">
          {config.llm_providers.map((p) => {
            const disabled = !p.configured;
            const selected = llmProvider === p.id;
            return (
              <button
                key={p.id}
                disabled={disabled}
                onClick={() => setLlmProvider(p.id)}
                title={disabled ? "Not configured — add an API key in .env" : p.model ?? undefined}
                className={`press rounded-lg border px-3 py-1.5 text-[13px] ${
                  selected
                    ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text-strong)]"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {p.label}
                {p.model && <span className="ml-1 font-mono text-[10px] opacity-60">{p.model}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          Greyed-out providers need an API key in <code>.env</code>. &ldquo;No LLM&rdquo; still returns a full
          dashboard, a metadata graph, and a template documentary.
        </p>
      </div>

      <div className="mt-4">
        <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">
          Research categories
        </h3>
        <div className="flex flex-wrap gap-2">
          {config.categories.map((c) => {
            const on = isCategoryOn(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCategory(c.id, allCats)}
                className={`press rounded-full border px-3 py-1 text-[12px] ${
                  on
                    ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--faint)] line-through"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
