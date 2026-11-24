'use strict';
// ZenCalendar · capturas REALES de la app para la web (docs/capturas/), sin maquetas.
//   node tests/web/capturas.js
// Abre la app de verdad (web/) con una semana de ejemplo creíble (relativa a hoy), en Zen y en Dot,
// y guarda pc-semana (1920×1248), movil-mes y movil-agenda (900×1900) en webp, y apunta los
// nombres en docs/capturas/capturas.json para que la web las enseñe en «Así se ve».
// También pc-workspace y movil-workspace (y sus -dot): un workspace de ejemplo, «Cenas de los viernes», con el
// Firebase simulado de la app (ZC.ws._mock) y tres personas, para la sección «Workspaces».
// En todas, «Mi calendario» lleva una foto de Google de ejemplo (un dibujo, no una persona de verdad).
//   ONLY=workspace node tests/web/capturas.js   → solo las de workspace
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

// la «foto de Google» de ejemplo: un dibujo sencillo (no es una persona de verdad)
const AV = (bg, fg, skin) => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="40" r="17" fill="${skin}"/><path d="M14 96c4-20 18-30 34-30s30 10 34 30z" fill="${fg}"/><path d="M31 37c0-12 8-19 17-19s18 6 18 18c-5-5-12-7-19-6-6 1-11 3-16 7z" fill="#3B2C2C"/></svg>`).toString('base64');
const PEOPLE = [
  { uid: 'u-lluc', name: 'Lluc', email: 'lluc@example.com', photo: AV('#CFC4FF', '#6F5BD8', '#F2C9A8') },
  { uid: 'u-ana', name: 'Ana', email: 'ana@example.com', photo: AV('#FFD3E6', '#D9609F', '#E9B48F') },
  { uid: 'u-bea', name: 'Bea', email: 'bea@example.com', photo: AV('#C9EFE3', '#3E9C80', '#C98E6B') },
];
// «Mi calendario» con la foto de Google (la de Drive)
async function googleMe(page) {
  await page.evaluate(me => {
    const st = ZC.drive.state;
    ZC.drive.state = () => Object.assign({}, st.call(ZC.drive), { connected: true, name: me.name, email: me.email, photo: me.photo });
  }, PEOPLE[0]);
}
// el workspace de ejemplo: «Cenas de los viernes», con Ana y Bea, sus planes y alguna tarea para alguien
async function seedWs(page, design, enter) {
  await page.evaluate(async ([people, design, enter]) => {
    const fb = await ZC.ws._mock({ users: people, me: 'u-lluc', signedIn: true });
    const w = await ZC.ws.create({ name: 'Cenas de los viernes', color: design === 'dot' ? '#D71921' : '#FF9CCB', icon: 'comida', bg: design === 'dot' ? { kind: 'none', value: '' } : { kind: 'anim', value: 'sakura' } });
    const tok = ZC.ws.parseCode(ZC.ws.inviteLink(w.id)).token;
    await fb.client('u-ana').join(w.id + '.' + tok);
    await fb.client('u-bea').join(w.id + '.' + tok);
    await new Promise(r => setTimeout(r, 150));
    const C = ZC.ui.cal, mon = C.sow(C.today()), d = n => C.ymd(C.addDays(mon, n));
    const put = async (who, id, o) => { const c = fb.client(who); await c.set('workspaces/' + w.id + '/items/' + id, Object.assign({ id, kind: 'event', allDay: false, notes: '', location: '', reminders: [], createdBy: who, updatedBy: who, assignee: null, deleted: false, updated: c.F.serverTimestamp() }, o)); };
    await put('u-ana', 'c1', { title: 'Cena en casa de Ana', start: d(4) + 'T21:00', end: d(4) + 'T23:30', location: 'Casa de Ana' });
    await put('u-bea', 'c2', { title: 'Pizzas y peli', start: d(11) + 'T21:00', end: d(11) + 'T23:30' });
    await put('u-lluc', 'c3', { title: 'Japonés', start: d(-3) + 'T21:30', end: d(-3) + 'T23:30', location: 'Kibo' });
    await put('u-ana', 't1', { kind: 'task', allDay: true, title: 'Comprar el vino', start: d(4), end: d(4), assignee: 'u-lluc' });
    await put('u-lluc', 't2', { kind: 'task', allDay: true, title: 'Llevar el postre', start: d(4), end: d(4), assignee: 'u-bea' });
    await put('u-bea', 't3', { kind: 'task', allDay: true, title: 'Reservar mesa', start: d(18), end: d(18), assignee: 'u-ana' });
    await put('u-bea', 'c5', { title: 'Vermut', start: d(5) + 'T13:00', end: d(5) + 'T14:30', location: 'Bar Pinocho' });
    await put('u-ana', 'c4', { title: 'Cumple de Bea', start: d(18) + 'T21:00', end: d(18) + 'T23:59', location: 'La Pepita' });
    await new Promise(r => setTimeout(r, 200));
    if (enter) await ZC.ws.switchTo(w.id);
  }, [PEOPLE, design, enter]);
}

(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const map = JSON.parse(fs.readFileSync(path.join(OUT, 'capturas.json'), 'utf8'));
  const errs = [];
  async function shot(name, design, ctxOpts, view, ws = false) {
    const c = await b.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', colorScheme: 'light', ...ctxOpts });
    await c.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(`[${name}] ${e.message}`));
    await p.goto(`http://127.0.0.1:${PORT}/index.html?nowelcome`); await p.waitForSelector('html.ready');
    await p.evaluate(dd => { ZC.store.local('welcomed', true); ZC.store.local('dotIconAsked', true); ZC.ui.look.set({ design: dd, scheme: 'light' }); }, design);
    await seed(p);
    await googleMe(p);
    await seedWs(p, design, ws);   // en todas: así «Mi calendario» sale con su foto y el workspace en el selector
    await p.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove()));
    // en el workspace, el móvil enseña el viernes de la cena (con sus tareas «Para ti» / «Para: Bea»)
    await p.evaluate(([v, ws]) => { const C = ZC.ui.cal, fri = C.addDays(C.sow(C.today()), 4); ZC.ui.app.go({ view: v, date: C.today(), sel: ws && v === 'month' ? fri : C.today() }); }, [view, ws]);
    await p.waitForTimeout(900);
    if (view === 'week') await p.evaluate(h => { const sc = document.querySelector('#viewHost .view:last-child .tg-scroll'); if (sc) sc.scrollTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hh')) * h; }, ws ? 12.4 : 8.6);
    await p.waitForTimeout(700);
    await p.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove()));
    const png = path.join('/tmp', name + '.png'), webp = path.join(OUT, name + '.webp');
    await p.screenshot({ path: png });
    execFileSync('convert', [png, '-quality', '82', '-define', 'webp:method=6', webp]);
    map[name] = name + '.webp';
    console.log('  ' + name + ' → ' + path.relative(process.cwd(), webp) + ` (${Math.round(fs.statSync(webp).size / 1024)} KB)`);
    await c.close();
  }
  const pc = { viewport: { width: 1440, height: 936 }, deviceScaleFactor: 1920 / 1440 };
  const phone = { viewport: { width: 360, height: 760 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent };
  const only = process.env.ONLY || '';
  for (const [design, suf] of [['zen', ''], ['dot', '-dot']]) {
    if (!only || only === 'base') {
      await shot('pc-semana' + suf, design, pc, 'week');
      await shot('movil-mes' + suf, design, phone, 'month');
      await shot('movil-agenda' + suf, design, phone, 'agenda');
    }
    if (!only || only === 'workspace') {
      await shot('pc-workspace' + suf, design, pc, 'week', true);
      await shot('movil-workspace' + suf, design, phone, 'month', true);
    }
  }
  fs.writeFileSync(path.join(OUT, 'capturas.json'), JSON.stringify(map, null, 2) + '\n');
  await b.close(); srv.close();
  if (errs.length) { console.error('Errores:\n  ' + errs.join('\n  ')); process.exit(1); }
  console.log('Hecho: docs/capturas/capturas.json actualizado.');
})().catch(e => { console.error(e); process.exit(1); });
