import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // individual runs are per-user working documents, not pages to index
      disallow: ["/research/", "/compare"],
    },
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
  };
}
