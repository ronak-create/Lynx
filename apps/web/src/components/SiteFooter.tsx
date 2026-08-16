"use client";
/* The site footer — deliberately chrome-less: no panel, no background, no top rule. It sits on
   the page's own backdrop so the landing keeps reading as one uninterrupted surface, and only
   the link columns carry any weight. Shared by the landing, About and Docs. */
import Link from "next/link";
import { DiscordLogo, GithubLogo } from "@phosphor-icons/react";
import { FOOTER_COLUMNS, SITE, type FooterLink } from "@/lib/site";
import { LynxMark } from "@/components/LynxMark";

function FooterAnchor({ link }: { link: FooterLink }) {
  const className =
    "press inline-block text-[13px] text-[var(--faint)] hover:text-[var(--text-strong)]";
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

export function SiteFooter({
  className = "",
  width = "max-w-5xl",
  stack = false,
}: {
  className?: string;
  width?: string;
  /** Stack the brand above the link columns — for narrow reading pages, where four columns
      beside the brand block would wrap every second label. */
  stack?: boolean;
}) {
  return (
    <footer className={`mx-auto w-full px-6 pt-20 pb-10 ${width} ${className}`}>
      <div className={`flex flex-col gap-10 ${stack ? "" : "md:flex-row md:justify-between"}`}>
        <div className={stack ? "" : "max-w-xs"}>
          <div className="flex items-center gap-2">
            <LynxMark className="h-7 w-7 text-[var(--text-strong)]" />
            <span className="wordmark text-[19px] font-bold">
              {SITE.name}
              <span>.</span>
            </span>
          </div>
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-[var(--muted)]">
            {SITE.tagline} Open source, runs on free public data, and works with no API keys at all.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <a
              href={SITE.repo}
              target="_blank"
              rel="noreferrer"
              aria-label="Lynx on GitHub"
              title="GitHub"
              className="press flex h-8 w-8 items-center justify-center rounded-lg text-[var(--faint)] hover:bg-[var(--panel-hover)] hover:text-[var(--text-strong)]"
            >
              <GithubLogo weight="fill" className="h-[17px] w-[17px]" />
            </a>
            <a
              href={SITE.discord}
              target="_blank"
              rel="noreferrer"
              aria-label="Lynx on Discord"
              title="Discord"
              className="press flex h-8 w-8 items-center justify-center rounded-lg text-[var(--faint)] hover:bg-[var(--panel-hover)] hover:text-[var(--text-strong)]"
            >
              <DiscordLogo weight="fill" className="h-[17px] w-[17px]" />
            </a>
          </div>
        </div>

        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-4 md:gap-x-14"
        >
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
                {col.title}
              </h2>
              <ul className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <FooterAnchor link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-12 flex flex-col gap-2 text-[12px] text-[var(--faint)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          MIT licensed · built by{" "}
          <a
            href={SITE.author.url}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--muted)] hover:text-[var(--text-strong)]"
          >
            {SITE.author.name}
          </a>
        </p>
        <p>Lynx aggregates public information. Results are a starting point, not advice.</p>
      </div>
    </footer>
  );
}
