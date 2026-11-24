'use strict';
// ZenCalendar · Google Calendar con varias cuentas en la interfaz (Playwright, puerto 8951).
//   node tests/ui/gcal.js            (SHOTS=0 para no guardar capturas)
// Con ZC.gcal simulado: varias cuentas, una con error, calendarios de solo lectura, una cuenta conectada en «el otro
// dispositivo». Comprueba Ajustes → Cuentas de Google, el panel lateral agrupado, el editor, los eventos de solo lectura,
// la bienvenida («¿Traer también tus calendarios?») y el aviso; y que sin ZC.gcal (o con available() false) no sale nada.
// En Zen y Dot, claro y oscuro, ES/CA/EN, móvil 360 px y PC, sin errores en la consola y sin desbordes.
// Si existe web/js/core/gcal.js con modo simulado se usa el simulador de aquí igualmente (la prueba es de la interfaz).
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const OUT = path.resolve(__dirname, 'out');
const PORT = +process.env.PORT || 8951;
const SHOTS = process.env.SHOTS !== '0';
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff': 'font/woff' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };

// ---------- simulador de ZC.gcal (se inyecta antes que nada) ----------
function mockGcal(opts) {
  const ZC = window.ZC = window.ZC || {};
  if (opts.none) return;
  const calls = window.__gc = [];
  const ls = new Set();
  const A = (id, email, name, color, cals, extra) => Object.assign({ id, email, name, photo: '', color, calendars: cals, lastSync: Date.now() - 120000, error: null }, extra || {});
  let accs = [
    A('a1', 'ana@example.com', 'Ana', '#4285F4', [
      { gid: 'primary', name: 'Ana', color: '#7986CB', primary: true, accessRole: 'owner', enabled: true },
      { gid: 'equipo', name: 'Equipo de fútbol', color: '#33B679', accessRole: 'reader', enabled: true },
      { gid: 'festes', name: 'Festivos en España', color: '#F6BF26', accessRole: 'reader', enabled: false },
    ]),
    A('a2', 'taller@example.com', 'Taller', '#E67C73', [
      { gid: 'primary', name: 'Taller', color: '#E67C73', primary: true, accessRole: 'owner', enabled: true },
    ], { error: 'La sesión de Google ha caducado', reauth: true }),
  ];
  let sugg = [{ email: 'casa@example.com', name: 'Casa' }];
  const emit = () => ls.forEach(f => { try { f({ accounts: accs }); } catch (e) { console.error(e); } });
  const S = () => ZC.store;
  // (como el núcleo de verdad: lo de Google entra por store._gwrite y no pasa por saveEvent/saveCalendar)
  const W = w => S()._gwrite ? S()._gwrite(w) : null;
  async function materialize() {
    const want = new Map();
    for (const a of accs) for (const c of a.calendars) if (c.enabled) want.set(`g:${a.id}:${c.gid}`, { a, c });
    const gone = S().calendars().filter(cal => cal.source === 'google' && !want.has(cal.id)).map(c => c.id);
    const add = [...want].filter(([id]) => !S().calendar(id)).map(([id, { a, c }]) => ({ id, name: c.name, color: c.color, visible: true, deleted: false, updated: Date.now(), source: 'google', accountId: a.id, gid: c.gid, gkey: c.gid, accessRole: c.accessRole, readOnly: c.accessRole === 'reader', order: 50 }));
    if (S()._gwrite) await W({ calendars: add, purgeCalendars: gone, purgeEvents: S()._rawEvents().filter(e => gone.includes(e.calendarId)).map(e => e.id) });
    else { for (const id of gone) await S().deleteCalendar(id); for (const c of add) await S().saveCalendar(c); }
  }
  window.__gcSeed = async () => {
    await materialize();
    const d = new Date(), p = n => String(n).padStart(2, '0'), day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const E = (id, title, calendarId, h0, h1, x) => Object.assign({ id, source: 'google', accountId: 'a1', gid: calendarId.split(':')[2], kind: 'event', title, notes: '', location: '', calendarId, color: null, emoji: null, allDay: false, start: day + 'T' + h0, end: day + 'T' + h1, rrule: null, exdates: [], recurrenceOf: null, reminders: [], attachments: [], checklist: [], done: false, doneAt: null, alarm: false, alarmTime: null, created: Date.now(), updated: Date.now(), deleted: false }, x || {});
    const evs = [E('g:a1:equipo:ro1', 'Partido (solo lectura)', 'g:a1:equipo', '11:00', '12:30', { readOnly: true, htmlLink: 'https://calendar.google.com/calendar/event?eid=x' }), E('g:a1:primary:rw1', 'Comida con Ana', 'g:a1:primary', '14:00', '15:00')];
    if (S()._gwrite) await W({ events: evs }); else for (const e of evs) await S().saveEvent(e);
  };
  window.__gcSugg = v => { sugg = v; emit(); };
  ZC.gcal = {
    available: () => !opts.unavailable,
    accounts: () => JSON.parse(JSON.stringify(accs)),
    suggested: () => sugg.slice(),
    async addAccount(o) {
      calls.push(['add', o || null]);
      await new Promise(r => setTimeout(r, 150));
      const email = (o && o.email) || 'nuevo@example.com';
      let a = accs.find(x => x.email === email);
      if (a) { a.error = null; a.lastSync = Date.now(); }
      else { a = A('a' + (accs.length + 1) + Math.random().toString(36).slice(2, 5), email, email.split('@')[0], '#8E24AA', [{ gid: 'primary', name: email.split('@')[0], color: '#8E24AA', primary: true, accessRole: 'owner', enabled: true }]); accs.push(a); }
      sugg = sugg.filter(s => s.email !== email);
      await materialize(); emit();
      return JSON.parse(JSON.stringify(a));
    },
    async removeAccount(id) { calls.push(['remove', id]); accs = accs.filter(a => a.id !== id); await materialize(); emit(); },
    async setCalendarEnabled(id, gid, on) { calls.push(['cal', id, gid, on]); const a = accs.find(x => x.id === id); const c = a && a.calendars.find(x => x.gid === gid); if (c) c.enabled = on; await materialize(); emit(); },
    async sync(id) { calls.push(['sync', id || null]); emit(); },
    on(type, fn) { if (type === 'state') ls.add(fn); return () => ls.delete(fn); },
    async init() {},
  };
}

