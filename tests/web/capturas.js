'use strict';
// ZenCalendar · capturas REALES de la app para la web (docs/capturas/), sin maquetas.
//   node tests/web/capturas.js
// Abre la app de verdad (web/) con una semana de ejemplo creíble (relativa a hoy), en Zen y en Dot,
// y guarda pc-semana (1920×1248), movil-mes y movil-agenda (900×1900) en webp, y apunta los
// nombres en docs/capturas/capturas.json para que la web las enseñe en «Así se ve».
const path = require('path'), fs = require('fs'), http = require('http'), { execFileSync } = require('child_process');
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const OUT = path.resolve(__dirname, '../../docs/capturas');
const PORT = +process.env.PORT || 8931;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); }); });

// la semana de ejemplo (días relativos al lunes de esta semana)
async function seed(page) {
  await page.evaluate(async () => {
    const C = ZC.ui.cal, mon = C.sow(C.today()), d = n => C.ymd(C.addDays(mon, n));
    const E = (title, day, a, b, cal, extra = {}) => ZC.store.saveEvent({ title, start: d(day) + 'T' + a, end: d(day) + 'T' + b, calendarId: cal, ...extra });
    await E('Reunión de equipo', 0, '09:30', '10:30', 'work', { location: 'Sala 2' });
    await E('Gimnasio', 0, '19:00', '20:00', 'personal', { emoji: '🏋️', rrule: { freq: 'weekly', interval: 1, byDay: ['MO', 'WE'] } });
    await E('Comida con Ana', 1, '14:00', '15:30', 'personal', { emoji: '🍝', location: 'La Pepita' });
    await E('Revisión del proyecto', 1, '10:00', '11:30', 'work');
    await E('Dentista', 2, '17:00', '17:45', 'personal', { emoji: '🦷', reminders: [60] });
    await E('Clase de inglés', 3, '18:30', '20:00', 'personal', { emoji: '📚' });
    await E('Llamada con el cliente', 3, '11:00', '11:30', 'work');
    await E('Entrega del diseño', 4, '12:00', '13:00', 'work', { alarm: true });
    await E('Cine', 4, '21:00', '23:00', 'personal', { emoji: '🎬' });
    await E('Mercado', 5, '10:30', '11:30', 'personal', { emoji: '🧺' });
    await E('Brunch con los primos', 6, '11:30', '13:30', 'personal', { emoji: '🥞' });
    await ZC.store.saveEvent({ title: 'Cumpleaños de Laura', allDay: true, start: d(3), end: d(3), calendarId: 'birthdays', emoji: '🎂' });
    await ZC.store.saveEvent({ title: 'Viaje a Lisboa', allDay: true, start: d(12), end: d(15), calendarId: 'personal', emoji: '✈️' });
    await E('Concierto', 9, '21:30', '23:30', 'personal', { emoji: '🎸' });
    await E('Reunión trimestral', 15, '10:00', '12:00', 'work');
    await E('Cena de antiguos alumnos', -5, '21:00', '23:30', 'personal');
    await ZC.store.saveEvent({ kind: 'task', title: 'Comprar flores', allDay: true, start: d(1), end: d(1), calendarId: 'personal' });
    await ZC.store.saveEvent({ kind: 'task', title: 'Pagar el alquiler', allDay: true, start: d(2), end: d(2), calendarId: 'personal' });
  });
}

(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const map = JSON.parse(fs.readFileSync(path.join(OUT, 'capturas.json'), 'utf8'));
  const errs = [];
  async function shot(name, design, ctxOpts, view) {
    const c = await b.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', colorScheme: 'light', ...ctxOpts });
    await c.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(`[${name}] ${e.message}`));
    await p.goto(`http://127.0.0.1:${PORT}/index.html?nowelcome`); await p.waitForSelector('html.ready');
    await p.evaluate(dd => { ZC.store.local('welcomed', true); ZC.store.local('dotIconAsked', true); ZC.ui.look.set({ design: dd, scheme: 'light' }); }, design);
    await seed(p);
    await p.evaluate(v => ZC.ui.app.go({ view: v, date: ZC.ui.cal.today(), sel: ZC.ui.cal.today() }), view);
    await p.waitForTimeout(900);
    if (view === 'week') await p.evaluate(() => { const sc = document.querySelector('#viewHost .view:last-child .tg-scroll'); if (sc) sc.scrollTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hh')) * 8.6; });
    await p.waitForTimeout(700);
    const png = path.join('/tmp', name + '.png'), webp = path.join(OUT, name + '.webp');
    await p.screenshot({ path: png });
    execFileSync('convert', [png, '-quality', '82', '-define', 'webp:method=6', webp]);
    map[name] = name + '.webp';
    console.log('  ' + name + ' → ' + path.relative(process.cwd(), webp) + ` (${Math.round(fs.statSync(webp).size / 1024)} KB)`);
    await c.close();
  }
  const pc = { viewport: { width: 1440, height: 936 }, deviceScaleFactor: 1920 / 1440 };
  const phone = { viewport: { width: 360, height: 760 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent };
  for (const [design, suf] of [['zen', ''], ['dot', '-dot']]) {
    await shot('pc-semana' + suf, design, pc, 'week');
    await shot('movil-mes' + suf, design, phone, 'month');
    await shot('movil-agenda' + suf, design, phone, 'agenda');
  }
  fs.writeFileSync(path.join(OUT, 'capturas.json'), JSON.stringify(map, null, 2) + '\n');
  await b.close(); srv.close();
  if (errs.length) { console.error('Errores:\n  ' + errs.join('\n  ')); process.exit(1); }
  console.log('Hecho: docs/capturas/capturas.json actualizado.');
})().catch(e => { console.error(e); process.exit(1); });
