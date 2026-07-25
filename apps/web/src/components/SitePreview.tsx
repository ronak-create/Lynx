"use client";
/* A lightweight homepage screenshot for an entity's resolved site — gives the dashboard a real
   visual and adds credibility. Uses WordPress's free mShots service (no key), which returns a
   screenshot for any URL. The URL is always our own resolved site, never user-typed text.
   Fails closed: if the shot errors it renders nothing. */
import { useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";

export function SitePreview({ url, className = "" }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;

  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const shot = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=640`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`Open ${host}`}
      className={`group relative block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel-2)] ${className}`}
      style={{ aspectRatio: "16 / 10" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- external screenshot host */}
      <img
        src={shot}
        alt={`${host} homepage`}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
      />
      <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm">
        {host}
        <ArrowUpRight weight="bold" className="h-3 w-3" />
      </span>
    </a>
  );
}
