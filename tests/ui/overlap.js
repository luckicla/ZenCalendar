'use strict';
// ZenCalendar · detector de solapes y desbordes de texto en condiciones de Android de verdad (Playwright, puerto 8871).
//   node tests/ui/overlap.js              (la ronda normal: falla si encuentra algo que no está en la lista blanca)
//   QUICK=1 node tests/ui/overlap.js      (solo 360 px, ES y CA)
//   ONLY=dot-ca node tests/ui/overlap.js  (solo las combinaciones cuyo nombre contenga todo lo indicado)
//   SHOTS=0 …                             (sin capturas recortadas)
//
// Simula lo que no se ve en Chrome de escritorio:
//  · las barras del sistema: la app va de borde a borde y Java le pasa --zc-safe-top/bottom/left/right
//    (aquí con un ZCAndroid de mentira cuyo setEdge(true) pone las variables, como MainActivity);
//  · pantallas de 360/384/412 px de ancho, alturas cortas y el teclado abierto (400 px de alto);
//  · la letra del WebView sin Google Fonts (Roboto) y una letra de sistema más ancha (DejaVu Sans);
//  · español, catalán e inglés; el tamaño de letra al máximo (130 %) y la densidad amplia.
//
// Lo que busca (en la capa que está encima: menú, ventana, panel lateral o la app):
//  (a) textos de elementos distintos cuyos rectángulos (Range.getClientRects) se cruzan;
//  (b) texto que se sale de su caja o queda cortado sin elipsis (y segmentados que solo caben desplazándolos);
//  (c) texto o controles debajo de la barra de estado o de la de navegación;
//  (d) controles táctiles que se pisan;
//  (e) desplazamiento horizontal de la página o de un panel.
// Informa con selector, texto, combinación y una captura recortada en tests/ui/out/overlap/.
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const OUT = path.join(__dirname, 'out', 'overlap');
const PORT = +process.env.PORT || 8871;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const SHOTS = process.env.SHOTS !== '0';
const QUICK = process.env.QUICK === '1';
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff': 'font/woff' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); }); });
const UA = 'Mozilla/5.0 (Linux; Android 9; SM-A505F Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36';

// ---------- lista blanca: lo que se queda así a propósito ----------
// type: a (solape), b (desborde/corte), c (barras), d (táctil), e (desplazamiento horizontal)
const WHITE = [
  // En la rejilla de Semana/Día, un evento de 15-30 min no tiene sitio para todo el título: se corta a propósito
  // (con line-clamp/elipsis donde se puede; el título entero está en el detalle).
  { type: 'b', sel: /\.tg-ev\b/, why: 'evento corto en la rejilla horaria: el título se corta dentro de su caja' },
  // Barras de evento del Mes: altura fija de 15-20 px, el texto se corta con elipsis (y en el móvil el recorte es vertical a ras).
  { type: 'b', sel: /\.mv-ev\b/, why: 'barra de evento del Mes: se recorta dentro de la barra' },
  // Las horas de la columna de la izquierda (00:00) se centran sobre la línea y la primera asoma por arriba de la rejilla.
  // Eventos que se solapan en la rejilla horaria: van escalonados a propósito (como Google Calendar), el de encima
  // es opaco y deja ver el principio del de debajo. En un WebView sin color-mix() el fondo tiene respaldo opaco (base.css).
  { type: 'd', sel: /\.tg-ev\b/, other: /\.tg-ev\b/, why: 'eventos solapados escalonados en Semana/Día' },
  { type: 'a', sel: /\.tg-ev\b/, other: /\.tg-ev\b/, why: 'eventos solapados escalonados en Semana/Día' },
  { type: 'b', sel: /\.tg-hours\b/, why: 'la etiqueta de las 00:00 queda centrada sobre la primera línea' },
];
const white = it => WHITE.find(w => w.type === it.type && w.sel.test(it.sel) && (!w.other || w.other.test(it.other || '')) && (!w.text || w.text.test(it.text || '')));

