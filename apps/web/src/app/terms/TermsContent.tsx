"use client";
import Link from "next/link";
import { FileText } from "@phosphor-icons/react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const UPDATED = "July 25, 2026";

export function TermsContent() {
  return (
    <>
      <SiteHeader width="max-w-3xl" />
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-14">
      <h1 className="mb-8 flex items-center gap-2.5 text-[26px] font-bold tracking-tight text-[var(--text-strong)]">
        <FileText weight="duotone" className="h-6 w-6 text-[var(--accent)]" />
        Terms &amp; Conditions
      </h1>

      <article className="flex flex-col gap-6 text-[14px] leading-relaxed text-[var(--text)]">
        <p className="text-[13px] text-[var(--muted)]">Last updated: {UPDATED}</p>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-[var(--text-strong)]">1. What Lynx is</h2>
          <p className="text-[var(--muted)]">
            Lynx is a research tool that assembles a live dashboard, a knowledge graph, and a generated
            documentary about a company or entity you look up. It aggregates information from public
            sources and, optionally, a language model you point it at. Results are provided as-is and may
            be incomplete, out of date, or inaccurate — treat them as a starting point, not as
            professional, legal, financial, or investment advice.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-[var(--text-strong)]">2. API keys you provide</h2>
          <p className="text-[var(--muted)]">
            You may enter API keys for third-party model providers (e.g. Groq, Cerebras, OpenRouter, or a
            local Ollama endpoint). When you tick <strong>Save config</strong>, these keys are stored only
            in your browser&rsquo;s <code>localStorage</code> on this device. They are never sent to Lynx
            servers for storage. If you leave <strong>Save config</strong> unticked, keys are held in
            memory only for the current session and are cleared when you reload or close the tab.
          </p>
          <p className="mt-2 text-[var(--muted)]">
            You are responsible for keeping your keys confidential and for any usage, billing, or rate
            limits incurred on the provider accounts they belong to. Anyone with access to this browser
            profile can read keys saved in <code>localStorage</code>. Clear a field, or untick
            <strong> Save config</strong>, to remove a stored key.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-[var(--text-strong)]">3. Acceptable use</h2>
          <p className="text-[var(--muted)]">
            Use Lynx lawfully and in line with the terms of every data source and model provider it
            reaches on your behalf. Do not use it to harass, deceive, infringe others&rsquo; rights, or to
            generate content that violates applicable law or a provider&rsquo;s policies.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-[var(--text-strong)]">4. No warranty &amp; liability</h2>
          <p className="text-[var(--muted)]">
            The service is provided &ldquo;as is&rdquo; without warranties of any kind. To the extent
            permitted by law, the operators of Lynx are not liable for any loss arising from your use of
            the tool, the generated output, or any third-party service you connect to it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-[var(--text-strong)]">5. Changes</h2>
          <p className="text-[var(--muted)]">
            These terms may be updated from time to time. Continued use after a change means you accept the
            revised terms.
          </p>
        </section>
      </article>

      <div className="mt-10 border-t border-[var(--border)] pt-4">
        <Link
          href="/"
          className="press text-[13px] text-[var(--accent)] underline decoration-[var(--accent-line)] underline-offset-2 hover:opacity-80"
        >
          ← Back to Lynx
        </Link>
      </div>
      </main>
      <SiteFooter width="max-w-3xl" stack />
    </>
  );
}
