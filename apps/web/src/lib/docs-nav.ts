/* The docs table of contents. One list drives the sidebar, the mobile picker, prev/next
   paging and the footer's docs column, so a new page is added in exactly one place. */

export type DocsPage = { href: string; label: string; summary: string };
export type DocsSection = { title: string; pages: DocsPage[] };

export const DOCS_NAV: DocsSection[] = [
  {
    title: "Getting started",
    pages: [
      {
        href: "/docs",
        label: "Overview",
        summary: "What Lynx does, what a run produces, and how the pieces fit together.",
      },
      {
        href: "/docs/quickstart",
        label: "Quickstart",
        summary: "Install the toolchain, start both services, and run your first research job.",
      },
    ],
  },
  {
    title: "How it works",
    pages: [
      {
        href: "/docs/architecture",
        label: "Architecture",
        summary: "The four phases of a run, the streaming layer, and the graph data model.",
      },
      {
        href: "/docs/agents",
        label: "Agents",
        summary: "Every research agent, what it answers, and how to add your own.",
      },
      {
        href: "/docs/sources",
        label: "Data sources",
        summary: "The source ladder, caching and rate limits, and writing a new adapter.",
      },
      {
        href: "/docs/models",
        label: "Models & degraded mode",
        summary: "Provider chain, per-run selection, and what still works with no LLM at all.",
      },
    ],
  },
  {
    title: "Reference",
    pages: [
      {
        href: "/docs/api",
        label: "HTTP API",
        summary: "Every endpoint, the SSE event stream, and the shapes they return.",
      },
      {
        href: "/docs/self-hosting",
        label: "Self-hosting",
        summary: "Docker, environment variables, CORS, persistence and production notes.",
      },
      {
        href: "/docs/faq",
        label: "FAQ & troubleshooting",
        summary: "Known limits, common failure modes, and what to do about them.",
      },
    ],
  },
];

export const DOCS_PAGES: DocsPage[] = DOCS_NAV.flatMap((section) => section.pages);

export function docsNeighbours(pathname: string): { prev?: DocsPage; next?: DocsPage } {
  const index = DOCS_PAGES.findIndex((page) => page.href === pathname);
  if (index === -1) return {};
  return { prev: DOCS_PAGES[index - 1], next: DOCS_PAGES[index + 1] };
}