// ---------- el detector (corre en la página) ----------
function detect(opt) {
  const vw = innerWidth, vh = innerHeight, out = [];
  const st = el => getComputedStyle(el);
  const sel = el => { const p = []; for (let e = el, i = 0; e && e.nodeType === 1 && i < 4 && e !== document.body; e = e.parentElement, i++) { let s = e.tagName.toLowerCase(); if (e.id) { s += '#' + e.id; p.unshift(s); break; } const c = [...e.classList].filter(x => !/^(on|open|in-|out-|ripple)/.test(x)).slice(0, 2); if (c.length) s += '.' + c.join('.'); p.unshift(s); } return p.join('>'); };
  const R = r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  const inter = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const ok = r => r && r.r - r.l > .5 && r.b - r.t > .5;
  const rnd = r => ({ x: Math.round(r.l), y: Math.round(r.t), w: Math.round(r.r - r.l), h: Math.round(r.b - r.t) });
  // ¿qué hay encima?
  const menus = [...document.querySelectorAll('.menu.open')];
  const L = (window.ZC && ZC.ui && ZC.ui.layers) || [];
  const app = document.getElementById('app');
  let roots;
  if (menus.length) roots = menus;
  else if (L.length) roots = [L[L.length - 1].el];
  else if (app.classList.contains('side-on') && matchMedia('(max-width: 759px)').matches) roots = [document.getElementById('side')];
  else roots = [app];
  const floats = [...document.querySelectorAll('#toasts .toast:not(.out), .upd-banner:not(.out)')];
  const covered = !menus.length && !L.length && !app.classList.contains('side-on');
  const visible = (el, root) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = st(e);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < .05) return false;
      if (s.clip && s.clip !== 'auto') return false;   // .sr (solo para lectores de pantalla)
      if (e === root) break;
    }
    return true;
  };
  // recorte por los antepasados con overflow (y la pantalla)
  const clipInfo = el => {
    let box = { l: 0, t: 0, r: vw, b: vh }; const chain = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
      const s = st(e);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const r = e.getBoundingClientRect(), bl = parseFloat(s.borderLeftWidth) || 0, bt = parseFloat(s.borderTopWidth) || 0;
        const pb = { l: r.left + bl, t: r.top + bt, r: r.left + bl + e.clientWidth, b: r.top + bt + e.clientHeight };
        if (e === document.body) { pb.r = Math.max(pb.r, vw); pb.b = Math.max(pb.b, vh); }
        chain.push({ e, s, pb });
        box = inter(box, pb);
      }
      if (s.position === 'fixed') break;
    }
    return { box, chain };
  };
  const blockOf = el => { for (let e = el; e; e = e.parentElement) { const d = st(e).display; if (!/^inline($|-flex$|-grid$)?$/.test(d) || /inline-(flex|grid|block)/.test(d)) return e; } return el; };
  const items = [];
  for (const root of [...roots, ...floats]) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.nodeValue.trim() ? 1 : 2) });
    for (let n; (n = tw.nextNode());) {
      const el = n.parentElement;
      if (!el || el.closest('svg, script, style, option, textarea, select, .seg .thumb')) continue;
      if (!visible(el, root)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const raw = [...rg.getClientRects()].map(R).filter(ok);
      if (!raw.length) continue;
      const ci = clipInfo(el);
      const vis = raw.map(r => inter(r, ci.box)).filter(r => r.r - r.l > 1.5 && r.b - r.t > 2);
      items.push({ el, n, raw, vis, ci, root, float: floats.includes(root), text: n.nodeValue.trim().replace(/\s+/g, ' ').slice(0, 60) });
    }
  }
  const push = (type, el, text, rect, extra) => out.push(Object.assign({ type, sel: sel(el), text, rect: rnd(rect) }, extra || {}));
  // (a) textos que se cruzan
  const vi = items.filter(i => i.vis.length);
  for (let i = 0; i < vi.length; i++) for (let j = i + 1; j < vi.length; j++) {
    const A = vi[i], B = vi[j];
    if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
    if (A.float !== B.float && !covered) continue;   // un aviso flotante encima de una ventana: es lo normal
    if (A.float !== B.float) { const other = A.float ? B : A; if (!other.el.closest('#bnav, #fab')) continue; }
    let hit = null;
    for (const a of A.vis) { for (const b of B.vis) { const x = inter(a, b); const mh = Math.min(a.b - a.t, b.b - b.t); if (x.r - x.l > 2 && x.b - x.t > Math.max(2.5, mh * .22)) { hit = { l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) }; break; } } if (hit) break; }
    if (hit) push('a', A.el, A.text + ' ⟂ ' + B.text, hit, { other: sel(B.el) });
  }
  // (b) desbordes y cortes
  for (const it of items) {
    const s = st(it.el);
    for (const r of it.raw) {
      // fuera de la pantalla por los lados
      const vis = inter(r, it.ci.box);
      if (!ok(vis) && it.ci.chain.some(c => /auto|scroll/.test(c.s.overflowY))) continue;   // desplazado fuera de su panel: normal
      // recortado por un antepasado
      for (const c of it.ci.chain) {
        const scrX = /auto|scroll/.test(c.s.overflowX), scrY = /auto|scroll/.test(c.s.overflowY);
        const tolY = Math.max(1.5, (r.b - r.t) * .12), outX = r.r > c.pb.r + 1 || r.l < c.pb.l - 1, outY = r.b > c.pb.b + tolY || r.t < c.pb.t - tolY;
        if (outX) {
          const ell = [it.el, ...it.ci.chain.map(x => x.e)].some(e => st(e).textOverflow === 'ellipsis' && e.contains(it.el));
          if (scrX && !ell) { if (c.e.scrollWidth > c.e.clientWidth + 1) push('b', c.e, it.text, r, { why: 'solo cabe desplazándolo' }); }
          else if (!ell && !scrX) push('b', it.el, it.text, r, { why: 'cortado por los lados', by: sel(c.e) });
        }
        if (outY && !scrY && c.s.overflowY !== 'visible') {
          const clamp = [it.el, ...it.ci.chain.map(x => x.e)].some(e => e.contains(it.el) && st(e).webkitLineClamp && st(e).webkitLineClamp !== 'none');
          const part = Math.min(r.b, c.pb.b) - Math.max(r.t, c.pb.t);
          if (!clamp && part > 0) push('b', it.el, it.text, r, { why: 'cortado por arriba/abajo', by: sel(c.e) });
        }
        if (scrX || scrY) break;   // lo de fuera de un panel con desplazamiento ya no cuenta
      }
      // se sale de su caja (sin recorte)
      const bk = blockOf(it.el), br = bk.getBoundingClientRect();
      if (st(bk).overflowX === 'visible' && (r.r > br.right + 1.5 || r.l < br.left - 1.5) && br.width > 0) push('b', bk, it.text, r, { why: 'se sale de su caja' });
      const h = r.b - r.t;
      if (st(bk).overflowY === 'visible' && br.height > 0 && (r.b > br.bottom + Math.max(2, h * .3) || r.t < br.top - Math.max(2, h * .3))) push('b', bk, it.text, r, { why: 'se sale de su caja (alto)' });
      if (it.ci.chain.every(c => !/auto|scroll|hidden|clip/.test(c.s.overflowX)) && (r.r > vw + 1 || r.l < -1)) push('b', it.el, it.text, r, { why: 'fuera de la pantalla' });
    }
    if (s.textOverflow !== 'ellipsis' && s.overflowX === 'hidden' && it.el.scrollWidth > it.el.clientWidth + 1 && s.whiteSpace === 'nowrap' && it.el.clientWidth > 0) push('b', it.el, it.text, R(it.el.getBoundingClientRect()), { why: 'scrollWidth > clientWidth sin elipsis' });
  }
  // (c) barras del sistema
  const ST = opt.safeTop, SB = opt.safeBottom;
  const inBars = r => (ST > 0 && r.t < ST - .5 && r.b > 0) || (SB > 0 && r.b > vh - SB + .5 && r.t < vh);
  const scrollEscape = (chain, r) => chain.some(c => /auto|scroll/.test(c.s.overflowY) && c.e.scrollHeight > c.e.clientHeight + 2 && c.e.scrollTop + c.e.clientHeight < c.e.scrollHeight - 2 && (parseFloat(c.s.paddingBottom) || 0) >= SB && r.t > vh - SB - 400);
  for (const it of items) for (const r of it.vis) if (inBars(r) && !scrollEscape(it.ci.chain, r)) { push('c', it.el, it.text, r); break; }
  const CTRL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=switch], [tabindex="0"]';
  const ctrls = [];
  for (const root of [...roots, ...floats]) for (const el of root.querySelectorAll(CTRL)) {
    if (!visible(el, root)) continue;
    const r0 = R(el.getBoundingClientRect()); if (!ok(r0)) continue;
    const ci = clipInfo(el.parentElement || el), r = inter(r0, ci.box);
    if (r.r - r.l < 4 || r.b - r.t < 4) continue;
    if (el.matches('input[type=color]') || el.closest('.seg .thumb')) continue;
    ctrls.push({ el, r, r0, ci, float: floats.includes(root) });
    if (inBars(r) && !scrollEscape(ci.chain, r)) push('c', el, (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), r, { why: 'control' });
  }
  // (a) texto tapado por un control que flota encima (el «+», la barra de abajo…)
  // (salvo si el texto está en un panel que se puede desplazar lo bastante para sacarlo de debajo)
  const canClear = (chain, cr) => chain.some(c => /auto|scroll/.test(c.s.overflowY) && c.e.scrollHeight > c.e.clientHeight + 2 && (parseFloat(c.s.paddingBottom) || 0) >= c.pb.b - cr.t - 2);
  for (const it of vi) for (const c of ctrls) {
    if (c.el.contains(it.el) || it.el.contains(c.el) || it.float !== c.float) continue;
    let hit = null;
    for (const r of it.vis) { const x = inter(r, c.r); if (x.r - x.l > 2 && x.b - x.t > 2.5) { hit = x; break; } }
    if (!hit) continue;
    const top = document.elementFromPoint((hit.l + hit.r) / 2, (hit.t + hit.b) / 2);
    if (!top || !c.el.contains(top) || it.el.contains(top)) continue;
    if (canClear(it.ci.chain, c.r)) continue;
    push('a', it.el, it.text + ' ⟂ ' + (c.el.getAttribute('aria-label') || c.el.textContent || '').trim().slice(0, 25), hit, { other: sel(c.el), why: 'texto tapado por un control' });
  }
  // (d) controles que se pisan
  for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
    const A = ctrls[i], B = ctrls[j];
    if (A.el.contains(B.el) || B.el.contains(A.el) || A.float !== B.float) continue;
    if (A.el.closest('label') && A.el.closest('label') === B.el.closest('label')) continue;
    const x = inter(A.r, B.r);
    if (x.r - x.l > 1.5 && x.b - x.t > 1.5) {
      if (canClear(A.ci.chain, B.r) || canClear(B.ci.chain, A.r)) continue;   // uno de los dos se puede desplazar fuera de debajo del otro
      const small = [A, B].some(c => c.r0.r - c.r0.l < 40 || c.r0.b - c.r0.t < 40);
      push('d', A.el, ((A.el.getAttribute('aria-label') || A.el.textContent || '').trim().slice(0, 25) + ' ⟂ ' + (B.el.getAttribute('aria-label') || B.el.textContent || '').trim().slice(0, 25)), { l: Math.min(A.r.l, B.r.l), t: Math.min(A.r.t, B.r.t), r: Math.max(A.r.r, B.r.r), b: Math.max(A.r.b, B.r.b) }, { other: sel(B.el), why: small ? 'controles pequeños que se pisan' : 'controles que se pisan' });
    }
  }
  // (e) desplazamiento horizontal
  const se = document.scrollingElement;
  if (se.scrollWidth > vw + 1) push('e', se, 'página', { l: 0, t: 0, r: vw, b: vh }, { why: `scrollWidth ${se.scrollWidth} > ${vw}` });
  for (const root of roots) for (const el of [root, ...root.querySelectorAll('*')]) {
    const s = st(el);
    if (!/auto|scroll/.test(s.overflowX) || el.clientWidth < 40 || el.matches('.seg') || !visible(el, root)) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      const er = el.getBoundingClientRect(), lim = er.left + el.clientWidth + 1;
      const wide = [...el.querySelectorAll('*')].filter(d => d.getBoundingClientRect().right > lim && ![...d.children].some(k => k.getBoundingClientRect().right > lim)).slice(0, 3).map(sel);
      push('e', el, '', R(er), { why: `scrollWidth ${el.scrollWidth} > ${el.clientWidth}; se salen: ${wide.join(' | ')}` });
    }
  }
  return out;
}

