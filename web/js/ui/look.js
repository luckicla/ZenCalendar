'use strict';
// ZenCalendar · aspecto: temas (claro y oscuro), estilos ya hechos, acentos, colores sacados de la
// imagen de fondo, transparencias por panel, esquinas, sombras, letras, animaciones y logo.
// Todo vive en prefs.look (se sincroniza por Drive) y se aplica con variables CSS.
(function () {
  const ZC = window.ZC, UI = ZC.ui = ZC.ui || {};
  const t = (...a) => ZC.t(...a);

  // ---------- colores ----------
  const hex2rgb = h => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgb2hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  function rgb2hsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
  function hsl2rgb([h, s, l]) { const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l); const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0) * 255, f(8) * 255, f(4) * 255]; }
  const hsl = (h, s, l) => rgb2hex(hsl2rgb([h, s, l]));
  const lum = hx => hex2rgb(hx).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const mix = (a, b, k) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * k));
  function readable(c, bg, min = 4.5) {
    let [h, s, l] = rgb2hsl(hex2rgb(c)); const darker = lum(bg) > .35;
    for (let i = 0; i < 30 && contrast(hsl(h, s, l), bg) < min; i++) l += darker ? -.025 : .025;
    return hsl(h, s, Math.max(0, Math.min(1, l)));
  }
  const PLUM = '#2B2140';
  const textOn = c => contrast(c, PLUM) >= contrast(c, '#ffffff') * .8 ? PLUM : '#ffffff';

  // ---------- temas ----------
  const T = (bg, s1, fg, mut, a1, a2, a3, b) => ({ bg, s1, fg, mut, a1, a2, a3, b });
  const THEMES = {
    nube: { name: 'Nube', desc: 'Lavanda y rosa, suave', bg: 'aurora',
      light: T('#F5F3FC', '#FFFFFF', '#3D3355', '#7C7396', '#9F8DFF', '#F0A6CC', '#7ED6C3', ['#D8CCFF', '#FFD6EA', '#CDEFE6', '#FFE8CC']),
      dark: T('#15131F', '#211E30', '#EEEAF8', '#A39CBD', '#B3A5FF', '#F4B3D4', '#8EE0CD', ['#4A3E86', '#6E3A5E', '#285E57', '#5A4A33']) },
    sakura: { name: 'Sakura', desc: 'Pétalos y rosa cerezo', bg: 'sakura',
      light: T('#FFF5F8', '#FFFFFF', '#4A2E3F', '#93697E', '#F28DB6', '#C9A5FF', '#FFB38A', ['#FFD0E2', '#FFE3EE', '#EAD9FF', '#FFE4D2']),
      dark: T('#1C1218', '#2A1B24', '#FBEAF1', '#C29AAD', '#FF9CC6', '#D2B4FF', '#FFC09E', ['#6B2F4C', '#4E2A45', '#41306A', '#5E3B2E']) },
    menta: { name: 'Menta', desc: 'Fresca, con burbujas', bg: 'burbujas',
      light: T('#F1FBF7', '#FFFFFF', '#24443C', '#628A80', '#4FC9A8', '#9FB8FF', '#FFB0A0', ['#C3F0E2', '#DDF6EE', '#D6E2FF', '#FFE1D9']),
      dark: T('#0F1A17', '#182622', '#E3F6EF', '#8DB3A8', '#6FE0BF', '#A9C1FF', '#FFB9AA', ['#1E5A4B', '#24493F', '#2E3F6E', '#5A3530']) },
    lavanda: { name: 'Lavanda', desc: 'Violeta tranquilo', bg: 'aurora',
      light: T('#F5F1FF', '#FFFFFF', '#3A2F5C', '#7A6FA0', '#8F7BF7', '#C3A7FF', '#F7A8D0', ['#DCCFFF', '#E9E0FF', '#F9D7EA', '#D7E7FF']),
      dark: T('#14111F', '#1F1A31', '#ECE7FF', '#A59CC6', '#A898FF', '#CDB6FF', '#F7B4D6', ['#43378A', '#382F70', '#6A3560', '#2E3F70']) },
    melocoton: { name: 'Melocotón', desc: 'Cálido, con olas', bg: 'olas',
      light: T('#FFF6F0', '#FFFFFF', '#4D3326', '#977564', '#FF9E7A', '#FFC27A', '#F6A3C4', ['#FFD9C7', '#FFE9C9', '#FFD6E5', '#FFF0D6']),
      dark: T('#1C140F', '#2A1E17', '#FCEDE4', '#C3A190', '#FFAA88', '#FFCC8C', '#F7AFCB', ['#6E3B26', '#6A4A22', '#6A2F46', '#4B3A24']) },
    cielo: { name: 'Cielo', desc: 'Azul claro y nubes', bg: 'nubes',
      light: T('#F1F7FF', '#FFFFFF', '#24364F', '#66809F', '#6AAEF5', '#A99BFF', '#7FDCCB', ['#CFE5FF', '#E1EEFF', '#E1DBFF', '#D3F4EC']),
      dark: T('#0F1520', '#172030', '#E6F0FC', '#8EA3BF', '#85BEFA', '#B4A8FF', '#8FE4D4', ['#22457A', '#1E3558', '#3D3478', '#1E5552']) },
    mantequilla: { name: 'Mantequilla', desc: 'Amarillo suave y crema', bg: 'degradado',
      light: T('#FFFBEF', '#FFFFFF', '#463C22', '#8C8160', '#E9B83F', '#F5A3B8', '#9DD3A8', ['#FFF0B8', '#FFF6D8', '#FFDCE5', '#DDF2D6']),
      dark: T('#1A1710', '#262217', '#FAF4E2', '#BFB38E', '#F7CF6A', '#F7B0C2', '#A8DDB3', ['#6A5A1E', '#4A4120', '#6A3343', '#2F5435']) },
    matcha: { name: 'Matcha', desc: 'Verde té y terracota', bg: 'aurora',
      light: T('#F5F8EE', '#FFFFFF', '#2F3D24', '#728262', '#86B862', '#E8B4A0', '#C2B0E8', ['#DCEBC6', '#EEF4E2', '#F6DDD3', '#E3DBF5']),
      dark: T('#12160E', '#1C2216', '#EAF1DF', '#A0AE8F', '#A3D47F', '#EDBFAD', '#CBBBEE', ['#33521E', '#2A3D1F', '#5A3A2F', '#3C3463']) },
    algodon: { name: 'Algodón de azúcar', desc: 'Rosa y azul bebé', bg: 'burbujas',
      light: T('#FCF4FF', '#FFFFFF', '#47325A', '#8C74A3', '#E58FD0', '#8FC8FF', '#B7A2FF', ['#FFD0F0', '#D2E9FF', '#E4D8FF', '#FFE6F5']),
      dark: T('#1A1222', '#271B32', '#F7EAFD', '#B9A0CC', '#F09BDA', '#9DD0FF', '#C2B0FF', ['#6A2F63', '#2A4A72', '#4A3A86', '#5B2E55']) },
    aurora: { name: 'Aurora', desc: 'Luces del norte en pastel', bg: 'aurora',
      light: T('#F2F6FB', '#FFFFFF', '#2D3550', '#6E7895', '#7C9BFF', '#6FDCC0', '#E39BE0', ['#C9D7FF', '#C6F2E6', '#F3D2F1', '#D8F0FF']),
      dark: T('#0D1220', '#161D30', '#E5EBFA', '#8E99B8', '#8FA9FF', '#75E3C6', '#EBA6E8', ['#244A8A', '#1D6A5A', '#6A2E73', '#203C66']) },
    noche: { name: 'Noche pastel', desc: 'Oscuro, estrellas y lila', bg: 'estrellas', dark1: true,
      light: T('#EEECF7', '#FBFAFF', '#2E2846', '#716A8C', '#8E7CF0', '#F09AC0', '#6CCDB8', ['#D3CCF2', '#E7D2EA', '#CDE8E4', '#E0DCF5']),
      dark: T('#110F1C', '#1C192C', '#EDE9FA', '#9D96B9', '#B9A8FF', '#FFB3D1', '#9BE6D4', ['#3B3373', '#5B2D58', '#1F4D4B', '#2A2650']) },
    grafito: { name: 'Grafito', desc: 'Neutro y limpio', bg: 'liso',
      light: T('#F4F4F7', '#FFFFFF', '#2E2E36', '#74747F', '#8E8CF2', '#F2A5B8', '#8FD1C2', ['#E4E4EC', '#EFEFF4', '#E8E2F2', '#E2EEEC']),
      dark: T('#121214', '#1C1C20', '#EDEDF2', '#9A9AA6', '#A3A1FA', '#F5B3C3', '#9BDACC', ['#2C2C3A', '#262630', '#3A3046', '#24363A']) },
  };
  const ACCENTS = [
    ['lavanda', 'Lavanda', '#9F8DFF'], ['rosa', 'Rosa', '#F28DB6'], ['menta', 'Menta', '#4FC9A8'], ['melocoton', 'Melocotón', '#FF9E7A'],
    ['mantequilla', 'Mantequilla', '#E9B83F'], ['cielo', 'Cielo', '#6AAEF5'], ['lila', 'Lila', '#C38BEB'], ['coral', 'Coral', '#FF8A8A'],
    ['salvia', 'Salvia', '#86B862'], ['grafito', 'Grafito', '#7D7D88'],
  ];
  const BGS = { theme: 'El del tema', aurora: 'Aurora', sakura: 'Sakura', nubes: 'Nubes', burbujas: 'Burbujas', estrellas: 'Estrellas', olas: 'Olas', degradado: 'Degradado', liso: 'Liso', imagen: 'Imagen propia' };
  const FONTS_UI = {
    system: ['Sistema', null, '"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",sans-serif'],
    nunito: ['Nunito', 'Nunito:wght@400;600;700;800', '"Nunito"'],
    inter: ['Inter', 'Inter:wght@400;500;600;700', '"Inter"'],
    quicksand: ['Quicksand', 'Quicksand:wght@400;500;600;700', '"Quicksand"'],
    dmsans: ['DM Sans', 'DM+Sans:wght@400;500;600;700', '"DM Sans"'],
    manrope: ['Manrope', 'Manrope:wght@400;500;600;700;800', '"Manrope"'],
    atkinson: ['Atkinson (muy legible)', 'Atkinson+Hyperlegible:wght@400;700', '"Atkinson Hyperlegible"'],
  };
  const FONTS_TITLE = {
    system: ['Sistema', null, '"Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,Roboto,sans-serif'],
    nunito: ['Nunito', 'Nunito:wght@600;700;800', '"Nunito"'],
    quicksand: ['Quicksand', 'Quicksand:wght@500;600;700', '"Quicksand"'],
    fredoka: ['Fredoka', 'Fredoka:wght@400;500;600', '"Fredoka"'],
    comfortaa: ['Comfortaa', 'Comfortaa:wght@500;600;700', '"Comfortaa"'],
    lora: ['Lora', 'Lora:wght@500;600;700', '"Lora",Georgia,serif'],
    dmserif: ['DM Serif', 'DM+Serif+Display', '"DM Serif Display",Georgia,serif'],
    playfair: ['Playfair', 'Playfair+Display:wght@500;600;700', '"Playfair Display",Georgia,serif'],
    caveat: ['Caveat', 'Caveat:wght@500;600;700', '"Caveat",cursive'],
  };
  const LOOK0 = {
    preset: 'zen', theme: 'nube', scheme: 'system', accent: null, a2: null, a3: null,
    bg: 'theme', bgSpeed: 1, bgAmount: 1, bgImage: null, bgImgColors: 'none', bgBlur: 0, bgDim: 0,
    tSide: 38, tMain: 46, tBar: 30, tCard: 18, blur: 22,
    radius: 22, shadows: 'soft', colorShadows: true, density: 'normal', zoom: 100,
    fontUI: 'system', fontTitle: 'nunito',
    anim: 'normal', todayGlow: false, eventStyle: 'soft',
    logoMode: 'both', logoText: '', logoColor: 'theme',
    appIcon: 'pastel', widgetAlpha: 72,
    design: 'zen',   // 'zen' | 'dot' (el diseño «Dot» vive en dot.js + dot.css)
  };
  const PRESETS = [
    { id: 'zen', name: 'Zen', sub: 'Lavanda, aurora y vidrio suave', set: { theme: 'nube', scheme: 'system', accent: null, a2: null, a3: null, bg: 'theme', tSide: 38, tMain: 46, tBar: 30, tCard: 18, blur: 22, radius: 22, shadows: 'soft', fontUI: 'system', fontTitle: 'nunito', eventStyle: 'soft' } },
    { id: 'cristal', name: 'Cristal', sub: 'Muy transparente, nubes', set: { theme: 'cielo', scheme: 'system', accent: null, a2: null, a3: null, bg: 'nubes', tSide: 62, tMain: 66, tBar: 55, tCard: 35, blur: 30, radius: 24, shadows: 'soft', fontUI: 'system', fontTitle: 'quicksand', eventStyle: 'soft' } },
    { id: 'algodon', name: 'Algodón', sub: 'Rosa y azul, muy redondo', set: { theme: 'algodon', scheme: 'light', accent: null, a2: null, a3: null, bg: 'burbujas', tSide: 40, tMain: 48, tBar: 34, tCard: 16, blur: 24, radius: 28, shadows: 'soft', fontUI: 'nunito', fontTitle: 'fredoka', eventStyle: 'soft' } },
    { id: 'sakura', name: 'Jardín', sub: 'Pétalos de cerezo y serif', set: { theme: 'sakura', scheme: 'light', accent: null, a2: null, a3: null, bg: 'sakura', tSide: 36, tMain: 42, tBar: 30, tCard: 16, blur: 20, radius: 20, shadows: 'soft', fontUI: 'system', fontTitle: 'lora', eventStyle: 'soft' } },
    { id: 'noche', name: 'Noche tranquila', sub: 'Oscuro, con estrellas', set: { theme: 'noche', scheme: 'dark', accent: null, a2: null, a3: null, bg: 'estrellas', tSide: 34, tMain: 40, tBar: 28, tCard: 14, blur: 22, radius: 22, shadows: 'soft', fontUI: 'system', fontTitle: 'nunito', eventStyle: 'soft' } },
    { id: 'brisa', name: 'Brisa', sub: 'Menta y olas lentas', set: { theme: 'menta', scheme: 'system', accent: null, a2: null, a3: null, bg: 'olas', tSide: 40, tMain: 46, tBar: 30, tCard: 18, blur: 22, radius: 22, shadows: 'soft', fontUI: 'dmsans', fontTitle: 'quicksand', eventStyle: 'soft' } },
    { id: 'papel', name: 'Papel', sub: 'Crema, serif y casi opaco', set: { theme: 'mantequilla', scheme: 'light', accent: null, a2: null, a3: null, bg: 'degradado', tSide: 12, tMain: 14, tBar: 10, tCard: 6, blur: 10, radius: 12, shadows: 'soft', fontUI: 'system', fontTitle: 'dmserif', eventStyle: 'line' } },
    { id: 'minimal', name: 'Minimal', sub: 'Neutro, sin adornos', set: { theme: 'grafito', scheme: 'system', accent: null, a2: null, a3: null, bg: 'liso', tSide: 8, tMain: 8, tBar: 8, tCard: 4, blur: 0, radius: 14, shadows: 'none', fontUI: 'inter', fontTitle: 'system', eventStyle: 'line' } },
  ];

  // ---------- colores desde una imagen (como MixUp, pero en pastel) ----------
  function paletteFromImage(img, light) {
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, S, S);
    const px = ctx.getImageData(0, 0, S, S).data;
    const buckets = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    let R = 0, G = 0, B = 0;
    for (let i = 0; i < px.length; i += 4) {
      const rgb = [px[i], px[i + 1], px[i + 2]], [h, s, l] = rgb2hsl(rgb);
      R += rgb[0]; G += rgb[1]; B += rgb[2];
      const vivid = s * (1 - Math.abs(l - .5) * 2); if (vivid < .12) continue;
      const bk = buckets[Math.floor(h / 15) % 24], w = vivid * vivid;
      bk.w += w; bk.r += rgb[0] * w; bk.g += rgb[1] * w; bk.b += rgb[2] * w;
    }
    const n = px.length / 4, [baseH, baseS] = rgb2hsl([R / n, G / n, B / n]);
    const p = light
      ? { bg: hsl(baseH, Math.min(baseS, .45), .96), s1: '#FFFFFF', fg: hsl(baseH, .3, .2), mut: hsl(baseH, .14, .45) }
      : { bg: hsl(baseH, Math.min(baseS, .35), .08), s1: hsl(baseH, Math.min(baseS, .3), .14), fg: hsl(baseH, .3, .93), mut: hsl(baseH, .14, .68) };
    const hues = buckets.map((b, i) => ({ ...b, h: i * 15 + 7.5 })).filter(b => b.w > 0).sort((a, b) => b.w - a.w);
    const dist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
    const picks = [];
    for (const b of hues) { if (picks.every(x => dist(x.h, b.h) >= 40)) picks.push(b); if (picks.length === 3) break; }
    const hueOf = b => rgb2hsl([b.r / b.w, b.g / b.w, b.b / b.w])[0];
    const hs = [picks[0] ? hueOf(picks[0]) : baseH, picks[1] ? hueOf(picks[1]) : (baseH + 140) % 360, picks[2] ? hueOf(picks[2]) : (baseH + 220) % 360];
    p.a1 = hsl(hs[0], .75, light ? .72 : .76); p.a2 = hsl(hs[1], .75, light ? .78 : .78); p.a3 = hsl(hs[2], .6, light ? .74 : .76);
    p.b = light ? [hsl(hs[0], .8, .88), hsl(hs[1], .8, .9), hsl(hs[2], .6, .88), hsl(baseH, .6, .92)] : [hsl(hs[0], .4, .3), hsl(hs[1], .4, .28), hsl(hs[2], .35, .28), hsl(baseH, .3, .24)];
    return p;
  }

  // ---------- estado ----------
  const root = document.documentElement;
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  const mqRed = matchMedia('(prefers-reduced-motion: reduce)');
  let L = { ...LOOK0 }, held = null, saveT = 0, imgEl = null, imgId = null, imgPal = null;
  const listeners = [];

  const scheme = () => L.scheme === 'system' ? (mqDark.matches ? 'dark' : 'light') : L.scheme;
  const isDot = () => L.design === 'dot' && !!UI.dot;
  function palette() {
    if (isDot()) return UI.dot.palette(L, scheme());
    const th = THEMES[L.theme] || THEMES.nube, sc = scheme();
    let p = { ...th[sc], b: [...th[sc].b] };
    if (L.bg === 'imagen' && imgPal && L.bgImgColors !== 'none') {
      const ip = imgPal[sc];
      if (L.bgImgColors === 'all') p = { ...ip, b: [...ip.b] };
      else { p.a1 = ip.a1; p.a2 = ip.a2; p.a3 = ip.a3; p.b = [...ip.b]; }
    }
    if (L.accent) p.a1 = L.accent;
    if (L.a2) p.a2 = L.a2;
    if (L.a3) p.a3 = L.a3;
    return p;
  }
  const bgKind = () => L.bg === 'theme' ? (THEMES[L.theme] || THEMES.nube).bg : L.bg;
  function effAnim() {
    const a = L.anim || 'normal';
    if (mqRed.matches) return a === 'none' ? 'none' : 'soft';
    return a;
  }

  const fontLinks = new Set();
  function ensureFont(spec) {
    if (!spec || fontLinks.has(spec)) return;
    fontLinks.add(spec);
    if (navigator.onLine === false) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + spec + '&display=swap';
    l.onerror = () => l.remove();
    document.head.appendChild(l);
  }

  function apply() {
    const p = palette(), sc = scheme(), light = sc === 'light';
    const s2 = mix(p.s1, p.fg, light ? .045 : .07), s3 = mix(p.s1, p.fg, light ? .09 : .13);
    const a1t = readable(p.a1, p.s1, 4.5), a2t = readable(p.a2, p.s1, 3), a3t = readable(p.a3, p.s1, 3);
    const fgRgb = hex2rgb(p.fg).join(' '), shRgb = hex2rgb(mix(p.a1, light ? '#3a2470' : '#000000', light ? .45 : .6)).join(' ');
    const st = root.style, set = (k, v) => st.setProperty(k, v);
    set('--bg', p.bg); set('--s1', p.s1); set('--s2', s2); set('--s3', s3); set('--fg', p.fg); set('--mut', p.mut);
    set('--fg-rgb', fgRgb); set('--sh-rgb', shRgb);
    set('--a1', p.a1); set('--a2', p.a2); set('--a3', p.a3);
    set('--a1t', a1t); set('--a2t', a2t); set('--a3t', a3t);
    set('--a1ink', textOn(p.a1)); set('--a2ink', textOn(p.a2));
    p.b.forEach((c, i) => set('--b' + (i + 1), c));
    const op = v => Math.max(4, 100 - (+v || 0)) + '%';
    set('--o-side', op(L.tSide)); set('--o-main', op(L.tMain)); set('--o-bar', op(L.tBar)); set('--o-card', op(L.tCard));
    set('--gb', (+L.blur || 0) + 'px');
    set('--rad', (+L.radius) + 'px');
    set('--bg-blur', (+L.bgBlur || 0) + 'px'); set('--bg-dim', (+L.bgDim || 0));
    if (!isDot()) {
      const fu = FONTS_UI[L.fontUI] || FONTS_UI.system, ft = FONTS_TITLE[L.fontTitle] || FONTS_TITLE.nunito;
      ensureFont(fu[1]); ensureFont(ft[1]);
      set('--font-ui', fu[2] + ',' + FONTS_UI.system[2]); set('--font-title', ft[2] + ',' + FONTS_TITLE.system[2]);
    }
    set('--zoom', (+L.zoom || 100) / 100);
    set('--wa', Math.max(15, Math.min(100, +L.widgetAlpha || 72)) + '%');
    root.dataset.scheme = sc; root.style.colorScheme = sc;
    root.dataset.design = isDot() ? 'dot' : 'zen';
    try { localStorage.setItem('zc.lookCache', JSON.stringify({ s: sc, bg: p.bg, d: root.dataset.design })); } catch {}
    document.documentElement.style.background = '';
    root.dataset.anim = effAnim();
    root.dataset.density = L.density; root.dataset.shadows = L.shadows; root.dataset.evstyle = L.eventStyle;
    root.dataset.titlefont = L.fontTitle;
    root.classList.toggle('color-shadows', !!L.colorShadows);
    root.classList.toggle('today-glow', !!L.todayGlow);
    root.classList.toggle('no-blur', !(+L.blur));
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = p.bg;
    // fondo
    const kind = bgKind(), img = document.getElementById('bgImg');
    if (img) {
      const showImg = kind === 'imagen' && imgEl;
      img.hidden = !showImg;
      if (showImg) img.style.backgroundImage = `url("${imgEl.src}")`;
    }
    if (isDot()) { if (img) img.hidden = true; if (UI.bg) UI.bg.set('liso', { animate: false, hidden: true }); }
    else if (UI.bg) UI.bg.set(kind === 'imagen' ? 'liso' : kind, { speed: +L.bgSpeed || 1, amount: +L.bgAmount || 1, animate: effAnim() !== 'none', hidden: kind === 'imagen' && !!imgEl });
    // Dot pone encima lo suyo (variables, letras, fondo de puntos o «glyph»); con Zen solo apaga lo que tuviera encendido
    if (UI.dot) try { UI.dot.apply(L, p, { set, light, anim: effAnim() }); } catch (e) { console.error(e); }
    narrow();
    glassFallback(st, set);
    paintLogo(p);
    try {
      if (!(ZC.platform && ZC.platform.isWidget)) ZC.platform && ZC.platform.setTheme && ZC.platform.setTheme({ bg: p.bg, surface: p.s1, fg: p.fg, muted: p.mut, a1: p.a1, a2: p.a2, a3: p.a3, light, alpha: (+L.widgetAlpha || 72) / 100, radius: isDot() ? 28 : +L.radius, design: root.dataset.design, ...(isDot() ? { accent: p.a1 } : {}) });
    } catch (e) { console.warn(e); }
    listeners.forEach(fn => { try { fn(L, p); } catch (e) { console.error(e); } });
  }

  // pantallas estrechas «de verdad»: el ancho en px de letra al 100 % (360 px con la letra al 130 % son como 277).
  // nrw < 380 (móviles de 360-375, o más anchos con la letra grande) y xnrw < 320: el CSS compacta lo que no cabe.
  function narrow() {
    const z = (+L.zoom || 100) / 100, w = (innerWidth || 1024) / z;
    root.classList.toggle('nrw', w < 380);
    root.classList.toggle('xnrw', w < 320);
  }
  addEventListener('resize', narrow);
  // WebView viejos (Chrome < 111) no saben color-mix(): sin esto los paneles se quedan sin fondo
  // y se ve el texto de debajo a través. Se calcula aquí el vidrio con rgba().
  const CMIX = !!(window.CSS && CSS.supports && CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)'));
  function glassFallback(st, set) {
    root.classList.toggle('no-cmix', !CMIX);
    if (CMIX) return;
    const s1 = hex2rgb(st.getPropertyValue('--s1').trim() || '#ffffff').join(',');
    const a = k => Math.max(0, Math.min(100, parseFloat(st.getPropertyValue(k)) || 80)) / 100;
    set('--glass-side', `rgba(${s1},${a('--o-side')})`); set('--glass-main', `rgba(${s1},${a('--o-main')})`);
    set('--glass-bar', `rgba(${s1},${a('--o-bar')})`); set('--glass-card', `rgba(${s1},${a('--o-card')})`);
    set('--glass-pop', `rgba(${s1},${Math.min(1, a('--o-card') + .08)})`);
  }

  function paintLogo(p) {
    document.querySelectorAll('.brand').forEach(el => {
      const mode = L.logoMode || 'both';
      const img = el.querySelector('.brand-logo'), tx = el.querySelector('.brand-text');
      if (img) img.hidden = !(mode === 'logo' || mode === 'both');
      if (tx) {
        tx.hidden = !(mode === 'text' || mode === 'both');
        const text = (L.logoText || '').trim() || 'ZenCalendar';
        if (tx.dataset.text !== text) { tx.dataset.text = text; tx.textContent = text; }
        tx.dataset.color = L.logoColor || 'theme';
      }
      el.hidden = mode === 'none';
    });
  }

  async function loadImage() {
    const id = L.bgImage;
    if (id === imgId) return;
    imgId = id; imgEl = null; imgPal = null;
    if (!id) return;
    try {
      // 'ws:<wid>:<versión>' = la foto de fondo de un workspace (la da ZC.ws)
      const wsImg = String(id).startsWith('ws:') ? String(id).split(':')[1] : null;
      const url = wsImg ? (ZC.ws && (ZC.ws.bgURL(wsImg) || await ZC.ws.bgData(wsImg).catch(() => null))) : await ZC.store.blobURL(id);
      if (!url && wsImg) imgId = null;
      if (!url) return;
      const im = new Image();
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = url; });
      imgEl = im;
      try { imgPal = { light: paletteFromImage(im, true), dark: paletteFromImage(im, false) }; } catch { imgPal = null; }
    } catch (e) { console.warn('fondo', e); }
  }

  // ---------- aspecto de un workspace ----------
  // En un workspace el aspecto es: lo tuyo + lo del workspace (su color y su fondo, igual para todos) + lo que
  // tú le hayas retocado a ese workspace (prefs.wsLook[wid], solo la diferencia). Al salir, lo tuyo tal cual.
  let userLook = {}, scope = null;   // scope: { wid, defaults: base => patch }
  const scopeBase = () => { const b = { ...LOOK0, ...userLook }; return scope ? { ...b, ...(scope.defaults(b) || {}) } : b; };
  const wsOwn = () => (scope && ((ZC.store.getPrefs() || {}).wsLook || {})[scope.wid]) || {};
  function compose() { L = scope ? { ...scopeBase(), ...wsOwn() } : { ...LOOK0, ...userLook }; }

  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      saveT = 0;
      try {
        if (scope) {
          // (el diseño Zen/Dot es de toda la app, no de un workspace)
          const base = scopeBase(), diff = {};
          for (const k of Object.keys(L)) if (k !== 'design' && JSON.stringify(L[k]) !== JSON.stringify(base[k])) diff[k] = L[k];
          if (String(diff.bgImage || '').startsWith('ws:')) delete diff.bgImage;
          const all = { ...((ZC.store.getPrefs() || {}).wsLook || {}) };
          if (Object.keys(diff).length) all[scope.wid] = diff; else delete all[scope.wid];
          ZC.store.setPrefs({ wsLook: all });
        } else { userLook = { ...L }; ZC.store.setPrefs({ look: { ...L } }); }
      } catch (e) { console.error(e); }
    }, 250);
  }
  /** setScope(wid, defaults) entra en el aspecto de un workspace; setScope(null) vuelve al tuyo */
  async function setScope(wid, defaults) {
    const key = wid ? wid + JSON.stringify(defaults ? defaults({ ...LOOK0, ...userLook }) : {}) : '';
    if (key === (scope ? scope.key : '') && !held) return;
    const was = !!scope;
    scope = wid ? { wid, defaults: defaults || (() => ({})), key } : null;
    if (held) { held = null; }
    compose();
    if (was !== !!scope && UI.anim()) { root.classList.add('look-swap'); setTimeout(() => root.classList.remove('look-swap'), 520); }
    await loadImage();
    apply();
  }
  async function resetScope() {
    if (!scope) return;
    const all = { ...((ZC.store.getPrefs() || {}).wsLook || {}) };
    delete all[scope.wid];
    await ZC.store.setPrefs({ wsLook: all });
    compose(); await loadImage(); apply();
  }
  function set(patch, { silent } = {}) {
    if (held) { Object.assign(L, patch); apply(); return; }
    // en un workspace, el diseño Zen/Dot se cambia para toda la app (el color del workspace se recalcula)
    if (scope && 'design' in patch && patch.design !== L.design) {
      userLook = { ...userLook, design: patch.design };
      if (!silent) ZC.store.setPrefs({ look: { ...LOOK0, ...userLook } });
      const rest = { ...patch }; delete rest.design;
      compose(); Object.assign(L, rest);
      apply(); if (!silent && Object.keys(rest).length) save();
      return;
    }
    const presetKeys = PRESETS.find(p => p.id === L.preset);
    Object.assign(L, patch);
    // si se toca algo que define el estilo, deja de ser ese estilo
    if (!('preset' in patch) && presetKeys && Object.keys(patch).some(k => k in presetKeys.set && JSON.stringify(presetKeys.set[k]) !== JSON.stringify(L[k]))) L.preset = null;
    const needImg = 'bgImage' in patch;
    const go = () => { apply(); if (!silent) save(); };
    if (needImg) loadImage().then(go); else go();
  }
  function preview(patch) { if (!held) held = JSON.stringify(L); Object.assign(L, patch); apply(); }
  function endPreview() { if (!held) return; L = JSON.parse(held); held = null; apply(); }
  async function load(look) {
    userLook = { ...(look || {}) };
    compose();
    await loadImage();
    apply();
  }
  function applyPreset(id) {
    const p = PRESETS.find(x => x.id === id); if (!p) return;
    set({ ...p.set, preset: id });
  }
  mqDark.addEventListener('change', () => { if (L.scheme === 'system') apply(); });
  mqRed.addEventListener('change', apply);

  UI.look = {
    THEMES, ACCENTS, BGS, FONTS_UI, FONTS_TITLE, PRESETS, LOOK0,
    get: () => L, palette, scheme, bgKind, effAnim, isDot, apply, set, preview, endPreview, previewing: () => !!held, load, applyPreset,
    setScope, resetScope, scope: () => (scope ? scope.wid : null), scopeOwn: () => ({ ...wsOwn() }), userLook: () => ({ ...LOOK0, ...userLook }),
    onChange: fn => listeners.push(fn),
    themeIn: (id, sc) => (THEMES[id] || THEMES.nube)[sc],
    color: { mix, readable, textOn, lum, contrast, hex2rgb, rgb2hsl, hsl },
    async setImage(file) {
      const { blob } = await UI.shrinkImage(file, 2400, .88);
      const old = L.bgImage;
      const id = await ZC.store.putBlob(blob, { name: 'fondo' + (file.name ? '-' + file.name : '') });
      set({ bgImage: id, bg: 'imagen' });
      if (old && !String(old).startsWith('ws:') && !(scope && old === userLook.bgImage)) try { await ZC.store.deleteBlob(old); } catch {}
    },
    async removeImage() {
      const old = L.bgImage;
      set({ bgImage: null, bg: L.bg === 'imagen' ? 'theme' : L.bg });
      if (old && !String(old).startsWith('ws:') && !(scope && old === userLook.bgImage)) try { await ZC.store.deleteBlob(old); } catch {}
    },
    imageURL: () => imgEl ? imgEl.src : '',
  };
})();
