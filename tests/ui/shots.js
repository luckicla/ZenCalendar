'use strict';
// ZenCalendar · capturas de la interfaz con Playwright.
//   node tests/ui/shots.js            (usa web/js/core de verdad)
//   MOCK=1 node tests/ui/shots.js     (usa tests/ui/mock-core.js)
//   ONLY=desk,dark node tests/ui/shots.js
// Salida: tests/ui/out/*.png  · Falla (código 1) si hay errores en la consola.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');

const ROOT = path.resolve(__dirname, '../..');
const WEB = path.join(ROOT, 'web');
const OUT = path.join(__dirname, 'out');
const MOCK = process.env.MOCK === '1' || !fs.existsSync(path.join(WEB, 'js/core/core.js'));
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      let file = path.join(WEB, p);
      if (MOCK && p.startsWith('/js/core/')) {
        if (p === '/js/core/config.js') file = path.join(__dirname, 'mock-core.js');
        else { resp.writeHead(200, { 'content-type': 'text/javascript' }); resp.end('/* mock */'); return; }
      }
      fs.readFile(file, (err, buf) => {
        if (err) { resp.writeHead(404); resp.end('404'); return; }
        resp.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
        resp.end(buf);
      });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

// datos de ejemplo alrededor de hoy
async function seed(page) {
  await page.evaluate(async () => {
    const C = ZC.ui.cal, S = ZC.store, T = C.today();
    const d = n => C.ymd(C.addDays(T, n));
    const at = (n, hm) => d(n) + 'T' + hm;
    const ev = (o) => S.saveEvent(Object.assign({ kind: 'event', calendarId: 'personal', reminders: [10] }, o));
    const wd = T.getDay(), mon = -((wd + 6) % 7);
    await ev({ title: 'Café con Ana', emoji: '☕', start: at(0, '10:00'), end: at(0, '11:00'), location: 'La Pepita' });
    await ev({ title: 'Reunión de equipo', calendarId: 'work', start: at(0, '12:30'), end: at(0, '13:30'), notes: 'Revisar el plan del trimestre\nhttps://example.com/acta', checklist: [{ id: 'a', text: 'Traer números', done: true }, { id: 'b', text: 'Preparar demo', done: false }] });
    await ev({ title: 'Yoga', emoji: '🧘', start: at(mon, '19:00'), end: at(mon, '20:00'), rrule: { freq: 'weekly', interval: 1, byDay: ['MO', 'WE'], until: null, count: null } });
    await ev({ title: 'Comprar flores', kind: 'task', allDay: true, start: d(0), end: d(0) });
    await ev({ title: 'Dentista', emoji: '🦷', start: at(1, '17:00'), end: at(1, '17:45'), location: 'Clínica Sonrisa' });
    await ev({ title: 'Cena con Marta', start: at(1, '21:30'), end: at(1, '23:00'), location: 'Casa Pepe', reminders: [60] });
    await ev({ title: 'Viaje a Lisboa', emoji: '✈️', allDay: true, start: d(mon + 11), end: d(mon + 13), calendarId: 'personal', color: '#7CC8F2' });
    await ev({ title: 'Cumple de Lluc', emoji: '🎂', allDay: true, start: d(3), end: d(3), calendarId: 'birthdays', rrule: { freq: 'yearly', interval: 1, until: null, count: null } });
    await ev({ title: 'Presentación', calendarId: 'work', start: at(2, '10:00'), end: at(2, '11:30') });
    await ev({ title: 'Llamada cliente', calendarId: 'work', start: at(2, '10:30'), end: at(2, '11:00'), color: '#FFB38A' });
    await ev({ title: 'Pagar el alquiler', kind: 'task', allDay: true, start: d(-1), end: d(-1), calendarId: 'personal' });
    await ev({ title: 'Llamar a mamá', kind: 'task', start: at(1, '18:30'), end: at(1, '18:30') });
    await ev({ title: 'Gimnasio', emoji: '🏋️', start: at(mon + 1, '08:00'), end: at(mon + 1, '09:00'), rrule: { freq: 'weekly', interval: 1, byDay: ['TU', 'TH'], until: null, count: null }, color: '#7ED6C3' });
    await ev({ title: 'Mercado', emoji: '🛒', start: at(mon + 5, '11:00'), end: at(mon + 5, '12:00') });
    await ev({ title: 'Cine', emoji: '🎬', start: at(mon + 4, '20:30'), end: at(mon + 4, '22:30'), location: 'Cines Verdi' });
    await ev({ title: 'Entrega del proyecto', calendarId: 'work', allDay: true, start: d(mon + 16), end: d(mon + 16) });
    await ev({ title: 'Semana de exámenes', allDay: true, start: d(mon + 21), end: d(mon + 25), color: '#C38BEB' });
    await ev({ title: 'Brunch', emoji: '🥞', start: at(mon + 6, '11:30'), end: at(mon + 6, '13:00') });
    await ev({ title: 'Clase de cerámica', start: at(mon + 9, '18:00'), end: at(mon + 9, '20:00'), color: '#F2C14E' });
    await ev({ title: 'Dentista revisión', start: at(mon - 5, '09:00'), end: at(mon - 5, '09:30') });
    await ev({ title: 'Concierto', emoji: '🎵', start: at(mon + 18, '21:00'), end: at(mon + 18, '23:30') });
  });
  await page.waitForTimeout(400);
}

