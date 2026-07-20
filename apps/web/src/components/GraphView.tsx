"use client";
/* Obsidian-style force graph: canvas rendering via react-force-graph-2d (d3-force under
   the hood — same physics model as Obsidian's graph view).
   The component is imported at runtime (not next/dynamic) so the imperative ref that
   configures d3 forces is preserved. */
import { useMemo, useRef, useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, GraphData, NODE_COLORS } from "@/lib/api";
import { useHighlight } from "@/stores/highlight";
import { useTheme } from "@/stores/theme";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Palette = { bg: string; text: string; accent: string; accentGlow: string; link: string };

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => s.getPropertyValue(n).trim() || f;
  return {
    bg: v("--bg", "#090a0f"),
    text: v("--text", "#e7e9f2"),
    accent: v("--accent", "#9d7bff"),
    accentGlow: v("--accent-glow", "rgba(157,123,255,0.28)"),
    link: v("--border-strong", "#333b56"),
  };
}

export function GraphView({ jobId }: { jobId: string }) {
  const themeMode = useTheme((s) => s.mode);
  const { data } = useQuery<GraphData>({
    queryKey: ["graph", jobId],
    queryFn: () => api.graph(jobId),
    refetchInterval: (q) => (q.state.data ? false : 4000),
  });
  const { hoveredEntityId, selectedEntityId, setSelected, setHovered } = useHighlight();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [FG, setFG] = useState<any>(null);
  const [pal, setPal] = useState<Palette | null>(null);

  // read themed colours from CSS variables, and refresh when the theme changes
  useEffect(() => {
    const id = requestAnimationFrame(() => setPal(readPalette()));
    return () => cancelAnimationFrame(id);
  }, [themeMode]);

  // client-only import that keeps ref forwarding intact
  useEffect(() => {
    let alive = true;
    import("react-force-graph-2d").then((m) => alive && setFG(() => m.default));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [FG]);

  const applyForces = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-240).distanceMax(500);
    fg.d3Force("link")?.distance(60);
    fg.d3ReheatSimulation?.();
  }, []);

  useEffect(() => {
    if (FG && data) applyForces();
  }, [FG, data, applyForces]);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    const degree: Record<string, number> = {};
    for (const l of data.links) {
      degree[l.source] = (degree[l.source] ?? 0) + 1;
      degree[l.target] = (degree[l.target] ?? 0) + 1;
    }
    return {
      nodes: data.nodes.map((n) => ({ ...n, degree: degree[n.id] ?? 0 })),
      links: data.links.map((l) => ({ ...l })),
    };
  }, [data]);

  const neighborIds = useMemo(() => {
    const focus = hoveredEntityId ?? selectedEntityId;
    if (!focus || !data) return null;
    const ids = new Set<string>([focus]);
    for (const l of data.links) {
      const s = typeof l.source === "string" ? l.source : (l.source as any).id;
      const t = typeof l.target === "string" ? l.target : (l.target as any).id;
      if (s === focus) ids.add(t);
      if (t === focus) ids.add(s);
    }
    return ids;
  }, [hoveredEntityId, selectedEntityId, data]);

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const focus = hoveredEntityId ?? selectedEntityId;
      const dimmed = neighborIds !== null && !neighborIds.has(node.id);
      const r = node.is_root ? 9 : 3.5 + Math.min(node.degree ?? 0, 12) * 0.45;
      const color = NODE_COLORS[node.type] ?? "#94a3b8";

      const textColor = pal?.text ?? "#e7e9f2";
      const glow = pal?.accentGlow ?? "rgba(157,123,255,0.28)";

      ctx.globalAlpha = dimmed ? 0.15 : 1;
      if (node.id === focus) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
        ctx.fillStyle = glow;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (globalScale > 1.1 || node.is_root || node.id === focus || (!dimmed && neighborIds !== null)) {
        const fontSize = Math.max(11 / globalScale, 2.4);
        ctx.font = `${node.is_root ? "600 " : ""}${fontSize}px Sans-Serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = textColor;
        ctx.fillText(node.name, node.x, node.y + r + 1.5);
      }
      ctx.globalAlpha = 1;
    },
    [hoveredEntityId, selectedEntityId, neighborIds, pal],
  );

  return (
    <div ref={containerRef} className="panel relative h-full min-h-0 w-full overflow-hidden">
      {data && (
        <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5 text-[11px]">
          {Object.entries(NODE_COLORS)
            .filter(([type]) => data.nodes.some((n) => n.type === type))
            .map(([type, color]) => (
              <span
                key={type}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)]/85 px-2 py-0.5 text-[var(--muted)] backdrop-blur-sm"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                {type}
              </span>
            ))}
        </div>
      )}
      {!data || !FG ? (
        <div className="flex h-full items-center justify-center gap-2.5 text-sm text-[var(--muted)]">
          <span className="spinner h-4 w-4" />
          Building knowledge graph…
        </div>
      ) : (
        <FG
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          backgroundColor={pal?.bg ?? "#090a0f"}
          onEngineStop={() => fgRef.current?.zoomToFit?.(400, 60)}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
            ctx.beginPath();
            ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          linkColor={(l: any) => {
            const focus = hoveredEntityId ?? selectedEntityId;
            if (!focus) return "rgba(139,147,167,0.25)";
            const s = typeof l.source === "object" ? l.source.id : l.source;
            const t = typeof l.target === "object" ? l.target.id : l.target;
            return s === focus || t === focus ? pal?.accent ?? "#9d7bff" : "rgba(139,147,167,0.08)";
          }}
          linkWidth={(l: any) => 0.5 + (l.confidence ?? 1)}
          onNodeClick={(node: any) => setSelected(node.id)}
          onNodeHover={(node: any) => setHovered(node ? node.id : null)}
          onBackgroundClick={() => setSelected(null)}
          enableNodeDrag={false}
          cooldownTicks={140}
          d3VelocityDecay={0.28}
        />
      )}
    </div>
  );
}
