"use client";
/* The entity's logo for the dashboard header. We try hard to show a REAL logo, stepping through
   a cascade of logo sources for the resolved domain (never user-typed text) and only falling back
   to a monogram tile once every source fails or there's no domain:

     1. unavatar.io      – aggregates the site's own logo + Clearbit + the company's social-media
                           avatar (Twitter/GitHub/etc.), so it catches logos that live on socials
     2. Clearbit         – high-quality brand logos by domain
     3. Google favicon   – 128px, usually the site logo/mark
     4. DuckDuckGo icon  – last-resort favicon

   Each source advances to the next on load error; dependency-free. */
import { useMemo, useState } from "react";

function initial(name: string): string {
  const c = name.trim()[0];
  return c ? c.toUpperCase() : "?";
}

export function CompanyLogo({
  name,
  domain,
  size = 34,
}: {
  name: string;
  domain?: string | null;
  size?: number;
}) {
  const sources = useMemo(
    () =>
      domain
        ? [
            `https://unavatar.io/${domain}?fallback=false`,
            `https://logo.clearbit.com/${domain}`,
            `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
            `https://icons.duckduckgo.com/ip3/${domain}.ico`,
          ]
        : [],
    [domain],
  );
  const [idx, setIdx] = useState(0);
  const src = sources[idx]; // undefined once every source has failed → monogram

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--glass-border)] ${
        src ? "bg-white" : "bg-[var(--accent-soft)]"
      }`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external logo host
        <img
          key={src}
          src={src}
          alt={`${name} logo`}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setIdx((i) => i + 1)}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <span
          className="font-semibold text-[var(--accent)]"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          {initial(name)}
        </span>
      )}
    </span>
  );
}
