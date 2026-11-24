'use strict';
// ZenCalendar · tocar una opción no te manda arriba del todo (Playwright, puerto 8991).
//   node tests/ui/scroll.js
// En cada sección de Ajustes (móvil y PC, Zen y Dot) y en el editor: se baja, se toca un interruptor,
// un segmento o un botón de la mitad de abajo y la pantalla tiene que seguir donde estaba.
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const PORT = +process.env.PORT || 8991;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };
(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  const combos = [['PC zen', { viewport: { width: 1366, height: 800 } }, 'zen'], ['móvil dot', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent }, 'dot']];
  for (const [tag, opts, design] of combos) {
    console.log(tag);
    const c = await b.newContext({ locale: 'es-ES', ...opts });
    await c.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    const p = await c.newPage(); p.on('pageerror', e => errs.push(`[${tag}] ${e.message}`));
    await p.goto(`http://127.0.0.1:${PORT}/index.html?nowelcome`); await p.waitForSelector('html.ready');
    await p.evaluate(d => { ZC.store.local('welcomed', true); ZC.store.local('dotIconAsked', true); ZC.ui.look.set({ design: d }); }, design);
    await p.waitForTimeout(400);
    const secs = await p.evaluate(() => { ZC.ui.settings.open(); return Object.keys(ZC.ui.settings.sections); });
    await p.waitForTimeout(500);
    for (const id of secs) {
      const r = await p.evaluate(async id => {
        ZC.ui.settings.open(id); await new Promise(r => setTimeout(r, 450));
        const box = document.querySelector('.set-content'); if (!box || box.scrollHeight < box.clientHeight + 200) return { skip: true };
        box.scrollTop = Math.round((box.scrollHeight - box.clientHeight) * .7); await new Promise(r => setTimeout(r, 80));
        const y0 = box.scrollTop, br = box.getBoundingClientRect();
        // un control de la zona visible de abajo que no abra nada ni borre
        const cand = [...box.querySelectorAll('.sw, .seg [data-v]:not(.on), .dots [data-v]:not(.on), [data-k] [data-v]:not(.on)')].filter(el => { const q = el.getBoundingClientRect(); return q.top > br.top + br.height * .35 && q.bottom < br.bottom - 10 && q.width; });
        const el = cand[0]; if (!el) return { skip: true };
        el.click(); await new Promise(r => setTimeout(r, 600));
        const box2 = document.querySelector('.set-content');
        return { y0, y1: box2.scrollTop, what: (el.closest('[data-k]') || el).dataset.k || el.className };
      }, id);
      if (r.skip) continue;
      ok(Math.abs(r.y1 - r.y0) < 60, `Ajustes → ${id}: tocar ${r.what} deja la pantalla donde estaba (${r.y0} → ${r.y1})`);
    }
    // editor
    await p.evaluate(() => { document.querySelectorAll('.layer').forEach(l => l.remove()); document.querySelector('.scrim')?.remove(); ZC.ui.editor.open({}); });
    await p.waitForTimeout(700);
    const e = await p.evaluate(async () => {
      const sc = [document.querySelector('.ed-panel'), ...document.querySelectorAll('.ed-layer .layer-body, .ed-layer .layer-scroll')].find(x => x && x.scrollHeight > x.clientHeight + 100);
      if (!sc) return { skip: true };
      sc.scrollTop = sc.scrollHeight; await new Promise(r => setTimeout(r, 80)); const y0 = sc.scrollTop;
      const btn = document.querySelector('.ed [data-act="alarm"], .ed [data-color]'); if (!btn) return { skip: true };
      btn.click(); await new Promise(r => setTimeout(r, 400));
      // (el contenedor se vuelve a crear al repintar: se mide el de ahora)
      const now = sc.isConnected ? sc : document.querySelector('.ed-layer .layer-scroll');
      return { y0, y1: now ? now.scrollTop : 0 };
    });
    if (!e.skip) ok(Math.abs(e.y1 - e.y0) < 60, `Editor: tocar una opción abajo deja la pantalla donde estaba (${e.y0} → ${e.y1})`);
    await c.close();
  }
  ok(!errs.length, 'sin errores' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
