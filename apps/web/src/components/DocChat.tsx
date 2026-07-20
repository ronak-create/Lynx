"use client";
import { useRef, useState } from "react";
import { PaperPlaneRight, Sparkle } from "@phosphor-icons/react";
import { api, ChatSource } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string; sources?: ChatSource[]; grounded?: boolean };

const SUGGESTIONS = ["Summarize this company", "How legitimate is it?", "Who are the competitors?", "What are the risks?"];

/* Research assistant: a RAG chat grounded in THIS run's documentary + category results.
   Lives in the Documentary tab's right sidebar. */
export function DocChat({ jobId, disabled }: { jobId: string; disabled?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || pending || disabled) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setPending(true);
    try {
      const res = await api.ask(jobId, question, history);
      setMessages((m) => [...m, { role: "assistant", content: res.answer, sources: res.sources, grounded: res.grounded }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I couldn't answer that right now." }]);
    } finally {
      setPending(false);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
      );
    }
  };

  return (
    <aside className="panel flex h-full w-[360px] shrink-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <Sparkle weight="duotone" className="h-4 w-4 text-[var(--accent)]" />
        <h3 className="text-[13px] font-semibold text-[var(--text-strong)]">Research assistant</h3>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2.5">
            <p className="text-[13px] leading-relaxed text-[var(--muted)]">
              Ask anything about this company — answers are grounded in the research on this page.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={disabled}
                  className="press rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1 text-[11px] text-[var(--text)] hover:border-[var(--accent-line)] disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[86%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                m.role === "user"
                  ? "bg-[var(--accent-soft)] text-[var(--text-strong)]"
                  : "bg-[var(--panel-2)] text-[var(--text)]"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {[...new Set(m.sources.map((s) => s.label))].map((label) => (
                    <span
                      key={label}
                      title={m.sources!.find((s) => s.label === label)?.snippet}
                      className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[10px] text-[var(--faint)]"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-[var(--panel-2)] px-3 py-2">
              <span className="spinner h-3.5 w-3.5" />
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-[var(--border)] p-2.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled || pending}
          placeholder={disabled ? "Waiting for research…" : "Ask a question…"}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent-line)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || pending || !input.trim()}
          aria-label="Send"
          className="press flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-bright)] disabled:opacity-30"
        >
          <PaperPlaneRight weight="bold" className="h-4 w-4" />
        </button>
      </form>
    </aside>
  );
}
