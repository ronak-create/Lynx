"use client";
/* Previous/next paging derived from the same nav config the sidebar uses. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { docsNeighbours } from "@/lib/docs-nav";

export function DocsPager() {
  const pathname = usePathname() ?? "";
  const { prev, next } = docsNeighbours(pathname);
  if (!prev && !next) return null;

  return (
    <nav aria-label="Docs pagination" className="mt-16 grid gap-3 border-t border-[var(--border)] pt-6 sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className="press group rounded-xl border border-[var(--border)] p-4 hover:border-[var(--border-strong)]">
          <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--faint)]">
            <ArrowLeft weight="bold" className="h-3.5 w-3.5" /> Previous
          </span>
          <span className="mt-1 block text-[14px] font-medium text-[var(--text-strong)]">{prev.label}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={next.href}
          className="press group rounded-xl border border-[var(--border)] p-4 text-right hover:border-[var(--border-strong)] sm:col-start-2"
        >
          <span className="flex items-center justify-end gap-1.5 text-[11.5px] text-[var(--faint)]">
            Next <ArrowRight weight="bold" className="h-3.5 w-3.5" />
          </span>
          <span className="mt-1 block text-[14px] font-medium text-[var(--text-strong)]">{next.label}</span>
        </Link>
      )}
    </nav>
  );
}
