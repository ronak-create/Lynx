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
const DOT_R = 1.8; // dot radius at the wave crest (full energy)
const REST_SCALE = 0.78; // resting dots sit a little smaller so the wave stands out
const CREST_SCALE = 1.45; // …and swell past DOT_R as the wave energy peaks (>1 = bigger crest)
const REST_ALPHA_MUL = 0.82; // …and a little more transparent when no wave is on them
const HIGHLIGHT: [number, number, number] = [255, 255, 255]; // lit / leading face
const SHADOW: [number, number, number] = [3, 4, 10]; // shadowed / trailing face (sinks into the bg)
// LIGHT THEME: white crests are invisible on a white page, so the model inverts — the lit crest
// shades toward near-black (reads punchy on white) and the trailing face recedes toward the light
// base. Only these + a higher base alpha change in light mode; the dark look is untouched.
const HIGHLIGHT_LIGHT: [number, number, number] = [16, 12, 34]; // lit crest — dark & vivid on white
const SHADOW_LIGHT: [number, number, number] = [246, 247, 251]; // trailing face sinks into the light bg
const BASE_ALPHA_LIGHT = 0.66; // resting field sits denser/darker so it doesn't wash out
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
const POINTER_R = 165; // influence radius (wider halo around the cursor)
const POINTER_PUSH = 24; // px repulsion at the pointer
const POINTER_EASE = 0.085; // how fast the halo catches up to the cursor — lower = more trailing lag
const REFLECT_R = 230; // radius around the cursor where waves appear to bounce off it
const REFLECT_GAIN = 1.2; // strength of the reflected wavelet vs the incident wave
// motion-gated ripple: the pointer halo only disturbs the field while the cursor is MOVING,
// so a resting cursor leaves the swarm calm (no permanent dent) — the ripple fades in with speed.
const MOTION_SCALE = 22; // px/frame of travel that maps to full ripple intensity
const MOTION_RISE = 0.4; // how fast the ripple spins up as you start moving
const MOTION_FALL = 0.09; // how fast it settles once you stop (lower = longer, smoother fade)
// comet trail: recent cursor positions each leave a short-lived disturbance behind the pointer
const TRAIL_MAX = 16; // most trail points kept
const TRAIL_LIFE = 0.55; // s each trail point keeps nudging the field
const TRAIL_R = 95; // px influence radius of a trail point
const TRAIL_DISP = 11; // px outward push at a trail point
const TRAIL_MIN_DIST = 8; // px the cursor must travel before dropping a new trail point
// hue rotation (test) — the crest colour cycles its hue across the plane and over time,
// so a slow rainbow band drifts diagonally through the swarm instead of one fixed accent.
const HUE_ROTATE = true;
const HUE_SPEED = 12; // deg/s the whole field cycles
const HUE_SPAN = 220; // deg swept from one corner of the plane to the opposite one

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

