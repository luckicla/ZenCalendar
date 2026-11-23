'use strict';
// ZenCalendar · pruebas de las actualizaciones con una API `updates` de mentira (todos los estados).
//   node tests/ui/updates.js     (capturas en tests/ui/out/upd-*.png)
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MOCK = () => {
  const fns = []; let s = { status: 'idle', current: '1.0.0', latest: '', progress: 0, notes: '', error: null };
  window.__upd = {
    calls: [],
    set(p) { s = Object.assign({}, s, p); fns.forEach(f => f({ ...s })); },
    api: { available: true, state: () => ({ ...s }), on: f => { fns.push(f); return () => fns.splice(fns.indexOf(f), 1); },
      async check() { window.__upd.calls.push('check'); window.__upd.set({ status: 'checking' }); await new Promise(r => setTimeout(r, 150)); window.__upd.set({ status: 'none' }); return { ...s }; },
      async install() { window.__upd.calls.push('install'); return true; } },
  };
};

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/index.html?nowelcome`;
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  for (const cfg of [{ name: 'desk', vp: { width: 1366, height: 800 }, plat: 'desktop' }, { name: 'mob', vp: { width: 390, height: 844 }, plat: 'android', mobile: true }]) {
    const ctx = await b.newContext({ viewport: cfg.vp, isMobile: !!cfg.mobile, hasTouch: !!cfg.mobile, deviceScaleFactor: cfg.mobile ? 2 : 1, locale: 'es-ES' });
    await ctx.route(/fonts\./, r => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(base + '&plat=' + cfg.plat); await p.waitForSelector('html.ready'); await sleep(700);
    await p.evaluate(MOCK);
    await p.evaluate(() => ZC.ui.updates.use(window.__upd.api));
    const tag = s => `[${cfg.name}] ${s}`;
    await p.evaluate(() => window.__upd.set({ status: 'available', latest: '1.0.1' })); await sleep(600);
    ok(await p.evaluate(() => /1\.0\.1/.test((document.querySelector('.upd-banner') || {}).textContent || '')), tag('aviso de versión nueva'));
    await p.evaluate(() => window.__upd.set({ status: 'downloading', progress: 42 })); await sleep(300);
    ok(await p.evaluate(() => document.querySelector('.upd-banner .prog i').style.width === '42%'), tag('barra de progreso mientras descarga'));
    await p.screenshot({ path: path.join(OUT, `upd-${cfg.name}-downloading.png`) });
    await p.evaluate(() => window.__upd.set({ status: 'ready', progress: 100, notes: '## Novedades\n- **Gestos** nuevos: pellizcar y deslizar\n- Arreglos en la agenda\n\nGracias por usar ZenCalendar.' })); await sleep(500);
    const txt = await p.evaluate(() => document.querySelector('.upd-banner').textContent);
    const lbl = { android: 'Instalar', desktop: 'Reiniciar y actualizar', web: 'Recargar' }[await p.evaluate(() => ZC.platform.kind)];
    ok(/está lista/.test(txt) && txt.includes(lbl), tag('lista para instalar, con el botón de su plataforma (' + lbl + ')'));
    await p.screenshot({ path: path.join(OUT, `upd-${cfg.name}-ready.png`) });
    await p.click('.upd-banner [data-u=notes]'); await sleep(500);
    ok(await p.evaluate(() => document.querySelectorAll('.upd-notes li').length === 2), tag('«Ver novedades» enseña las notas'));
    await p.screenshot({ path: path.join(OUT, `upd-${cfg.name}-notes.png`) });
    await p.click('.upd-notes [data-inst]'); await sleep(300);
    ok(await p.evaluate(() => window.__upd.calls.includes('install')), tag('«Actualizar» llama a install()'));
    await p.click('.upd-banner [data-u=x]'); await sleep(500);
    ok(!(await p.$('.upd-banner')), tag('el aviso se puede cerrar'));
    // Ajustes → Actualizaciones
    await p.evaluate(() => ZC.ui.settings.open('updates')); await sleep(600);
    ok(await p.evaluate(() => /ZenCalendar 1\.0\.0/.test(document.querySelector('.upd-sec').textContent) && !!document.querySelector('.set-sec .upd-md li')), tag('Ajustes enseña versión y novedades'));
    await p.screenshot({ path: path.join(OUT, `upd-${cfg.name}-settings.png`) });
    await p.click('[data-upd=auto]'); await sleep(500);
    ok(await p.evaluate(() => ZC.store.getPrefs().look.autoUpdate === false), tag('«Actualizar sola» se guarda en prefs.look.autoUpdate'));
    await p.evaluate(() => window.__upd.set({ status: 'none', latest: '', notes: '' })); await sleep(400);
    await p.click('[data-upd=check]'); await sleep(700);
    ok(await p.evaluate(() => window.__upd.calls.includes('check') && [...document.querySelectorAll('.toast')].some(x => /última versión/.test(x.textContent))), tag('«Buscar actualizaciones» comprueba y avisa'));
    await p.evaluate(() => window.__upd.set({ status: 'error', error: 'Sin conexión' })); await sleep(500);
    ok(await p.evaluate(() => /Sin conexión/.test(document.querySelector('.upd-sec').textContent)), tag('el error se enseña en Ajustes'));
    await p.evaluate(() => ZC.ui.back()); await sleep(400);
    await p.evaluate(() => ZC.ui.updates.justUpdated('1.0.1')); await sleep(1300);
    ok(await p.evaluate(() => [...document.querySelectorAll('.toast')].some(x => /Actualizado a la versión 1\.0\.1/.test(x.textContent))), tag('«Actualizado a la versión X» al abrir'));
    await p.screenshot({ path: path.join(OUT, `upd-${cfg.name}-updated.png`) });
    const n0 = await p.evaluate(() => document.querySelectorAll('.toast').length);
    await p.evaluate(() => ZC.ui.updates.justUpdated('1.0.1')); await sleep(1300);
    ok((await p.evaluate(() => [...document.querySelectorAll('.toast')].filter(x => /Actualizado/.test(x.textContent)).length)) <= 1 && n0 >= 1, tag('…solo la primera vez'));
    await ctx.close();
  }
  await b.close(); srv.close();
  if (errs.length) { console.log('Errores de página:\n' + errs.join('\n')); fails++; }
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
