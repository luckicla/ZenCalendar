'use strict';
// ZenCalendar · pruebas de interacción (Playwright): crear, mover, estirar, completar, borrar y deshacer, deslizar.
//   node tests/ui/interact.js
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/index.html?nowelcome&plat=desktop`;
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  // ---------- PC ----------
  let ctx = await b.newContext({ viewport: { width: 1366, height: 800 }, locale: 'es-ES' });
  await ctx.route(/fonts\./, r => r.abort());
  let p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(base); await p.waitForSelector('html.ready'); await p.waitForTimeout(600);
  // añadir rápido
  await p.click('#qaIn'); await p.keyboard.type('Dentista mañana a las 17:00'); await p.waitForTimeout(300);
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => ZC.store.events().some(e => /dentista/i.test(e.title))), 'añadir rápido crea el evento');
  // vista semana: arrastrar en vacío para crear
  await p.keyboard.press('Escape');
  await p.evaluate(() => ZC.ui.app.go({ view: 'week', date: ZC.ui.cal.today() })); await p.waitForTimeout(700);
  const col = await p.$('.tg-col:nth-child(3)'); const bb = await col.boundingBox();
  const sc = await p.$('.tg-scroll'); const sb = await sc.boundingBox();
  await p.mouse.move(bb.x + 20, sb.y + 60); await p.mouse.down(); await p.mouse.move(bb.x + 20, sb.y + 140, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(500);
  ok(!!(await p.$('.ed-panel')), 'arrastrar en vacío abre el editor');
  await p.fill('.ed-tin', 'Bloque de prueba'); await p.click('[data-act=save]'); await p.waitForTimeout(600);
  const ev = await p.evaluate(() => ZC.store.events().find(e => e.title === 'Bloque de prueba'));
  ok(ev && ev.start && ev.end > ev.start, 'el editor guarda el evento creado arrastrando');
  // mover arrastrando
  await p.waitForTimeout(400);
  let el = await p.$(`.tg-ev[data-key^="${ev.id}"]`); let eb = await el.boundingBox();
  await p.mouse.move(eb.x + 10, eb.y + 8); await p.mouse.down(); await p.mouse.move(eb.x + 10, eb.y + 60, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(600);
  const ev2 = await p.evaluate(id => ZC.store.get(id), ev.id);
  ok(ev2.start > ev.start, 'arrastrar un evento lo mueve (' + ev.start + ' → ' + ev2.start + ')');
  // estirar
  el = await p.$(`.tg-ev[data-key^="${ev.id}"] .rz`); eb = await el.boundingBox();
  await p.mouse.move(eb.x + eb.width / 2, eb.y + 4); await p.mouse.down(); await p.mouse.move(eb.x + eb.width / 2, eb.y + 60, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(600);
  const ev3 = await p.evaluate(id => ZC.store.get(id), ev.id);
  ok(ev3.end > ev2.end, 'estirar cambia la duración (' + ev2.end + ' → ' + ev3.end + ')');
  // borrar y deshacer
  await p.evaluate(id => ZC.ui.editor.detail(ZC.ui.cal.occOf(ZC.store.get(id))), ev.id); await p.waitForTimeout(400);
  await p.click('.dt [data-act=delete]'); await p.waitForTimeout(400);
  ok(!(await p.evaluate(id => ZC.store.events().some(e => e.id === id), ev.id)), 'borrar desde el detalle');
  await p.click('.toast-act'); await p.waitForTimeout(400);
  ok(await p.evaluate(id => ZC.store.events().some(e => e.id === id), ev.id), 'deshacer recupera el evento');
  // tarea: completar
  await p.evaluate(() => ZC.store.saveEvent({ kind: 'task', title: 'Tarea X', allDay: true, start: ZC.ui.cal.ymd(new Date()), end: ZC.ui.cal.ymd(new Date()) })); await p.waitForTimeout(300);
  await p.click('#sideTasks .task-row:has-text("Tarea X") .tick'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => ZC.store.events().find(e => e.title === 'Tarea X').done), 'marcar una tarea como hecha');
  // atajos
  await p.keyboard.press('m'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => ZC.ui.app.state.view === 'month'), 'atajo M → mes');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => ZC.ui.app.state.date.getMonth() !== new Date().getMonth()), 'flecha → mes siguiente');
  await p.keyboard.press('t'); await p.waitForTimeout(400);
  await p.keyboard.press('Control+k'); await p.waitForTimeout(500);
  ok(!!(await p.$('.ai-panel')), 'Ctrl+K abre el asistente');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // ajustes: cambiar tema y que se guarde
  await p.evaluate(() => ZC.ui.settings.open('look')); await p.waitForTimeout(400);
  await p.click('.tcard[data-v=menta]'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => ZC.store.getPrefs().look.theme === 'menta'), 'elegir tema se guarda en prefs.look');
  await p.evaluate(() => ZC.ui.settings.open('cal')); await p.waitForTimeout(400);
  await p.click('[data-k="cal.lang"] [data-v=en]'); await p.waitForTimeout(600);
  ok(await p.evaluate(() => document.querySelector('#btnToday .txt').textContent === 'Today'), 'cambiar idioma a inglés');
  await p.click('[data-k="cal.lang"] [data-v=es]'); await p.waitForTimeout(400);
  await ctx.close();
  // ---------- móvil: deslizar ----------
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES' });
  await ctx.route(/fonts\./, r => r.abort());
  p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(base.replace('plat=desktop', 'plat=android')); await p.waitForSelector('html.ready'); await p.waitForTimeout(600);
  const m0 = await p.evaluate(() => ZC.ui.app.state.date.getMonth());
  const cdp = await ctx.newCDPSession(p);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', 320, 400); for (let i = 1; i <= 8; i++) await touch('touchMove', 320 - i * 30, 402); await touch('touchEnd');
  await p.waitForTimeout(700);
  ok(await p.evaluate(m => ZC.ui.app.state.date.getMonth() !== m, m0), 'deslizar cambia de mes en el móvil');
  // mantener pulsado un día crea
  const cell = await p.$('.mc-day:not(.out)'); const cb = await cell.boundingBox();
  await touch('touchStart', cb.x + 20, cb.y + 30); await p.waitForTimeout(650); await touch('touchEnd'); await p.waitForTimeout(600);
  ok(!!(await p.$('.ed-panel')), 'mantener pulsado un día abre el editor');
  await ctx.close();
  await b.close(); srv.close();
  if (errs.length) { console.log('Errores de página:\n' + errs.join('\n')); fails++; }
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
