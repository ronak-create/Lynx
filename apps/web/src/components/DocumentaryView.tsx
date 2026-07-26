"use client";
/* Renders the generated documentary. Backend emits Obsidian-style links `[[Text|entity:<id>]]`;
   we rewrite them to markdown links with an entity: protocol and intercept them so hover
   cross-highlights the graph node and click opens the NodePanel. */
import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DownloadSimple, CaretDown, FilePdf, FileDoc } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { useHighlight } from "@/stores/highlight";
import { DocChat } from "./DocChat";
import { MediaPreview } from "./MediaPreview";
import { PersonAvatar } from "./PersonAvatar";

const WIKI_LINK = /\[\[([^\]|]+)\|entity:([0-9a-f-]{36})\]\]/g;

type DocPerson = { name: string; role?: string; url?: string; wikidata_url?: string };

function CastStrip({ people }: { people: DocPerson[] }) {
  if (people.length === 0) return null;
  return (
    <div className="mb-6 flex flex-wrap gap-x-5 gap-y-3 border-b border-[var(--border)] pb-5">
      {people.slice(0, 10).map((p) => {
        const href = p.wikidata_url ?? p.url;
        const body = (
          <>
            <PersonAvatar name={p.name} size={40} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium text-[var(--text-strong)]">{p.name}</span>
              {p.role && (
                <span className="truncate text-[11px] text-[var(--muted)]">{String(p.role).replace(/_/g, " ")}</span>
              )}
            </span>
          </>
        );
        return href ? (
          <a key={p.name + (p.role ?? "")} href={href} target="_blank" rel="noreferrer" className="press flex items-center gap-2.5">
            {body}
          </a>
        ) : (
          <span key={p.name + (p.role ?? "")} className="flex items-center gap-2.5">
            {body}
          </span>
        );
      })}
    </div>
  );
}

// print-ready CSS shared by the PDF (print window) and DOC (Word HTML) exports
const EXPORT_CSS = `
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.6; max-width: 720px; margin: 40px auto; padding: 0 24px; }
  h1, h2, h3 { font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.25; }
  h1 { font-size: 26px; margin: 0 0 16px; }
  h2 { font-size: 20px; margin: 28px 0 10px; }
  h3 { font-size: 16px; margin: 22px 0 8px; }
  p { margin: 0 0 12px; }
  a { color: #1a1a1a; text-decoration: none; }
  img { display: block; max-width: 360px; width: auto; height: auto; margin: 16px auto; border-radius: 6px; }
  blockquote { border-left: 3px solid #ccc; margin: 12px 0; padding: 4px 0 4px 16px; color: #444; }
  ul, ol { margin: 0 0 12px; padding-left: 22px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
`;

