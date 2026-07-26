"use client";
/* A circular headshot for a named person, fetched from Wikipedia's page image (biased toward a
   person result, not a namesake company/place). Falls back to monogram initials, and hides the
   broken <img> on load error. Name is derived from researched data, never user-typed text. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

/* eslint-disable @typescript-eslint/no-explicit-any */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PERSON_DESC = /( born |footballer|actor|actress|founder|ceo|executive|politician|singer|musician|author|player|scientist|engineer|investor| is an? )/i;

export function usePersonImage(name?: string) {
  return useQuery({
    queryKey: ["person-img", name],
    enabled: !!name && name.trim().length >= 2,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const url =
        `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
        `&generator=search&gsrsearch=${encodeURIComponent(name!)}&gsrlimit=4` +
        `&prop=pageimages|description&piprop=thumbnail&pithumbsize=200`;
      const r = await fetch(url).then((res) => res.json());
      const pages: any[] = Object.values(r?.query?.pages ?? {}).sort(
        (a: any, b: any) => (a.index ?? 99) - (b.index ?? 99),
      );
      // Only trust a photo from a page whose TITLE actually contains this person's name — a
      // bare-name search otherwise returns the first image on any namesake/unrelated page (some
      // other person entirely). Require first+last (or the sole token) to appear in the title.
      const tokens = name!.trim().toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
      const titleMatches = (title: string) => {
        const t = title.toLowerCase();
        return tokens.length >= 2
          ? t.includes(tokens[0]) && t.includes(tokens[tokens.length - 1])
          : tokens.length === 1 && t.includes(tokens[0]);
      };
      const withImg = pages.filter((p) => p?.thumbnail?.source && titleMatches(String(p.title ?? "")));
      // among name-matching pages, prefer one whose description reads like a person (not a place/org)
      const best = withImg.find((p) => PERSON_DESC.test(String(p.description ?? ""))) ?? withImg[0];
      return (best?.thumbnail?.source as string | undefined) ?? null;
    },
  });
}

export function PersonAvatar({
  name,
  size = 34,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const { data: img } = usePersonImage(name);
  const [failed, setFailed] = useState(false);
  const show = img && !failed;
  return (
    <span
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel-2)] ${className}`}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external host (Wikipedia)
        <img
          src={img}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-medium text-[var(--muted)]"
          style={{ fontSize: Math.round(size * 0.36) }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
