'use strict';
// ZenCalendar · la Semana en el móvil con el dedo (Playwright + CDP, puerto 8921).
//   node tests/ui/week.js
// - la franja vacía de «Todo el día» mide lo suyo (antes cogía los estilos de .empty: 97-119 px y la
//   columna de los eventos de todo el día a 0 de ancho)
// - muchos desplazamientos verticales rápidos no cambian de vista ni de semana ni el alto de las horas
// - deslizar a los lados muy seguido avanza exactamente una semana por gesto (antes se perdían y se
//   mezclaban las vistas) y no deja vistas amontonadas ni transformaciones colgadas
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const PORT = +process.env.PORT || 8921;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };
(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  for (const d of ['zen', 'dot']) {
    console.log(d);
    const c = await b.newContext({ locale: 'es-ES', viewport: { width: 384, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent });
    await c.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    await c.addInitScript(() => { window.ZCAndroid = { setEdge() {}, setTheme() {}, haptic() {} }; });
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(`[${d}] ${e.message}`));
    await p.goto(`http://127.0.0.1:${PORT}/index.html?nowelcome`); await p.waitForSelector('html.ready');
    await p.evaluate(dd => { ZC.store.local('welcomed', true); ZC.store.local('dotIconAsked', true); ZC.ui.look.set({ design: dd }); ZC.ui.app.go({ view: 'week' }); }, d);
    await sleep(1000);
    const cdp = await c.newCDPSession(p);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const drag = async (x0, y0, x1, y1, steps = 6, dt = 6) => { await touch('touchStart', x0, y0); for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(dt); } await touch('touchEnd'); };
    const st = () => p.evaluate(() => ({ views: document.querySelectorAll('#viewHost > .view').length, tr: [...document.querySelectorAll('#viewHost > .view')].map(v => v.style.transform).join(''), hz: ZC.store.local('hourZoom'), date: ZC.ui.cal.ymd(ZC.ui.app.state.date), view: ZC.ui.app.state.view, ad: Math.round(document.querySelector('#viewHost .view:last-child .tg-allday').getBoundingClientRect().height), adl: Math.round(document.querySelector('#viewHost .view:last-child .tg-adl').getBoundingClientRect().width) }));
    const s0 = await st();
    ok(s0.ad <= 40, `«Todo el día» vacío mide ${s0.ad} px (≤ 40)`);
    ok(s0.adl > 200, `la columna de todo el día tiene ancho (${s0.adl} px)`);
    for (let i = 0; i < 25; i++) { const up = i % 2; await drag(200 + (i % 3) * 10, up ? 300 : 650, 200 + (i % 5) * 6, up ? 650 : 300, 6, 5); }
    await sleep(500);
    const s1 = await st();
    ok(s1.view === 'week' && s1.date === s0.date && s1.hz === s0.hz, 'desplazarse mucho en vertical no cambia de vista, de semana ni el alto de las horas');
    for (let i = 0; i < 6; i++) { await drag(330, 450, 40, 455); await sleep(60); }
    await sleep(800);
    const s2 = await st();
    const weeks = Math.round((new Date(s2.date) - new Date(s1.date)) / (7 * 864e5));
    ok(weeks === 6, `6 deslizamientos rápidos = 6 semanas (salen ${weeks})`);
    ok(s2.views === 1 && !s2.tr, 'sin vistas amontonadas ni transformaciones colgadas');
    await c.close();
  }
  ok(!errs.length, 'sin errores' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
