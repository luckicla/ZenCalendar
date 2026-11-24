'use strict';
// ZenCalendar · workspaces compartidos en la interfaz (Playwright, puerto 8961).
//   node tests/ui/ws.js            (SHOTS=0 para no guardar capturas)
// Con ZC.ws simulado (web/js/core/ws-mock.js: Firebase en memoria con las reglas de verdad). Comprueba que sin Firebase no
// sale nada; el selector «Mi calendario ▾»; el título con el nombre del workspace (y el mes) sin romper la barra; el color y el
// aspecto del workspace; crear, invitar (copiar, WhatsApp, correo), entrar con un enlace, miembros; tareas «Para»; los avisos;
// Ajustes → Workspaces; la bienvenida. En Zen y Dot, claro y oscuro, ES/CA/EN, móvil 360 px y PC, sin errores ni desbordes.
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const OUT = path.resolve(__dirname, 'out');
const PORT = +process.env.PORT || 8961;
const SHOTS = process.env.SHOTS !== '0';
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff': 'font/woff' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };

const USERS = [
  { uid: 'u-ana', name: 'Ana García', email: 'ana@example.com' },
  { uid: 'u-bea', name: 'Bea', email: 'bea@example.com' },
  { uid: 'u-carl', name: 'Carlos', email: 'carl@example.com' },
];