// ---------- datos de ejemplo (largos a propósito) ----------
async function seed(page) {
  await page.evaluate(async () => {
    const C = ZC.ui.cal, S = ZC.store, T = C.today();
    const d = n => C.ymd(C.addDays(T, n)); const at = (n, hm) => d(n) + 'T' + hm;
    const ev = o => S.saveEvent(Object.assign({ kind: 'event', calendarId: 'personal', reminders: [10] }, o));
    const wd = T.getDay(), mon = -((wd + 6) % 7);
    await S.saveCalendar({ id: 'longcal', name: 'Activitats extraescolars dels nens', color: '#7ED6C3', visible: true, order: 3 });
    await ev({ title: 'Café con Ana', emoji: '☕', start: at(0, '10:00'), end: at(0, '11:00'), location: 'La Pepita, carrer de Sant Antoni Maria Claret 123' });
    await ev({ title: 'Reunió trimestral amb el departament de comptabilitat i recursos humans', calendarId: 'work', start: at(0, '12:30'), end: at(0, '13:30'), notes: 'Revisar el plan del trimestre\nhttps://example.com/una/direccion/muy/larga/que/no/se/parte/nunca/acta-de-la-reunion-del-trimestre', checklist: [{ id: 'a', text: 'Portar els números del trimestre anterior', done: true }, { id: 'b', text: 'Preparar la demostració', done: false }], reminders: [0, 10, 60, 1440, 10080] });
    await ev({ title: 'Ioga', emoji: '🧘', start: at(mon, '19:00'), end: at(mon, '20:00'), rrule: { freq: 'weekly', interval: 2, byDay: ['MO', 'WE', 'FR'], until: d(90), count: null }, reminders: [0, 15, 120] });
    await ev({ title: 'Comprar flores para el cumpleaños de la abuela', kind: 'task', allDay: true, start: d(0), end: d(0) });
    await ev({ title: 'Dentista', emoji: '🦷', start: at(1, '17:00'), end: at(1, '17:45'), location: 'Clínica Sonrisa' });
    await ev({ title: 'Sopar amb la Marta i els seus companys de feina', start: at(1, '21:30'), end: at(1, '23:00'), location: 'Casa Pepe', reminders: [60] });
    await ev({ title: 'Viatge a Lisboa', emoji: '✈️', allDay: true, start: d(mon + 11), end: d(mon + 13), color: '#7CC8F2' });
    await ev({ title: 'Aniversari del Lluc', emoji: '🎂', allDay: true, start: d(3), end: d(3), calendarId: 'birthdays', rrule: { freq: 'yearly', interval: 1, until: null, count: null } });
    await ev({ title: 'Presentació del projecte', calendarId: 'work', start: at(2, '10:00'), end: at(2, '11:30') });
    await ev({ title: 'Trucada amb el client', calendarId: 'work', start: at(2, '10:30'), end: at(2, '11:00'), color: '#FFB38A' });
    await ev({ title: 'Pagar el lloguer', kind: 'task', allDay: true, start: d(-1), end: d(-1) });
    await ev({ title: 'Trucar a la mare', kind: 'task', start: at(1, '18:30'), end: at(1, '18:30') });
    await ev({ title: 'Gimnàs', emoji: '🏋️', start: at(mon + 1, '08:00'), end: at(mon + 1, '09:00'), rrule: { freq: 'weekly', interval: 1, byDay: ['TU', 'TH'], until: null, count: null }, color: '#7ED6C3' });
    await ev({ title: 'Mercat', emoji: '🛒', start: at(mon + 5, '11:00'), end: at(mon + 5, '12:00'), calendarId: 'longcal' });
    await ev({ title: 'Cinema', emoji: '🎬', start: at(mon + 4, '20:30'), end: at(mon + 4, '22:30'), location: 'Cines Verdi' });
    await ev({ title: 'Lliurament del projecte final', calendarId: 'work', allDay: true, start: d(mon + 16), end: d(mon + 16) });
    await ev({ title: 'Setmana d\'exàmens', allDay: true, start: d(mon + 21), end: d(mon + 25), color: '#C38BEB' });
    await ev({ title: 'Classe de ceràmica', start: at(mon + 9, '18:00'), end: at(mon + 9, '20:00'), color: '#F2C14E' });
    for (let i = 0; i < 4; i++) await ev({ title: 'Cosa ' + (i + 1) + ' del dia ple', start: at(4, (9 + i) + ':00'), end: at(4, (9 + i) + ':30') });
  });
  await page.waitForTimeout(300);
}

