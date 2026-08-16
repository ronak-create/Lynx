import type { MetadataRoute } from "next";
import { DOCS_PAGES } from "@/lib/docs-nav";

/* Only the stable, public surfaces belong here — a /research/[jobId] page is one person's run,
   not a document anyone should be pointed at. Set NEXT_PUBLIC_SITE_URL when you deploy. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const paths = ["/", "/about", "/terms", ...DOCS_PAGES.map((page) => page.href)];
  return paths.map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    lastModified,
    changeFrequency: "monthly" as const,
    priority: path === "/" ? 1 : 0.7,
  }));
}
