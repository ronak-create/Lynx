"use client";
/* Link to the project's DeepWiki docs. Shared by the landing and app headers. */
import { BookOpen } from "@phosphor-icons/react";

const DOCS = "https://deepwiki.com/ronak-create/Lynx";

export function DocsLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={DOCS}
      target="_blank"
      rel="noreferrer"
      title="Read the docs on DeepWiki"
      className={`press flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[13px] font-medium text-[var(--muted)] hover:text-[var(--text-strong)] ${className}`}
    >
      <BookOpen weight="bold" className="h-4 w-4" />
      Docs
    </a>
  );
}