// ---------- pantallas ----------
const L = p => p.evaluate(() => ZC.ui.layers.length);
const closeAll = async p => { await p.evaluate(() => { document.querySelectorAll('.menu.open').forEach(m => m._close && m._close()); [...ZC.ui.layers].reverse().forEach(l => l.close()); ZC.ui.app.closeSide(); document.querySelectorAll('#toasts .toast, .upd-banner').forEach(x => x.remove()); }); await p.waitForTimeout(120); };
const go = v => async p => { await p.evaluate(v => ZC.ui.app.go({ view: v, date: ZC.ui.cal.today(), sel: ZC.ui.cal.today() }), v); await p.waitForTimeout(250); };
const SET_SECS = ['look', 'bg', 'glass', 'shape', 'type', 'anim', 'logo', 'icon', 'cal', 'widgets', 'notif', 'ai', 'drive', 'data', 'about', 'updates'];
const SCREENS_ALL = [
  { name: 'welcome-0', open: async p => { await p.evaluate(() => { ZC.ui.welcome.open(); }); await p.waitForTimeout(350); }, scroll: '.welcome .layer-body' },
  { name: 'welcome-1', open: async p => { await p.evaluate(() => { ZC.ui.welcome.open(); }); await p.waitForTimeout(250); await p.evaluate(() => document.querySelector('.wl [data-go="1"]').click()); await p.waitForTimeout(300); }, scroll: '.welcome .layer-body' },
  { name: 'welcome-2', open: async p => { await p.evaluate(() => { ZC.ui.welcome.open(); }); await p.waitForTimeout(250); await p.evaluate(() => document.querySelector('.wl [data-go="1"]').click()); await p.waitForTimeout(200); await p.evaluate(() => document.querySelector('.wl [data-go="2"]').click()); await p.waitForTimeout(300); }, scroll: '.welcome .layer-body' },
  { name: 'month', open: go('month'), scroll: '.dm-panel, .mv-daylist' },
  { name: 'week', open: go('week') },
  { name: 'day', open: go('day') },
  { name: 'agenda', open: go('agenda'), scroll: '.ag-scroll' },
  { name: 'year', open: go('year'), scroll: '.yr-scroll' },
  { name: 'tasks', open: go('tasks'), scroll: '.tk-scroll' },
  { name: 'side', open: async p => { await go('month')(p); await p.evaluate(() => ZC.ui.app.toggleSide()); await p.waitForTimeout(350); }, scroll: '#side' },
  { name: 'period-menu', open: async p => { await go('month')(p); await p.evaluate(() => document.getElementById('periodTitle').click()); await p.waitForTimeout(250); } },
  { name: 'editor-new', open: async p => { await p.evaluate(() => ZC.ui.editor.open({ date: ZC.ui.cal.today() })); await p.waitForTimeout(400); }, scroll: '.ed-body' },
  { name: 'editor-nlp', open: async p => { await p.evaluate(() => ZC.ui.editor.open({ date: ZC.ui.cal.today() })); await p.waitForTimeout(350); await p.fill('.ed-tin', 'sopar amb la Marta divendres a les 9 a Casa Pepe'); await p.waitForTimeout(700); }, scroll: '.ed-body' },
  { name: 'editor-custom', open: async p => { await p.evaluate(() => { const e = ZC.store.events().find(x => x.title === 'Ioga'); ZC.ui.editor.open({ ev: e }); }); await p.waitForTimeout(400); }, scroll: '.ed-body' },
  { name: 'editor-reminders', open: async p => { await p.evaluate(() => { const e = ZC.store.events().find(x => /trimestral/.test(x.title)); ZC.ui.editor.open({ ev: e }); }); await p.waitForTimeout(400); }, scroll: '.ed-body' },
  { name: 'detail', open: async p => { await p.evaluate(() => { const e = ZC.store.events().find(x => /trimestral/.test(x.title)); ZC.ui.editor.detail(ZC.ui.cal.occOf(e)); }); await p.waitForTimeout(400); }, scroll: '.layer:last-of-type .layer-body' },
  { name: 'ai-empty', open: async p => { await p.evaluate(() => ZC.ui.aipanel.open()); await p.waitForTimeout(400); } },
  { name: 'ai-preview', open: async p => { await p.evaluate(() => ZC.ui.aipanel.open()); await p.waitForTimeout(300); await p.fill('.ai-box textarea', 'sopar amb la Marta divendres a les 9 i recorda-m\'ho 1 h abans'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500); }, scroll: '.ai-log' },
  { name: 'search', open: async p => { await p.evaluate(() => ZC.ui.quick.search()); await p.waitForTimeout(300); await p.keyboard.type('re'); await p.waitForTimeout(400); }, scroll: '.sr-res' },
  { name: 'settings-list', open: async p => { await p.evaluate(() => ZC.ui.settings.open()); await p.waitForTimeout(400); await p.evaluate(() => { const b = document.querySelector('.set-back'); if (b && b.offsetParent) b.click(); }); await p.waitForTimeout(400); }, scroll: '.set-nav' },
  ...SET_SECS.map(s => ({ name: 'settings-' + s, open: async p => { await p.evaluate(s => ZC.ui.settings.open(s), s); await p.waitForTimeout(450); }, scroll: '.set-content' })),
  { name: 'cal-menu', open: async p => { await go('month')(p); await p.evaluate(() => ZC.ui.app.toggleSide()); await p.waitForTimeout(300); await p.evaluate(() => document.querySelector('#side [data-calmenu="longcal"]').click()); await p.waitForTimeout(300); } },
  { name: 'cal-new', open: async p => { await p.evaluate(() => { ZC.ui.prompt(ZC.t('Nuevo calendario'), '', { placeholder: ZC.t('Por ejemplo: Gimnasio'), ok: ZC.t('Crear') }); }); await p.waitForTimeout(400); } },
  { name: 'cal-color', open: async p => { await p.evaluate(() => ZC.ui.side.colorPicker(ZC.store.calendar('longcal'))); await p.waitForTimeout(400); } },
  { name: 'cal-delete', open: async p => { await p.evaluate(() => { ZC.ui.confirm(ZC.t('¿Borrar «{x}»?', { x: 'Activitats extraescolars dels nens' }), ZC.i18n.tn(12, 'También se borrará {n} evento suyo.', 'También se borrarán sus {n} eventos.'), { ok: ZC.t('Borrar'), danger: true, icon: 'trash' }); }); await p.waitForTimeout(400); } },
  { name: 'goto', open: async p => { await p.evaluate(() => ZC.ui.app.goToDate()); await p.waitForTimeout(400); } },
  { name: 'toasts', open: async p => { await go('month')(p); await p.evaluate(() => { ZC.ui.toast(ZC.t('Calendario «{x}» creado', { x: 'Activitats extraescolars dels nens' }), { icon: 'check', ms: 60000 }); ZC.ui.toast(ZC.t('Actualizado a la versión {v}', { v: '1.1.0' }), { ms: 60000, action: { label: ZC.t('Ver novedades'), fn: () => {} } }); ZC.ui.toast(ZC.t('Evento borrado'), { ms: 60000, undo: () => {} }); }); await p.waitForTimeout(600); } },
  ...['available', 'downloading', 'ready'].map(stt => ({ name: 'update-' + stt, open: async p => {
    await go('month')(p);
    await p.evaluate(stt => { const s = { status: stt, current: '1.1.0', latest: '1.2.0', progress: 42, notes: '## Novetats\n- Una cosa nova\n- Una altra' }; ZC.ui.updates.use({ available: true, state: () => ({ ...s }), on: () => () => {}, check: async () => s, install: async () => true }); }, stt);
    await p.waitForTimeout(700);
  } })),
  { name: 'lightbox', open: async p => {
    await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#9F8DFF'; g.fillRect(0, 0, 600, 900);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      if (!window.__img) { window.__img = await ZC.store.putBlob(b, { name: 'foto.png' }); window.__img = window.__img.id || window.__img; }
      ZC.ui.lightbox([window.__img, window.__img], 0);
    });
    await p.waitForTimeout(600);
  } },
];
const SCREENS = process.env.SCREENS ? SCREENS_ALL.filter(s => process.env.SCREENS.split(',').some(x => s.name.startsWith(x))) : SCREENS_ALL;
const KEYBOARD = ['editor-new', 'editor-custom', 'ai-preview', 'search', 'cal-new', 'settings-ai'];

