"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/** Imperative handle: fire a radial wave pulse through the swarm from a viewport point
 *  (used when the search box is focused / a search is submitted — "dispatching the agents"). */
export type SwarmHandle = { pulse: (clientX: number, clientY: number) => void };

// ---- tuning (all in CSS px / seconds) — kept together so the look is one-glance adjustable ----
const GRID_STEP = 21; // base spacing between particles — smaller = denser
const GRID_STEP_COARSE = 28; // sparser on touch / low-power
const MAX_PARTICLES = 2800; // hard cap; step grows to respect it
const DRIFT = 6; // organic flow-field wander radius
const BASE_R = 1.4; // crisp dot radius (no glow)
const BASE_ALPHA = 0.5; // resting opacity — most of the field sits here (dense, always visible)
// lit-wave shading (test alternative to size-scaling): every dot is the SAME size; as a wave
// sweeps across it, it shades white (leading face, catching the light) → theme colour (crest) →
// black (trailing face, in shadow), as if lit from the front of the travelling wave.
const DOT_R = 1.8; // uniform dot radius — no per-particle size variance
const HIGHLIGHT: [number, number, number] = [255, 255, 255]; // lit / leading face
const SHADOW: [number, number, number] = [3, 4, 10]; // shadowed / trailing face (sinks into the bg)
const LIGHT_DIR = 1; // set to -1 if the lit and shadow sides come out reversed
const SHADE_GAIN = 1.35; // how hard the white↔black shading pushes (>1 = punchier lit/shadow)
// travelling waves — several at once, each in a RANDOM independent direction, born and dying
const TARGET_WAVES = 3;
const WAVE_SHARP = 2.6; // higher = narrower bright band
const WAVE_DISP = 9; // px a particle is nudged along a wave's normal
const WAVE_LIFE: [number, number] = [8, 15]; // s each wave lives (random in range)
const WAVE_FREQ: [number, number] = [0.0045, 0.0085]; // spatial frequency range (higher = smaller waves)
const WAVE_SPEED: [number, number] = [0.7, 1.7]; // rad/s travel speed range
const WAVE_AMP: [number, number] = [0.6, 0.95]; // peak brightness range
// interaction pulses (radial rings)
const PULSE_SPEED = 720; // px/s the ring expands
const PULSE_LIFE = 1.7; // s until it fades out
const PULSE_WIDTH = 60; // ring thickness
const PULSE_DISP = 15; // px outward shove at the ring
// pointer
const POINTER_R = 120; // influence radius
const POINTER_PUSH = 24; // px repulsion at the pointer

type Particle = { hx: number; hy: number; r: number; seed: number };
type Pulse = { x: number; y: number; t: number };
type Wave = {
  cos: number;
  sin: number;
  freq: number;
  speed: number;
  amp: number;
  born: number; // ms
  life: number; // s
};

const rand = ([a, b]: [number, number]) => a + Math.random() * (b - a);

function parseColor(v: string): [number, number, number] | null {
  const s = v.trim();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    const p =
      h.length === 3
        ? [h[0] + h[0], h[1] + h[1], h[2] + h[2]]
        : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
    const n = p.map((c) => parseInt(c, 16));
    return n.some(Number.isNaN) ? null : [n[0], n[1], n[2]];
  }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : null;
}

function spawnWave(now: number, backdate = false): Wave {
  const angle = Math.random() * Math.PI * 2; // fully random, independent direction
  const life = rand(WAVE_LIFE);
  return {
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    freq: rand(WAVE_FREQ),
    speed: rand(WAVE_SPEED),
    amp: rand(WAVE_AMP),
    // back-date on init so the starting set is desynced mid-life instead of all fading in together
    born: backdate ? now - Math.random() * life * 1000 : now,
    life,
  };
}

