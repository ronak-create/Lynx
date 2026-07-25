"use client";
/* The entity's logo for the dashboard header. Tries DuckDuckGo's favicon service for the resolved
   domain (never user-typed text) and falls back to a monogram tile if there's no domain or the
   image fails to load. Kept small and dependency-free. */
import { useState } from "react";

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
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(domain) && !failed;

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--glass-border)] ${
        showImg ? "bg-white" : "bg-[var(--accent-soft)]"
      }`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external logo host
        <img
          src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
          alt={`${name} logo`}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
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