(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
  const base = `http://127.0.0.1:${PORT}/index.html`;
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  const phone = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent };
  const pc = { viewport: { width: 1366, height: 800 } };

  async function page(tag, ctxOpts, { locale = 'es-ES', mock = {}, welcome = false, real = false } = {}) {
    const ctx = await b.newContext({ locale, timezoneId: 'Europe/Madrid', ...ctxOpts });
    await ctx.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    // (si el núcleo ya trae su gcal.js, aquí manda el simulador de la prueba)
    if (!real) {
      await ctx.route('**/js/core/gcal.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* simulado en la prueba */' }));
      await ctx.addInitScript(mockGcal, mock);
    }
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`[${tag}] ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/net::ERR|ERR_FAILED|fonts\.googleapis/.test(m.text())) errs.push(`[${tag}] ${m.text()}`); });
    await p.goto(base + (welcome ? '' : '?nowelcome')); await p.waitForSelector('html.ready'); await p.waitForTimeout(300);
    if (!welcome) await p.evaluate(() => ZC.store.local('welcomed', true));
    return { ctx, p };
  }
  // Drive simulado (conectado como ana@ o sin conectar)
  const fakeDrive = (p, connected) => p.evaluate(c => {
    let st = c ? { connected: true, email: 'ana@example.com', name: 'Ana', lastSync: Date.now() - 60000 } : { connected: false };
    ZC.drive.available = () => true; ZC.drive.state = () => ({ ...st }); ZC.drive.prepare = () => {};
    ZC.drive.connect = async () => { window.__driveConn = (window.__driveConn || 0) + 1; st = { connected: true, email: 'ana@example.com', name: 'Ana', lastSync: Date.now() }; return st; };
    ZC.drive.sync = async () => st;
  }, connected);
  const look = (p, design, scheme) => p.evaluate(([d, s]) => { ZC.ui.dot.pick(d); ZC.ui.look.set({ scheme: s }); }, [design, scheme]);
  const shot = async (p, name, keepToasts) => { if (!SHOTS) return; if (!keepToasts) await p.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove())); await p.screenshot({ path: path.join(OUT, name) }); };
  const noOverflow = (p, sel) => p.evaluate(s => {
    const box = document.querySelector(s); if (!box) return 'no está ' + s;
    const r = box.getBoundingClientRect(), bad = [];
    if (box.scrollWidth > box.clientWidth + 1) bad.push('scroll horizontal');
    for (const el of box.querySelectorAll('.gacc, .ga-head, .ga-cal, .ga-sug, .ga-add, .ga-short, .ga-warn, .cal-gh, .cal-row, .ed-cg, .wl-gsw, .btn')) {
      const q = el.getBoundingClientRect(); if (!q.width) continue;
      if (q.left < r.left - 1 || q.right > r.right + 1) bad.push((el.className.baseVal ?? el.className) + ' ' + Math.round(q.left) + '–' + Math.round(q.right));
    }
    return bad.join(', ');
  }, sel);
  const openSide = async (p, mobile) => { if (mobile) { await p.evaluate(() => ZC.ui.app.toggleSide()); await p.waitForTimeout(450); } };

  // ---------- 1. sin ZC.gcal / con available() false: no sale nada y no se rompe ----------
  for (const [tag, mock] of [['sin ZC.gcal', { none: true }], ['available() false', { unavailable: true }]]) {
    console.log(tag);
    const { ctx, p } = await page(tag, pc, { mock });
    await fakeDrive(p, true);
    await p.evaluate(() => ZC.ui.settings.open('drive')); await p.waitForTimeout(400);
    ok(await p.locator('.gcal-card').count() === 0, 'Ajustes no enseña Google Calendar');
    ok(await p.locator('.drive .acct').count() === 1, 'la cuenta de Drive sigue ahí');
    ok(await p.locator('.set-nav [data-sec=drive] b').textContent() === 'Cuentas de Google', 'la sección se llama «Cuentas de Google»');
    await p.evaluate(() => ZC.ui.settings.open('drive')); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    ok(await p.locator('#sideCals .cal-gh').count() === 0, 'el panel lateral no agrupa');
    await p.evaluate(() => ZC.ui.welcome.open()); await p.waitForTimeout(400);
    await p.locator('.wl [data-go="1"]').click(); await p.waitForTimeout(300);
    ok(await p.locator('.wl-gcal').count() === 0, 'la bienvenida no ofrece los calendarios');
    await ctx.close();
  }

  // ---------- 2. con cuentas: PC y móvil, Zen y Dot, claro y oscuro, tres idiomas ----------
  const RUNS = [
    ['PC · Zen · claro · es', pc, 'zen', 'light', 'es-ES', false],
    ['PC · Dot · oscuro · en', pc, 'dot', 'dark', 'en-GB', false],
    ['móvil · Zen · oscuro · ca', phone, 'zen', 'dark', 'ca-ES', true],
    ['móvil · Dot · claro · es', phone, 'dot', 'light', 'es-ES', true],
  ];
  for (const [tag, opts, design, scheme, locale, mobile] of RUNS) {
    console.log(tag);
    const slug = tag.replace(/ · /g, '-').replace(/[^a-z0-9-]/gi, c => ({ 'ó': 'o' }[c] || '')).toLowerCase();
    const { ctx, p } = await page(tag, opts, { locale });
    await fakeDrive(p, true);
    await look(p, design, scheme);
    await p.evaluate(() => window.__gcSeed()); await p.waitForTimeout(400);

    // panel lateral agrupado y plegable
    await openSide(p, mobile);
    const groups = await p.$$eval('#sideCals .cal-gh span', els => els.map(e => e.textContent));
    ok(groups.length === 3 && groups[0] === 'ZenCalendar' && groups[1] === 'ana@example.com' && groups[2] === 'taller@example.com', 'panel lateral: grupos ZenCalendar, ana@ y taller@ (' + groups.join(' | ') + ')');
    ok(await p.locator('#sideCals [data-cal="g:a1:festes"]').count() === 0, 'un calendario desactivado no sale');
    ok(await p.locator('#sideCals [data-cal="g:a1:equipo"] .cal-ro').count() === 1, 'el de solo lectura lleva su candado');
    ok(await p.locator('#sideCals [data-grp=a2] .cg-err').count() === 1, 'la cuenta con error lleva un punto rojo');
    ok(!(await noOverflow(p, '#side')), 'panel lateral sin desbordes ' + (await noOverflow(p, '#side')));
    if (!mobile || design === 'dot') await shot(p, `gcal-side-${slug}.png`);
    await p.locator('#sideCals [data-fold=a1]').click(); await p.waitForTimeout(150);
    ok(await p.locator('#sideCals [data-grp=a1] .cal-gb').isHidden(), 'tocar el título pliega el grupo');
    await p.locator('#sideCals [data-fold=a1]').click(); await p.waitForTimeout(150);
    ok(await p.locator('#sideCals [data-grp=a1] .cal-gb').isVisible(), 'y lo vuelve a abrir');
    if (mobile) { await p.evaluate(() => ZC.ui.app.closeSide()); await p.waitForTimeout(400); }

    // Ajustes → Cuentas de Google
    await p.evaluate(() => ZC.ui.settings.open('drive')); await p.waitForTimeout(500);
    ok(await p.locator('.gcal-card .gacc').count() === 2, 'Ajustes: dos cuentas de Google Calendar');
    ok(await p.locator('.gacc[data-gacc=a2] [data-ga=reconnect]').count() === 1, 'la cuenta con error ofrece «Volver a conectar»');
    ok(await p.locator('.ga-sug [data-email="casa@example.com"]').count() === 1, 'sale la cuenta del otro dispositivo con «Conectar»');
    ok(await p.locator('.ga-short').count() === 0, 'sin atajo: la cuenta de Drive ya tiene sus calendarios');
    ok(await p.locator('.gcal-card .ga-warn').count() === 1, 'explica el aviso de «app no verificada»');
    await p.locator('.gacc[data-gacc=a1] .ga-head').click(); await p.waitForTimeout(250);
    ok(await p.locator('.gacc[data-gacc=a1] .ga-cal').count() === 3, 'al desplegar, sus 3 calendarios');
    ok(await p.locator('.gacc[data-gacc=a1] .ga-cal[data-gid=festes][aria-checked=false]').count() === 1, 'festivos, desactivado');
    ok(await p.locator('.gacc[data-gacc=a1] .ga-ro').count() === 2, 'dos marcados «solo lectura»');
    ok(!(await noOverflow(p, '.set-content')), 'Ajustes sin desbordes ' + (await noOverflow(p, '.set-content')));
    await p.locator('.gacc[data-gacc=a1] .ga-head').scrollIntoViewIfNeeded();
    await shot(p, `gcal-settings-${slug}.png`);
    await p.locator('.ga-cal[data-gid=festes]').click(); await p.waitForTimeout(350);
    ok(await p.evaluate(() => JSON.stringify(window.__gc.at(-1))) === '["cal","a1","festes",true]', 'activar un calendario llama a setCalendarEnabled');
    ok(await p.locator('.gacc[data-gacc=a1].open').count() === 1, 'la cuenta sigue desplegada después');
    // añadir cuenta
    await p.locator('.ga-add').click(); await p.waitForTimeout(500);
    ok(await p.evaluate(() => window.__gc.some(c => c[0] === 'add' && c[1] === null)), '«Añadir cuenta de Google» llama a addAccount (con el selector de cuentas)');
    ok(await p.locator('.gcal-card .gacc').count() === 3, 'y la cuenta nueva aparece');
    // conectar la del otro dispositivo
    await p.locator('.ga-sug [data-email="casa@example.com"]').click(); await p.waitForTimeout(500);
    ok(await p.evaluate(() => window.__gc.some(c => c[0] === 'add' && c[1] && c[1].email === 'casa@example.com')), '«Conectar» la del otro dispositivo pide esa cuenta');
    ok(await p.locator('.ga-sug').count() === 0, 'y deja de salir como sugerida');
    // quitar cuenta
    const nb = await p.locator('.gcal-card .gacc').count();
    await p.locator('.gacc[data-gacc=a2] .ga-head').click(); await p.waitForTimeout(200);
    await p.locator('.gacc[data-gacc=a2] [data-ga=remove]').click(); await p.waitForTimeout(350);
    await p.locator('.dlg [data-a=ok]').click(); await p.waitForTimeout(450);
    ok(await p.locator('.gcal-card .gacc').count() === nb - 1, 'quitar cuenta (con confirmación)');
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);

    // evento de solo lectura: se ve, no se edita
    await p.evaluate(() => { const ev = ZC.store.get('g:a1:equipo:ro1'); ZC.ui.editor.open({ ev, occ: ZC.ui.cal.occOf(ev) }); }); await p.waitForTimeout(450);
    ok(await p.locator('.dt-panel .dt-ro').count() === 1 && await p.locator('.ed-panel').count() === 0, 'abrir para editar uno de solo lectura enseña el detalle');
    ok(await p.locator('.dt-panel [data-act=edit], .dt-panel [data-act=delete]').count() === 0, 'sin editar ni borrar');
    ok(await p.locator('.dt-panel .dt-gcal').count() === 1, 'con «Abrir en Google Calendar»');
    if (!mobile || design === 'zen') await shot(p, `gcal-readonly-${slug}.png`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);
    ok(await p.evaluate(async () => { const ev = ZC.store.get('g:a1:equipo:ro1'); const r = await ZC.ui.cal.deleteOccurrence(ZC.ui.cal.occOf(ev)); return r === false && !!ZC.store.get('g:a1:equipo:ro1'); }), 'no se puede borrar');
    ok(await p.evaluate(async () => { const ev = ZC.store.get('g:a1:equipo:ro1'), o = ZC.ui.cal.occOf(ev), s0 = ev.start; await ZC.ui.cal.moveOccurrence(o, new Date(+o.start + 864e5), new Date(+o.end + 864e5)); return ZC.store.get('g:a1:equipo:ro1').start === s0; }), 'ni mover');
    await p.waitForTimeout(300);
    // evento de Google que sí se puede editar
    await p.evaluate(() => { const ev = ZC.store.get('g:a1:primary:rw1'); ZC.ui.editor.detail(ZC.ui.cal.occOf(ev)); }); await p.waitForTimeout(400);
    ok(await p.locator('.dt-panel [data-act=edit]').count() === 1 && await p.locator('.dt-panel .dt-gcal').count() === 1, 'uno de Google con permiso: se edita y también se abre en Google');
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);

    // editor: calendarios por cuenta, sin los de solo lectura
    await p.evaluate(() => ZC.ui.editor.open({})); await p.waitForTimeout(450);
    const eg = await p.$$eval('.ed-cals.grouped .ed-cgl', els => els.map(e => e.textContent.trim()));
    ok(eg.length >= 2 && eg[0] === 'ZenCalendar' && eg.includes('ana@example.com'), 'editor: calendarios agrupados por cuenta (' + eg.join(' | ') + ')');
    ok(await p.locator('.ed-cals [data-cal="g:a1:equipo"]').count() === 0, 'el de solo lectura no se puede elegir');
    ok(await p.evaluate(() => !ZC.store.calendar(document.querySelector('.ed-cals .cal-chip.on').dataset.cal).source), 'por defecto, un calendario de ZenCalendar');
    ok(!(await noOverflow(p, '.ed-panel')), 'editor sin desbordes ' + (await noOverflow(p, '.ed-panel')));
    await p.locator('.ed-cals [data-cal="g:a1:primary"]').click(); await p.waitForTimeout(150);
    ok(await p.locator('.ed-cals [data-cal="g:a1:primary"].on').count() === 1, 'se puede elegir uno de Google');
    if (mobile && design === 'dot') { await p.locator('.ed-cals').scrollIntoViewIfNeeded(); await shot(p, `gcal-editor-${slug}.png`); }
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await ctx.close();
  }

  // ---------- 3. aviso «conéctala también aquí» ----------
  {
    console.log('aviso del otro dispositivo');
    const { ctx, p } = await page('aviso', phone, { locale: 'es-ES' });
    await fakeDrive(p, true);
    await p.evaluate(() => { ZC.store.local('gcal.hinted', null); ZC.ui.gacc.hint(); }); await p.waitForTimeout(400);
    const tx = await p.locator('.toast').filter({ hasText: 'casa@example.com' }).count();
    ok(tx === 1, 'sale el aviso con la cuenta');
    await shot(p, 'gcal-hint-movil.png', true);
    await p.locator('.toast .toast-act').filter({ hasText: 'Conectar' }).click(); await p.waitForTimeout(500);
    ok(await p.evaluate(() => window.__gc.some(c => c[0] === 'add' && c[1] && c[1].email === 'casa@example.com')), 'un toque en «Conectar» la conecta');
    await p.evaluate(() => { window.__gcSugg([{ email: 'casa@example.com' }]); ZC.ui.gacc.hint(); }); await p.waitForTimeout(300);
    ok(await p.locator('.toast').filter({ hasText: 'casa@example.com' }).count() <= 1, 'no repite el aviso de la misma cuenta');
    await ctx.close();
  }

  // ---------- 4. bienvenida: «¿Traer también tus calendarios de Google?» ----------
  for (const [tag, opts, design, scheme, locale] of [['bienvenida · móvil · Zen · claro · es', phone, 'zen', 'light', 'es-ES'], ['bienvenida · PC · Dot · oscuro · ca', pc, 'dot', 'dark', 'ca-ES']]) {
    console.log(tag);
    const { ctx, p } = await page(tag, opts, { locale, welcome: true });
    await p.waitForSelector('.wl-card'); await fakeDrive(p, false);
    await p.evaluate(() => window.__gcSugg([]));
    await look(p, design, scheme);
    await p.locator('.wl [data-go="1"]').click(); await p.waitForTimeout(350);
    if (process.env.DBG) console.log(await p.evaluate(() => document.querySelector('.wl-card').innerText + ' / ' + ZC.ui.gacc.has() + ' ' + JSON.stringify(ZC.drive.state())));
    ok(await p.locator('.wl-gcal [data-a=bring][aria-checked=true]').count() === 1, 'interruptor «¿Traer también tus calendarios?», activado');
    ok(await p.locator('.wl-gcal .ga-warn').count() === 1, 'con la línea del aviso de Google');
    ok(!(await noOverflow(p, '.wl-card')), 'sin desbordes ' + (await noOverflow(p, '.wl-card')));
    await shot(p, `gcal-welcome-${tag.split(' · ').slice(1).join('-').replace(/[^a-z0-9-]/gi, c => ({ 'ó': 'o' }[c] || '')).toLowerCase()}.png`);
    await p.locator('.wl-gsw b').click(); await p.waitForTimeout(200);
    ok(await p.locator('.wl-gcal [data-a=bring][aria-checked=false]').count() === 1, 'tocar el texto lo apaga');
    await p.locator('.wl-gsw b').click(); await p.waitForTimeout(200);
    await p.locator('.wl [data-a=conn]').click(); await p.waitForTimeout(700);
    ok(await p.evaluate(() => window.__driveConn === 1), '«Conectar con Google» conecta Drive');
    ok(await p.evaluate(() => window.__gc.some(c => c[0] === 'add' && c[1] && c[1].email === 'ana@example.com')), 'y trae los calendarios de esa misma cuenta');
    ok(await p.locator('.wl-card .sync-st').count() === 2, 'enseña «Conectado» y «Tus calendarios de Google ya están aquí»');
    await ctx.close();
  }

  // ---------- 5. con el núcleo de verdad en modo simulado (ZC.gcal._mock) ----------
  if (fs.existsSync(path.join(WEB, 'js/core/gcal-mock.js'))) {
    for (const [tag, opts, design, scheme, locale, mobile] of [['núcleo simulado · PC · Zen · oscuro · es', pc, 'zen', 'dark', 'es-ES', false], ['núcleo simulado · móvil · Dot · claro · en', phone, 'dot', 'light', 'en-GB', true]]) {
      console.log(tag);
      const { ctx, p } = await page(tag, opts, { locale, real: true });
      await look(p, design, scheme);
      await p.evaluate(async () => { window.__m = await ZC.gcal._mock(); }); await p.waitForTimeout(900);
      ok(await p.evaluate(() => ZC.gcal.available()), 'ZC.gcal.available()');
      await openSide(p, mobile);
      const gs = await p.$$eval('#sideCals .cal-gh span', els => els.map(e => e.textContent));
      ok(gs.includes('ana@example.com') && gs.includes('equipo@example.com'), 'panel lateral agrupado por cuenta (' + gs.join(' | ') + ')');
      ok(await p.locator('#sideCals .cal-row', { hasText: 'Festivos en España' }).count() === 0, 'festivos (desactivado) no sale');
      ok(await p.locator('#sideCals .cal-row', { hasText: 'Turnos' }).locator('.cal-ro').count() === 1, '«Turnos» con candado');
      if (mobile) { await p.evaluate(() => ZC.ui.app.closeSide()); await p.waitForTimeout(400); }
      await p.evaluate(() => ZC.ui.settings.open('drive')); await p.waitForTimeout(500);
      ok(await p.locator('.gcal-card .gacc').count() === 2, 'Ajustes: ana@ y equipo@');
      await p.locator('.ga-add').click(); await p.waitForTimeout(1500);
      ok(await p.locator('.gcal-card .gacc').count() === 3, '«Añadir cuenta de Google» trae nueva@');
      await p.evaluate(async () => { window.__m.setAuthError('equipo@example.com'); try { await ZC.gcal.sync(); } catch {} }); await p.waitForTimeout(700);
      const eq = await p.evaluate(() => (ZC.gcal.accounts().find(a => a.email === 'equipo@example.com') || {}).id);
      ok(await p.locator(`.gacc[data-gacc="${eq}"] [data-ga=reconnect]`).count() === 1, 'sesión caducada: «Volver a conectar»');
      await p.evaluate(() => window.__m.setAuthError('equipo@example.com', false));
      await p.locator(`.gacc[data-gacc="${eq}"] [data-ga=reconnect]`).click(); await p.waitForTimeout(1200);
      ok(await p.locator(`.gacc[data-gacc="${eq}"] [data-ga=reconnect]`).count() === 0, 'y al volver a conectar se va');
      ok(!(await noOverflow(p, '.set-content')), 'sin desbordes ' + (await noOverflow(p, '.set-content')));
      await shot(p, `gcal-core-settings-${mobile ? 'movil' : 'pc'}.png`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(350);
      const ro = await p.evaluate(() => { const ev = ZC.store.events().find(e => e.title === 'Turno de tarde'); if (!ev) return 'no está'; ZC.ui.editor.open({ ev, occ: ZC.ui.cal.occOf(ev) }); return 'ok'; }); await p.waitForTimeout(450);
      ok(ro === 'ok' && await p.locator('.dt-panel .dt-ro').count() === 1 && await p.locator('.dt-panel .dt-gcal').count() === 1, 'un evento de «Turnos» se abre en modo ver, con «Abrir en Google Calendar»');
      await p.keyboard.press('Escape'); await p.waitForTimeout(350);
      await p.evaluate(() => ZC.ui.editor.open({})); await p.waitForTimeout(450);
      ok(await p.locator('.ed-cals.grouped .ed-cg').count() >= 3, 'editor agrupado por cuenta');
      ok(await p.locator('.ed-cals .cal-chip', { hasText: 'Turnos' }).count() === 0, '«Turnos» no se puede elegir');
      // crear en Google desde el editor
      const gcal = await p.evaluate(() => (ZC.store.calendars().find(c => c.source === 'google' && !c.readOnly && c.primary) || {}).id);
      await p.locator(`.ed-cals [data-cal="${gcal}"]`).click(); await p.waitForTimeout(150);
      await p.locator('.ed-tin').fill('Prueba en Google'); await p.locator('.ed-foot [data-act=save]').click(); await p.waitForTimeout(800);
      ok(await p.evaluate(g => { const e = ZC.store.events().find(x => x.title === 'Prueba en Google'); return !!e && e.calendarId === g; }, gcal), 'guardar en un calendario de Google');
      await ctx.close();
    }
  }

  ok(!errs.length, 'sin errores en la consola' + (errs.length ? ':\n    ' + errs.join('\n    ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