(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
  const base = `http://127.0.0.1:${PORT}/index.html`;
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  const phone = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent };
  const pc = { viewport: { width: 1366, height: 800 } };

  async function page(tag, ctxOpts, { locale = 'es-ES', scheme = 'light', mock = true, signedIn = true } = {}) {
    const ctx = await b.newContext({ locale, timezoneId: 'Europe/Madrid', colorScheme: scheme, ...ctxOpts });
    await ctx.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:' + PORT }).catch(() => {});
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`[${tag}] ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/net::ERR|ERR_FAILED|fonts\.googleapis/.test(m.text())) errs.push(`[${tag}] ${m.text()}`); });
    await p.goto(base + '?nowelcome'); await p.waitForSelector('html.ready'); await p.waitForTimeout(300);
    await p.evaluate(() => ZC.store.local('welcomed', true));
    if (mock) {
      await p.evaluate(async ([users, signedIn]) => {
        window.__fb = await ZC.ws._mock({ users, me: 'u-ana', signedIn });
        window.__opened = [];
        ZC.platform.share = async o => { window.__opened.push(o); return true; };
      }, [USERS, signedIn]);
      await p.waitForTimeout(150);
    }
    return { ctx, p };
  }
  const seed = p => p.evaluate(async () => {
    const fb = window.__fb;
    const w = await ZC.ws.create({ name: 'Cenas de los viernes', color: '#FF9CCB', emoji: '🍕', bg: { kind: 'anim', value: 'sakura' } });
    const tok = ZC.ws.parseCode(ZC.ws.inviteLink(w.id)).token;
    await fb.client('u-bea').join(w.id + '.' + tok);
    await fb.client('u-carl').join(w.id + '.' + tok);
    const w2 = await ZC.ws.create({ name: 'Piso de la calle Mayor número tres, segundo segunda', color: '#7CC8F2', emoji: '🏠' });
    await new Promise(r => setTimeout(r, 120));
    window.__w = w.id; window.__w2 = w2.id;
    const d = new Date(), pad = n => String(n).padStart(2, '0'), day = k => { const x = new Date(d); x.setDate(x.getDate() + k); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
    window.__day = day;
    await ZC.store.saveEvent({ title: 'Dentista', start: day(0) + 'T10:00' });
    return w.id;
  });
  const look = (p, design, scheme) => p.evaluate(([d, s]) => { ZC.ui.dot.pick(d); ZC.ui.look.set({ scheme: s }); }, [design, scheme]);
  const shot = async (p, name) => { if (!SHOTS) return; await p.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove())); await p.screenshot({ path: path.join(OUT, name) }); };
  // nada de la barra de arriba se sale ni se pisa
  const topOk = p => p.evaluate(() => {
    const bad = [], vw = innerWidth;
    const els = [...document.querySelectorAll('#top > *, #top .tb-nav > *')].filter(e => e.offsetWidth && getComputedStyle(e).display !== 'none' && !e.classList.contains('tb-spacer') && !e.classList.contains('tb-nav'));
    const rs = els.map(e => [e, e.getBoundingClientRect()]);
    for (const [e, r] of rs) if (r.left < -1 || r.right > vw + 1) bad.push((e.id || e.className) + ' se sale');
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const [a, ra] = rs[i], [c, rc] = rs[j];
      if (a.contains(c) || c.contains(a)) continue;
      const ox = Math.min(ra.right, rc.right) - Math.max(ra.left, rc.left), oy = Math.min(ra.bottom, rc.bottom) - Math.max(ra.top, rc.top);
      if (ox > 2 && oy > 2) bad.push((a.id || a.className) + ' pisa ' + (c.id || c.className));
    }
    const top = document.getElementById('top'); if (top.scrollWidth > top.clientWidth + 2) bad.push('la barra tiene scroll');
    return bad.join(', ');
  });
  const inside = (p, sel) => p.evaluate(s => {
    const box = document.querySelector(s); if (!box) return 'no está ' + s;
    const r = box.getBoundingClientRect(), bad = [];
    if (box.scrollWidth > box.clientWidth + 1) bad.push('scroll horizontal en ' + s);
    for (const el of box.querySelectorAll('button, input, .ws-li, .wsd-m, .wsm-row, .wsi-b')) {
      const q = el.getBoundingClientRect(); if (!q.width || el.closest('[hidden]')) continue;
      if (q.left < r.left - 1 || q.right > r.right + 1) bad.push((el.className.baseVal ?? el.className) + ' ' + Math.round(q.left) + '–' + Math.round(q.right));
    }
    return bad.join(', ');
  }, sel);

  // ---------- 1. sin Firebase: no sale nada ----------
  {
    console.log('sin Firebase configurado');
    const { ctx, p } = await page('sin firebase', pc, { mock: false });
    ok(await p.locator('#wsChip').count() === 0, 'no hay selector en la barra');
    ok(!(await p.evaluate(() => document.documentElement.classList.contains('has-ws'))), 'nada cambia en la barra');
    await p.evaluate(() => ZC.ui.settings.open('ws')); await p.waitForTimeout(400);
    ok(/aún no tiene configurados los workspaces/.test(await p.locator('.set-content').textContent()), 'Ajustes → Workspaces lo dice y nada más');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.evaluate(() => ZC.ui.welcome.open()); await p.waitForTimeout(300);
    await p.locator('.wl [data-go="1"]').click(); await p.locator('.wl [data-go="2"]').click(); await p.waitForTimeout(300);
    ok(await p.locator('.wl-ws').count() === 0, 'la bienvenida no habla de workspaces');
    await ctx.close();
  }

  // ---------- 2. PC: selector, cambiar, título, color, panel lateral ----------
  {
    console.log('PC, Zen claro');
    const { ctx, p } = await page('pc', pc);
    await seed(p);
    await p.evaluate(() => ZC.ws.switchTo(null)); await p.waitForTimeout(300);
    ok(await p.locator('#wsChip').isVisible(), 'el selector está en la barra');
    ok((await p.locator('#wsChip').textContent()).includes('Mi calendario'), 'dice «Mi calendario»');
    ok(!(await topOk(p)), 'la barra cabe sin pisarse: ' + await topOk(p));
    await p.locator('#wsChip').click(); await p.waitForTimeout(300);
    ok(await p.locator('.wsm-pop .wsm-row').count() === 3, 'el menú: mi calendario y los dos workspaces');
    ok(await p.locator('.wsm-pop .wsm-row.on').textContent().then(s => s.includes('Mi calendario')), 'marca dónde estás');
    ok(await p.locator('.wsm-pop [data-wsact=create]').isVisible() && await p.locator('.wsm-pop [data-wsact=joinask]').isVisible(), '«Crear workspace» y «Unirme con un enlace»');
    ok(!(await inside(p, '.wsm-pop')), 'el menú no se desborda');
    await shot(p, 'ws-pc-menu.png');
    await p.locator('.wsm-pop .wsm-row', { hasText: 'Cenas' }).click(); await p.waitForTimeout(700);
    ok(await p.evaluate(() => document.documentElement.classList.contains('in-ws')), 'modo workspace');
    ok((await p.locator('#periodTitle .ws-nt').textContent()) === 'Cenas de los viernes', 'el título es el nombre del workspace');
    ok(/\d{4}/.test(await p.locator('#periodTitle .ws-month').textContent()), 'y el mes debajo');
    ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--a1').trim().toLowerCase()) === '#ff9ccb', 'el acento es el color del workspace');
    ok(await p.evaluate(() => ZC.ui.look.bgKind()) === 'sakura', 'y su fondo animado');
    ok(await p.locator('#sideCals .ws-side').isVisible(), 'el panel lateral enseña el workspace');
    ok(await p.locator('#sideCals .ws-face').count() >= 3, 'con las caritas de los miembros');
    ok(!(await p.evaluate(() => ZC.store.events().some(e => e.title === 'Dentista'))), 'lo tuyo no se ve dentro');
    ok(!(await topOk(p)), 'la barra cabe en modo workspace: ' + await topOk(p));
    await shot(p, 'ws-pc-zen.png');
    // nombre larguísimo: se encoge y no rompe la barra
    await p.evaluate(() => ZC.ws.switchTo(window.__w2)); await p.waitForTimeout(600);
    const tw = await p.evaluate(() => { const n = document.querySelector('#periodTitle .ws-nt'); return { sw: n.scrollWidth, cw: n.clientWidth, fs: parseFloat(getComputedStyle(n.parentElement).fontSize) }; });
    ok(tw.fs < 21, 'un nombre largo usa letra más pequeña (' + tw.fs + ' px)');
    ok(!(await topOk(p)), 'y la barra sigue sin pisarse: ' + await topOk(p));
    // ver también lo tuyo
    await p.locator('#sideCals [data-wsact=dim]').click(); await p.waitForTimeout(300);
    ok(await p.evaluate(() => ZC.store.events().some(e => e.title === 'Dentista')), '«Ver también mi calendario» lo enseña (atenuado)');
    await p.locator('#sideCals [data-wsact=dim]').click(); await p.waitForTimeout(200);
    // deslizar el chip = el calendario de al lado
    const box = await p.locator('#wsChip').boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 - 70, box.y + box.height / 2, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(400);
    ok(await p.evaluate(() => ZC.ws.current() === null), 'deslizar el selector cambia de calendario');

    // crear desde el diálogo
    await p.locator('#wsChip').click(); await p.waitForTimeout(200);
    await p.locator('.wsm-pop [data-wsact=create]').click(); await p.waitForTimeout(400);
    ok(!(await inside(p, '.wsd')), 'el diálogo de crear no se desborda');
    await p.locator('.wsd input[name=name]').fill('Club de lectura');
    await p.locator('.wsd [data-emo="📚"]').click();
    await p.locator('.wsd [data-col="#86B862"]').click();
    await p.locator('.wsd [data-bgk=anim]').click(); await p.locator('.wsd [data-wsanim=olas]').click();
    await shot(p, 'ws-pc-crear.png');
    await p.locator('.wsd [data-wsd=save]').click(); await p.waitForTimeout(800);
    const cur = await p.evaluate(() => ZC.ws.current());
    ok(cur && cur.name === 'Club de lectura' && cur.emoji === '📚' && cur.color === '#86B862' && cur.bg.value === 'olas', 'crea el workspace y entra');
    // invitar
    await p.evaluate(() => ZC.ui.wsui.inviteSheet(ZC.ws.current().id)); await p.waitForTimeout(400);
    ok((await p.locator('.wsi-link input').inputValue()).startsWith('https://luckicla.github.io/ZenCalendar/w/#'), 'el enlace de invitación');
    await p.locator('.wsi [data-wi=wa]').click(); await p.waitForTimeout(100);
    ok(await p.evaluate(() => window.__opened.some(o => o.app === 'whatsapp' && o.url.includes('/w/#'))), 'WhatsApp con el enlace');
    await p.locator('.wsi [data-wi=mail]').click(); await p.waitForTimeout(100);
    ok(await p.evaluate(() => window.__opened.some(o => o.app === 'email')), 'correo');
    await p.locator('.wsi input[name=mail]').fill('bea@example.com'); await p.locator('.wsi-mail button').click(); await p.waitForTimeout(300);
    ok(await p.evaluate(() => ZC.ws.current().invitedEmails.includes('bea@example.com')), 'invitar por correo de Google');
    ok(!(await inside(p, '.wsi')), 'la hoja de invitar no se desborda');
    await shot(p, 'ws-pc-invitar.png');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);

    // tareas «Para» y quién lo añadió
    await p.evaluate(() => ZC.ws.switchTo(window.__w)); await p.waitForTimeout(400);
    await p.evaluate(() => ZC.ui.editor.open({ kind: 'task', date: new Date() })); await p.waitForTimeout(400);
    ok(await p.locator('.ws-assign').isVisible(), 'el editor de una tarea del workspace tiene «Para»');
    ok(await p.locator('.ed-row.ws-noimg').count() === 1, 'sin imágenes (no van al workspace)');
    await p.locator('.ed-tin').fill('Comprar vino');
    await p.locator('.ws-assign [data-assign=u-bea]').click(); await p.waitForTimeout(150);
    await p.locator('.ed [data-act=save]').click(); await p.waitForTimeout(500);
    const it = await p.evaluate(() => { const e = ZC.store.events().find(x => x.title === 'Comprar vino'); return e && window.__fb.raw('workspaces/' + window.__w + '/items/' + e.id); });
    ok(it && it.assignee === 'u-bea' && it.createdBy === 'u-ana', 'se guarda en Firestore para Bea');
    await p.evaluate(() => ZC.ui.app.go({ view: 'tasks' })); await p.waitForTimeout(500);
    ok((await p.locator('.v-tasks').textContent()).includes('Para: Bea'), 'la lista de tareas dice «Para: Bea»');
    await p.locator('.v-tasks [data-wsact=mine]').click(); await p.waitForTimeout(400);
    ok(!(await p.locator('.v-tasks').textContent()).includes('Comprar vino'), '«Mis tareas» filtra las de los demás');
    await p.locator('.v-tasks [data-wsact=mine]').click(); await p.waitForTimeout(300);
    await p.evaluate(() => ZC.ui.app.go({ view: 'month' })); await p.waitForTimeout(300);
    // aviso cuando otro cambia algo
    await p.evaluate(async () => { const c = window.__fb.client('u-bea'); await c.set('workspaces/' + window.__w + '/items/zz1', { id: 'zz1', kind: 'event', title: 'Cena el viernes', start: window.__day(2) + 'T21:00', end: window.__day(2) + 'T23:00', createdBy: 'u-bea', updatedBy: 'u-bea', updated: c.F.serverTimestamp() }); });
    await p.waitForTimeout(900);
    ok((await p.locator('#toasts').textContent()).includes('Bea ha añadido «Cena el viernes»'), 'toast «Bea ha añadido…»');
    await p.evaluate(() => ZC.ui.editor.detail(ZC.ui.cal.occOf(ZC.store.get('zz1')))); await p.waitForTimeout(400);
    ok((await p.locator('.ws-det').textContent()).includes('Lo añadió Bea'), 'el detalle dice quién lo añadió');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    // un aviso de otro workspace: punto en el selector
    await p.evaluate(async () => { await ZC.ws.switchTo(null); });
    await p.evaluate(async () => { const c = window.__fb.client('u-bea'); await c.set('workspaces/' + window.__w + '/items/zz2', { id: 'zz2', kind: 'event', title: 'Bolera', start: window.__day(3) + 'T19:00', end: window.__day(3) + 'T20:00', createdBy: 'u-bea', updatedBy: 'u-bea', updated: c.F.serverTimestamp() }); });
    await p.waitForTimeout(900);
    ok(await p.locator('#wsChip .wsc-dot').count() === 1, 'punto de novedades en el selector');
    // Ajustes → Workspaces
    await p.evaluate(() => ZC.ui.settings.open('ws')); await p.waitForTimeout(400);
    ok(await p.locator('.set-content .ws-li').count() === 3, 'Ajustes lista los workspaces');
    ok(!(await inside(p, '.set-content')), 'Ajustes → Workspaces no se desborda');
    await shot(p, 'ws-pc-ajustes.png');
    await p.keyboard.press('Escape');
    await ctx.close();
  }

  // ---------- 3. entrar con un enlace (con y sin sesión) ----------
  {
    console.log('entrar con un enlace');
    const { ctx, p } = await page('join', phone, { signedIn: false });
    await p.evaluate(async () => {
      const c = window.__fb.client('u-bea'), F = c.F;
      await c.batch([['set', 'workspaces/wsbea0000001', { name: 'Viaje a Menorca', color: '#7ED6C3', emoji: '🏖️', bg: { kind: 'none', value: '' }, owner: 'u-bea', members: { 'u-bea': { name: 'Bea', email: 'bea@example.com', photo: '', joined: 1 } }, memberIds: ['u-bea'], invitedEmails: [], inviteToken: 'TOKENTOKENTOKEN12345', createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() }],
        ['set', 'workspaces/wsbea0000001/invite/TOKENTOKENTOKEN12345', { name: 'Viaje a Menorca', color: '#7ED6C3', emoji: '🏖️', bg: { kind: 'none', value: '' }, ownerName: 'Bea', count: 1 }]]);
    });
    ok(await p.locator('#wsChip').isVisible(), 'sin sesión el selector también está (para conectar)');
    await p.evaluate(() => ZC.platform._open({ action: 'join', code: 'wsbea0000001.TOKENTOKENTOKEN12345' })); await p.waitForTimeout(500);
    ok((await p.locator('.wsj').textContent()).includes('conecta tu cuenta de Google'), 'pide conectar Google primero');
    await p.locator('.wsj [data-j=conn]').click(); await p.waitForTimeout(700);
    ok((await p.locator('.wsj h2').textContent()) === 'Viaje a Menorca', '«Te han invitado a Viaje a Menorca»');
    ok(!(await inside(p, '.wsj')), 'la pantalla de entrar cabe en 360 px');
    await shot(p, 'ws-movil-entrar.png');
    await p.locator('.wsj [data-j=join]').click(); await p.waitForTimeout(900);
    ok(await p.evaluate(() => (ZC.ws.current() || {}).id === 'wsbea0000001'), 'entra y abre el workspace');
    // enlace que ya no vale
    await p.evaluate(() => ZC.ui.wsui.joinFlow('wsnoexiste0001.CLAVEQUENOVALE0000')); await p.waitForTimeout(500);
    ok((await p.locator('.wsj h2').last().textContent()).includes('ya no vale'), 'un enlace malo lo dice claro');
    await ctx.close();
  }

  // ---------- 4. móvil 360 px, Zen y Dot, claro y oscuro, idiomas ----------
  for (const [design, scheme, locale, label] of [['zen', 'light', 'es-ES', 'Mi calendario'], ['zen', 'dark', 'ca-ES', 'El meu calendari'], ['dot', 'light', 'en-GB', 'My calendar'], ['dot', 'dark', 'es-ES', 'Mi calendario']]) {
    console.log(`móvil 360 · ${design} ${scheme} · ${locale}`);
    const { ctx, p } = await page(`m-${design}-${scheme}`, phone, { locale, scheme });
    await look(p, design, scheme);
    await seed(p);
    await p.evaluate(() => ZC.ws.switchTo(null)); await p.waitForTimeout(400);
    ok((await p.locator('#wsChip').getAttribute('aria-label')).includes(label), `el selector dice «${label}» (para lectores de pantalla)`);
    ok(!(await topOk(p)), 'la cabecera cabe: ' + await topOk(p));
    await p.evaluate(() => ZC.ws.switchTo(window.__w2)); await p.waitForTimeout(700);
    ok(!(await topOk(p)), 'con un nombre largo también: ' + await topOk(p));
    const ttl = await p.evaluate(() => { const r = document.getElementById('periodTitle').getBoundingClientRect(); return r.width > 60 && r.right <= innerWidth; });
    ok(ttl, 'el título se ve y no se sale');
    await shot(p, `ws-movil-${design}-${scheme}.png`);
    await p.locator('#wsChip').click(); await p.waitForTimeout(500);
    ok(await p.locator('.wsm-layer .wsm-row').count() === 3, 'en el móvil el menú es una hoja');
    ok(!(await inside(p, '.wsm-layer .panel')), 'la hoja no se desborda');
    if (design === 'zen' && scheme === 'light') await shot(p, 'ws-movil-menu.png');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.evaluate(() => ZC.ui.wsui.editDialog(window.__w)); await p.waitForTimeout(500);
    ok(!(await inside(p, '.wsd')), 'editar cabe en 360 px');
    ok(await p.locator('.wsd [data-kick]').count() === 2, 'el dueño puede quitar a los otros dos');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.evaluate(() => ZC.ui.settings.open('ws')); await p.waitForTimeout(500);
    ok(!(await inside(p, '.set-content')), 'Ajustes → Workspaces cabe en 360 px');
    await ctx.close();
  }

  // ---------- 5. los textos de los workspaces están traducidos ----------
  {
    const src = fs.readFileSync(path.join(WEB, 'js/ui/ws.js'), 'utf8'), msg = fs.readFileSync(path.join(WEB, 'js/core/ws.js'), 'utf8').split('const MSG = {')[1].split('};')[0];
    const keys = new Set();
    for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);
    for (const m of msg.matchAll(/^\s+\w+: '([^']+)',?$/gm)) keys.add(m[1]);
    for (const m of src.matchAll(/'(\{who\}[^']*)'/g)) keys.add(m[1]);
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await ctx.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    await p.goto(base + '?nowelcome'); await p.waitForSelector('html.ready');
    const miss = await p.evaluate(ks => { const D = ZC.i18n.DICT; return ks.filter(k => !D.en[k] || !D.ca[k]); }, [...keys]);
    ok(!miss.length, 'todo en inglés y en catalán' + (miss.length ? ': faltan ' + miss.join(' | ') : ''));
    await ctx.close();
  }

  ok(!errs.length, 'sin errores en la consola' + (errs.length ? ':\n    ' + errs.join('\n    ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
