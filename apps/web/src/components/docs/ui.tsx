"use client";
/* Typographic primitives for the docs. Deliberately a small, closed set — every docs page is
   built from these, so spacing, colour and rhythm stay identical across the whole section. */
import { useState, type ReactNode } from "react";
import { Check, Copy, Info, Link as LinkIcon, Warning } from "@phosphor-icons/react";

/** Slug used for heading anchors and the "on this page" rail. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function DocTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">{eyebrow}</p>
      <h1 className="mt-2 text-[32px] leading-tight font-bold tracking-tight text-[var(--text-strong)]">{title}</h1>
    </>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[16px] leading-relaxed text-[var(--muted)]">{children}</p>;
}

export function H2({ children }: { children: string }) {
  const id = slug(children);
  return (
    <h2 id={id} className="group mt-14 scroll-mt-24 text-[22px] font-bold tracking-tight text-[var(--text-strong)]">
      <a href={`#${id}`} className="relative">
        {children}
        <LinkIcon
          weight="bold"
          aria-hidden
          className="absolute top-1/2 -left-6 hidden h-4 w-4 -translate-y-1/2 text-[var(--faint)] group-hover:sm:block"
        />
      </a>
    </h2>
  );
}

export function H3({ children }: { children: string }) {
  return (
    <h3 id={slug(children)} className="mt-9 scroll-mt-24 text-[16px] font-semibold text-[var(--text-strong)]">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[14.5px] leading-relaxed text-[var(--muted)]">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-4 flex flex-col gap-2.5">{children}</ul>;
}

export function LI({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-5 text-[14.5px] leading-relaxed text-[var(--muted)]">
      <span aria-hidden className="absolute top-[9px] left-0 h-1.5 w-1.5 rounded-full bg-[var(--border-strong)]" />
      {children}
    </li>
  );
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="mt-4 flex list-decimal flex-col gap-2.5 pl-5 marker:text-[var(--faint)]">{children}</ol>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[5px] border border-[var(--border)] bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--text)]">
      {children}
    </code>
  );
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="text-[var(--accent)] underline decoration-[var(--accent-line)] underline-offset-2 hover:decoration-[var(--accent)]"
    >
      {children}
    </a>
  );
}

export function CodeBlock({ code, caption }: { code: string; caption?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked (insecure context) — the code is selectable anyway */
    }
  };
  return (
    <figure className="mt-5">
      <div className="panel-2 relative overflow-hidden">
        <button
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          title={copied ? "Copied" : "Copy code"}
          className="press absolute top-2.5 right-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--faint)] hover:bg-[var(--panel-hover)] hover:text-[var(--text-strong)]"
        >
          {copied ? <Check weight="bold" className="h-4 w-4 text-[var(--accent)]" /> : <Copy className="h-4 w-4" />}
        </button>
        <pre className="overflow-x-auto px-4 py-3.5 pr-12 font-mono text-[12.5px] leading-[1.75] text-[var(--text)]">
          {code}
        </pre>
      </div>
      {caption && <figcaption className="mt-2 text-[12.5px] text-[var(--faint)]">{caption}</figcaption>}
    </figure>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn";
  title?: string;
  children: ReactNode;
}) {
  const Icon = tone === "warn" ? Warning : Info;
  return (
    <aside
      className={`mt-5 flex gap-3 rounded-xl border p-4 ${
        tone === "warn"
          ? "border-[var(--border-strong)] bg-[var(--panel-2)]"
          : "border-[var(--accent-line)] bg-[var(--accent-soft)]"
      }`}
    >
      <Icon
        weight="duotone"
        className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${
          tone === "warn" ? "text-[var(--muted)]" : "text-[var(--accent)]"
        }`}
      />
      <div className="text-[14px] leading-relaxed text-[var(--muted)]">
        {title && <p className="mb-1 font-semibold text-[var(--text-strong)]">{title}</p>}
        {children}
      </div>
    </aside>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px]">
        <thead>
          <tr>
            {head.map((cell) => (
              <th
                key={cell}
                className="border-b border-[var(--border-strong)] pb-2.5 pr-4 text-[11px] font-semibold tracking-[0.1em] text-[var(--muted)] uppercase"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-[var(--border)] py-2.5 pr-4 align-top leading-relaxed text-[var(--muted)] last:pr-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A labelled step list — used by the quickstart so the shell commands stay in order. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-6 flex flex-col gap-8">{children}</ol>;
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="relative pl-11">
      <span className="panel-2 absolute top-0 left-0 flex h-7 w-7 items-center justify-center rounded-full font-mono text-[12px] text-[var(--accent)]">
        {n}
      </span>
      <h3 className="text-[15px] font-semibold text-[var(--text-strong)]">{title}</h3>
      <div className="[&>*:first-child]:mt-2">{children}</div>
    </li>
  );
}