// ---------- combinaciones ----------
const SIZES = { s360: { width: 360, height: 740 }, s384: { width: 384, height: 780 }, s412: { width: 412, height: 915 }, s360short: { width: 360, height: 640 } };
const combos = [];
for (const design of ['zen', 'dot']) {
  // A: lo peor (360, barras 28/48, letra al 130 %, densidad amplia), los tres idiomas
  for (const lang of ['es', 'ca', 'en']) combos.push({ design, lang, size: 's360', safe: [28, 48], zoom: 130, density: 'wide', font: 'roboto', scheme: (lang === 'ca') !== (design === 'dot') ? 'dark' : 'light' });
  if (QUICK) continue;
  // B: 384 con barras 40/16, letra normal pero una letra de sistema más ancha
  for (const lang of ['es', 'ca']) combos.push({ design, lang, size: 's384', safe: [40, 16], zoom: 100, density: 'normal', font: 'wide', scheme: lang === 'es' ? 'dark' : 'light' });
  // C: 412 con gestos (24/0) y 115 %
  for (const lang of ['ca', 'en']) combos.push({ design, lang, size: 's412', safe: [24, 0], zoom: 115, density: 'normal', font: 'roboto', scheme: 'light' });
  // D: 360×640 (pantalla corta) en catalán al 130 %
  combos.push({ design, lang: 'ca', size: 's360short', safe: [40, 16], zoom: 130, density: 'compact', font: 'roboto', scheme: 'dark' });
}
combos.forEach(c => { c.tag = `${c.design}-${c.lang}-${c.size}-z${c.zoom}-${c.font}-${c.scheme}`; });
if (QUICK) combos.splice(0, combos.length, ...combos.filter(c => c.lang !== 'en'));

