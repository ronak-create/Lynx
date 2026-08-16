"use client";
/* Link to the in-app documentation. Shared by the landing and app headers.
   (The code-level DeepWiki walkthrough is linked from inside /docs, not from here.) */
import Link from "next/link";
import { BookOpen } from "@phosphor-icons/react";

export function DocsLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/docs"
      title="Read the docs"
      className={`press flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[13px] font-medium text-[var(--muted)] hover:text-[var(--text-strong)] ${className}`}
    >
      <BookOpen weight="bold" className="h-4 w-4" />
      Docs
    </Link>
  );
}
