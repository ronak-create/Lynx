// SwarmWave: the particle field from the Lynx app's search page (apps/web/src/components/SwarmWave.tsx),
// ported to plain JS for the static site. Same tuning and shading model; additions for the landing page:
//   quiet zones  dots fade out under every [data-quiet] text block, so copy always reads cleanly
//   hue groups   each [data-hue] section tints the field its own colour family; the field blends
//                between them as you scroll (scroll is read inside the rAF loop, no scroll listener)
//   INTENSITY / FLOOR  full strength behind the hero, settling lighter behind the rest of the page
// Exposes window.lynxSwarm.pulse(x, y) for interaction rings.
(function () {
  "use strict";

  var canvas = document.getElementById("swarm");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  // ---- tuning (CSS px / seconds), mirrored from the app ----
  var GRID_STEP = 21;
  var GRID_STEP_COARSE = 28;
  var MAX_PARTICLES = 2800;
  var DRIFT = 6;
  var BASE_ALPHA = 0.5;
  var DOT_R = 1.8;
  var REST_SCALE = 0.78;
  var CREST_SCALE = 1.45;
  var REST_ALPHA_MUL = 0.82;
  var HIGHLIGHT = [255, 255, 255];
  var SHADOW = [3, 4, 10];
  var HIGHLIGHT_LIGHT = [16, 12, 34];
  var SHADOW_LIGHT = [246, 247, 251];
  var BASE_ALPHA_LIGHT = 0.66;
  var LIGHT_DIR = 1;
  var SHADE_GAIN = 1.35;
  var TARGET_WAVES = 3;
  var WAVE_SHARP = 2.6;
  var WAVE_DISP = 9;
  var WAVE_LIFE = [8, 15];
  var WAVE_FREQ = [0.0045, 0.0085];
  var WAVE_SPEED = [0.7, 1.7];
  var WAVE_AMP = [0.6, 0.95];
  var PULSE_SPEED = 720;
  var PULSE_LIFE = 1.7;
  var PULSE_WIDTH = 60;
  var PULSE_DISP = 15;
  var POINTER_R = 128;
  var POINTER_PUSH = 24;
  var POINTER_EASE = 0.085;
  var REFLECT_R = 230;
  var REFLECT_GAIN = 1.2;
  var MOTION_SCALE = 22;
  var MOTION_RISE = 0.4;
  var MOTION_FALL = 0.09;
  var TRAIL_MAX = 30;
  var TRAIL_LIFE = 0.95;
  var TRAIL_R = 95;
  var TRAIL_DISP = 11;
  var TRAIL_MIN_DIST = 8;
  // the app spins the hue continuously across the full wheel; here each section owns a narrower band
  var GROUP_SPAN = 70; // deg of hue spread diagonally across the screen within one section's family
  var GROUP_DRIFT = 14; // deg the family gently sways over time
  var HUE_EASE = 0.045; // how quickly the field glides to the next section's colour (per frame)

  // ---- landing-page additions ----
  var INTENSITY = window.matchMedia("(max-width: 640px)").matches ? 0.6 : 0.8; // opacity trim (1 = the app's full strength); lighter on phones where text sits closer to the field
  var QUIET_FLOOR = 0.1; // opacity multiplier directly under a text block
  var QUIET_PAD = 56; // px over which dots fade back in around a text block
  var FLOOR = window.matchMedia("(max-width: 640px)").matches ? 0.38 : 0.5; // field strength past the hero
  var FADE_DISTANCE = 0.75; // hero-to-floor transition, as a fraction of the viewport height of scroll

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;

  function rand(r) {
    return r[0] + Math.random() * (r[1] - r[0]);
  }

  function parseColor(v) {
    var s = (v || "").trim();
    if (s.charAt(0) === "#") {
      var h = s.slice(1);
      var p = h.length === 3 ? [h[0] + h[0], h[1] + h[1], h[2] + h[2]] : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
      var n = p.map(function (c) {
        return parseInt(c, 16);
      });
      return n.some(isNaN) ? null : n;
    }
    var m = s.match(/[\d.]+/g);
    return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : null;
  }

  function rgbToHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0, d = max - min;
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

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function spawnWave(now, backdate) {
    var angle = Math.random() * Math.PI * 2;
    var life = rand(WAVE_LIFE);
    return {
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      freq: rand(WAVE_FREQ),
      speed: rand(WAVE_SPEED),
      amp: rand(WAVE_AMP),
      born: backdate ? now - Math.random() * life * 1000 : now,
      life: life,
    };
  }

  var W = 0, H = 0, dpr = 1;
  var particles = [];
  var colTheme = [157, 123, 255];
  var baseHsl = rgbToHsl(colTheme);
  var isLight = false;
  var waves = [];
  var pulses = [];
  var pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, px: -9999, py: -9999, active: false, motion: 0 };
  var trail = [];
  var zones = []; // quiet zones: { x0, y0, x1, y1 } in document coordinates
  var hueSections = []; // { top, bottom, hue } in document coordinates
  var curHue = null; // hue currently shown (eases toward the scroll target)
  var heroEl = document.querySelector(".hero");

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colTheme = parseColor(cs.getPropertyValue("--accent")) || colTheme;
    baseHsl = rgbToHsl(colTheme);
    isLight = document.documentElement.getAttribute("data-theme") === "light";
  }
  readColors();
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  function measure() {
    var sy = window.scrollY;
    zones = [];
    document.querySelectorAll("[data-quiet]").forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width && r.height) zones.push({ x0: r.left, y0: r.top + sy, x1: r.right, y1: r.bottom + sy });
    });
    hueSections = [];
    document.querySelectorAll("[data-hue]").forEach(function (el) {
      var r = el.getBoundingClientRect();
      hueSections.push({ top: r.top + sy, bottom: r.bottom + sy, hue: parseFloat(el.dataset.hue) });
    });
  }

  // circular mean of the section hues, weighted by how much of each section is on screen
  function targetHue() {
    var top = window.scrollY, bottom = top + H, vx = 0, vy = 0;
    for (var i = 0; i < hueSections.length; i++) {
      var sct = hueSections[i];
      var overlap = Math.min(bottom, sct.bottom) - Math.max(top, sct.top);
      if (overlap <= 0) continue;
      var a = (sct.hue * Math.PI) / 180;
      vx += Math.cos(a) * overlap;
      vy += Math.sin(a) * overlap;
    }
    if (!vx && !vy) return curHue === null ? baseHsl[0] : curHue;
    return ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360;
  }

  function build() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var step = coarse ? GRID_STEP_COARSE : GRID_STEP;
    while (Math.ceil(W / step) * Math.ceil(H / step) > MAX_PARTICLES) step += 1;
    particles = [];
    for (var y = step / 2; y < H; y += step) {
      for (var x = step / 2; x < W; x += step) {
        particles.push({
          hx: x + (Math.random() - 0.5) * step * 0.7,
          hy: y + (Math.random() - 0.5) * step * 0.7,
          seed: Math.random() * Math.PI * 2,
        });
      }
    }
    measure();
  }
  build();

  function draw(now) {
    var t = now / 1000;
    var i, p, w;
    ctx.clearRect(0, 0, W, H);

    if (!reduce) {
      for (i = waves.length - 1; i >= 0; i--) {
        if ((now - waves[i].born) / 1000 >= waves[i].life) waves.splice(i, 1);
      }
      while (waves.length < TARGET_WAVES) waves.push(spawnWave(now, waves.length === 0));
    }
    pulses = pulses.filter(function (pl) {
      return (now - pl.t) / 1000 < PULSE_LIFE;
    });

    if (pointer.active) {
      pointer.x += (pointer.tx - pointer.x) * POINTER_EASE;
      pointer.y += (pointer.ty - pointer.y) * POINTER_EASE;
    }
    var move = pointer.active ? Math.hypot(pointer.tx - pointer.px, pointer.ty - pointer.py) : 0;
    pointer.px = pointer.tx;
    pointer.py = pointer.ty;
    var targetMotion = Math.min(1, move / MOTION_SCALE);
    pointer.motion += (targetMotion - pointer.motion) * (targetMotion > pointer.motion ? MOTION_RISE : MOTION_FALL);
    for (i = trail.length - 1; i >= 0; i--) {
      if ((now - trail[i].t) / 1000 >= TRAIL_LIFE) trail.splice(i, 1);
    }

    // quiet zones that touch the viewport this frame, converted to viewport coordinates
    var sy = window.scrollY, live = [];
    for (i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (z.y1 + QUIET_PAD < sy || z.y0 - QUIET_PAD > sy + H) continue;
      live.push({ x0: z.x0, y0: z.y0 - sy, x1: z.x1, y1: z.y1 - sy });
    }

    // glide toward the colour family of whatever sections are on screen
    var tgt = targetHue();
    if (curHue === null || reduce) curHue = tgt;
    else {
      var dh = ((tgt - curHue + 540) % 360) - 180; // shortest way round the wheel
      curHue = (curHue + dh * HUE_EASE + 360) % 360;
    }
    var sway = reduce ? 0 : Math.sin(t * 0.25) * GROUP_DRIFT;

    var hi = isLight ? HIGHLIGHT_LIGHT : HIGHLIGHT;
    var sh = isLight ? SHADOW_LIGHT : SHADOW;
    var baseAlpha = isLight ? BASE_ALPHA_LIGHT : BASE_ALPHA;

    for (var n = 0; n < particles.length; n++) {
      p = particles[n];
      var x = p.hx, y = p.hy, e = 0, litNum = 0, litDen = 0;

      if (!reduce) {
        x += DRIFT * Math.sin(p.hy * 0.012 + t * 0.3 + p.seed);
        y += DRIFT * Math.cos(p.hx * 0.012 + t * 0.24 + p.seed);

        var refl = 0;
        if (pointer.active) {
          var rdx = p.hx - pointer.x, rdy = p.hy - pointer.y, rd2 = rdx * rdx + rdy * rdy;
          if (rd2 < REFLECT_R * REFLECT_R) {
            var f0 = 1 - Math.sqrt(rd2) / REFLECT_R;
            refl = f0 * f0;
          }
        }

        for (i = 0; i < waves.length; i++) {
          w = waves[i];
          var age = (now - w.born) / 1000;
          var env = Math.min(1, age / 1.5, (w.life - age) / 2.5);
          if (env <= 0) continue;
          var phase = (p.hx * w.cos + p.hy * w.sin) * w.freq - age * w.speed;
          var band = Math.max(0, Math.sin(phase));
          var we = w.amp * env * Math.pow(band, WAVE_SHARP);
          if (we > 0.01) {
            e += we;
            x += we * WAVE_DISP * w.cos;
            y += we * WAVE_DISP * w.sin;
            litNum += we * Math.cos(phase) * LIGHT_DIR;
            litDen += we;
          }
          if (refl > 0) {
            var phaseR = ((2 * pointer.x - p.hx) * w.cos + (2 * pointer.y - p.hy) * w.sin) * w.freq - age * w.speed;
            var bandR = Math.max(0, Math.sin(phaseR));
            var weR = w.amp * env * Math.pow(bandR, WAVE_SHARP) * refl * REFLECT_GAIN;
            if (weR > 0.01) {
              e += weR;
              x -= weR * WAVE_DISP * w.cos;
              y -= weR * WAVE_DISP * w.sin;
              litNum += weR * Math.cos(phaseR) * LIGHT_DIR;
              litDen += weR;
            }
          }
        }
      }

      for (i = 0; i < pulses.length; i++) {
        var pl = pulses[i];
        var pAge = (now - pl.t) / 1000;
        var dxp = p.hx - pl.x, dyp = p.hy - pl.y;
        var dist = Math.hypot(dxp, dyp) || 1;
        var ring = Math.exp(-Math.pow((dist - pAge * PULSE_SPEED) / PULSE_WIDTH, 2));
        var pe = ring * (1 - pAge / PULSE_LIFE);
        if (pe > 0.01) {
          x += (dxp / dist) * pe * PULSE_DISP;
          y += (dyp / dist) * pe * PULSE_DISP;
          e += pe;
          litNum += pe * 0.7;
          litDen += pe;
        }
      }

      if (pointer.active && pointer.motion > 0.01) {
        var dx = p.hx - pointer.x, dy = p.hy - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < POINTER_R * POINTER_R) {
          var d = Math.sqrt(d2) || 1;
          var fp = (1 - d / POINTER_R) * POINTER_PUSH * pointer.motion;
          x += (dx / d) * fp;
          y += (dy / d) * fp;
          e += (1 - d / POINTER_R) * pointer.motion * 0.3;
        }
      }

      for (i = 0; i < trail.length; i++) {
        var tp = trail[i];
        var tenv = 1 - (now - tp.t) / 1000 / TRAIL_LIFE;
        if (tenv <= 0) continue;
        var tdx = p.hx - tp.x, tdy = p.hy - tp.y, td2 = tdx * tdx + tdy * tdy;
        if (td2 < TRAIL_R * TRAIL_R) {
          var td = Math.sqrt(td2) || 1;
          var ft = (1 - td / TRAIL_R) * tenv;
          x += (tdx / td) * ft * TRAIL_DISP;
          y += (tdy / td) * ft * TRAIL_DISP;
          e += ft * 0.5;
          litNum += ft * 0.6;
          litDen += ft;
        }
      }

      if (e > 1) e = 1;

      var lit = litDen > 0 ? litNum / litDen : 0;
      var m = Math.max(-1, Math.min(1, lit * e * SHADE_GAIN));
      var target = m >= 0 ? hi : sh;
      var k = Math.abs(m);
      var crest = hslToRgb(curHue + sway + ((p.hx + p.hy) / (W + H) - 0.5) * GROUP_SPAN, baseHsl[1], baseHsl[2]);
      var cr = Math.round(crest[0] + (target[0] - crest[0]) * k);
      var cg = Math.round(crest[1] + (target[1] - crest[1]) * k);
      var cb = Math.round(crest[2] + (target[2] - crest[2]) * k);
      var alpha = baseAlpha * REST_ALPHA_MUL + e * (0.5 + baseAlpha * (1 - REST_ALPHA_MUL)) * (m >= 0 ? 1 : 0.3);

      // quiet zones: rounded-rectangle falloff around each text block (the strongest one wins)
      var quietMul = 1;
      for (i = 0; i < live.length; i++) {
        var lz = live[i];
        var ox = Math.max(lz.x0 - x, 0, x - lz.x1);
        var oy = Math.max(lz.y0 - y, 0, y - lz.y1);
        if (ox > QUIET_PAD || oy > QUIET_PAD) continue;
        var dq = Math.min(1, Math.sqrt(ox * ox + oy * oy) / QUIET_PAD);
        var mq = QUIET_FLOOR + (1 - QUIET_FLOOR) * dq * dq * (3 - 2 * dq);
        if (mq < quietMul) quietMul = mq;
      }
      alpha *= quietMul;
      alpha *= INTENSITY;

      var radius = DOT_R * (REST_SCALE + (CREST_SCALE - REST_SCALE) * e);
      ctx.fillStyle = "rgba(" + cr + "," + cg + "," + cb + "," + alpha + ")";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // full strength behind the hero, settling to FLOOR for the rest of the page
  function updateFade() {
    var span = (heroEl ? Math.min(heroEl.offsetHeight, window.innerHeight) : window.innerHeight) * FADE_DISTANCE;
    canvas.style.opacity = String(FLOOR + (1 - FLOOR) * Math.max(0, 1 - window.scrollY / span));
  }

  // reduced motion: no animation, but redraw (static) when the scroll position changes the colour
  var lastY = -1;
  function loop(now) {
    if (!document.hidden) {
      updateFade();
      if (!reduce) draw(now);
      else if (window.scrollY !== lastY) {
        lastY = window.scrollY;
        draw(0);
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---- input ----
  if (!coarse && !reduce) {
    window.addEventListener(
      "pointermove",
      function (e) {
        pointer.tx = e.clientX;
        pointer.ty = e.clientY;
        if (!pointer.active) {
          pointer.x = pointer.px = e.clientX;
          pointer.y = pointer.py = e.clientY;
        }
        pointer.active = true;
        var last = trail[trail.length - 1];
        if (!last || Math.hypot(e.clientX - last.x, e.clientY - last.y) >= TRAIL_MIN_DIST) {
          trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
          if (trail.length > TRAIL_MAX) trail.shift();
        }
      },
      { passive: true }
    );
    document.addEventListener("pointerleave", function () {
      pointer.active = false;
    });
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      build();
      if (reduce) lastY = -1;
    }, 120);
  });
  // web fonts change the copy block's size after first layout
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  window.addEventListener("load", measure);
  // tab captions and the copy button change block sizes slightly; re-measure on layout shifts
  if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.body);

  window.lynxSwarm = {
    pulse: function (x, y) {
      if (reduce) return;
      if (pulses.length > 4) pulses.shift();
      pulses.push({ x: x, y: y, t: performance.now() });
    },
  };
})();
