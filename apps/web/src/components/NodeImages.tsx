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

// map the node's entity type to a Wikipedia search qualifier so ambiguous names resolve to the
// right subject — "Apple" as a COMPANY must find Apple Inc., not the fruit.
const KIND_HINT: Record<string, string> = {
  company: "company",
  organization: "company",
  org: "company",
  investor: "company",
  competitor: "company",
  product: "product",
};

// does a Wikipedia short description read like the node's kind? used to reject a mismatched top hit.
function descMatchesKind(desc: string, type?: string): boolean {
  const d = desc.toLowerCase();
  const t = (type ?? "").toLowerCase();
  if (["company", "organization", "org", "investor", "competitor"].includes(t))
    return /(company|corporation|business|manufacturer|technology|firm|brand|organization|inc\.?)/.test(d);
  if (t === "person") return /( born |footballer|actor|founder|ceo|executive|politician|singer|player|author| is an? )/.test(d);
  return true; // unknown kind: don't second-guess the top result
}

export function NodeImages({
  name,
  claims = [],
  type,
}: {
  name?: string;
  claims?: Claim[];
  type?: string;
}) {
  const ownDomain = domainFromClaims(claims);

  const { data: wikiImg } = useQuery({
    queryKey: ["wiki-img", name, type],
    enabled: !!name && name.length >= 2,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const hint = KIND_HINT[(type ?? "").toLowerCase()];
      const term = hint ? `${name} ${hint}` : name!;
      const url =
        `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
        `&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrlimit=5` +
        `&prop=pageimages|description&piprop=thumbnail&pithumbsize=320`;
      const r = await fetch(url).then((res) => res.json());
      const pages: any[] = Object.values(r?.query?.pages ?? {});
      pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
      // prefer the best hit whose description matches this node's kind AND has an image; that
      // skips the fruit "Apple" for a company node and skips image-less disambiguation pages.
      const withImg = pages.filter((p) => p?.thumbnail?.source);
      const best =
        withImg.find((p) => descMatchesKind(String(p.description ?? ""), type)) ?? withImg[0];
      return (best?.thumbnail?.source as string | undefined) ?? null;
    },
  });

  const tiles: { src: string; alt: string; wide?: boolean; light?: boolean }[] = [];
  if (wikiImg) tiles.push({ src: wikiImg, alt: `${name} image` });
  // only this node's OWN imagery — never another entity's homepage (that was misleading on
  // competitor/related nodes, e.g. Microsoft's page appearing under the Apple node).
  if (ownDomain) {
    tiles.push({ src: shot(ownDomain), alt: `${ownDomain} homepage`, wide: true });
    tiles.push({ src: favicon(ownDomain), alt: `${ownDomain} favicon`, light: true });
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
