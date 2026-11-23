'use strict';
// ZenCalendar · fondos animados dibujados en código (nada se descarga).
// Se pintan en un lienzo de baja resolución que el navegador escala con suavizado:
// así cuesta poco y queda suave. Se paran con la pestaña oculta y con «Animaciones: Ninguna».
(function () {
  const ZC = window.ZC, UI = ZC.ui = ZC.ui || {};
  const KINDS = ['aurora', 'sakura', 'nubes', 'burbujas', 'estrellas', 'olas', 'degradado', 'liso'];
  const SCALE = { aurora: 0.16, degradado: 0.16, nubes: 0.25, sakura: 0.5, burbujas: 0.5, estrellas: 0.5, olas: 0.4, liso: 0.05 };
  const FPS = { aurora: 24, nubes: 24, sakura: 30, burbujas: 30, estrellas: 24, olas: 30 };

  const hex = h => { h = String(h || '#000').trim().replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (c, a) => `rgba(${hex(c).join(',')},${a})`;
  const mix = (a, b, k) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`; };
  const rnd = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  let cv, ctx, kind = 'aurora', speed = 1, amount = 1, animate = true, W = 0, H = 0, S = null, raf = 0, last = 0, t0 = performance.now(), P = null, paused = false;

  function pal() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    return { bg: v('--bg') || '#f6f3ff', s1: v('--s1') || '#fff', a1: v('--a1') || '#9f8dff', a2: v('--a2') || '#f0a6cc', a3: v('--a3') || '#7fd8c4',
      b: [v('--b1') || '#d9ccff', v('--b2') || '#ffd3e8', v('--b3') || '#c8f1e6', v('--b4') || '#ffe9c9'], light: document.documentElement.dataset.scheme !== 'dark' };
  }

  function setup() {
    const r = rnd(4242 + kind.length * 31), n = k => Math.max(1, Math.round(k * amount));
    const area = (W * H) / (SCALE[kind] * SCALE[kind]) / 1e6;   // megapíxeles reales de la ventana
    S = { r };
    S.blobs = Array.from({ length: n(kind === 'aurora' ? 6 : 4) }, (_, i) => ({ x: r(), y: r(), rad: .35 + r() * .35, sx: .02 + r() * .05, sy: .02 + r() * .05, p: r() * 6.28, c: i % 4 }));
    S.petals = Array.from({ length: n(26 * Math.min(2, .6 + area)) }, () => ({ x: r() * W, y: r() * H, s: 2.4 + r() * 3.4, v: .25 + r() * .5, w: r() * 6.28, rot: r() * 6.28, vr: (r() - .5) * .04, c: r() }));
    S.bubbles = Array.from({ length: n(22 * Math.min(2, .6 + area)) }, () => ({ x: r() * W, y: r() * H, s: 3 + r() * 12, v: .15 + r() * .4, w: r() * 6.28, c: r() }));
    S.stars = Array.from({ length: n(Math.min(260, W * H / 260)) }, () => ({ x: r() * W, y: r() * H, p: r() * 6.28, s: r() < .08 ? 1.6 : .9, f: .4 + r() * 1.2 }));
    S.clouds = Array.from({ length: n(7) }, (_, i) => ({ x: r() * 1.3 - .15, y: .05 + r() * .75, s: .5 + r() * .8, v: .004 + r() * .008, puffs: Array.from({ length: 5 }, () => [r() * 2 - 1, r() * .6 - .3, .45 + r() * .45]) }));
    S.shoot = null;
  }

  function blobs(t, alpha) {
    for (const b of S.blobs) {
      const x = (b.x + Math.sin(t * b.sx + b.p) * .18) * W, y = (b.y + Math.cos(t * b.sy + b.p * 1.3) * .16) * H;
      const rad = b.rad * Math.max(W, H) * (1 + Math.sin(t * .07 + b.p) * .08);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const c = P.b[b.c];
      g.addColorStop(0, rgba(c, alpha)); g.addColorStop(.55, rgba(c, alpha * .45)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }
  function base(top, bottom) {
    const g = ctx.createLinearGradient(0, 0, W * .3, H);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function frame(now) {
    raf = 0;
    if (!W || !S) return;
    const t = (now - t0) / 1000 * speed;
    P = P || pal();
    const L = P.light;
    ctx.globalCompositeOperation = 'source-over';
    switch (kind) {
      case 'liso': ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H); break;
      case 'aurora': case 'degradado': {
        base(P.bg, mix(P.bg, P.b[1], L ? .25 : .15));
        blobs(kind === 'degradado' ? 8 : t, L ? .75 : .42);
        break;
      }
      case 'sakura': {
        base(mix(P.bg, '#fff3f8', L ? .5 : 0), mix(P.bg, P.b[1], L ? .35 : .2));
        blobs(t * .5, L ? .45 : .28);
        for (const p of S.petals) {
          p.y += p.v * speed; p.x += (Math.sin(t * .9 + p.w) * .35 - .2) * speed; p.rot += p.vr * speed;
          if (p.y > H + 6) { p.y = -6; p.x = S.r() * W * 1.2; } if (p.x < -8) p.x = W + 6;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + Math.sin(t + p.w) * .4);
          ctx.scale(1, .55 + .45 * Math.abs(Math.sin(t * 1.4 + p.w)));
          ctx.fillStyle = p.c > .5 ? rgba('#ffc4dc', L ? .9 : .7) : rgba('#ffdbe9', L ? .95 : .6);
          ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * .62, 0, 0, 6.283); ctx.fill();
          ctx.fillStyle = rgba('#ff9cc4', .35); ctx.beginPath(); ctx.ellipse(p.s * .45, 0, p.s * .3, p.s * .18, 0, 0, 6.283); ctx.fill();
          ctx.restore();
        }
        break;
      }
      case 'nubes': {
        base(L ? mix(P.bg, '#dcefff', .55) : mix(P.bg, '#1b2140', .4), L ? mix(P.bg, P.b[1], .35) : mix(P.bg, P.b[0], .25));
        blobs(t * .4, L ? .35 : .25);
        for (const c of S.clouds) {
          c.x += c.v * .016 * speed; if (c.x > 1.3) c.x = -.3;
          const cx = c.x * W, cy = c.y * H, s = c.s * Math.min(W, H) * .22;
          for (const [dx, dy, k] of c.puffs) {
            const x = cx + dx * s, y = cy + dy * s, r = k * s;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, rgba('#ffffff', L ? .9 : .14)); g.addColorStop(.6, rgba('#ffffff', L ? .55 : .08)); g.addColorStop(1, rgba('#ffffff', 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
          }
        }
        break;
      }
      case 'burbujas': {
        base(mix(P.bg, P.b[2], L ? .25 : .12), mix(P.bg, P.b[0], L ? .3 : .15));
        blobs(t * .5, L ? .45 : .3);
        for (const b of S.bubbles) {
          b.y -= b.v * speed; b.x += Math.sin(t * .8 + b.w) * .25 * speed;
          if (b.y < -b.s * 2) { b.y = H + b.s * 2; b.x = S.r() * W; }
          const col = b.c > .66 ? P.a1 : b.c > .33 ? P.a2 : P.a3;
          const g = ctx.createRadialGradient(b.x - b.s * .3, b.y - b.s * .3, b.s * .1, b.x, b.y, b.s);
          g.addColorStop(0, rgba('#ffffff', L ? .55 : .25)); g.addColorStop(.7, rgba(col, L ? .14 : .12)); g.addColorStop(1, rgba(col, L ? .32 : .28));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.s, 0, 6.283); ctx.fill();
        }
        break;
      }
      case 'estrellas': {
        base(L ? mix(P.bg, '#e9e4ff', .5) : mix(P.bg, '#0c0a1e', .5), L ? mix(P.bg, P.b[0], .4) : mix(P.bg, P.b[0], .3));
        blobs(t * .4, L ? .35 : .3);
        for (const s of S.stars) {
          const k = .35 + .65 * Math.abs(Math.sin(t * s.f + s.p));
          ctx.fillStyle = L ? rgba(P.a1, k * .55) : rgba('#ffffff', k * .9);
          ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, 6.283); ctx.fill();
          if (s.s > 1.2 && k > .9) { ctx.strokeStyle = L ? rgba(P.a1, .3) : rgba('#ffffff', .4); ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(s.x - 4, s.y); ctx.lineTo(s.x + 4, s.y); ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x, s.y + 4); ctx.stroke(); }
        }
        if (animate && !S.shoot && S.r() < .003 * speed) S.shoot = { x: S.r() * W * .8, y: S.r() * H * .4, l: 0 };
        if (S.shoot) {
          const s = S.shoot; s.l += 4 * speed;
          const g = ctx.createLinearGradient(s.x + s.l, s.y + s.l * .4, s.x + s.l - 40, s.y + s.l * .4 - 16);
          g.addColorStop(0, rgba(L ? P.a1 : '#ffffff', .9 * (1 - s.l / 160))); g.addColorStop(1, rgba('#ffffff', 0));
          ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(s.x + s.l, s.y + s.l * .4); ctx.lineTo(s.x + s.l - 40, s.y + s.l * .4 - 16); ctx.stroke();
          if (s.l > 160) S.shoot = null;
        }
        break;
      }
      case 'olas': {
        base(P.bg, mix(P.bg, P.b[0], L ? .3 : .18));
        blobs(t * .3, L ? .4 : .25);
        const cols = [P.b[0], P.b[1], P.b[2], P.b[3]];
        for (let k = 0; k < 4; k++) {
          const y0 = H * (.55 + k * .1), amp = H * (.03 + k * .006), f = .006 / SCALE.olas * .4 * (1 + k * .2);
          ctx.fillStyle = rgba(cols[k], L ? .55 : .3);
          ctx.beginPath(); ctx.moveTo(0, H);
          for (let x = 0; x <= W; x += 3) ctx.lineTo(x, y0 + Math.sin(x * f + t * (.5 + k * .15) + k) * amp + Math.sin(x * f * 2.3 - t * .4) * amp * .35);
          ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
        }
        break;
      }
    }
    if (animate && !paused && !document.hidden && kind !== 'liso' && kind !== 'degradado') raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0;
    if (now - last < 1000 / (FPS[kind] || 24)) { raf = requestAnimationFrame(tick); return; }
    last = now; frame(now);
  }
  function size() {
    const k = SCALE[kind] || .25;
    const w = Math.max(8, Math.ceil(innerWidth * k)), h = Math.max(8, Math.ceil(innerHeight * k));
    if (w === W && h === H && S) return false;
    W = cv.width = w; H = cv.height = h; setup(); return true;
  }
  function kick() { if (raf) cancelAnimationFrame(raf); raf = 0; frame(performance.now()); }

  function init() {
    cv = document.getElementById('bgCanvas');
    if (!cv) { cv = document.createElement('canvas'); cv.id = 'bgCanvas'; document.body.prepend(cv); }
    cv.setAttribute('aria-hidden', 'true');
    ctx = cv.getContext('2d', { alpha: false });
    addEventListener('resize', () => { if (size()) kick(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf) kick(); });
  }
  UI.bg = {
    KINDS,
    set(k, opts = {}) {
      if (!cv) init();
      const nk = KINDS.includes(k) ? k : 'aurora';
      const changed = nk !== kind || opts.amount !== amount;
      kind = nk; speed = opts.speed ?? 1; amount = opts.amount ?? 1; animate = opts.animate !== false;
      cv.hidden = !!opts.hidden;
      P = null;
      if (changed) { W = 0; S = null; }
      size(); kick();
    },
    repaint() { P = null; kick(); },   // cambió la paleta
    pause(v) { paused = !!v; if (!v) kick(); },
    // miniatura para las tarjetas de ajustes
    thumb(k, w = 120, h = 80) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const save = { cv, ctx, kind, W, H, S, animate, P, amount, raf };
      cv = c; ctx = c.getContext('2d'); kind = k; amount = 1; W = Math.ceil(w * (SCALE[k] || .25) * 4); H = Math.ceil(h * (SCALE[k] || .25) * 4); c.width = W; c.height = H; animate = false; P = null; setup();
      frame(performance.now() + 20000);
      ({ cv, ctx, kind, W, H, S, animate, P, amount, raf } = save);
      return c;
    },
  };
})();
