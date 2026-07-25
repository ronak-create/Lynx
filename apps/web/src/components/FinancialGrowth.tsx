"use client";
/* A compact financial-growth chart. Prefers real annual revenue (SEC XBRL) for public companies;
   for private companies it falls back to funding-round sizes over time. Pure inline SVG, no deps. */
import { useId } from "react";
import { fmtMoney } from "@/lib/api";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Payload = Record<string, any>;

function parseMoney(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/,/g, "").trim();
  const m = s.match(/([\d.]+)\s*(trillion|billion|million|thousand|bn|mn|[tbmk])?/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (Number.isNaN(v)) return null;
  const u = (m[2] || "").toLowerCase();
  const mult = u.startsWith("t")
    ? 1e12
    : u.startsWith("b")
      ? 1e9
      : u.startsWith("m")
        ? 1e6
        : u.startsWith("k") || u.startsWith("thous")
          ? 1e3
          : 1;
  return v * mult;
}

type Bar = { label: string; value: number };

/** Returns the series to chart, or null if there's nothing meaningful to show. */
function buildSeries(financials?: Payload, funding?: Payload): { bars: Bar[]; kind: "revenue" | "funding" } | null {
  const rev: [number, number][] = financials?.revenue_series ?? [];
  if (rev.length >= 2) {
    return {
      kind: "revenue",
      bars: rev.slice(-6).map(([fy, v]) => ({ label: `FY${String(fy).slice(-2)}`, value: Number(v) })),
    };
  }
  const rounds: Payload[] = funding?.rounds ?? [];
  const parsed = rounds
    .map((r) => ({ label: String(r.stage || r.date || "Round"), value: parseMoney(r.amount), date: r.date }))
    .filter((r): r is Bar & { date?: string } => r.value != null && r.value > 0);
  if (parsed.length >= 2) {
    // chronological if the dates sort cleanly; otherwise keep source order
    const withTime = parsed.map((r) => ({ ...r, t: Date.parse(String(r.date ?? "")) }));
    if (withTime.every((r) => !Number.isNaN(r.t))) withTime.sort((a, b) => a.t - b.t);
    return { kind: "funding", bars: withTime.slice(-6).map(({ label, value }) => ({ label, value })) };
  }
  return null;
}

export function FinancialGrowth({ financials, funding }: { financials?: Payload; funding?: Payload }) {
  const gid = useId();
  const series = buildSeries(financials, funding);
  if (!series) {
    return <p className="text-sm text-[var(--muted)]">Not enough financial data to chart yet.</p>;
  }
  const { bars, kind } = series;
  const max = Math.max(...bars.map((b) => b.value)) || 1;
  const W = 460;
  const H = 150;
  const padB = 22; // room for x labels
  const padT = 16; // room for value labels
  const gap = 10;
  const bw = (W - gap * (bars.length - 1)) / bars.length;
  const chartH = H - padB - padT;
  const up = bars[bars.length - 1].value >= bars[0].value;
  const color = up ? "var(--accent)" : "var(--neg)";

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
        {kind === "revenue" ? "Annual revenue (SEC)" : "Funding rounds over time"}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {bars.map((b, i) => {
          const h = Math.max(2, (b.value / max) * chartH);
          const x = i * (bw + gap);
          const y = padT + (chartH - h);
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={h} rx={4} fill={`url(#${gid})`} />
              <text x={x + bw / 2} y={y - 5} textAnchor="middle" className="fill-[var(--text-strong)]" fontSize="11" fontFamily="var(--font-mono)">
                {fmtMoney(b.value)}
              </text>
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-[var(--muted)]" fontSize="10.5">
                {b.label.length > 10 ? b.label.slice(0, 9) + "…" : b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