// convert once so we can spin the hue while keeping the theme's saturation/lightness
function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
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
    let baseHsl = rgbToHsl(colTheme); // theme hue/sat/light — hue gets spun per particle
    let isLight = false; // drives the light-theme shading inversion so the field reads on white
    const waves: Wave[] = [];
    // x/y is the *smoothed* halo position that eases toward the raw cursor (tx/ty),
    // so the ripple trails a little behind the mouse instead of snapping to it.
    // px/py = previous raw position (for speed), motion = 0..1 smoothed movement intensity.
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, px: -9999, py: -9999, active: false, motion: 0 };
    const trail: { x: number; y: number; t: number }[] = []; // recent cursor positions (comet tail)

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      colTheme = parseColor(cs.getPropertyValue("--accent")) ?? colTheme;
      baseHsl = rgbToHsl(colTheme);
      isLight = document.documentElement.getAttribute("data-theme") === "light";
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

      // ease the halo toward the real cursor so the ripple lags a touch behind the mouse
      if (pointer.active) {
        pointer.x += (pointer.tx - pointer.x) * POINTER_EASE;
        pointer.y += (pointer.ty - pointer.y) * POINTER_EASE;
      }
      // movement intensity drives the ripple: it rises as the cursor travels and settles to 0
      // when it holds still, so a resting pointer leaves the field undisturbed.
      const move = pointer.active ? Math.hypot(pointer.tx - pointer.px, pointer.ty - pointer.py) : 0;
      pointer.px = pointer.tx;
      pointer.py = pointer.ty;
      const targetMotion = Math.min(1, move / MOTION_SCALE);
      pointer.motion += (targetMotion - pointer.motion) * (targetMotion > pointer.motion ? MOTION_RISE : MOTION_FALL);
      // retire trail points past their life so the comet tail stays short
      for (let i = trail.length - 1; i >= 0; i--) {
        if ((now - trail[i].t) / 1000 >= TRAIL_LIFE) trail.splice(i, 1);
      }

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

          // how strongly this dot feels the cursor as a reflector (0 far away → 1 at the cursor)
          let refl = 0;
          if (pointer.active) {
            const rdx = p.hx - pointer.x;
            const rdy = p.hy - pointer.y;
            const rd2 = rdx * rdx + rdy * rdy;
            if (rd2 < REFLECT_R * REFLECT_R) {
              const f = 1 - Math.sqrt(rd2) / REFLECT_R;
              refl = f * f; // eased falloff
            }
          }

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

            // reflected wavelet: mirror the wave's source through the cursor so, near the
            // pointer, the wave looks like it bounces straight back the way it came.
            if (refl > 0) {
              const mProj = (2 * pointer.x - p.hx) * w.cos + (2 * pointer.y - p.hy) * w.sin;
              const phaseR = mProj * w.freq - age * w.speed;
              const bandR = Math.max(0, Math.sin(phaseR));
              const weR = w.amp * env * bandR ** WAVE_SHARP * refl * REFLECT_GAIN;
              if (weR > 0.01) {
                e += weR;
                x -= weR * WAVE_DISP * w.cos; // travels opposite to the incident wave
                y -= weR * WAVE_DISP * w.sin;
                litNum += weR * Math.cos(phaseR) * LIGHT_DIR;
                litDen += weR;
              }
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

        // pointer repulsion — gated by motion so the halo only ripples while the cursor moves
        if (pointer.active && pointer.motion > 0.01) {
          const dx = p.hx - pointer.x;
          const dy = p.hy - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < POINTER_R * POINTER_R) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / POINTER_R) * POINTER_PUSH * pointer.motion;
            x += (dx / d) * f;
            y += (dy / d) * f;
            e += (1 - d / POINTER_R) * pointer.motion * 0.3; // moving cursor glows a little
          }
        }

        // comet trail — each recent cursor position nudges + lights nearby dots, fading with age
        for (const tp of trail) {
          const tage = (now - tp.t) / 1000;
          const tenv = 1 - tage / TRAIL_LIFE;
          if (tenv <= 0) continue;
          const dx = p.hx - tp.x;
          const dy = p.hy - tp.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < TRAIL_R * TRAIL_R) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / TRAIL_R) * tenv;
            x += (dx / d) * f * TRAIL_DISP;
            y += (dy / d) * f * TRAIL_DISP;
            e += f * 0.5;
            litNum += f * 0.6; // the tail reads as a lit streak
            litDen += f;
          }
        }

        if (e > 1) e = 1;

        // LIT WAVE: shade white (lit, leading) → theme (crest) → black (shadow, trailing).
        // `m` is the signed shading strength: how far, and toward which end, this dot sits.
        const lit = litDen > 0 ? litNum / litDen : 0; // [-1, 1]
        const m = Math.max(-1, Math.min(1, lit * e * SHADE_GAIN));
        // light theme flips the light/shadow ends (dark crest, light trailing) so the wave shows on white
        const hi = isLight ? HIGHLIGHT_LIGHT : HIGHLIGHT;
        const sh = isLight ? SHADOW_LIGHT : SHADOW;
        const target = m >= 0 ? hi : sh;
        const k = Math.abs(m);
        // spin the crest hue: a diagonal position ramp across the plane + a steady time cycle
        const crest = HUE_ROTATE
          ? hslToRgb(
              baseHsl[0] +
                t * HUE_SPEED +
                ((p.hx + p.hy) / (W + H)) * HUE_SPAN,
              baseHsl[1],
              baseHsl[2],
            )
          : colTheme;
        const cr = Math.round(crest[0] + (target[0] - crest[0]) * k);
        const cg = Math.round(crest[1] + (target[1] - crest[1]) * k);
        const cb = Math.round(crest[2] + (target[2] - crest[2]) * k);
        // the crest (bright band) is more opaque; shadow side eases off so it recedes
        const baseAlpha = isLight ? BASE_ALPHA_LIGHT : BASE_ALPHA;
        const alpha = baseAlpha * REST_ALPHA_MUL + e * (0.5 + baseAlpha * (1 - REST_ALPHA_MUL)) * (m >= 0 ? 1 : 0.3);
        // resting dots are a touch smaller; they swell past DOT_R (CREST_SCALE) as wave energy rises
        const radius = DOT_R * (REST_SCALE + (CREST_SCALE - REST_SCALE) * e);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
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
      pointer.tx = e.clientX;
      pointer.ty = e.clientY;
      // first contact after leaving: snap the halo to the cursor so it doesn't sweep in from afar
      if (!pointer.active) {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.px = e.clientX;
        pointer.py = e.clientY;
      }
      pointer.active = true;
      // drop a trail point once the cursor has moved far enough since the last one
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(e.clientX - last.x, e.clientY - last.y) >= TRAIL_MIN_DIST) {
        trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (trail.length > TRAIL_MAX) trail.shift();
      }
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
