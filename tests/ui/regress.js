'use strict';
// ZenCalendar · pruebas de regresión de la revisión de errores (Playwright).
//   node tests/ui/regress.js
// Cada prueba es un fallo que hubo: series al arrastrar y deshacer, horario de verano, tareas que se repiten,
// Notificaciones, «Personalizado…», el asistente con dos vistas previas, XSS, agenda casi vacía e idioma.
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/index.html?nowelcome`;
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1366, height: 800 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  await ctx.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
  const p = await ctx.newPage();
  // (fechas fijas: los casos usan noviembre de 2026 y no deben depender de qué día es hoy)
  await p.clock.install({ time: new Date('2026-11-10T09:00:00') });
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => { errs.push('diálogo inesperado: ' + d.message()); d.dismiss(); });
  await p.goto(base); await p.waitForSelector('html.ready'); await p.waitForTimeout(500);
  const wipe = () => p.evaluate(async () => { for (const e of ZC.store.events()) await ZC.store.deleteEvent(e.id); });
  const lastToastUndo = () => p.click('#toasts .toast:last-child .toast-act');
  // arrastra la aparición `key` en la vista Semana a la columna del día `toDay` (misma altura)
  async function dragTo(key, toDay, dy = 0) {
    const el = await p.$(`.tg-ev[data-key="${key}"]`); await el.scrollIntoViewIfNeeded();
    const bb = await el.boundingBox(), col = await (await p.$(`.tg-col[data-d="${toDay}"]`)).boundingBox();
    await p.mouse.move(bb.x + 10, bb.y + 6); await p.mouse.down();
    await p.mouse.move(col.x + 20, bb.y + 6 + dy, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(400);
  }
  const occ = (a, z) => p.evaluate(([a, z]) => ZC.store.occurrences(ZC.ui.cal.parse(a), ZC.ui.cal.parse(z)).map(o => o.date + ' ' + o.start.toTimeString().slice(0, 5) + ' ' + o.ev.title), [a, z]);

  // 1) mover una serie semanal a otro día con «Todos» cambia también su día de la semana
  let id = await p.evaluate(async () => (await ZC.store.saveEvent({ title: 'Yoga', start: '2026-11-02T10:00', end: '2026-11-02T11:00', rrule: { freq: 'weekly', byDay: ['MO'] } })).id);
  await p.evaluate(() => ZC.ui.app.go({ view: 'week', date: new Date(2026, 10, 23) })); await p.waitForTimeout(500);
  await dragTo(`${id}@2026-11-23`, '2026-11-24');
  await p.click('.dlg-choices [data-v="all"]'); await p.waitForTimeout(500);
  ok(JSON.stringify(await occ('2026-11-23', '2026-11-30')) === JSON.stringify(['2026-11-24 10:00 Yoga']), 'serie semanal arrastrada a otro día con «Todos» se va a ese día');

  // 2) deshacer «solo este» no deja la copia suelta duplicada
  await wipe();
  id = await p.evaluate(async () => (await ZC.store.saveEvent({ title: 'Yoga', start: '2026-11-02T10:00', end: '2026-11-02T11:00', rrule: { freq: 'weekly', byDay: ['MO'] } })).id);
  await p.waitForTimeout(300);
  await dragTo(`${id}@2026-11-23`, '2026-11-25');
  await p.click('.dlg-choices [data-v="one"]'); await p.waitForTimeout(500);
  ok((await occ('2026-11-23', '2026-11-30')).join() === '2026-11-25 10:00 Yoga', '«solo este» mueve solo esa aparición');
  await lastToastUndo(); await p.waitForTimeout(500);
  ok((await occ('2026-11-23', '2026-11-30')).join() === '2026-11-23 10:00 Yoga', 'deshacer «solo este» deja la serie como estaba (sin copia suelta)');

  // 3) mover toda la serie un día cruzando el cambio de hora no cambia la hora
  await wipe();
  id = await p.evaluate(async () => (await ZC.store.saveEvent({ title: 'Pastilla', start: '2026-03-20T10:00', end: '2026-03-20T10:30', rrule: { freq: 'daily' } })).id);
  await p.evaluate(() => ZC.ui.app.go({ view: 'week', date: new Date(2026, 2, 23) })); await p.waitForTimeout(500);
  await dragTo(`${id}@2026-03-28`, '2026-03-29');
  await p.click('.dlg-choices [data-v="all"]'); await p.waitForTimeout(500);
  ok((await p.evaluate(i => ZC.store.get(i).start, id)) === '2026-03-21T10:00', 'mover toda la serie a través del horario de verano conserva las 10:00');

  // 4) «este y los siguientes» respeta lo que queda de `count`
  await wipe();
  id = await p.evaluate(async () => (await ZC.store.saveEvent({ title: 'Clase', start: '2026-11-02T18:00', end: '2026-11-02T19:00', rrule: { freq: 'weekly', byDay: ['MO'], count: 6 } })).id);
  await p.evaluate(() => ZC.ui.app.go({ view: 'week', date: new Date(2026, 10, 16) })); await p.waitForTimeout(500);
  await dragTo(`${id}@2026-11-16`, '2026-11-16', 52);
  await p.click('.dlg-choices [data-v="future"]'); await p.waitForTimeout(500);
  ok((await occ('2026-11-01', '2027-02-01')).length === 6, '«este y los siguientes» no alarga una serie de 6 veces');

  // 5) tareas que se repiten: salen con la aparición de hoy y al marcarla pasa a la siguiente
  await wipe();
  await p.evaluate(async () => { const C = ZC.ui.cal; await ZC.store.saveEvent({ kind: 'task', title: 'Regar', allDay: true, start: C.ymd(C.addDays(C.today(), -20)), rrule: { freq: 'daily' } }); });
  await p.evaluate(() => ZC.ui.app.go({ view: 'tasks' })); await p.waitForTimeout(500);
  const tdy = await p.evaluate(() => ZC.ui.cal.ymd(new Date()));
  ok(await p.evaluate(d => !!document.querySelector(`.v-tasks .task-row[data-key$="@${d}"]`), tdy), 'una tarea diaria sale con la aparición de hoy (no la del primer día)');
  await p.click('.v-tasks .task-row .tick'); await p.waitForTimeout(500);
  const tmw = await p.evaluate(() => ZC.ui.cal.ymd(ZC.ui.cal.addDays(new Date(), 1)));
  ok(await p.evaluate(d => !!document.querySelector(`.v-tasks .task-row[data-key$="@${d}"]`), tmw), 'al marcarla pasa a la de mañana');

  // 6) Notificaciones: los próximos avisos llevan su evento (antes salían «Sin título»)
  await p.evaluate(async () => { await ZC.store.saveEvent({ title: 'Dentista', start: ZC.ui.cal.ymd(ZC.ui.cal.addDays(new Date(), 1)) + 'T17:00', reminders: [10] }); });
  await p.evaluate(() => ZC.ui.settings.open('notif')); await p.waitForTimeout(400);
  const nr = await p.$$eval('.next-rem .nr b', e => e.map(x => x.textContent));
  ok(nr.length && !nr.includes('Sin título') && nr.includes('Dentista'), 'Notificaciones enseña los títulos de los próximos avisos');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 7) «Personalizado…» abre su panel aunque la regla coincida con un preset
  await p.evaluate(() => ZC.ui.editor.open({ date: new Date(2026, 11, 1) })); await p.waitForTimeout(400);
  await p.selectOption('.ed-panel select[name=repeat]', 'custom'); await p.waitForTimeout(200);
  ok(await p.$eval('.ed-custom', e => !e.hidden), 'elegir «Personalizado…» enseña las opciones');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  // 8) XSS: nombres de calendario y colores raros no se ejecutan
  await p.evaluate(async () => {
    await ZC.store.saveCalendar({ name: '"><img src=x onerror=alert("cal")>', color: '#ff0000' });
    await ZC.store.saveEvent({ title: '<img src=x onerror=alert("ev")>', color: '#fff" onmouseover="alert(3)', start: ZC.ui.cal.ymd(new Date()) + 'T15:00' });
  });
  for (const v of ['month', 'week', 'agenda']) { await p.evaluate(v => ZC.ui.app.go({ view: v, date: new Date() }), v); await p.waitForTimeout(400); }
  ok(await p.evaluate(() => ![...document.querySelectorAll('img')].some(i => i.getAttribute('src') === 'x') && !document.querySelector('[onmouseover]')), 'sin HTML inyectado por nombres o colores');

  // 9) agenda casi vacía: carga sola hasta encontrar lo que hay lejos
  await wipe();
  await p.evaluate(async () => { const C = ZC.ui.cal; await ZC.store.saveEvent({ title: 'Lejos', start: C.ymd(C.addDays(C.today(), 150)) + 'T10:00' }); });
  await p.evaluate(() => ZC.ui.app.go({ view: 'agenda', date: new Date() })); await p.waitForTimeout(1000);
  ok(await p.evaluate(() => [...document.querySelectorAll('.v-agenda .ag-card b')].some(b => /Lejos/.test(b.textContent))), 'la agenda infinita no se para con pocos eventos');

  // 10) asistente: con dos vistas previas, quitar una acción quita la de su mensaje
  await p.route('https://api.openai.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"reply":"ok","actions":[{"type":"create","event":{"title":"Cena","start":"2026-12-04T21:00"}}]}' } }] }) }));
  await p.evaluate(() => { ZC.ai.setConfig({ provider: 'openai' }); ZC.ai.setKey('openai', 'sk-test'); ZC.ui.aipanel.open(); }); await p.waitForTimeout(300);
  for (const s of ['uno', 'dos']) { await p.fill('.ai-panel textarea', s); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }
  let msgs = await p.$$('.msg.ai');
  await (await msgs[msgs.length - 2].$('[data-tog]')).click(); await p.waitForTimeout(200);
  msgs = await p.$$('.msg.ai');
  ok((await msgs[msgs.length - 2].$$('.ai-act.off')).length === 1 && (await msgs[msgs.length - 1].$$('.ai-act.off')).length === 0, 'quitar una acción en la vista previa vieja no toca la nueva');
  await p.evaluate(() => ZC.ai.setConfig({ provider: 'rules' }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // 11) cambiar de idioma traduce también la barra de añadir rápido
  await p.evaluate(() => ZC.ui.app.go({ view: 'month' })); await p.waitForTimeout(300);
  await p.evaluate(async () => { await ZC.store.setPrefs({ cal: { ...ZC.ui.prefsCal(), lang: 'en' } }); }); await p.waitForTimeout(600);
  ok(!/Añade/.test(await p.$eval('#qaIn', e => e.placeholder)), 'la barra de añadir rápido cambia de idioma');
  await p.evaluate(async () => { await ZC.store.setPrefs({ cal: { ...ZC.ui.prefsCal(), lang: 'es' } }); }); await p.waitForTimeout(400);

  // 12) móvil: mantener pulsado un evento del mes y arrastrarlo a otro día (aunque se suelte encima de otra barra)
  const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  await mctx.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
  const m = await mctx.newPage(); m.on('pageerror', e => errs.push(e.message));
  await m.goto(base.replace('nowelcome', 'nowelcome&plat=android')); await m.waitForSelector('html.ready'); await m.waitForTimeout(500);
  const cdp = await mctx.newCDPSession(m);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const mid = await m.evaluate(async () => { const C = ZC.ui.cal, d = C.ymd(new Date()), d2 = C.ymd(C.addDays(new Date(), 1)); await ZC.store.saveEvent({ title: 'Otro', start: d2 + 'T09:00' }); return (await ZC.store.saveEvent({ title: 'Mover', start: d + 'T12:00' })).id; });
  await m.waitForTimeout(400);
  const bar = await (await m.$(`.mv-ev[data-key^="${mid}@"]`)).boundingBox();
  const to = await m.evaluate(() => { const r = [...document.querySelectorAll('.mv-ev')].find(x => /Otro/.test(x.textContent)).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await touch('touchStart', bar.x + bar.width / 2, bar.y + bar.height / 2); await m.waitForTimeout(550);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', bar.x + bar.width / 2 + (to[0] - bar.x - bar.width / 2) * i / 10, bar.y + bar.height / 2 + (to[1] - bar.y - bar.height / 2) * i / 10); await m.waitForTimeout(16); }
  await touch('touchEnd'); await m.waitForTimeout(700);
  ok(await m.evaluate(i => ZC.store.get(i).start === ZC.ui.cal.ymd(ZC.ui.cal.addDays(new Date(), 1)) + 'T12:00', mid), 'móvil: arrastrar un evento del mes a otro día');
  await mctx.close();

  await b.close(); srv.close();
  if (errs.length) { console.log('Errores de página:\n' + errs.join('\n')); fails++; }
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
