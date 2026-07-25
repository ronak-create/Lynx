"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Key, ArrowLeft, Eye, EyeSlash, Check } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { useSettings } from "@/stores/settings";
import { useApiKeys } from "@/stores/apiKeys";

// per-provider hint shown in the key field (secrets, except ollama which is a base URL)
const KEY_HINT: Record<string, { placeholder: string; note?: string }> = {
  groq: { placeholder: "gsk_…" },
  cerebras: { placeholder: "csk-…" },
  openrouter: { placeholder: "sk-or-…" },
  ollama: { placeholder: "http://localhost:11434", note: "Base URL, not a secret." },
  firecrawl: { placeholder: "fc-…", note: "Crawler fallback for JS-heavy pages." },
};

export function SettingsPanel() {
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.config });
  const { llmProvider, setLlmProvider, toggleCategory, isCategoryOn } = useSettings();
  const { keys, setKey, hasKey, save, setSave } = useApiKeys();
  const [showKeys, setShowKeys] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  if (!config) return null;
  const allCats = config.categories.map((c) => c.id);
  // providers that actually take a key/URL — "auto" and "none" don't
  const keyProviders = config.llm_providers.filter((p) => p.id !== "auto" && p.id !== "none");

  const renderField = (id: string, label: string) => {
    const hint = KEY_HINT[id] ?? { placeholder: "API key" };
    const shown = reveal[id];
    const value = keys[id] ?? "";
    return (
      <label key={id} className="block">
        <span className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--text)]">
          {label}
          {value && <Check weight="bold" className="h-3 w-3 text-[var(--accent)]" />}
        </span>
        <div className="relative">
          <input
            type={shown ? "text" : "password"}
            value={value}
            onChange={(e) => setKey(id, e.target.value)}
            placeholder={hint.placeholder}
            autoComplete="off"
            spellCheck={false}
            className="panel w-full py-2 pr-10 pl-3 font-mono text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent-line)]"
          />
          <button
            type="button"
            onClick={() => setReveal((r) => ({ ...r, [id]: !r[id] }))}
            aria-label={shown ? "Hide" : "Show"}
            className="press absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--faint)] hover:text-[var(--text-strong)]"
          >
            {shown ? <EyeSlash weight="bold" className="h-4 w-4" /> : <Eye weight="bold" className="h-4 w-4" />}
          </button>
        </div>
        {hint.note && <span className="mt-1 block text-[10px] text-[var(--faint)]">{hint.note}</span>}
      </label>
    );
  };

  return (
    <div className="panel relative mt-3 w-full max-w-xl p-4 text-sm">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">
          Model
        </h3>
        <div className="flex flex-wrap gap-2">
          {config.llm_providers.map((p) => {
            const local = hasKey(p.id);
            const disabled = !p.configured && !local;
            const selected = llmProvider === p.id;
            return (
              <button
                key={p.id}
                disabled={disabled}
                onClick={() => setLlmProvider(p.id)}
                title={disabled ? "Not configured — add an API key via “Configure keys”" : p.model ?? undefined}
                className={`press flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] ${
                  selected
                    ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text-strong)]"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {p.label}
                {p.model && <span className="font-mono text-[10px] opacity-60">{p.model}</span>}
                {local && <Key weight="fill" className="h-3 w-3 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          Providers without a key are greyed out — add one via <strong>Configure keys</strong>. Keys are
          stored only in your browser. &ldquo;No LLM&rdquo; still returns a full dashboard, a metadata
          graph, and a template documentary.
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

      {/* Configure keys lives at the bottom-right of the panel — click toggles the slide-out */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setShowKeys((s) => !s)}
          aria-expanded={showKeys}
          className={`press flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] ${
            showKeys
              ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text-strong)]"
          }`}
        >
          <Key weight="bold" className="h-3.5 w-3.5" />
          {showKeys ? "Close keys" : "Configure keys"}
        </button>
      </div>

      {/* key configuration — unrolls sideways out of the model box's right edge */}
      <div
        className={`reveal-collapse-x absolute inset-y-0 left-full ml-3 w-80 ${showKeys ? "is-open" : ""}`}
        aria-hidden={!showKeys}
      >
        <div className={`h-full min-w-0 overflow-hidden ${showKeys ? "" : "pointer-events-none"}`}>
          <div className="panel flex h-full w-80 flex-col p-4">
            <div className="mb-3 flex shrink-0 items-center gap-2">
              <button
                onClick={() => setShowKeys(false)}
                aria-label="Back"
                className="press flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text-strong)]"
              >
                <ArrowLeft weight="bold" className="h-4 w-4" />
              </button>
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">
                <Key weight="bold" className="h-3.5 w-3.5" />
                Provider API keys
              </h3>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {keyProviders.map((p) => renderField(p.id, p.label))}
              {/* non-LLM data-source keys */}
              <div className="mt-1 border-t border-[var(--border)] pt-3">
                <span className="mb-2 block text-[10px] font-semibold tracking-wider text-[var(--muted)] uppercase">
                  Data source
                </span>
                {renderField("firecrawl", "Firecrawl")}
              </div>
            </div>

            {/* save choice + terms — pinned footer, always visible */}
            <div className="mt-4 shrink-0 border-t border-[var(--border)] pt-3">
              <label className="flex cursor-pointer items-start gap-2 text-[12px] text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={save}
                  onChange={(e) => setSave(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                />
                <span>
                  Save config
                  <span className="text-[var(--muted)]">
                    {" "}
                    — keep keys in this browser.{" "}
                    <Link
                      href="/terms"
                      className="text-[var(--accent)] underline decoration-[var(--accent-line)] underline-offset-2 hover:opacity-80"
                    >
                      Terms &amp; conditions
                    </Link>
                  </span>
                </span>
              </label>
              <p className="mt-2 text-[11px] text-[var(--faint)]">
                {save
                  ? "Keys persist in localStorage until you clear them."
                  : "Keys are kept only for this session and cleared on reload."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
