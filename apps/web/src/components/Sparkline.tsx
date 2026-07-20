"use client";
import { useId } from "react";

export function Sparkline({
  series,
  width = 240,
  height = 56,
}: {
  series: [string, number][];
  width?: number;
  height?: number;
}) {
  const gid = useId();
  if (series.length < 2) return null;
  const values = series.map(([, v]) => v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / range) * (height - pad * 2) - pad;
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${x(0)},${height} ${line} ${x(values.length - 1)},${height}`;
  const up = values[values.length - 1] >= values[0];
  // No red/green "signal" colours: rising uses the brand accent, falling a muted rose.
  const color = up ? "var(--accent)" : "var(--neg)";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
