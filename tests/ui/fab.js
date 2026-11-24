'use strict';
// ZenCalendar · el «+» del móvil (Playwright, puerto 8891).
//   node tests/ui/fab.js
// En 360 px, Zen y Dot, como en Android (con ZCAndroid de mentira y las barras del sistema):
// tocar el «+» abre el editor a la primera, sin que un aviso lo tape (antes el de «¿Pones el
// icono de Dot?» quedaba encima y el toque cambiaba el icono), sin repintar la app entera y
// sin el círculo de clip-path (en táctil parpadeaba en el WebView). Y ningún aviso pisa el «+».
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const PORT = +process.env.PORT || 8891;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };
(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  for (const d of ['zen', 'dot']) {
    console.log(d);
    const c = await b.newContext({ locale: 'es-ES', viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent });
    await c.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    await c.addInitScript(() => { window.ZCAndroid = { setEdge() {}, setTheme() {}, haptic() {}, appIcon() {} }; });
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(`[${d}] ${e.message}`));
    await p.goto(`http://127.0.0.1:${PORT}/index.html?nowelcome`); await p.waitForSelector('html.ready');
    await p.evaluate(dd => { ZC.store.local('welcomed', true); const s = document.documentElement.style; s.setProperty('--zc-safe-top', '28px'); s.setProperty('--zc-safe-bottom', '48px'); ZC.ui.look.set({ design: dd }); ZC.ui.toast('Un aviso cualquiera, bastante largo para ocupar casi todo el ancho', { ms: 9000, action: { label: 'Deshacer', fn() {} } }); }, d);
    await p.waitForTimeout(1200);
    const geo = await p.evaluate(() => {
      const f = document.querySelector('#fab').getBoundingClientRect();
      const hit = [...document.querySelectorAll('#toasts > *, .upd-banner')].map(e => e.getBoundingClientRect()).some(r => r.width && !(r.right <= f.left || r.left >= f.right || r.bottom <= f.top || r.top >= f.bottom));
      return { hit, f: { x: f.left + f.width / 2, y: f.top + f.height / 2 } };
    });
    ok(!geo.hit, 'ningún aviso pisa el «+»');
    await p.evaluate(() => { window.__n = 0; new MutationObserver(ms => { for (const m of ms) if (m.target === document.documentElement && m.attributeName === 'style') window.__n++; }).observe(document.documentElement, { attributes: true }); });
    await p.touchscreen.tap(geo.f.x, geo.f.y); await p.waitForTimeout(900);
    ok(await p.evaluate(() => !!document.querySelector('.ed-layer.open')), 'tocar el «+» abre el editor');
    ok(await p.evaluate(() => !document.querySelector('.ed-layer.morph')), 'sin el círculo de clip-path en táctil');
    ok(await p.evaluate(() => window.__n === 0), 'no se repinta el tema de la app al abrirlo');
    await c.close();
  }
  ok(!errs.length, 'sin errores' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
