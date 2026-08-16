/* Every outbound link the site chrome uses, in one place — change a URL here and the header,
   footer, About page and docs all follow. Anything left empty is simply not rendered, so a
   channel that doesn't exist yet never ships as a dead link. */

export const SITE = {
  name: "Lynx",
  tagline: "See any company clearly.",
  description:
    "Type a company or paste a URL. Fifteen research agents fan out across public sources and return a live dashboard, a knowledge graph, a documentary, and live job postings.",
  repo: "https://github.com/ronak-create/Lynx",
  issues: "https://github.com/ronak-create/Lynx/issues",
  discussions: "https://github.com/ronak-create/Lynx/discussions",
  deepwiki: "https://deepwiki.com/ronak-create/Lynx",
  discord: "https://discord.gg/XdMmjD5qU",
  license: "https://github.com/ronak-create/Lynx/blob/main/LICENSE",
  author: { name: "Ronak Parmar", url: "https://github.com/ronak-create" },
} as const;

export type FooterLink = { label: string; href: string; external?: boolean };

export const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Research", href: "/" },
      { label: "Compare runs", href: "/compare" },
      { label: "About", href: "/about" },
    ],
  },
  {
    title: "Docs",
    links: [
      { label: "Quickstart", href: "/docs" },
      { label: "Architecture", href: "/docs/architecture" },
      { label: "Data sources", href: "/docs/sources" },
      { label: "API reference", href: "/docs/api" },
      { label: "Code wiki", href: SITE.deepwiki, external: true },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub", href: SITE.repo, external: true },
      { label: "Discord", href: SITE.discord, external: true },
      { label: "Discussions", href: SITE.discussions, external: true },
      { label: "Report an issue", href: SITE.issues, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/about#privacy" },
      { label: "MIT License", href: SITE.license, external: true },
    ],
  },
];