const FONT_CSS = {
  roboto: 'html:root, html:root[data-design] { --font-ui: Roboto, sans-serif !important; --font-title: Roboto, sans-serif !important; }',
  wide: 'html:root, html:root[data-design] { --font-ui: "DejaVu Sans", sans-serif !important; --font-title: "DejaVu Sans", sans-serif !important; }',
};

(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  const base = `http://127.0.0.1:${PORT}/index.html?nowelcome`;
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [], found = new Map();
  let shotN = 0;
  const todo = combos.filter(c => !ONLY.length || ONLY.every(o => c.tag.includes(o)));
  const runCombo = async c => {
    const ctx = await browser.newContext({ viewport: SIZES[c.size], deviceScaleFactor: 2.75, isMobile: true, hasTouch: true, userAgent: UA, colorScheme: c.scheme, locale: { es: 'es-ES', ca: 'ca-ES', en: 'en-GB' }[c.lang], timezoneId: 'Europe/Madrid' });
    await ctx.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    await ctx.addInitScript(([st, sb, css]) => {
      const set = () => { const s = document.documentElement.style; s.setProperty('--zc-safe-top', st + 'px'); s.setProperty('--zc-safe-bottom', sb + 'px'); s.setProperty('--zc-safe-left', '0px'); s.setProperty('--zc-safe-right', '0px'); };
      const noop = () => {};
      window.ZCAndroid = { setEdge: on => { if (on) set(); }, version: () => '1.1.0', takeOpen: () => '', takeShared: () => '', updateState: () => '', takeUpdated: () => '', setTheme: noop, openExternal: noop, share: noop, setAppIcon: noop, notificationsAllowed: () => true, canPinWidget: () => false, pinWidget: noop, updateCheck: noop, updateInstall: noop, haptic: noop, setReminders: noop, googleAuth: noop, googleClear: noop };
      document.addEventListener('DOMContentLoaded', () => { const el = document.createElement('style'); el.id = 'zc-test-font'; el.textContent = css; document.head.appendChild(el); });
    }, [c.safe[0], c.safe[1], FONT_CSS[c.font]]);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`[${c.tag}] ${e.message}`));
    p.on('console', m => { if (process.env.DEBUGD && /^DBG/.test(m.text())) console.log(m.text()); if (m.type() === 'error' && !/net::ERR|ERR_FAILED|fonts\.googleapis/.test(m.text())) errs.push(`[${c.tag}] ${m.text()}`); });
    await p.goto(base); await p.waitForSelector('html.ready', { timeout: 15000 }); await p.waitForTimeout(500);
    await p.evaluate(() => { ZC.store.local('welcomed', true); ZC.store.local('dotIconAsked', true); });
    await seed(p);
    await p.evaluate(async ([c]) => {
      ZC.ui.look.set({ design: c.design, scheme: c.scheme, zoom: c.zoom, density: c.density, anim: 'none', bg: 'liso' });
      await ZC.store.setPrefs({ cal: { ...ZC.ui.cal.prefsCal(), lang: c.lang } });
      ZC.i18n.setLang(c.lang); ZC.ui.app.rebuild();
      // (lo mismo que hace Java tras setEdge: por si alguien las pisa)
      const s = document.documentElement.style; s.setProperty('--zc-safe-top', c.safe[0] + 'px'); s.setProperty('--zc-safe-bottom', c.safe[1] + 'px');
    }, [c]);
    await p.waitForTimeout(500);
    const ok0 = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--zc-safe-top').trim());
    if (!ok0) errs.push(`[${c.tag}] no se han puesto las barras`);
    const runScreen = async (scr, kb) => {
      await closeAll(p);
      if (kb) await p.setViewportSize({ width: SIZES[c.size].width, height: SIZES[c.size].height });
      try { await scr.open(p); } catch (e) { errs.push(`[${c.tag}] ${scr.name}: ${e.message.split('\n')[0]}`); return; }
      if (kb) {
        // teclado abierto: el WebView encoge (interactive-widget=resizes-content) y la barra de navegación queda tapada por el teclado
        await p.setViewportSize({ width: SIZES[c.size].width, height: 400 });
        await p.evaluate(() => { const s = document.documentElement.style; s.setProperty('--zc-safe-bottom', '0px'); const f = document.querySelector('.layer:last-of-type input:not([type=date]):not([type=time]), .layer:last-of-type textarea'); if (f) f.focus(); });
        await p.waitForTimeout(350);
      }
      const name = scr.name + (kb ? '+teclado' : ''); const t0 = Date.now();
      const sb = kb ? 0 : c.safe[1];
      const positions = [0];
      if (scr.scroll) {
        const n = await p.evaluate(s => { const el = [...document.querySelectorAll(s)].filter(e => e.offsetParent && e.clientHeight > 0).pop(); if (!el) return 0; return Math.min(12, Math.ceil((el.scrollHeight - el.clientHeight) / Math.max(1, el.clientHeight * .8))); }, scr.scroll);
        for (let i = 1; i <= n; i++) positions.push(i);
      }
      if (process.env.DEBUG) process.stdout.write(`    ${name} (${positions.length})`);
      if (process.env.FULL) { fs.mkdirSync(path.join(OUT, 'full'), { recursive: true }); await p.screenshot({ path: path.join(OUT, 'full', `${c.tag}-${name}.png`) }); }
      for (const pos of positions) {
        if (pos) { await p.evaluate(([s, pos]) => { const el = [...document.querySelectorAll(s)].filter(e => e.offsetParent && e.clientHeight > 0).pop(); if (el) el.scrollTop = Math.round(el.clientHeight * .8 * pos); }, [scr.scroll, pos]); await p.waitForTimeout(120); }
        const res = await p.evaluate(detect, { safeTop: c.safe[0], safeBottom: sb, debug: !!process.env.DEBUGD });
        for (const it of res) {
          const w = white(it);
          const key = `${it.type}|${it.sel}|${it.why || ''}|${(it.text || '').replace(/\d+/g, '#').slice(0, 30)}`;
          let f = found.get(key);
          if (!f) { f = { ...it, white: w, where: [] }; found.set(key, f); if (SHOTS && !w && shotN < 220) {
            const vp = p.viewportSize(), pad = 26;
            const x = Math.max(0, it.rect.x - pad), y = Math.max(0, it.rect.y - pad);
            const clip = { x, y, width: Math.max(10, Math.min(vp.width - x, it.rect.w + pad * 2)), height: Math.max(10, Math.min(vp.height - y, it.rect.h + pad * 2)) };
            f.shot = path.join(OUT, `${String(++shotN).padStart(3, '0')}-${it.type}-${c.tag}-${name}.png`);
            try { await p.screenshot({ path: f.shot, clip }); } catch { f.shot = null; }
          } }
          if (f.where.length < 6) f.where.push(`${c.tag}/${name}${pos ? '@' + pos : ''}`); else f.more = (f.more || 0) + 1;
        }
      }
      if (process.env.DEBUG) console.log(' ' + (Date.now() - t0) + ' ms');
    };
    for (const scr of SCREENS) await runScreen(scr, false);
    for (const scr of SCREENS.filter(s => KEYBOARD.includes(s.name))) await runScreen(scr, true);
    await p.setViewportSize(SIZES[c.size]);
    await ctx.close();
    console.log('  hecho ' + c.tag);
  };
  // (tres combinaciones a la vez: cada una en su contexto)
  const workers = Array.from({ length: Math.min(+process.env.JOBS || 3, todo.length) }, async () => { for (let c; (c = todo.shift());) await runCombo(c); });
  await Promise.all(workers);
  await browser.close(); srv.close();
  const bad = [...found.values()].filter(f => !f.white), wl = [...found.values()].filter(f => f.white);
  const order = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  bad.sort((x, y) => order[x.type] - order[y.type] || x.sel.localeCompare(y.sel));
  const NAMES = { a: 'textos que se solapan', b: 'texto que se sale o se corta', c: 'debajo de las barras del sistema', d: 'controles que se pisan', e: 'desplazamiento horizontal' };
  for (const f of bad) console.log(`\n[${f.type}] ${NAMES[f.type]}${f.why ? ' · ' + f.why : ''}\n   ${f.sel}${f.other ? '  ⟂  ' + f.other : ''}${f.by ? '  (por ' + f.by + ')' : ''}\n   «${f.text}»  ${JSON.stringify(f.rect)}\n   en: ${f.where.join(', ')}${f.more ? ` (+${f.more})` : ''}${f.shot ? '\n   captura: ' + path.relative(process.cwd(), f.shot) : ''}`);
  if (wl.length) console.log(`\nEn la lista blanca (${wl.length}): ` + [...new Set(wl.map(f => f.white.why))].join(' · '));
  if (errs.length) console.log('\nERRORES:\n' + errs.join('\n'));
  console.log(`\n${bad.length ? 'FALLO' : 'ok'}: ${bad.length} problemas (${Object.keys(NAMES).map(k => k + '=' + bad.filter(f => f.type === k).length).join(' ')}), ${wl.length} en la lista blanca, ${errs.length} errores`);
  process.exit(bad.length || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
