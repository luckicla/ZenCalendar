'use strict';
// ZenCalendar · diseño «Dot»: monocromo, puntos y un solo rojo (inspirado en el estilo de Nothing OS).
// Se elige con prefs.look.design = 'dot' y se pinta con html[data-design="dot"] (css/dot.css).
// Aquí está lo que necesita JS:
//   · números y titulares en matriz de puntos 5×7 (SVG) que se encienden columna a columna
//   · la paleta y las variables de Dot, su letra y sus fondos (puntos, rejilla, liso y «glyph» animado)
//   · la cabecera (mes y fecha de hoy en puntos), la vista Mes como rejilla de puntos y sus ajustes
//   · el selector «Diseño: Zen / Dot» (Ajustes y bienvenida) y el widget de escritorio
// Con Zen no hace nada: cada gancho mira primero si el diseño es Dot.
(function () {
  const ZC = window.ZC, UI = ZC.ui = ZC.ui || {};
  const t = (...a) => ZC.t(...a);
  const root = document.documentElement;
  const on = () => root.dataset.design === 'dot';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const animOk = () => { const a = root.dataset.anim || 'normal'; return a === 'normal' || a === 'lots'; };

  // ---------- valores por defecto de Dot (se guardan en prefs.look como el resto) ----------
  const DOT0 = { dotAccent: 'red', dotBg: 'dots', dotGap: 18, dotGlass: 22, dotBlur: 14, dotColors: 'dot', dotFont: 'archivo', dotSpeed: 1 };
  if (UI.look && UI.look.LOOK0) Object.assign(UI.look.LOOK0, DOT0);
  const val = (L, k) => (L && L[k] != null ? L[k] : DOT0[k]);
  // «glyph» se ve a través de los paneles: al elegirlo, si la transparencia sigue en la de siempre, se sube para que
  // se vea (y al dejarlo vuelve). Si el usuario ya la había movido, no se toca.
  const GLYPH_GLASS = 40;
  function bgPatch(v) {
    const L = UI.look.get(), g = +val(L, 'dotGlass'), was = val(L, 'dotBg'), p = { dotBg: v };
    if (v === 'glyph' && was !== 'glyph' && g === DOT0.dotGlass) p.dotGlass = GLYPH_GLASS;
    else if (v !== 'glyph' && was === 'glyph' && g === GLYPH_GLASS) p.dotGlass = DOT0.dotGlass;
    return p;
  }

  // ---------- matriz de puntos 5×7 ----------
  // Los mismos dibujos que la fuente ZenDot (tools/mkfont.py los escribe aquí). Cada letra: «fila de arriba|filas»,
  // con la fila 0 arriba de las mayúsculas y la 6 en la línea base; las tildes de las mayúsculas suben a las filas
  // -3 y -2 y la cola de la «Ç» baja a la 7 y la 8. Esas filas de más solo pintan los puntos encendidos: la rejilla
  // apagada es siempre la de 7.
  // <zendot> (lo escribe tools/mkfont.py: no lo cambies a mano)
  const F = {
    '0': '0|01110 10001 10001 10001 10001 10001 01110', '1': '0|00100 01100 10100 00100 00100 00100 11111', '2': '0|01110 10001 00001 00010 00100 01000 11111', '3': '0|01110 10001 00001 00110 00001 10001 01110',
    '4': '0|00010 00110 01010 10010 11111 00010 00010', '5': '0|11111 10000 11110 00001 00001 10001 01110', '6': '0|00110 01000 10000 11110 10001 10001 01110', '7': '0|11111 00001 00010 00100 01000 01000 01000',
    '8': '0|01110 10001 10001 01110 10001 10001 01110', '9': '0|01110 10001 10001 01111 00001 00010 01100', 'A': '0|01110 10001 10001 11111 10001 10001 10001', 'B': '0|11110 10001 10001 11110 10001 10001 11110',
    'C': '0|01110 10001 10000 10000 10000 10001 01110', 'D': '0|11110 10001 10001 10001 10001 10001 11110', 'E': '0|11111 10000 10000 11110 10000 10000 11111', 'F': '0|11111 10000 10000 11110 10000 10000 10000',
    'G': '0|01110 10001 10000 10111 10001 10001 01111', 'H': '0|10001 10001 10001 11111 10001 10001 10001', 'I': '0|111 010 010 010 010 010 111', 'J': '0|00111 00010 00010 00010 00010 10010 01100',
    'K': '0|10001 10010 10100 11000 10100 10010 10001', 'L': '0|10000 10000 10000 10000 10000 10000 11111', 'M': '0|10001 11011 10101 10101 10001 10001 10001', 'N': '0|10001 10001 11001 10101 10011 10001 10001',
    'O': '0|01110 10001 10001 10001 10001 10001 01110', 'P': '0|11110 10001 10001 11110 10000 10000 10000', 'Q': '0|01110 10001 10001 10001 10101 10010 01101', 'R': '0|11110 10001 10001 11110 10100 10010 10001',
    'S': '0|01110 10001 10000 01110 00001 10001 01110', 'T': '0|11111 00100 00100 00100 00100 00100 00100', 'U': '0|10001 10001 10001 10001 10001 10001 01110', 'V': '0|10001 10001 10001 10001 10001 01010 00100',
    'W': '0|10001 10001 10001 10101 10101 10101 01010', 'X': '0|10001 10001 01010 00100 01010 10001 10001', 'Y': '0|10001 10001 01010 00100 00100 00100 00100', 'Z': '0|11111 00001 00010 00100 01000 10000 11111',
    'Á': '-3|00010 00100 00000 01110 10001 10001 11111 10001 10001 10001', 'É': '-3|00010 00100 00000 11111 10000 10000 11110 10000 10000 11111', 'Í': '-3|001 010 000 111 010 010 010 010 010 111', 'Ó': '-3|00010 00100 00000 01110 10001 10001 10001 10001 10001 01110',
    'Ú': '-3|00010 00100 00000 10001 10001 10001 10001 10001 10001 01110', 'À': '-3|01000 00100 00000 01110 10001 10001 11111 10001 10001 10001', 'È': '-3|01000 00100 00000 11111 10000 10000 11110 10000 10000 11111', 'Ì': '-3|100 010 000 111 010 010 010 010 010 111',
    'Ò': '-3|01000 00100 00000 01110 10001 10001 10001 10001 10001 01110', 'Ù': '-3|01000 00100 00000 10001 10001 10001 10001 10001 10001 01110', 'Ä': '-2|01010 00000 01110 10001 10001 11111 10001 10001 10001', 'Ë': '-2|01010 00000 11111 10000 10000 11110 10000 10000 11111',
    'Ï': '-2|101 000 111 010 010 010 010 010 111', 'Ö': '-2|01010 00000 01110 10001 10001 10001 10001 10001 01110', 'Ü': '-2|01010 00000 10001 10001 10001 10001 10001 10001 01110', 'Ñ': '-3|01101 10010 00000 10001 10001 11001 10101 10011 10001 10001',
    'Ç': '0|01110 10001 10000 10000 10000 10001 01110 00100 01000', '.': '6|1', ',': '5|01 01 10', ':': '2|1 0 1',
    ';': '2|01 00 00 01 01 10', '!': '0|1 1 1 1 1 0 1', '¡': '0|1 0 1 1 1 1 1', '?': '0|01110 10001 00001 00010 00100 00000 00100',
    '¿': '0|00100 00000 00100 01000 10000 10001 01110', "'": '0|1 1', '"': '0|101 101', '‘': '0|01 10',
    '’': '0|01 10', '“': '0|0101 1010', '”': '0|0101 1010', '«': '2|001001 010010 100100 010010 001001',
    '»': '2|100100 010010 001001 010010 100100', '-': '3|111', '‐': '3|111', '–': '3|11111',
    '—': '3|1111111', '/': '0|00001 00010 00010 00100 01000 01000 10000', '\\': '0|10000 01000 01000 00100 00010 00010 00001', '|': '0|1 1 1 1 1 1 1 1',
    '(': '0|001 010 100 100 100 010 001', ')': '0|100 010 001 001 001 010 100', '[': '0|111 100 100 100 100 100 111', ']': '0|111 001 001 001 001 001 111',
    '{': '0|0011 0100 0100 1000 0100 0100 0011', '}': '0|1100 0010 0010 0001 0010 0010 1100', '+': '1|00100 00100 11111 00100 00100', '±': '1|00100 11111 00100 00000 11111',
    '×': '2|10001 01010 00100 01010 10001', '÷': '1|00100 00000 11111 00000 00100', '%': '0|11000 11001 00010 00100 01000 10011 00011', '&': '0|01100 10010 10100 01000 10101 10010 01101',
    '@': '0|01110 10001 00001 01101 10101 10101 01110', '#': '0|01010 01010 11111 01010 11111 01010 01010', '*': '1|00100 10101 01110 10101 00100', '=': '2|11111 00000 11111',
    '<': '0|0001 0010 0100 1000 0100 0010 0001', '>': '0|1000 0100 0010 0001 0010 0100 1000', '_': '8|11111', '~': '2|01101 10010',
    '^': '0|00100 01010 10001', '`': '0|10 01', '´': '0|01 10', '¨': '0|101',
    '°': '0|010 101 010', '·': '3|1', '•': '2|010 111 010', '…': '6|10101',
    '$': '0|00100 01111 10100 01110 00101 11110 00100', '€': '0|00111 01000 11110 01000 11110 01000 00111', '£': '0|00110 01001 01000 11110 01000 01000 11111', '→': '1|00100 00010 11111 00010 00100',
    '←': '1|00100 01000 11111 01000 00100', '↑': '0|00100 01110 10101 00100 00100 00100 00100', '↓': '0|00100 00100 00100 00100 10101 01110 00100', '✓': '1|00001 00010 10100 01000 00000',
  };
  // </zendot>
  const gcache = new Map();
  function glyph(ch) {
    if (gcache.has(ch)) return gcache.get(ch);
    let g = null;
    if (ch === ' ' || ch === '\u00a0') g = { w: 3, top: 0, rows: [], blank: true };   // el espacio: sin puntos apagados
    else if (F[ch]) {
      const [top, body] = F[ch].split('|'), rows = body.split(' ');
      g = { w: rows[0].length, top: +top, rows };
    }
    gcache.set(ch, g);
    return g;
  }
  /**
   * matrix(texto | [{ text, tone }], { pitch, cls, scan, label }) → SVG con un punto por píxel.
   * tone: '' (encendido), 'dim' (gris) o 'acc' (color de acento). Los puntos apagados se ven muy tenues.
   */
  function matrix(parts, o = {}) {
    if (!Array.isArray(parts)) parts = [{ text: String(parts) }];
    const pitch = o.pitch || 4, r = pitch * (o.r || .36);
    const cells = [];
    let col = 0, rmin = 0, rmax = 6;
    parts.forEach(p => {
      const txt = String(p.text || '').toLocaleUpperCase(ZC.i18n ? ZC.i18n.locale() : 'es');
      for (const ch of txt) {
        const g = glyph(ch) || glyph('?');
        if (col > 0) col += 1;   // un punto de aire entre letras (como en ZenDot); el espacio deja 5 sin puntos
        cells.push({ g, col, tone: p.tone || '' });
        rmin = Math.min(rmin, g.top); rmax = Math.max(rmax, g.top + g.rows.length - 1);
        col += g.w;
      }
    });
    const y0 = -rmin, rowsN = rmax - rmin + 1;
    const W = Math.max(1, col) * pitch, H = rowsN * pitch;
    let lit = '', off = '';
    const dot = (x, y, cls, c) => `<circle cx="${(x + .5) * pitch}" cy="${(y + .5) * pitch}" r="${r}"${cls ? ` class="${cls}"` : ''}${c != null ? ` style="--c:${c}"` : ''}/>`;
    for (const { g, col: x0, tone } of cells) {
      const on = new Set();
      g.rows.forEach((row, i) => { for (let x = 0; x < g.w; x++) if (row[x] === '1') on.add(x + ',' + (g.top + i)); });
      for (const k of on) { const [x, y] = k.split(',').map(Number); lit += dot(x0 + x, y + y0, 'l' + (tone ? ' ' + tone : ''), x0 + x); }
      // la rejilla apagada: las 7 filas del cuerpo de la letra (el espacio no lleva)
      if (o.off !== false && !g.blank) for (let y = 0; y < 7; y++) for (let x = 0; x < g.w; x++) if (!on.has(x + ',' + y)) off += dot(x0 + x, y + y0);
    }
    const label = o.label != null ? o.label : parts.map(p => p.text).join('');
    return `<svg class="dm ${o.cls || ''} ${o.scan ? 'scan' : ''}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label.trim())}"><g class="o">${off}</g><g>${lit}</g></svg>`;
  }

  // logo de Dot: la «Z» y las dos pestañas del calendario hechas de puntos, con un punto rojo
  function logo(size = 30, cls = '') {
    const Z = ['11111', '00010', '00100', '01000', '11112'];   // el último punto de la «Z» es el rojo
    let d = '', red = '';
    Z.forEach((row, y) => [...row].forEach((b, x) => {
      const c = `<circle cx="${(6.8 + x * 2.6).toFixed(1)}" cy="${(9.2 + y * 2.6).toFixed(1)}" r="0.98"`;
      if (b === '1') d += c + '/>'; else if (b === '2') red = c + ' class="dl-red"/>';
    }));
    return `<svg class="dot-logo ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><rect x=".5" y=".5" width="23" height="23" rx="7" class="dl-bg"/><g class="dl-fg"><circle cx="9.4" cy="5" r="1.1"/><circle cx="14.6" cy="5" r="1.1"/>${d}</g>${red}</svg>`;
  }

  // ---------- paleta ----------
  const ACCENTS = [['red', 'Rojo', '#D71921'], ['ink', 'Tinta', null], ['amber', 'Ámbar', '#F2A900'], ['cyan', 'Cian', '#1FB5C8'], ['green', 'Verde', '#2DB46C']];
  function accentOf(L, fg) {
    const a = val(L, 'dotAccent');
    if (a === 'ink') return fg;
    const named = ACCENTS.find(x => x[0] === a);
    if (named) return named[2];
    return /^#[0-9a-f]{6}$/i.test(String(a)) ? a : '#D71921';
  }
  function palette(L, sc) {
    const light = sc === 'light';
    const p = light
      ? { bg: '#F2F2F2', s1: '#FFFFFF', fg: '#000000', mut: '#6A6A6A', b: ['#E2E2E2', '#EAEAEA', '#D9D9D9', '#EFEFEF'] }
      : { bg: '#000000', s1: '#141414', fg: '#FFFFFF', mut: '#8F8F8F', b: ['#1F1F1F', '#262626', '#1A1A1A', '#2B2B2B'] };
    p.a1 = p.a2 = accentOf(L, p.fg);
    p.a3 = p.fg;
    p.dotAccent = p.a1;   // para el selector de color de Ajustes
    return p;
  }

  // ---------- letras ----------
  const FONTS = {
    archivo: ['Archivo', 'Archivo:wght@400;500;600;700', '"Archivo"'],
    system: ['Sistema', null, '"Segoe UI Variable Text","Segoe UI"'],
    atkinson: ['Atkinson (muy legible)', 'Atkinson+Hyperlegible:wght@400;700', '"Atkinson Hyperlegible"'],
  };
  const SYS = 'system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif';
  const fontLinks = new Set();
  function ensureFont(spec) {
    if (!spec || fontLinks.has(spec) || navigator.onLine === false) return;
    fontLinks.add(spec);
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + spec + '&display=swap';
    l.onerror = () => l.remove();
    document.head.appendChild(l);
  }

  // ---------- aplicar (lo llama look.js después de poner lo común) ----------
  let lastDesign = null;
  function apply(L, p, ctx) {
    const dot = L.design === 'dot';
    if (!dot) { glyph_.stop(); root.removeAttribute('data-dotbg'); root.removeAttribute('data-dotcolor'); return; }
    const set = ctx.set, c = UI.look.color;
    set('--a1ink', c.lum(p.a1) > .36 ? '#000000' : '#FFFFFF');
    set('--a1t', c.readable(p.a1, p.s1, 4.5));
    set('--a2t', c.readable(p.a1, p.s1, 4.5));
    set('--a3t', p.fg);
    const f = FONTS[val(L, 'dotFont')] || FONTS.archivo;
    ensureFont(f[1]);
    set('--font-ui', f[2] + ',' + SYS); set('--font-title', f[2] + ',' + SYS);
    const g = Math.max(0, Math.min(90, +val(L, 'dotGlass')));
    const op = v => Math.max(8, Math.min(100, v)) + '%';
    set('--o-side', op(100 - g)); set('--o-main', op(100 - g)); set('--o-bar', op(100 - g * 1.2)); set('--o-card', op(100 - g * .6));
    set('--gb', (+val(L, 'dotBlur') || 0) + 'px');
    set('--rad', '26px');
    set('--dot-gap', Math.max(8, +val(L, 'dotGap')) + 'px');
    root.dataset.evstyle = 'dot'; root.dataset.shadows = 'none'; root.dataset.titlefont = 'dot';
    root.classList.remove('color-shadows', 'today-glow');
    root.classList.toggle('no-blur', !(+val(L, 'dotBlur')));
    const bg = ['dots', 'grid', 'liso', 'glyph'].includes(val(L, 'dotBg')) ? val(L, 'dotBg') : 'dots';
    root.dataset.dotbg = bg;
    root.dataset.dotcolor = ['dot', 'full', 'mono'].includes(val(L, 'dotColors')) ? val(L, 'dotColors') : 'dot';
    if (bg === 'glyph' && !(ZC.platform && ZC.platform.isWidget)) glyph_.start({ speed: +val(L, 'dotSpeed') || 1, animate: ctx.anim === 'normal' || ctx.anim === 'lots' });
    else glyph_.stop();
  }

  // ---------- fondo «glyph»: tiras de luz que se encienden por pasos ----------
  const glyph_ = (() => {
    let cv = null, ctx = null, col = null, W = 0, H = 0, dpr = 1, timer = 0, speed = 1, animate = true, segs = [], seq = [], step = 0, queue = [];
    function layout() {
      // el anillo, por debajo de la cabecera (que no tiene panel: encima de un trazo encendido no se leería nada)
      const m = Math.min(W, H), R = m * .2 + 40, cx = Math.min(W * .74, W - R - 24), cy = Math.max(H * .5, 110 + R);
      segs = [];
      const arcs = 6, gap = .09;
      for (let i = 0; i < arcs; i++) { const a0 = -Math.PI / 2 + i * (Math.PI * 2 / arcs) + gap, a1 = a0 + Math.PI * 2 / arcs - gap * 2; segs.push({ k: 'arc', cx, cy, r: R, a0, a1, g: 'ring', b: 0 }); }
      const bx = W * .95, by0 = H * .6, by1 = H * .92, n = 5;
      for (let i = 0; i < n; i++) { const y1 = by1 - (by1 - by0) * i / n, y0 = by1 - (by1 - by0) * (i + 1) / n + 10; segs.push({ k: 'line', x0: bx, y0: y1 - 5, x1: bx, y1: y0, g: 'bar', b: 0 }); }
      segs.push({ k: 'line', x0: cx - R * .95, y0: cy + R * 1.05, x1: cx - R * 1.7, y1: cy + R * 2.2, g: 'diag', b: 0 });
      // abajo a la izquierda (arriba, entre la cabecera y los paneles, parecía una barra de desplazamiento)
      segs.push({ k: 'line', x0: W * .06, y0: H * .86, x1: W * .06 + Math.min(180, W * .14), y1: H * .86, g: 'top', b: 0 });
      segs.push({ k: 'dot', x: W * .06 + Math.min(180, W * .14) + 22, y: H * .86, g: 'top', b: 0 });
      segs.push({ k: 'dot', x: cx, y: cy, g: 'core', b: 0 });
    }
    const idx = g => segs.map((s, i) => s.g === g ? i : -1).filter(i => i >= 0);
    // secuencias: cada paso es la lista de tiras que se encienden (las demás se apagan en dos pasos)
    function program(kind) {
      const ring = idx('ring'), bar = idx('bar'), diag = idx('diag'), top = idx('top'), core = idx('core');
      if (kind === 'ring') return [...ring.map((_, i) => ring.slice(0, i + 1)), ring, [], ring, [], [], []];
      if (kind === 'bar') return [...bar.map((_, i) => bar.slice(0, i + 1)), bar, bar, [], [], []];
      if (kind === 'blink') return [[...diag, ...core], [], [...diag, ...core], [], [], top, top, [], [], []];
      return [[]];
    }
    function next() {
      if (!queue.length) queue = ['ring', 'blink', 'bar', 'blink'].flatMap(k => program(k)).concat(Array(3).fill([]));
      return queue.shift();
    }
    function draw() {
      if (!ctx) return;
      // (el color se lee una vez por cada start(): leer estilos cada 120 ms obligaba a recalcularlos)
      if (!col) col = { fg: getComputedStyle(root).getPropertyValue('--fg').trim() || '#fff', light: root.dataset.scheme === 'light' };
      const { fg, light } = col;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const lw = Math.max(6, Math.min(W, H) * .015);
      ctx.lineCap = 'round';
      for (const s of segs) {
        for (const pass of [0, 1]) {
          const a = pass === 0 ? (light ? .16 : .22) : s.b * (light ? .65 : .8);   // encendido, sin tapar el texto de los paneles
          if (a <= 0) continue;
          ctx.globalAlpha = a; ctx.strokeStyle = ctx.fillStyle = fg;
          ctx.shadowColor = fg; ctx.shadowBlur = pass ? lw * (light ? 1.2 : 3) : 0;
          ctx.lineWidth = lw;
          ctx.beginPath();
          if (s.k === 'arc') { ctx.arc(s.cx, s.cy, s.r, s.a0, s.a1); ctx.stroke(); }
          else if (s.k === 'line') { ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke(); }
          else { ctx.arc(s.x, s.y, lw * .75, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    function tick() {
      timer = 0;
      if (!cv || document.hidden) return;
      const litNow = new Set(next() || []);
      segs.forEach((s, i) => { s.b = litNow.has(i) ? 1 : s.b > .5 ? .35 : 0; });
      draw(); step++;
      if (animate) timer = setTimeout(tick, 120 / Math.max(.2, speed));
    }
    function size() {
      if (!cv) return;
      dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      layout(); draw();
    }
    function start(o) {
      speed = o.speed || 1; animate = o.animate !== false; col = null;
      if (!cv) {
        cv = document.createElement('canvas'); cv.id = 'dotGlyph'; cv.setAttribute('aria-hidden', 'true');
        const ref = document.getElementById('bgVeil');
        if (ref) ref.after(cv); else document.body.prepend(cv);
        ctx = cv.getContext('2d');
        addEventListener('resize', size);
        document.addEventListener('visibilitychange', onVis);
        size();
      }
      clearTimeout(timer); timer = 0;
      if (animate) tick();
      else { queue = []; segs.forEach((s, i) => { s.b = s.g === 'ring' && i % 2 === 0 ? 1 : 0; }); draw(); }
    }
    function onVis() { if (cv && !document.hidden && !timer && animate) tick(); }
    function stop() { if (!cv) return; clearTimeout(timer); timer = 0; removeEventListener('resize', size); document.removeEventListener('visibilitychange', onVis); cv.remove(); cv = null; ctx = null; queue = []; }
    // respuesta a lo que hace el usuario: la barra se llena por pasos (al guardar algo)
    function pulse(kind = 'bar') { if (!cv || !animate) return; queue = program(kind).concat(queue.slice(0, 0)); }
    return { start, stop, pulse };
  })();

  // ---------- textos de la cabecera ----------
  const up = s => String(s || '').toLocaleUpperCase(ZC.i18n ? ZC.i18n.locale() : 'es');
  const mon3 = d => up(ZC.i18n.D.month(d, 'short')).replace(/^(DE |D')/, '').replace(/[^A-ZÀ-Ý]/g, '').slice(0, 3);
  const wd3 = d => up(ZC.i18n.D.wd(d)).replace(/[^A-ZÀ-Ý]/g, '').slice(0, 3);
  function titleParts(st) {
    const d = st.date, D = ZC.i18n.D, C = UI.cal, mob = UI.isMobile() || innerWidth < 1100, y = String(d.getFullYear()), thisYear = d.getFullYear() === new Date().getFullYear();
    switch (st.view) {
      case 'week': {
        const a = C.sow(d), b = C.addDays(a, 6);
        const txt = a.getMonth() === b.getMonth() ? `${a.getDate()}-${b.getDate()} ${mon3(a)}` : `${a.getDate()} ${mon3(a)}-${b.getDate()} ${mon3(b)}`;
        return [{ text: txt }, ...(mob && thisYear ? [] : [{ text: ' ' + b.getFullYear(), tone: 'dim' }])];
      }
      case 'day': return [{ text: `${wd3(d)} ${d.getDate()}` }, { text: ' ' + mon3(d), tone: 'dim' }];
      case 'agenda': return [{ text: t('Agenda') }, ...(mob ? [] : [{ text: ' ' + mon3(d), tone: 'dim' }])];
      case 'year': return [{ text: y }];
      case 'tasks': return [{ text: t('Tareas') }];
      default: return [{ text: D.month(d) }, ...(mob && thisYear ? [] : [{ text: ' ' + y, tone: 'dim' }])];
    }
  }

  // ---------- cabecera (lo llama app.js en cada pintado) ----------
  let lastTitle = '', lastToday = '', booted = false;
  function chrome(st) {
    if (!on()) return;
    const pt = document.getElementById('periodTitle');
    if (pt) {
      let box = pt.querySelector('.dm-title');
      if (!box) { box = document.createElement('span'); box.className = 'dm-title'; box.setAttribute('aria-hidden', 'true'); pt.querySelector('h1').after(box); lastTitle = ''; }
      const pitch = UI.isMobile() ? 3.6 : innerWidth < 1100 ? 3.2 : innerWidth < 1300 ? 4 : 4.6;
      const parts = titleParts(st), key = JSON.stringify(parts) + pitch;
      if (key !== lastTitle) {
        const scan = animOk() && (lastTitle !== '' || root.classList.contains('boot'));
        box.innerHTML = matrix(parts, { pitch, scan });
        lastTitle = key;
      }
    }
    const tb = document.getElementById('btnToday');
    if (tb) {
      const td = UI.cal.today(), k = UI.cal.ymd(td);
      let box = tb.querySelector('.dm-today');
      if (!box || lastToday !== k) {
        if (!box) { box = document.createElement('span'); box.className = 'dm-today'; tb.prepend(box); }
        box.innerHTML = matrix(String(td.getDate()), { pitch: UI.isMobile() ? 2.4 : 3, cls: 'acc' }) + `<small>${esc(wd3(td))}</small>`;
        lastToday = k;
      }
    }
    const br = document.getElementById('brand');
    if (br && !br.querySelector('.dot-logo')) br.querySelector('.brand-logo').insertAdjacentHTML('afterend', logo(30, 'dot-brand'));
    booted = true;
  }

  // ---------- vista Mes: cada día es un punto que se enciende según lo que tiene ----------
  let lastMonthKey = '';
  function buildMonth(d) {
    const C = UI.cal, cal = C.prefsCal();
    const first = new Date(d.getFullYear(), d.getMonth(), 1), start = C.sow(first), last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const weeks = Math.ceil((C.daysBetween(start, last) + 1) / 7), end = C.addDays(start, weeks * 7);
    const list = C.occ(start, end), hol = C.holidays(start, end), tdy = C.today();
    const sel = UI.app && UI.app.state.sel ? UI.app.state.sel : tdy;
    const count = new Map(), cols = new Map();
    for (const o of list) {
      const col = (C.evVars(o).match(/--c:([^;]+)/) || [])[1];
      for (let dd = C.sod(o.start), k = 0; dd <= C.lastDay(o) && k < 62; dd = C.addDays(dd, 1), k++) {
        const key = C.ymd(dd); count.set(key, (count.get(key) || 0) + 1);
        const cs = cols.get(key) || []; if (col && !cs.includes(col) && cs.length < 3) cs.push(col); cols.set(key, cs);
      }
    }
    const mobile = UI.isMobile(), wn = !!cal.weekNumbers;
    const mk = d.getFullYear() * 12 + d.getMonth();
    const scan = animOk() && (mk !== lastMonthKey);
    lastMonthKey = mk;
    let head = `<div class="mv-head dm-head">${wn ? '<span class="dm-wk"></span>' : ''}`;
    for (let i = 0; i < 7; i++) { const dd = C.addDays(start, i); head += `<span class="${dd.getDay() === 0 || dd.getDay() === 6 ? 'we' : ''}">${esc(mobile ? ZC.i18n.D.wdLetter(dd) : wd3(dd))}</span>`; }
    head += '</div>';
    let grid = '', i = 0;
    for (let w = 0; w < weeks; w++) {
      const ws = C.addDays(start, w * 7);
      grid += `<div class="dm-week">${wn ? `<span class="dm-wk">${C.isoWeek(C.addDays(ws, 3))}</span>` : ''}`;
      for (let k = 0; k < 7; k++, i++) {
        const dd = C.addDays(ws, k), key = C.ymd(dd), n = count.get(key) || 0, out = dd.getMonth() !== d.getMonth();
        const lvl = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4, hn = hol.get(key);
        const cls = ['mc-day', 'dm-day', 'l' + lvl, out ? 'out' : '', C.sameDay(dd, tdy) ? 'today' : '', C.sameDay(dd, sel) && !out ? 'sel' : '', hn ? 'hol' : '', dd < tdy ? 'past' : ''].filter(Boolean).join(' ');
        const label = ZC.i18n.D.day(dd) + (n ? ', ' + ZC.i18n.tn(n, '{n} evento', '{n} eventos') : '') + (hn ? ', ' + hn : '');
        const pips = !out && n ? `<span class="dm-pips">${(cols.get(key) || []).map(c => `<i style="--c:${c}"></i>`).join('')}</span>` : '';
        grid += `<div class="${cls}" data-d="${key}" tabindex="-1" style="--i:${i}" title="${esc(label)}" aria-label="${esc(label)}"><span class="dm-dot"><span class="num">${dd.getDate()}</span></span>${pips}</div>`;
      }
      grid += '</div>';
    }
    const el = UI.h(`<div class="view v-month dm-month ${wn ? 'wn' : ''} ${scan ? 'scan' : ''}" style="--weeks:${weeks}">
      <div class="dm-cal">${head}<div class="mv-grid dm-grid">${grid}</div></div>
      <div class="mv-daylist dm-panel"></div></div>`);
    el._d = d;
    wireMonth(el, d);
    return el;
  }
  function dayPanel(el) {
    const box = el.querySelector('.dm-panel'); if (!box) return;
    const C = UI.cal, sel = (UI.app && UI.app.state.sel) || C.today(), td = C.today();
    const list = C.onDay(C.occ(C.sod(sel), C.addDays(C.sod(sel), 1)), sel);
    const hn = C.holidays(C.sod(sel), C.addDays(C.sod(sel), 1)).get(C.ymd(sel));
    const D = ZC.i18n.D, isToday = C.sameDay(sel, td);
    const rel = isToday ? t('Hoy') : C.sameDay(sel, C.addDays(td, 1)) ? t('Mañana') : C.sameDay(sel, C.addDays(td, -1)) ? t('Ayer') : '';
    let html = `<div class="dp-head ${isToday ? 'today' : ''}">${matrix(String(sel.getDate()).padStart(2, '0'), { pitch: UI.isMobile() ? 3.4 : 6, cls: isToday ? 'acc' : '', scan: animOk() && box._last !== C.ymd(sel) && !!box._last })}
      <div class="dp-tx"><b>${esc(D.wd(sel, 'long'))}</b><small>${esc(D.month(sel))} ${sel.getFullYear()}</small></div>
      <div class="dp-tags">${rel ? `<span class="dp-tag ${isToday ? 'acc' : ''}">${esc(rel)}</span>` : ''}<span class="dp-tag">${esc(ZC.i18n.tn(list.length, '{n} evento', '{n} eventos'))}</span></div></div>`;
    if (hn) html += `<p class="dp-hol">${esc(hn)}</p>`;
    if (!list.length) html += `<div class="dp-empty"><span class="dp-empty-dots" aria-hidden="true">${'<i></i>'.repeat(5)}</span><p>${esc(UI.touchy() ? t('Nada por aquí. Mantén pulsado un día para añadir algo.') : t('Día libre'))}</p></div>`;
    else html += '<div class="dl-list dp-list">' + list.map((o, i) => UI.views.agendaCard(o, i, { date: sel })).join('') + '</div>';
    html += `<button type="button" class="dp-add" data-act="dpadd">${UI.icon('plus', 18)}<span>${esc(t('Añadir'))}</span></button>`;
    box.innerHTML = html;
    box._last = C.ymd(sel);
    box.querySelectorAll('[data-key]').forEach(b => { b._o = list.find(x => x.key === b.dataset.key); });
  }
  function wireMonth(el, d) {
    const C = UI.cal;
    const select = (cell, haptic) => {
      el.querySelectorAll('.dm-day.sel').forEach(x => x.classList.remove('sel'));
      cell.classList.add('sel');
      UI.app.state.sel = C.parse(cell.dataset.d);
      dayPanel(el);
      UI.side && UI.side.render && UI.side.render();
      if (haptic) UI.haptic('tick');
    };
    el.addEventListener('click', e => {
      if (el._dragged) { el._dragged = false; return; }
      const tk = e.target.closest('.tick'), card = e.target.closest('[data-key]');
      if (tk && card && card._o) { e.stopPropagation(); C.toggleTask(card._o, tk); return; }
      if (card && card._o) { UI.editor.detail(card._o, card); return; }
      if (e.target.closest('[data-act=dpadd]')) { UI.editor.open({ date: UI.app.state.sel || C.today() }); return; }
      const cell = e.target.closest('.dm-day');
      if (!cell) return;
      const dd = C.parse(cell.dataset.d);
      if (cell.classList.contains('out')) { UI.app.go({ date: dd, sel: dd }, dd > d ? 1 : -1); return; }
      select(cell, true);
    });
    el.addEventListener('dblclick', e => { const cell = e.target.closest('.dm-day'); if (!cell || e.target.closest('[data-key]')) return; UI.editor.open({ date: C.parse(cell.dataset.d), allDay: false }); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-key]')) e.target.click(); });
    // ratón: arrastrar una tarjeta de la lista del día a otro punto = moverla
    let P = null;
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.pointerType !== 'mouse') return;
      const card = e.target.closest('.dm-panel .ag-card'); if (!card || !card._o || e.target.closest('.tick')) return;
      P = { card, x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
    });
    const cellAt = (x, y) => { for (const c of el.querySelectorAll('.dm-day')) { const r = c.getBoundingClientRect(); if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return c; } return null; };
    el.addEventListener('pointermove', e => {
      if (!P || e.pointerId !== P.id) return;
      if (!P.on) {
        if (Math.hypot(e.clientX - P.x, e.clientY - P.y) < 6) return;
        P.on = true; el._dragged = true;
        P.ghost = UI.h(`<div class="mv-ghost dm-ghost" style="${C.evVars(P.card._o)}">${esc(C.titleOf(P.card._o.ev))}</div>`);
        document.body.appendChild(P.ghost); P.card.classList.add('dragging');
        root.classList.add('dragging-ev');
        try { el.setPointerCapture(P.id); } catch {}
      }
      P.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY - 14}px)`;
      const c = cellAt(e.clientX, e.clientY);
      if (c !== P.over) { if (P.over) P.over.classList.remove('drop'); P.over = c && !c.classList.contains('out') ? c : null; if (P.over) P.over.classList.add('drop'); }
    });
    const end = e => {
      if (!P) return;
      const p = P; P = null;
      if (!p.on) return;
      p.ghost.remove(); p.card.classList.remove('dragging'); root.classList.remove('dragging-ev');
      if (p.over) p.over.classList.remove('drop');
      setTimeout(() => { el._dragged = false; }, 60);
      if (!e || e.type === 'pointercancel' || !p.over) return;
      const o = p.card._o, from = UI.app.state.sel || C.sod(o.start), delta = C.daysBetween(C.sod(from), C.parse(p.over.dataset.d));
      if (!delta) return;
      UI.app.state.sel = C.parse(p.over.dataset.d);
      C.moveOccurrence(o, C.addDays(o.start, delta), C.addDays(o.allDay ? C.lastDay(o) : o.end, delta));
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  function mountMonth(el) {
    dayPanel(el);
    if (el.classList.contains('scan')) setTimeout(() => el.classList.remove('scan'), 900);
  }

  // envuelve una vista: con Dot usa lo nuestro, con Zen lo de siempre
  function wrapViews() {
    const V = UI.views && UI.views.month; if (!V || V._dot) return;
    const base = { build: V.build, mount: V.mount, resize: V.resize, refreshSel: V.refreshSel };
    V._dot = true;
    V.build = d => on() ? buildMonth(d) : base.build(d);
    V.mount = el => el.classList.contains('dm-month') ? mountMonth(el) : base.mount && base.mount(el);
    V.resize = el => el.classList.contains('dm-month') ? null : base.resize && base.resize(el);
    V.refreshSel = el => el.classList.contains('dm-month') ? dayPanel(el) : base.refreshSel && base.refreshSel(el);
  }

  // ---------- iconos de línea propios de Dot (los demás, los de siempre con trazo más fino) ----------
  const ICONS = {
    month: '<circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="6" cy="18" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="2.6"/><circle cx="18" cy="18" r="1.5" fill="currentColor" stroke="none"/>',
    week: '<path d="M5 4.5v15M9.7 4.5v15M14.3 4.5v15M19 4.5v15"/>',
    day: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 1.8"/>',
    agenda: '<path d="M10 6.5h10M10 12h10M10 17.5h6"/><circle cx="5" cy="6.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="5" cy="17.5" r="1.4"/>',
    tasks: '<circle cx="12" cy="12" r="8.5"/><path d="M8.6 12.2l2.3 2.3 4.6-4.8"/>',
    year: [4.5, 9.5, 14.5, 19.5].flatMap(y => [4.5, 9.5, 14.5, 19.5].map(x => `<circle cx="${x}" cy="${y}" r="1.25" fill="currentColor" stroke="none"/>`)).join(''),
    sparkles: '<circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4L18 18M18 6l-2.6 2.6M8.6 15.4L6 18"/>',
    today: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  function wrapIcons() {
    if (!UI.icon || UI.icon._dot) return;
    const base = UI.icon;
    const icon = (name, size = 20, cls = '') => on() && ICONS[name]
      ? `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
      : base(name, size, cls);
    icon._dot = true;
    UI.icon = icon;
  }

  // ---------- selector «Diseño: Zen / Dot» (Ajustes y bienvenida) ----------
  function zenMini() {
    const L = UI.look.get(), sc = UI.look.scheme(), th = UI.look.themeIn(L.theme === undefined ? 'nube' : L.theme, sc);
    return `<span class="dz-prev dz-zen" style="--z-bg:${th.bg};--z-s:${th.s1};--z-fg:${th.fg};--z-a1:${th.a1};--z-a2:${th.a2};--z-a3:${th.a3};--z-b1:${th.b[0]};--z-b2:${th.b[1]}">
      <i class="zb a"></i><i class="zb b"></i>
      <span class="zw"><b>${esc(ZC.i18n.D.month(new Date()))}</b><span class="zg">${'<i></i>'.repeat(21)}</span><span class="ze"></span><span class="ze two"></span></span></span>`;
  }
  function dotMini() {
    const L = UI.look.get(), sc = UI.look.scheme(), p = palette(L, sc);
    const n = new Date().getDate();
    let dots = '';
    const loads = [0, 1, 0, 2, 0, 0, 1, 3, 0, 1, 0, 4, 2, 0, 0, 1, 0, 0, 2, 1, 0];
    loads.forEach((l, i) => { dots += `<i class="l${l} ${i === 9 ? 'td' : ''}" style="--i:${i}"></i>`; });
    return `<span class="dz-prev dz-dot" style="--d-bg:${p.bg};--d-s:${p.s1};--d-fg:${p.fg};--d-acc:${p.a1}">
      <span class="dw">${matrix(String(n), { pitch: 2.6, cls: 'acc' })}<span class="dg">${dots}</span></span></span>`;
  }
  function designPicker(where) {
    const d = on() ? 'dot' : 'zen';
    const card = (id, name, sub, mini) => `<button type="button" class="dz-card ${d === id ? 'on' : ''}" data-design="${id}" data-v="${id}" role="radio" aria-checked="${d === id}">${mini}<span class="dz-tx"><b>${name}</b><small>${esc(sub)}</small></span></button>`;
    return `<div class="dz-pick ${where === 'wl' ? 'dz-wl' : ''}" ${where === 'set' ? 'data-k="look.design"' : ''} role="radiogroup" aria-label="${esc(t('Diseño'))}">
      ${card('zen', 'Zen', t('Pastel, vidrio y fondos que flotan'), zenMini())}
      ${card('dot', 'Dot', where === 'set' ? t('Monocromo, puntos y un solo rojo. Inspirado en el estilo de Nothing OS.') : t('Monocromo, puntos y un solo rojo'), dotMini())}</div>`;
  }
  function pick(d) { if (UI.look) UI.look.set({ design: d === 'dot' ? 'dot' : 'zen' }); }

  // ---------- al cambiar de diseño: se redibuja todo y, la primera vez, se ofrece el icono de Dot ----------
  function onLook(L) {
    const d = L.design === 'dot' ? 'dot' : 'zen';
    if (d === 'dot') paintNavVals();
    if (lastDesign === null) { lastDesign = d; return; }
    if (d === lastDesign) return;
    lastDesign = d;
    if (UI.look.previewing && UI.look.previewing()) return;
    lastTitle = ''; lastToday = ''; lastMonthKey = '';
    if (UI.app && UI.app.rebuild && document.querySelector('#top .tb-nav')) { try { UI.app.rebuild(); } catch (e) { console.error(e); } }
    if (d === 'dot') setTimeout(offerIcon, 500);
  }
  function offerIcon() {
    try {
      const P = ZC.platform || {};
      const icons = P.appIcons || [];
      if (!P.setAppIcon || !icons.some(i => i.id === 'dot')) return;
      if (ZC.store.local('dotIconAsked')) return;
      if ((UI.look.get().appIcon || '') === 'dot') return;
      // durante la bienvenida el aviso taparía sus botones: se ofrece al terminarla
      if (document.querySelector('.welcome .wl-card')) return;
      ZC.store.local('dotIconAsked', true);
      UI.toast(t('¿Pones también el icono de Dot?'), { ms: 9000, action: { label: t('Cambiar icono'), fn: () => { UI.look.set({ appIcon: 'dot' }); try { P.setAppIcon('dot'); } catch (e) { console.warn(e); } UI.toast(t('Icono cambiado'), { icon: 'check' }); } } });
    } catch (e) { console.warn(e); }
  }

  // ---------- secciones de Ajustes en Dot ----------
  function wrapSettings() {
    const ST = UI.settings; if (!ST || !ST.sections || ST._dot) return;
    ST._dot = true;
    const S = ST.sections, P = ST.parts, Z = { look: S.look, bg: S.bg, glass: S.glass, shape: S.shape, type: S.type, logo: S.logo };
    const { row, seg, sw, rng, h3, card } = P;
    const scheme = () => row(t('Claro u oscuro'), t('«Como el sistema» cambia solo cuando tu móvil o Windows lo hacen.'), seg('look.scheme', [['system', t('Como el sistema'), 'monitor'], ['light', t('Claro'), 'sun'], ['dark', t('Oscuro'), 'moon']]), 'stack');
    const lookDot = () => card(scheme())
      + card(h3(t('Color de acento'), t('Uno solo: el día de hoy, el «+», la hora actual y lo importante.'))
        + `<div class="dots dz-acc" data-k="look.dotAccent">${ACCENTS.map(([id, n, c]) => `<button type="button" class="adot ${id === 'ink' ? 'ink' : ''}" data-v="${id}" style="--c:${c || 'var(--fg)'}" title="${esc(t(n))}" aria-label="${esc(t(n))}"></button>`).join('')}</div>`
        + row(t('Otro color'), t('El que quieras, a mano.'), `<input type="color" data-color="dotAccent" aria-label="${esc(t('Color de acento'))}">`))
      + card(h3(t('Colores de los calendarios'), t('Dot es monocromo: elige cuánto color dejas entrar.'))
        + seg('look.dotColors', [['dot', t('Un punto')], ['full', t('Contorno de color')], ['mono', t('Sin color')]], 'class="wide"'));
    const bgDot = () => {
      const B = [['dots', t('Puntos')], ['grid', t('Rejilla')], ['liso', t('Liso')], ['glyph', t('Glyph')]];
      return card(h3(t('Fondo'), t('«Glyph» son tiras de luz que se encienden por pasos (y avisan cuando guardas algo).'))
        + `<div class="dots dz-bgs" data-k="look.dotBg">${B.map(([id, n]) => `<button type="button" class="dzb-card" data-v="${id}"><span class="dzb dzb-${id}">${id === 'glyph' ? '<i></i><i></i><i></i>' : ''}</span><b>${esc(n)}</b></button>`).join('')}</div>`
        + row(t('Separación de los puntos'), t('Para los fondos de puntos y de rejilla.'), rng('look.dotGap', 10, 36, 1, 'px'))
        + row(t('Velocidad del glyph'), '', rng('look.dotSpeed', .3, 2.5, .1, '×')));
    };
    const glassDot = () => card(h3(t('Paneles'), t('Como una trasera transparente: más a la derecha, más se ve el fondo detrás.'))
      + row(t('Transparencia'), '', rng('look.dotGlass', 0, 85, 1, '%'))
      + row(t('Desenfoque'), t('0 = sin desenfoque (gasta menos batería).'), rng('look.dotBlur', 0, 40, 1, 'px')));
    const shapeDot = () => card(h3(t('Tamaño'))
      + row(t('Densidad'), t('Cuánto aire hay entre las cosas.'), seg('look.density', [['compact', t('Compacta')], ['normal', t('Normal')], ['wide', t('Amplia')]]))
      + row(t('Tamaño de letra'), '', rng('look.zoom', 80, 130, 5, '%')))
      + card(`<p class="note">${UI.icon('info', 15)}${esc(t('En Dot las esquinas y los contornos son siempre los mismos: forman parte del diseño.'))}</p>`);
    const typeDot = () => card(h3(t('Letra del texto'), t('Los números, las horas y los rótulos van siempre en ZenDot, nuestra letra de puntos.'))
      + `<div class="fonts" data-k="look.dotFont">${Object.entries(FONTS).map(([id, f]) => `<button type="button" class="fcard" data-v="${id}" style="font-family:${esc(f[2])},${SYS}"><b>Aa</b><span>${esc(t(f[0]))}</span></button>`).join('')}</div>`
      + `<div class="dz-type-demo">${matrix('0123456789', { pitch: 3 })}<span class="dz-zd">ZenDot 5×7</span></div>`);
    S.look = () => card(h3(t('Diseño'), t('Dos maneras completas de ver tu calendario. Tus datos y ajustes son los mismos.')) + designPicker('set')) + (on() ? lookDot() : Z.look());
    S.bg = () => on() ? bgDot() : Z.bg();
    S.glass = () => on() ? glassDot() : Z.glass();
    S.shape = () => on() ? shapeDot() : Z.shape();
    S.type = () => on() ? typeDot() : Z.type();
    S.logo = () => on() ? Z.logo().replace('<img class="brand-logo"', logo(40, 'dot-brand') + '<img class="brand-logo"') : Z.logo();
  }

  const navSub = { look: 'Diseño, claro u oscuro y el color de acento', bg: 'Puntos, rejilla, liso o glyph', glass: 'Transparencia y desenfoque de los paneles', shape: 'Densidad y tamaño de letra', type: 'La letra del texto' };

  // lista técnica: al lado de cada sección de aspecto, su valor de ahora
  function navVal(id) {
    const L = UI.look ? UI.look.get() : {};
    const lab = { system: 'Sistema', light: 'Claro', dark: 'Oscuro', dots: 'Puntos', grid: 'Rejilla', liso: 'Liso', glyph: 'Glyph', compact: 'Compacta', normal: 'Normal', wide: 'Amplia', none: 'Ninguna', soft: 'Suaves', lots: 'Muchas' };
    const v = { look: L.scheme, bg: val(L, 'dotBg'), glass: Math.round(+val(L, 'dotGlass')) + '%', shape: L.density, anim: L.anim === 'normal' ? 'Normales' : L.anim, type: (FONTS[val(L, 'dotFont')] || FONTS.archivo)[0].split(' (')[0] }[id];
    return v == null ? '' : t(lab[v] || String(v));
  }
  function paintNavVals() { document.querySelectorAll('.set-nav [data-sec] .sn-val').forEach(el => { el.textContent = navVal(el.parentElement.dataset.sec); }); }

  // en Dot, la vibración de confirmar es la del «glyph» (dos golpecitos secos) si la plataforma la tiene
  function wrapHaptic() {
    if (!UI.haptic || UI.haptic._dot) return;
    const base = UI.haptic;
    const hp = (k = 'tap') => {
      const P = ZC.platform;
      if (on() && P && P.haptic && P.kind !== 'web') { try { P.haptic(k === 'ok' ? 'glyph' : k === 'tick' ? 'select' : k === 'warn' ? 'warning' : 'tap'); } catch {} return; }
      base(k);
    };
    hp._dot = true;
    UI.haptic = hp;
  }

  // ---------- widget de escritorio ----------
  function widget(box, o) {
    if (!box) return;
    box.classList.toggle('dot-w', on());
    if (!on()) return;
    const b = box.querySelector('.w-date b');
    if (b) b.innerHTML = matrix(String(o.d0.getDate()).padStart(2, '0'), { pitch: 4.2, cls: 'acc', scan: animOk() && !box._scanned });
    box._scanned = true;
    const logoBtn = box.querySelector('[data-a=open] img');
    if (logoBtn) logoBtn.outerHTML = logo(20);
  }

  // ---------- arranque ----------
  wrapIcons();
  wrapHaptic();
  wrapViews();
  wrapSettings();
  if (UI.look && UI.look.onChange) UI.look.onChange(onLook);
  // el tamaño del titular depende del ancho
  let rzT = 0;
  addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (on() && UI.app && document.getElementById('periodTitle')) chrome(UI.app.state); }, 150); });
  // el «glyph» responde cuando guardas algo
  try { ZC.store && ZC.store.on && ZC.store.on('change', ev => { if (on() && ev && ev.source === 'local' && ev.type === 'events') glyph_.pulse('bar'); }); } catch {}

  UI.dot = { on, matrix, logo, palette, apply, chrome, designPicker, pick, widget, bgPatch, DOT0, ACCENTS, FONTS, pulse: k => glyph_.pulse(k), offerIcon, navSub, navVal };
})();
