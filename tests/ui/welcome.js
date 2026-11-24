'use strict';
// ZenCalendar · la bienvenida de principio a fin (Playwright, puerto 8881).
//   node tests/ui/welcome.js
// En el móvil con toques de verdad (y en el PC con el ratón), en Zen y en Dot y en español,
// catalán e inglés: «Siguiente» avanza, «Atrás» vuelve, elegir diseño o estilo no cambia de paso,
// y «Empezar a usarlo» la cierra y no vuelve a salir al recargar.
// (Regresión: <html data-design> hacía que cualquier toque contase como «elegir diseño» y no se avanzaba.)
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const PORT = +process.env.PORT || 8881;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff': 'font/woff' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };

(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  const base = `http://127.0.0.1:${PORT}/index.html`;
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];

  async function run(tag, ctxOpts, { touch, design, locale }) {
    const ctx = await b.newContext({ locale, timezoneId: 'Europe/Madrid', ...ctxOpts });
    await ctx.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`[${tag}] ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/net::ERR|ERR_FAILED|fonts\.googleapis/.test(m.text())) errs.push(`[${tag}] ${m.text()}`); });
    await p.goto(base); await p.waitForSelector('.wl-card', { timeout: 15000 });
    const step = () => p.evaluate(() => { const c = document.querySelector('.wl-card'); return c ? +c.dataset.step : -1; });
    const press = async sel => {
      const el = p.locator(sel).first();
      await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(150);
      if (touch) { const bb = await el.boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); }
      else await el.click();
      await p.waitForTimeout(350);
    };
    console.log(tag);
    ok(await step() === 0, 'empieza en el paso 1');
    // elegir diseño: se queda en el paso 1 y cambia el diseño
    await press(`.wl .dz-card[data-design="${design}"]`);
    ok(await step() === 0, 'elegir el diseño no cambia de paso');
    ok(await p.evaluate(() => document.documentElement.dataset.design) === design, `el diseño pasa a ${design}`);
    if (design === 'zen') { await press('.wl .wl-p[data-p="sakura"]'); ok(await step() === 0, 'elegir un estilo no cambia de paso'); }
    await press('#wlScheme [data-v="dark"]'); ok(await step() === 0, 'elegir oscuro no cambia de paso');
    await press('.wl [data-go="1"]'); ok(await step() === 1, '«Siguiente» lleva al paso 2');
    await press('.wl [data-go="0"]'); ok(await step() === 0, '«Atrás» vuelve al paso 1');
    await press('.wl [data-go="1"]'); await press('.wl [data-go="2"]'); ok(await step() === 2, 'del paso 2 al 3');
    await press('.wl [data-a="done"]'); await p.waitForTimeout(500);
    ok(await step() === -1, '«Empezar a usarlo» cierra la bienvenida');
    await p.reload(); await p.waitForSelector('html.ready'); await p.waitForTimeout(600);
    ok(await step() === -1, 'al recargar no vuelve a salir');
    ok(await p.evaluate(() => document.documentElement.dataset.design) === design, 'el diseño elegido se ha guardado');
    await ctx.close();
  }

  const phone = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent };
  await run('móvil · Zen · es', phone, { touch: true, design: 'zen', locale: 'es-ES' });
  await run('móvil · Dot · ca', phone, { touch: true, design: 'dot', locale: 'ca-ES' });
  await run('móvil · Dot · en', phone, { touch: true, design: 'dot', locale: 'en-GB' });
  await run('PC · Zen · es', { viewport: { width: 1366, height: 800 } }, { touch: false, design: 'zen', locale: 'es-ES' });

  ok(!errs.length, 'sin errores en la consola' + (errs.length ? ':\n    ' + errs.join('\n    ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
