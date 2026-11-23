'use strict';
// ZenCalendar · pruebas de gestos (Playwright, táctil con CDP en 390×844 y ratón en 1366×800).
//   node tests/ui/gestures.js
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function touchKit(cdp) {
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  return {
    async drag(x0, y0, x1, y1, steps = 10, holdMs = 0) {
      await send('touchStart', [[x0, y0]]); if (holdMs) await sleep(holdMs);
      for (let i = 1; i <= steps; i++) { await send('touchMove', [[x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps]]); await sleep(12); }
      await send('touchEnd', []);
    },
    async tap(x, y) { await send('touchStart', [[x, y]]); await sleep(40); await send('touchEnd', []); },
    async pinch(cx, cy, d0, d1, steps = 10) {
      const pts = d => [[cx - d / 2, cy], [cx + d / 2, cy]];
      await send('touchStart', [pts(d0)[0]]); await send('touchStart', pts(d0));
      for (let i = 1; i <= steps; i++) { await send('touchMove', pts(d0 + (d1 - d0) * i / steps)); await sleep(15); }
      await send('touchEnd', [pts(d1)[0]]); await send('touchEnd', []);
    },
    async move(x0, y0, x1, y1, steps = 6) { await send('touchStart', [[x0, y0]]); for (let i = 1; i <= steps; i++) { await send('touchMove', [[x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps]]); await sleep(12); } return () => send('touchEnd', []); },
  };
}

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/index.html?nowelcome`;
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  // ---------------- móvil ----------------
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' });
  await ctx.route(/fonts\./, r => r.abort());
  let p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '&plat=android'); await p.waitForSelector('html.ready'); await sleep(600);
  const cdp = await ctx.newCDPSession(p), tk = touchKit(cdp);
  const ev = (f, a) => p.evaluate(f, a);
  const today = await ev(() => ZC.ui.cal.ymd(new Date()));
  await ev(async d => {
    const S = ZC.store;
    await S.saveEvent({ title: 'Reunión', start: d + 'T10:00', end: d + 'T11:00', calendarId: 'personal' });
    await S.saveEvent({ title: 'Comprar pan', kind: 'task', allDay: true, start: d, end: d, calendarId: 'personal' });
    await S.saveEvent({ title: 'Llamar', kind: 'task', allDay: true, start: d, end: d, calendarId: 'personal' });
  }, today);
  await sleep(300);
  const month = () => ev(() => ZC.ui.app.state.date.getMonth() + ZC.ui.app.state.date.getFullYear() * 12);
  const view = () => ev(() => ZC.ui.app.state.view);

  // deslizar con el periodo de al lado asomando
  let m0 = await month();
  let end = await tk.move(320, 330, 200, 334);
  ok(!!(await p.$('.view.peek')), 'mientras deslizas asoma el mes de al lado');
  await end(); await sleep(150);
  await sleep(500);
  // (el primer gesto se suelta a 120 px, más del 25 %)
  ok((await month()) === m0 + 1, 'deslizar a la izquierda pasa al mes siguiente');
  await tk.drag(60, 330, 330, 334, 10); await sleep(600);
  ok((await month()) === m0, 'deslizar a la derecha vuelve al mes anterior');
  await tk.drag(300, 330, 260, 332, 4); await sleep(600);
  ok((await month()) === m0, 'un deslizamiento corto vuelve a su sitio (muelle)');

  // pellizcar: mes → año → mes
  await tk.pinch(195, 400, 260, 90); await sleep(800);
  ok((await view()) === 'year', 'pellizcar hacia dentro en Mes abre el Año');
  await tk.pinch(195, 400, 80, 280); await sleep(800);
  ok((await view()) === 'month', 'pellizcar hacia fuera en Año vuelve al Mes');

  // plegar: semana ⇄ mes
  await ev(() => ZC.ui.app.go({ view: 'week', date: ZC.ui.cal.today() })); await sleep(700);
  let hd = await (await p.$('.tg-head')).boundingBox();
  await tk.drag(200, hd.y + 30, 200, hd.y + 200, 10); await sleep(800);
  ok((await view()) === 'month', 'arrastrar hacia abajo la cabecera de Semana despliega el Mes');
  let gr = await (await p.$('.mv-grid')).boundingBox();
  await tk.drag(200, gr.y + 220, 200, gr.y + 40, 10); await sleep(800);
  ok((await view()) === 'week', 'arrastrar el mes hacia arriba vuelve a Semana');

  // pellizcar la rejilla horaria
  const hh0 = await ev(() => ZC.ui.gestures.hourZoom());
  await tk.pinch(220, 500, 80, 200); await sleep(600);
  const hh1 = await ev(() => ZC.ui.gestures.hourZoom());
  ok(hh1 > hh0 * 1.3, `pellizcar la rejilla agranda las horas (${hh0.toFixed(2)} → ${hh1.toFixed(2)})`);
  await ev(() => ZC.ui.gestures.setHourZoom(1));

  // filas: completar, borrar y deshacer, posponer
  await ev(() => ZC.ui.app.go({ view: 'agenda', date: ZC.ui.cal.today() })); await sleep(800);
  const rowBox = async t => { const h = await p.$(`.ag-card:has-text("${t}")`); return h && h.boundingBox(); };
  let rb = await rowBox('Comprar pan');
  await tk.drag(rb.x + 40, rb.y + rb.height / 2, rb.x + rb.width * .8, rb.y + rb.height / 2, 10); await sleep(900);
  ok(await ev(() => ZC.store.events().find(e => e.title === 'Comprar pan').done), 'deslizar una tarea a la derecha la completa');
  rb = await rowBox('Reunión');
  await tk.drag(rb.x + rb.width - 20, rb.y + rb.height / 2, rb.x + 10, rb.y + rb.height / 2, 12); await sleep(900);
  ok(!(await ev(() => ZC.store.events().some(e => e.title === 'Reunión'))), 'deslizar del todo a la izquierda borra');
  const undo = await p.$('.toast:has-text("borrado") .toast-act'); if (undo) { await undo.click(); await sleep(500); }
  ok(await ev(() => ZC.store.events().some(e => e.title === 'Reunión')), '…y «Deshacer» lo recupera');
  await sleep(300);
  rb = await rowBox('Llamar');
  await tk.drag(rb.x + rb.width - 20, rb.y + rb.height / 2, rb.x + rb.width - 140, rb.y + rb.height / 2, 8); await sleep(500);
  const post = await p.$('.sw-row .sw-act.post');
  ok(!!post, 'deslizar un poco a la izquierda enseña «Mañana» y «Borrar»');
  if (post) { const pb = await post.boundingBox(); await tk.tap(pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(800); }
  ok(await ev(d => ZC.store.events().find(e => e.title === 'Llamar').start > d, today), '«Mañana» pospone la tarea un día');

  // tirar para sincronizar
  const sc = await (await p.$('.ag-scroll')).boundingBox();
  await ev(() => { document.querySelector('.ag-scroll').scrollTop = 0; });
  await tk.drag(200, sc.y + 30, 200, sc.y + 330, 14); await sleep(900);
  ok(await ev(() => [...document.querySelectorAll('.toast')].some(x => /Al día|Sincronizado/.test(x.textContent))), 'tirar hacia abajo en Agenda sincroniza');

  // doble toque: crear y volver a hoy
  await ev(() => ZC.ui.app.go({ view: 'month', date: ZC.ui.cal.today() })); await sleep(700);
  const cell = await (await p.$('.mc-day:not(.out):not(.today)')).boundingBox();
  await tk.tap(cell.x + cell.width / 2, cell.y + 40); await sleep(120); await tk.tap(cell.x + cell.width / 2, cell.y + 40); await sleep(700);
  ok(!!(await p.$('.ed-panel')), 'doble toque en un día abre el editor');
  await ev(() => ZC.ui.back()); await sleep(500);
  await ev(() => ZC.ui.app.step(2)); await sleep(600);
  const mh = await (await p.$('.mv-head')).boundingBox();
  await tk.tap(mh.x + 100, mh.y + mh.height / 2); await sleep(120); await tk.tap(mh.x + 100, mh.y + mh.height / 2); await sleep(700);
  ok((await month()) === m0, 'doble toque en la cabecera vuelve a hoy');

  // borde izquierdo
  await tk.drag(4, 400, 260, 404, 10); await sleep(600);
  ok(await ev(() => document.getElementById('app').classList.contains('side-on')), 'deslizar desde el borde abre el panel lateral');
  await tk.drag(280, 400, 40, 404, 10); await sleep(600);
  ok(!(await ev(() => document.getElementById('app').classList.contains('side-on'))), 'deslizarlo a la izquierda lo cierra');

  // hoja inferior: arrastrar hacia arriba la expande
  await ev(() => { const e = ZC.store.events().find(x => x.title === 'Reunión'); ZC.ui.editor.detail(ZC.ui.cal.occOf(e)); }); await sleep(700);
  const g = await (await p.$('.layer-sheet .grabber')).boundingBox();
  await tk.drag(195, g.y + 8, 195, g.y - 200, 8); await sleep(600);
  ok(await ev(() => !!document.querySelector('.layer-sheet .panel.expanded')), 'arrastrar la hoja hacia arriba la expande');
  await ev(() => ZC.ui.back()); await sleep(500);

  // visor de imágenes
  await ev(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#c9b8ff'; x.fillRect(0, 0, 400, 300); const blob = await new Promise(r => c.toBlob(r, 'image/png')); const id = await ZC.store.putBlob(blob, { name: 'p.png' }); ZC.ui.lightbox([id], 0); });
  await sleep(700);
  let ib = await (await p.$('.lightbox img')).boundingBox();
  await tk.tap(ib.x + ib.width / 2, ib.y + ib.height / 2); await sleep(90); await tk.tap(ib.x + ib.width / 2, ib.y + ib.height / 2); await sleep(500);
  ok(await ev(() => /scale\(2\.5\)/.test(document.querySelector('.lightbox img').style.transform)), 'doble toque en la foto la amplía');
  await tk.tap(ib.x + ib.width / 2, ib.y + ib.height / 2); await sleep(90); await tk.tap(ib.x + ib.width / 2, ib.y + ib.height / 2); await sleep(500);
  ib = await (await p.$('.lightbox img')).boundingBox();
  await tk.drag(ib.x + ib.width / 2, ib.y + ib.height / 2, ib.x + ib.width / 2, ib.y + ib.height / 2 + 260, 10); await sleep(700);
  ok(!(await p.$('.lightbox')), 'deslizar la foto hacia abajo cierra el visor');

  // apagar un grupo en Ajustes → Gestos
  await ev(() => ZC.ui.settings.open('gestures')); await sleep(600);
  ok(!!(await p.$('[data-gest=swipe]')), 'Ajustes → Gestos existe');
  await tk.tap(...(await (async () => { const bb = await (await p.$('[data-gest=swipe]')).boundingBox(); return [bb.x + bb.width / 2, bb.y + bb.height / 2]; })())); await sleep(400);
  await ev(() => ZC.ui.back()); await sleep(500);
  m0 = await month();
  await tk.drag(320, 330, 80, 334, 10); await sleep(600);
  ok((await month()) === m0, 'con el interruptor apagado, deslizar ya no cambia de mes');
  await ev(() => ZC.store.setPrefs({ cal: { ...ZC.ui.cal.prefsCal(), gestures: {} } }));
  await ctx.close();

  // ---------------- PC ----------------
  ctx = await b.newContext({ viewport: { width: 1366, height: 800 }, locale: 'es-ES' });
  await ctx.route(/fonts\./, r => r.abort());
  p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '&plat=desktop'); await p.waitForSelector('html.ready'); await sleep(600);
  await p.evaluate(async d => { await ZC.store.saveEvent({ title: 'Cita', start: d + 'T12:00', end: d + 'T13:00', calendarId: 'personal' }); }, today);
  await sleep(300);
  const pm = () => p.evaluate(() => ZC.ui.app.state.date.getMonth());
  const m1 = await pm();
  await p.mouse.move(800, 450); await p.keyboard.down('Shift'); await p.mouse.wheel(0, 120); await p.keyboard.up('Shift'); await sleep(600);
  ok((await pm()) !== m1, 'Mayús + rueda cambia de mes');
  await p.mouse.wheel(-120, 0); await sleep(700);
  ok((await pm()) === m1, 'el trackpad horizontal vuelve');
  await p.evaluate(() => ZC.ui.app.go({ view: 'week', date: ZC.ui.cal.today() })); await sleep(700);
  const z0 = await p.evaluate(() => ZC.ui.gestures.hourZoom());
  await p.mouse.move(800, 500); await p.keyboard.down('Control'); await p.mouse.wheel(0, -200); await p.keyboard.up('Control'); await sleep(500);
  ok((await p.evaluate(() => ZC.ui.gestures.hourZoom())) > z0, 'Ctrl + rueda agranda las horas');
  await p.evaluate(() => ZC.ui.gestures.setHourZoom(1)); await sleep(500);
  await p.evaluate(() => { const e = [...document.querySelectorAll('.tg-ev')].find(x => /Cita/.test(x.textContent)); e.scrollIntoView({ block: 'center' }); }); await sleep(200);
  const evb = await (await p.$('.tg-ev:has-text("Cita")')).boundingBox();
  await p.mouse.click(evb.x + 20, evb.y + 10, { button: 'right' }); await sleep(400);
  ok(!!(await p.$('.menu.ctx-menu')), 'clic derecho en un evento abre el menú');
  await p.click('.ctx-colors [data-c="#7ED6C3"]'); await sleep(500);
  ok(await p.evaluate(() => ZC.store.events().find(e => e.title === 'Cita').color === '#7ED6C3'), 'el menú cambia el color');
  const evb2 = await (await p.$('.tg-ev:has-text("Cita")')).boundingBox();
  await p.mouse.click(evb2.x + 20, evb2.y + 10, { button: 'middle' }); await sleep(600);
  ok(!!(await p.$('.ed-panel')), 'clic central abre el editor');
  await p.keyboard.press('Escape'); await sleep(400);
  const col = await (await p.$('.tg-col:nth-child(4)')).boundingBox();
  const scb = await (await p.$('.tg-scroll')).boundingBox();
  await p.mouse.click(col.x + 30, scb.y + 120, { button: 'right' }); await sleep(400);
  ok(await p.evaluate(() => /Nuevo evento a esta hora/.test(document.querySelector('.menu') ? document.querySelector('.menu').textContent : '')), 'clic derecho en un hueco ofrece crear ahí');
  await ctx.close();

  await b.close(); srv.close();
  if (errs.length) { console.log('Errores de página:\n' + errs.join('\n')); fails++; }
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
