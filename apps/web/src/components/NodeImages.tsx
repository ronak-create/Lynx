"use client";
/* Related imagery for a selected graph node, shown in the sidebar for every analysed node:
   the entity's own picture (Wikipedia search) and website (if it has one), always backed by the
   researched company's homepage shot so even image-less nodes show related context. Each image
   hides on error. All sources derive from resolved entity data, never user-typed text. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Claim = { predicate: string; value: { text?: string } };

function domainFromClaims(claims: Claim[]): string | null {
  for (const c of claims) {
    const t = c.value?.text ?? "";
    if (/website|url|domain|site|homepage|official/i.test(c.predicate) || /^https?:\/\//i.test(t)) {
      const m = String(t).match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
      if (m) return m[0].replace(/^www\./, "");
    }
  }
  return null;
}

const shot = (domain: string) =>
  `https://s.wordpress.com/mshots/v1/${encodeURIComponent(`https://${domain}`)}?w=320`;
const favicon = (domain: string) => `https://icons.duckduckgo.com/ip3/${domain}.ico`;

function HideableImg({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // eslint-disable-next-line @next/next/no-img-element -- arbitrary external hosts
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
}

export function NodeImages({
  name,
  claims = [],
  companyName,
  companyDomain,
}: {
  name?: string;
  claims?: Claim[];
  companyName?: string;
  companyDomain?: string | null;
}) {
  const ownDomain = domainFromClaims(claims);

  const { data: wikiImg } = useQuery({
    queryKey: ["wiki-img", name],
    enabled: !!name && name.length >= 2,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const url =
        `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
        `&generator=search&gsrsearch=${encodeURIComponent(name!)}&gsrlimit=3` +
        `&prop=pageimages&piprop=thumbnail&pithumbsize=320`;
      const r = await fetch(url).then((res) => res.json());
      const pages: any[] = Object.values(r?.query?.pages ?? {});
      pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
      // only the best-matching page's own image — never a lower result's (that's a different entity)
      return (pages[0]?.thumbnail?.source as string | undefined) ?? null;
    },
  });

  const tiles: { src: string; alt: string; wide?: boolean; light?: boolean }[] = [];
  if (wikiImg) tiles.push({ src: wikiImg, alt: `${name} image` });
  if (ownDomain) {
    tiles.push({ src: shot(ownDomain), alt: `${ownDomain} homepage`, wide: true });
    tiles.push({ src: favicon(ownDomain), alt: `${ownDomain} favicon`, light: true });
  }
  // always show the researched company's homepage as related context (skip if it's this node's own)
  if (companyDomain && companyDomain !== ownDomain) {
    tiles.push({ src: shot(companyDomain), alt: `${companyName ?? companyDomain} homepage`, wide: true });
  }
  if (tiles.length === 0) return null;

  return (
    <div>
      <h4 className="mb-1 text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">Related</h4>
      <div className="flex flex-wrap gap-2">
        {tiles.map((t, i) => (
          <HideableImg
            key={i}
            src={t.src}
            alt={t.alt}
            className={`rounded-lg border border-[var(--border)] ${
              t.wide ? "h-16 w-28 object-cover object-top" : t.light ? "h-16 w-16 bg-white object-contain p-1" : "h-16 w-16 object-cover"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
