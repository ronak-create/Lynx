"use client";
/* Docs sidebar: the section list on desktop, a compact select on small screens. Active page is
   marked with the accent rail rather than a filled pill, so the reading column stays dominant. */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen } from "@phosphor-icons/react";
import { DOCS_NAV, DOCS_PAGES } from "@/lib/docs-nav";
import { SITE } from "@/lib/site";

export function DocsSidebar() {
  const pathname = usePathname() ?? "/docs";
  const router = useRouter();

  return (
    <>
      {/* mobile: one control instead of a long list pushing the content down */}
      <div className="mb-6 lg:hidden">
        <label htmlFor="docs-page" className="sr-only">
          Documentation page
        </label>
        <select
          id="docs-page"
          value={pathname}
          onChange={(e) => router.push(e.target.value)}
          className="panel-2 w-full px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
        >
          {DOCS_NAV.map((section) => (
            <optgroup key={section.title} label={section.title}>
              {section.pages.map((page) => (
                <option key={page.href} value={page.href}>
                  {page.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <nav aria-label="Documentation" className="hidden lg:block">
        <div className="flex flex-col gap-7">
          {DOCS_NAV.map((section) => (
            <div key={section.title}>
              <h2 className="mb-2.5 text-[11px] font-semibold tracking-[0.14em] text-[var(--faint)] uppercase">
                {section.title}
              </h2>
              <ul className="flex flex-col border-l border-[var(--border)]">
                {section.pages.map((page) => {
                  const active = pathname === page.href;
                  return (
                    <li key={page.href}>
                      <Link
                        href={page.href}
                        aria-current={active ? "page" : undefined}
                        className={`-ml-px block border-l py-1.5 pl-3.5 text-[13.5px] ${
                          active
                            ? "border-[var(--accent)] font-medium text-[var(--text-strong)]"
                            : "border-transparent text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-strong)]"
                        }`}
                      >
                        {page.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <a
          href={SITE.deepwiki}
          target="_blank"
          rel="noreferrer"
          className="press mt-8 flex items-start gap-2.5 rounded-xl border border-[var(--border)] p-3 text-[12.5px] leading-relaxed text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-strong)]"
        >
          <BookOpen weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
          <span>
            <span className="block font-medium text-[var(--text-strong)]">Code-level wiki</span>
            Module-by-module walkthrough of the source on DeepWiki.
          </span>
        </a>
        <p className="mt-4 pl-0.5 text-[11.5px] text-[var(--faint)]">
          {DOCS_PAGES.length} pages · edit them in <code className="font-mono">apps/web/src/app/docs</code>
        </p>
      </nav>
    </>
  );
}