const errors = [];
async function run() {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  console.log((MOCK ? 'MOCK' : 'core real') + ' en ' + base);
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--disable-gpu-sandbox'] });
  const configs = [
    { name: 'desk', viewport: { width: 1366, height: 800 }, deviceScaleFactor: 1, plat: 'desktop' },
    { name: 'mob', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, plat: 'android' },
  ];
  for (const cfg of configs) {
    for (const scheme of ['light', 'dark']) {
      const tag = cfg.name + '-' + scheme;
      if (ONLY.length && !ONLY.every(o => tag.includes(o))) continue;
      const ctx = await browser.newContext({ viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor, isMobile: !!cfg.isMobile, hasTouch: !!cfg.hasTouch, colorScheme: scheme, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
      const page = await ctx.newPage();
      page.on('console', m => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_FAILED|ERR_BLOCKED|net::ERR/.test(m.text())) errors.push(`[${tag}] ${m.text()}`); });
      page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}\n${e.stack || ''}`));
      const shot = async (n, opts = {}) => { await page.waitForTimeout(opts.wait ?? 750); await page.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) }); };
      // bienvenida (primera vez)
      await page.goto(base + 'index.html?plat=' + cfg.plat, { waitUntil: 'load' });
      await page.waitForSelector('html.ready', { timeout: 15000 });
      await page.waitForTimeout(900);
      if (await page.$('.welcome')) await shot('00-welcome');
      await page.evaluate(() => { ZC.store.local('welcomed', true); ZC.ui.back && ZC.ui.layers.forEach(l => l.close()); });
      await seed(page);
      await page.evaluate(s => ZC.ui.look.set({ scheme: s }), scheme);
      const go = async v => { await page.evaluate(v => ZC.ui.app.go({ view: v, date: ZC.ui.cal.today(), sel: ZC.ui.cal.today() }), v); };
      for (const v of ['month', 'week', 'day', 'agenda', 'year']) { await go(v); await shot('1-' + v); if (process.env.DEBUG) console.log(v, await page.evaluate(() => [document.getElementById('side').scrollTop, document.getElementById('side').scrollHeight, document.getElementById('side').clientHeight])); }
      if (cfg.name === 'mob') { await go('tasks'); await shot('1-tasks'); }
      await go('month');
      // editor nuevo con lenguaje natural
      await page.evaluate(() => ZC.ui.editor.open({ date: ZC.ui.cal.today() }));
      await page.waitForTimeout(500);
      await page.fill('.ed-tin', 'cena con Marta el viernes a las 9 en Casa Pepe');
      await shot('2-editor', { wait: 900 });
      await page.evaluate(() => ZC.ui.back());
      // editor de uno existente (con repetición)
      await page.evaluate(() => { const e = ZC.store.events().find(x => x.title === 'Yoga'); ZC.ui.editor.open({ ev: e }); });
      await shot('2-editor-edit');
      await page.evaluate(() => ZC.ui.back());
      // detalle
      await page.evaluate(() => { const e = ZC.store.events().find(x => x.title === 'Reunión de equipo'); ZC.ui.editor.detail(ZC.ui.cal.occOf(e)); });
      await shot('3-detail');
      await page.evaluate(() => ZC.ui.back());
      // asistente
      await page.evaluate(() => ZC.ui.aipanel.open());
      await shot('4-ai-empty');
      await page.fill('.ai-box textarea', 'cena con Marta el viernes a las 9 y recuérdamelo 1 h antes');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      await shot('4-ai-preview');
      await page.evaluate(() => ZC.ui.back());
      // buscador
      await page.evaluate(() => ZC.ui.quick.search());
      await page.waitForTimeout(300);
      await page.keyboard.type('den');
      await shot('5-search');
      await page.evaluate(() => ZC.ui.back());
      // ajustes
      for (const s of ['look', 'bg', 'glass', 'type', 'cal', 'ai', 'drive']) {
        await page.evaluate(s => ZC.ui.settings.open(s), s);
        await shot('6-settings-' + s, { wait: 700 });
      }
      if (cfg.name === 'mob') { await page.evaluate(() => ZC.ui.back()); await page.waitForTimeout(400); await page.evaluate(() => ZC.ui.settings.open()); await shot('6-settings-list'); }
      await page.evaluate(() => ZC.ui.back());
      // añadir rápido (PC)
      if (cfg.name === 'desk') {
        await page.click('#qaIn');
        await page.keyboard.type('dentista mañana a las 5');
        await shot('7-quickadd', { wait: 600 });
        await page.keyboard.press('Escape');
      }
      if (cfg.name === 'desk') {
        const wp = await ctx.newPage();
        wp.on('pageerror', e => errors.push(`[${tag} widget] pageerror: ${e.message}`));
        wp.on('console', m => { if (m.type() === 'error' && !/net::ERR/.test(m.text())) errors.push(`[${tag} widget] ${m.text()}`); });
        await wp.setViewportSize({ width: 340, height: 420 });
        await wp.goto(base + 'widget.html', { waitUntil: 'load' });
        await wp.waitForSelector('html.ready', { timeout: 15000 });
        await wp.waitForTimeout(800);
        await wp.screenshot({ path: path.join(OUT, `${tag}-8-widget.png`), omitBackground: true });
        await wp.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
  srv.close();
  if (errors.length) { console.log('\nERRORES EN LA CONSOLA:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('Sin errores en la consola. Capturas en ' + OUT);
}
run().catch(e => { console.error(e); process.exit(1); });