function buildExportHtml(title: string, bodyHtml: string, forWord: boolean) {
  const wordNs = forWord
    ? " xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'"
    : "";
  return `<!DOCTYPE html><html${wordNs}><head><meta charset="utf-8"><title>${title}</title><style>${EXPORT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}

function slugify(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "documentary";
}

function DownloadMenu({ getHtml, title }: { getHtml: () => string; title: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const name = slugify(title);

  const downloadDoc = () => {
    const html = buildExportHtml(title, getHtml(), true);
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const downloadPdf = () => {
    // auto-print only AFTER images/fonts have loaded, so nothing prints at the wrong size
    const body = `${getHtml()}<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});<\/script>`;
    const html = buildExportHtml(title, body, false);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="press flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--muted)] uppercase hover:border-[var(--border-strong)] hover:text-[var(--text-strong)]"
      >
        <DownloadSimple weight="bold" className="h-3.5 w-3.5" />
        Download
        <CaretDown weight="bold" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-40 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] py-1 shadow-xl">
          <button
            onClick={downloadPdf}
            className="press flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[var(--text)] hover:bg-[var(--panel-hover)]"
          >
            <FilePdf weight="bold" className="h-4 w-4 text-[var(--neg)]" />
            PDF
          </button>
          <button
            onClick={downloadDoc}
            className="press flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[var(--text)] hover:bg-[var(--panel-hover)]"
          >
            <FileDoc weight="bold" className="h-4 w-4 text-[var(--accent)]" />
            Word (.doc)
          </button>
        </div>
      )}
    </div>
  );
}

export function DocumentaryView({
  jobId,
  running,
  people = [],
}: {
  jobId: string;
  running: boolean;
  people?: DocPerson[];
}) {
  const { setHovered, setSelected } = useHighlight();
  const articleRef = useRef<HTMLDivElement>(null);

  // Build clean export HTML from the rendered article: strip Tailwind classes (they don't exist
  // in the export window / Word) and give every image an explicit, capped size so it lands
  // formatted — centered, at a sane width — instead of at its raw intrinsic pixels.
  const collectExportHtml = () => {
    const node = articleRef.current;
    if (!node) return "";
    const clone = node.cloneNode(true) as HTMLElement;
    const liveImgs = node.querySelectorAll("img");
    clone.querySelectorAll("img").forEach((img, i) => {
      const live = liveImgs[i] as HTMLImageElement | undefined;
      const shown = live ? live.clientWidth || live.naturalWidth || 320 : 320;
      const w = Math.round(Math.min(shown, 360));
      img.removeAttribute("class");
      img.removeAttribute("loading");
      img.setAttribute("width", String(w));
      img.setAttribute("style", "display:block;max-width:360px;height:auto;margin:16px auto;border-radius:6px;");
    });
    // drop interactive entity-link styling but keep the text
    clone.querySelectorAll(".wiki-link").forEach((el) => el.removeAttribute("class"));
    return clone.innerHTML;
  };

  const { data, error } = useQuery({
    queryKey: ["document", jobId],
    queryFn: () => api.document(jobId),
    retry: false,
    refetchInterval: (q) => (q.state.data || !running ? false : 5000),
  });

  const markdown = useMemo(
    () => data?.markdown.replace(WIKI_LINK, (_m, text, id) => `[${text}](entity:${id})`),
    [data],
  );

  // The chat sidebar is available as soon as the run has finished (its corpus is the run's
  // results), even if a documentary was never generated.
  const chat = <DocChat jobId={jobId} disabled={running} />;

  if (!data) {
    return (
      <div className="flex h-full min-h-0 gap-4">
        <div className="panel flex flex-1 items-center justify-center gap-2.5 text-sm text-[var(--muted)]">
          {(running || !error) && <span className="spinner h-4 w-4" />}
          <span>
            {running ? "Writing documentary…" : error ? "No documentary was generated for this run" : "Loading…"}
          </span>
        </div>
        {chat}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="panel rise flex-1 overflow-y-auto px-8 py-6">
      <div className="doc-prose mx-auto max-w-3xl text-[15px]">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--border)] pb-3">
          <p className="text-[11px] tracking-[0.1em] text-[var(--faint)] uppercase">
            {data.method === "llm" ? "LLM narrative + sourced data" : "Template from sourced data"} · entity links
            highlight the graph
          </p>
          <DownloadMenu title="documentary" getHtml={collectExportHtml} />
        </div>
        <div ref={articleRef}>
        <CastStrip people={people} />
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url) => url /* preserve entity: scheme; content is backend-generated */}
          components={{
            img: ({ src, alt }) =>
              typeof src === "string" ? (
                <MediaPreview src={src} alt={alt ?? ""} className="mx-auto my-5 max-h-72 w-auto object-contain p-2" />
              ) : null,
            a: ({ href, children }) => {
              if (href?.startsWith("entity:")) {
                const id = href.slice(7);
                return (
                  <span
                    className="wiki-link"
                    onMouseEnter={() => setHovered(id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(id)}
                  >
                    {children}
                  </span>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
        </div>
      </div>
      </div>
      {chat}
    </div>
  );
}
