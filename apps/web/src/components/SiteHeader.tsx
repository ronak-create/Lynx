"use client";
/* Shared chrome for the non-app pages (About, Docs, Terms): mark + wordmark on the left,
   text nav + repo button + theme toggle on the right. The landing keeps its own minimal
   floating header so the search box stays the only thing competing for attention. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GithubButton } from "@/components/GithubButton";
import { LynxMark } from "@/components/LynxMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SITE } from "@/lib/site";

const NAV = [
  { label: "Research", href: "/" },
  { label: "Docs", href: "/docs" },
  { label: "About", href: "/about" },
];

export function SiteHeader({ width = "max-w-5xl" }: { width?: string }) {
  const pathname = usePathname() ?? "";
  return (
    // full-bleed bar, inner container matched to the page's reading column so the mark lines up
    // with the first character of the content beneath it
    <header className="glass-bar sticky top-0 z-30 w-full border-b">
      <div className={`mx-auto flex w-full items-center gap-3 px-6 py-3 ${width}`}>
        <Link href="/" className="press flex items-center gap-2" aria-label={`${SITE.name} home`}>
          <LynxMark className="h-7 w-7 text-[var(--text-strong)]" />
          <span className="wordmark text-[17px] font-bold">
            {SITE.name}
            <span>.</span>
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 sm:flex" aria-label="Main">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`press rounded-lg px-2.5 py-1.5 text-[13px] font-medium ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--text-strong)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <GithubButton className="hidden sm:flex" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