const SwarmWave = forwardRef<SwarmHandle, { className?: string }>(function SwarmWave(
  { className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulses = useRef<Pulse[]>([]);

  useImperativeHandle(
    ref,
    () => ({
      pulse: (x, y) => {
        if (pulses.current.length > 4) pulses.current.shift();
        pulses.current.push({ x, y, t: performance.now() });
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    let W = 0;
    let H = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: Particle[] = [];
    let colTheme: [number, number, number] = [157, 123, 255]; // the accent — the crest / mid-tone
    const waves: Wave[] = [];
    const pointer = { x: -9999, y: -9999, active: false };

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      colTheme = parseColor(cs.getPropertyValue("--accent")) ?? colTheme;
    };
    readColors();
    const themeObs = new MutationObserver(readColors);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const build = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      let step = coarse ? GRID_STEP_COARSE : GRID_STEP;
      while (Math.ceil(W / step) * Math.ceil(H / step) > MAX_PARTICLES) step += 1;
      particles = [];
      for (let y = step / 2; y < H; y += step) {
        for (let x = step / 2; x < W; x += step) {
          particles.push({
            hx: x + (Math.random() - 0.5) * step * 0.7,
            hy: y + (Math.random() - 0.5) * step * 0.7,
            r: BASE_R * (0.75 + Math.random() * 0.6),
            seed: Math.random() * Math.PI * 2,
          });
        }
      }
    };
    build();

    const draw = (now: number) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, W, H);

      // maintain the pool of random-direction waves: retire the expired, refill to target
      if (!reduce) {
        for (let i = waves.length - 1; i >= 0; i--) {
          if ((now - waves[i].born) / 1000 >= waves[i].life) waves.splice(i, 1);
        }
        while (waves.length < TARGET_WAVES) waves.push(spawnWave(now, waves.length === 0));
      }
      pulses.current = pulses.current.filter((p) => (now - p.t) / 1000 < PULSE_LIFE);

      for (const p of particles) {
        let x = p.hx;
        let y = p.hy;
        let e = 0;
        // signed lighting: Σ presence·slope over the waves. cos(phase) is + on a wave's leading
        // (lit) side, 0 at the crest, − on the trailing (shadow) side. Normalised by total
        // presence it gives lit ∈ [−1,1] → white / theme / black.
        let litNum = 0;
        let litDen = 0;

        if (!reduce) {
          x += DRIFT * Math.sin(p.hy * 0.012 + t * 0.3 + p.seed);
          y += DRIFT * Math.cos(p.hx * 0.012 + t * 0.24 + p.seed);

          // each independent wave contributes brightness + a nudge along its own direction
          for (const w of waves) {
            const age = (now - w.born) / 1000;
            // fade in over 1.5s, out over the last 2.5s
            const env = Math.min(1, age / 1.5, (w.life - age) / 2.5);
            if (env <= 0) continue;
            const proj = p.hx * w.cos + p.hy * w.sin;
            const phase = proj * w.freq - age * w.speed;
            const band = Math.max(0, Math.sin(phase));
            const we = w.amp * env * band ** WAVE_SHARP;
            if (we > 0.01) {
              e += we;
              x += we * WAVE_DISP * w.cos;
              y += we * WAVE_DISP * w.sin;
              litNum += we * Math.cos(phase) * LIGHT_DIR; // front-lit / back-shadowed
              litDen += we;
            }
          }
        }

        // interaction pulses (radial rings)
        for (const pl of pulses.current) {
          const age = (now - pl.t) / 1000;
          const radius = age * PULSE_SPEED;
          const dx = p.hx - pl.x;
          const dy = p.hy - pl.y;
          const dist = Math.hypot(dx, dy) || 1;
          const ring = Math.exp(-(((dist - radius) / PULSE_WIDTH) ** 2));
          const pe = ring * (1 - age / PULSE_LIFE);
          if (pe > 0.01) {
            x += (dx / dist) * pe * PULSE_DISP;
            y += (dy / dist) * pe * PULSE_DISP;
            e += pe;
            litNum += pe * 0.7; // an interaction ring reads as a bright, front-lit flash
            litDen += pe;
          }
        }

        // pointer repulsion
        if (pointer.active) {
          const dx = p.hx - pointer.x;
          const dy = p.hy - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < POINTER_R * POINTER_R) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / POINTER_R) * POINTER_PUSH;
            x += (dx / d) * f;
            y += (dy / d) * f;
          }
        }

        if (e > 1) e = 1;

        // LIT WAVE: shade white (lit, leading) → theme (crest) → black (shadow, trailing).
        // `m` is the signed shading strength: how far, and toward which end, this dot sits.
        const lit = litDen > 0 ? litNum / litDen : 0; // [-1, 1]
        const m = Math.max(-1, Math.min(1, lit * e * SHADE_GAIN));
        const target = m >= 0 ? HIGHLIGHT : SHADOW;
        const k = Math.abs(m);
        const cr = Math.round(colTheme[0] + (target[0] - colTheme[0]) * k);
        const cg = Math.round(colTheme[1] + (target[1] - colTheme[1]) * k);
        const cb = Math.round(colTheme[2] + (target[2] - colTheme[2]) * k);
        // the crest (bright band) is more opaque; shadow side eases off so it recedes
        const alpha = BASE_ALPHA + e * 0.5 * (m >= 0 ? 1 : 0.3);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let raf = 0;
    const loop = (now: number) => {
      if (!document.hidden) draw(now);
      raf = requestAnimationFrame(loop);
    };
    if (reduce) draw(0);
    else raf = requestAnimationFrame(loop);

    const onScroll = () => {
      const fade = Math.max(0, 1 - window.scrollY / (window.innerHeight * 0.7));
      canvas.style.opacity = String(fade);
    };
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };
    const onLeave = () => {
      pointer.active = false;
    };
    const onResize = () => build();

    window.addEventListener("scroll", onScroll, { passive: true });
    if (!coarse && !reduce) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerout", onLeave, { passive: true });
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      themeObs.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none fixed inset-0 h-full w-full ${className ?? ""}`}
      style={{ zIndex: -2 }}
    />
  );
});

export default SwarmWave;
