'use strict';
// ZenCalendar · pruebas del diseño «Dot» (Playwright, puerto 8821).
//   node tests/ui/dot.js
// Cambiar de diseño y volver, que se quede al recargar, setTheme con design, el aviso del icono (una sola vez),
// la vista Mes de puntos (elegir, crear, arrastrar), los ajustes propios de Dot, la bienvenida, el widget,
// movimiento reducido, que Zen se quede exactamente igual y que no haya errores en la consola.
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web');
const PORT = +process.env.PORT || 8821;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff': 'font/woff' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };
const NO_FONT = !fs.existsSync(path.join(WEB, 'fonts/ZenDot.woff'));

(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  const base = `http://127.0.0.1:${PORT}/index.html`;
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  const watch = (pg, tag) => {
    pg.on('pageerror', e => errs.push(`[${tag}] ${e.message}`));
    pg.on('console', m => { if (m.type() === 'error' && !(NO_FONT && /ZenDot/.test((m.location() || {}).url || '')) && !/net::ERR|ERR_FAILED|fonts\.googleapis/.test(m.text())) errs.push(`[${tag}] ${m.text()}`); });
    pg.on('dialog', d => { errs.push(`[${tag}] diálogo inesperado: ${d.message()}`); d.dismiss(); });
  };
  const mkCtx = (o = {}) => b.newContext({ viewport: { width: 1366, height: 800 }, locale: 'es-ES', timezoneId: 'Europe/Madrid', ...o });

  // ---------- PC ----------
  const ctx = await mkCtx();
  await ctx.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
  const p = await ctx.newPage(); watch(p, 'pc');
  await p.goto(base + '?nowelcome'); await p.waitForSelector('html.ready'); await p.waitForTimeout(400);
  await p.evaluate(() => ZC.store.local('welcomed', true));
  const design = () => p.evaluate(() => document.documentElement.dataset.design);
  const today = await p.evaluate(() => ZC.ui.cal.ymd(ZC.ui.cal.today()));
  // datos: dos eventos hoy y uno el día 10 de este mes
  await p.evaluate(async () => {
    const C = ZC.ui.cal, T = C.today(), d = n => C.ymd(C.addDays(T, n));
    await ZC.store.saveEvent({ title: 'Café', start: d(0) + 'T10:00', end: d(0) + 'T11:00', calendarId: 'personal' });
    await ZC.store.saveEvent({ title: 'Mover me', start: d(0) + 'T12:00', end: d(0) + 'T13:00', calendarId: 'work' });
  });
  await p.evaluate(() => ZC.ui.app.go({ view: 'month', date: ZC.ui.cal.today(), sel: ZC.ui.cal.today() }));
  // (fondo liso para poder comparar capturas: el de la aurora se mueve)
  await p.evaluate(() => ZC.ui.look.set({ bg: 'liso' }));
  await p.mouse.move(2, 790); await p.waitForTimeout(700);

  // 1) por defecto, Zen y nada de Dot
  ok(await design() === 'zen', 'por defecto el diseño es Zen');
  ok(await p.evaluate(() => !document.querySelector('.dm-month, .dm-title, #dotGlyph') && !!document.querySelector('.mv-week')), 'con Zen no hay nada de Dot (ni rejilla de puntos, ni titular en puntos, ni glyph)');
  const zenBefore = await p.screenshot();
  const zenVars = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return ['--a1', '--bg', '--s1', '--fg', '--rad', '--font-ui', '--o-main'].map(k => cs.getPropertyValue(k).trim()).join('|') + '|' + getComputedStyle(document.body).backgroundImage; });

  // 2) Ajustes → Aspecto: el selector grande, y elegir Dot
  const themes = [];
  await p.evaluate(() => { const P = ZC.platform, o = P.setTheme; window.__themes = []; P.setTheme = t => { window.__themes.push(t); return o && o.call(P, t); }; });
  await p.evaluate(() => ZC.store.local('dotIconAsked', null));
  await p.evaluate(() => ZC.ui.settings.open('look')); await p.waitForTimeout(400);
  ok(await p.evaluate(() => { const first = document.querySelector('.set-sec .scard'); return !!(first && first.querySelector('.dz-pick [data-design="zen"].on') && first.querySelector('.dz-pick [data-design="dot"] .dz-dot')); }), 'Ajustes → Aspecto empieza con «Diseño: Zen / Dot» y sus dos miniaturas');
  await p.click('.set-sec .dz-pick [data-design="dot"]'); await p.waitForTimeout(700);
  ok(await design() === 'dot', 'al tocar «Dot» cambia el diseño');
  ok(await p.evaluate(() => ZC.store.getPrefs().look.design) === 'dot', 'se guarda en prefs.look.design');
  ok(await p.evaluate(() => !!document.querySelector('.set-sec .dz-acc') && !document.querySelector('.set-sec .presets, .set-sec .themes')), 'en Dot, Aspecto enseña su acento y esconde los temas pastel');
  themes.push(...await p.evaluate(() => window.__themes));
  ok(themes.length > 0 && themes[themes.length - 1].design === 'dot', 'setTheme recibe design: "dot"');
  // el aviso del icono, una sola vez
  ok(await p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].some(x => /icono de Dot/.test(x.textContent))), 'al elegir Dot se ofrece (sin imponer) el icono de Dot');
  await p.click('#toasts .toast:last-child .toast-act'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => ZC.ui.look.get().appIcon) === 'dot', '«Cambiar icono» pone el icono de Dot');
  await p.evaluate(() => ZC.ui.back()); await p.waitForTimeout(300);

  // 3) la interfaz cambia de verdad
  ok(await p.evaluate(() => !!document.querySelector('#viewHost .dm-month .dm-grid .dm-day') && !document.querySelector('#viewHost .mv-week')), 'la vista Mes es la rejilla de puntos');
  ok(await p.evaluate(() => !!document.querySelector('#periodTitle .dm-title svg.dm circle.l') && !!document.querySelector('#btnToday .dm-today svg')), 'la cabecera tiene el mes y la fecha de hoy en matriz de puntos');
  // el espacio del titular no lleva puntos apagados: «NOVIEMBRE 2026» no sale pegado (y los dibujos son los de ZenDot)
  ok(await p.evaluate(() => { const svg = ZC.ui.dot.matrix([{ text: 'AB' }, { text: ' 12', tone: 'dim' }], { pitch: 1 }); const xs = [...new Set([...svg.matchAll(/cx="([\d.]+)"/g)].map(m => +m[1]))].sort((a, b) => a - b); const gaps = xs.slice(1).map((x, i) => x - xs[i]); return Math.max(...gaps) === 6 && /circle/.test(ZC.ui.dot.matrix('Ç')); }), 'titular: el espacio deja un hueco de verdad entre el mes y el año');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#viewHost > .dm-month')).flexDirection) === 'row', 'en el PC, la rejilla a la izquierda y el día elegido a la derecha');
  ok(await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return cs.getPropertyValue('--bg').trim().toLowerCase() === '#f2f2f2' && cs.getPropertyValue('--a1').trim().toUpperCase() === '#D71921'; }), 'paleta de Dot: blanco/gris y rojo #D71921');
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('bgCanvas')).display === 'none' && /radial-gradient/.test(getComputedStyle(document.body).backgroundImage)), 'fondo de puntos (sin las manchas pastel)');
  ok(await p.evaluate(() => { const l = document.querySelector(`.dm-day[data-d="${ZC.ui.cal.ymd(ZC.ui.cal.today())}"]`); return l && l.classList.contains('today') && l.classList.contains('l2'); }), 'el punto de hoy se enciende según la carga (2 eventos → nivel 2)');

  // 4) elegir un día, crear con doble clic, arrastrar desde la lista del día
  const other = await p.evaluate(() => { const T = ZC.ui.cal.today(), d = new Date(T.getFullYear(), T.getMonth(), T.getDate() === 10 ? 11 : 10); return ZC.ui.cal.ymd(d); });
  await p.click(`.dm-day[data-d="${other}"]`); await p.waitForTimeout(250);
  ok(await p.evaluate(o => ZC.ui.cal.ymd(ZC.ui.app.state.sel) === o && document.querySelector(`.dm-day[data-d="${o}"]`).classList.contains('sel') && /Día libre|Nada/.test(document.querySelector('.dm-panel').textContent), other), 'tocar un día lo elige y enseña su lista a la derecha');
  await p.dblclick(`.dm-day[data-d="${other}"]`); await p.waitForTimeout(500);
  ok(await p.evaluate(o => !!document.querySelector('.ed-panel') && document.querySelector('.ed-panel input[name=sd]').value === o, other), 'doble clic en un día abre el editor en ese día');
  await p.evaluate(() => ZC.ui.back()); await p.waitForTimeout(400);
  await p.click(`.dm-day[data-d="${today}"]`); await p.waitForTimeout(300);
  const card = await p.$('.dm-panel .ag-card:has-text("Mover me")'), cb = await card.boundingBox(), tb = await (await p.$(`.dm-day[data-d="${other}"] .dm-dot`)).boundingBox();
  await p.mouse.move(cb.x + 80, cb.y + cb.height / 2); await p.mouse.down();
  await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(600);
  ok(await p.evaluate(o => (ZC.store.events().find(e => e.title === 'Mover me') || {}).start === o + 'T12:00', other), 'arrastrar una tarjeta de la lista a otro punto mueve el evento (misma hora)');
  ok(await p.evaluate(() => !document.querySelector('.layer')), 'soltar el arrastre no abre el detalle');

  // 5) otras vistas en Dot
  for (const v of ['week', 'day', 'agenda', 'year']) { await p.evaluate(v => ZC.ui.app.go({ view: v }), v); await p.waitForTimeout(350); }
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.yd')).borderRadius === '50%' && getComputedStyle(document.querySelector('.yd')).fontSize === '0px'), 'Año: cada día es un punto sin número');
  await p.evaluate(() => ZC.ui.app.go({ view: 'day', date: ZC.ui.cal.today() })); await p.waitForTimeout(350);
  ok(await p.evaluate(() => { const n = document.querySelector('.now-line'); return n && getComputedStyle(n).backgroundColor === 'rgb(215, 25, 33)'; }), 'Día: la hora actual es una línea roja');
  await p.evaluate(() => ZC.ui.app.go({ view: 'month', date: ZC.ui.cal.today(), sel: ZC.ui.cal.today() })); await p.waitForTimeout(350);

  // 6) ajustes propios de Dot
  await p.evaluate(() => ZC.ui.look.set({ dotAccent: 'ink' })); await p.waitForTimeout(150);
  ok(await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return cs.getPropertyValue('--a1').trim() === cs.getPropertyValue('--fg').trim(); }), 'acento «Tinta» = el color del texto');
  await p.evaluate(() => ZC.ui.look.set({ dotAccent: 'red' })); await p.evaluate(() => ZC.ui.settings.open('bg')); await p.waitForTimeout(250);
  await p.click('.dz-bgs [data-v=glyph]'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => !!document.getElementById('dotGlyph') && ZC.ui.look.get().dotGlass === 40), 'fondo «Glyph»: aparece su lienzo y los paneles se vuelven más transparentes para que se vea');
  await p.click('.dz-bgs [data-v=dots]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => ZC.ui.look.get().dotGlass === 22), '…y al dejarlo la transparencia vuelve a la de siempre');
  await p.evaluate(() => { ZC.ui.back(); ZC.ui.look.set({ dotBg: 'glyph' }); }); await p.waitForTimeout(300);
  await p.evaluate(() => ZC.ui.look.set({ dotBg: 'grid', dotColors: 'mono' })); await p.waitForTimeout(150);
  ok(await p.evaluate(() => !document.getElementById('dotGlyph') && document.documentElement.dataset.dotbg === 'grid' && document.documentElement.dataset.dotcolor === 'mono'), 'rejilla y «sin color»: el glyph se va y cambian los atributos');
  await p.evaluate(() => ZC.ui.look.set({ dotBg: 'dots', dotColors: 'dot', dotGlass: 50 })); await p.waitForTimeout(150);
  ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--o-main').trim() === '50%'), 'la transparencia de Dot mueve el vidrio de los paneles');
  await p.evaluate(() => ZC.ui.look.set({ dotGlass: 22 }));
  for (const s of ['bg', 'glass', 'shape', 'type']) { await p.evaluate(s => ZC.ui.settings.open(s), s); await p.waitForTimeout(250); }
  ok(await p.evaluate(() => !!document.querySelector('.set-sec[data-sec=type] [data-k="look.dotFont"]')), 'Ajustes → Letras en Dot: la letra del texto');
  await p.evaluate(() => ZC.ui.back()); await p.waitForTimeout(300);

  // 7) recargar: se queda en Dot (y sin destello: el atributo ya está antes del primer pintado)
  await p.goto(base + '?nowelcome', { waitUntil: 'commit' });
  const early = await p.evaluate(() => document.documentElement.dataset.design || '').catch(() => '');
  await p.waitForSelector('html.ready'); await p.waitForTimeout(400);
  await p.evaluate(() => { const P = ZC.platform, o = P.setTheme; window.__themes = []; P.setTheme = t => { window.__themes.push(t); return o && o.call(P, t); }; });
  ok(await design() === 'dot' && !!(await p.$('#viewHost .dm-month')), 'al recargar sigue en Dot');
  ok(early === 'dot' || early === '', 'el primer pintado ya sabe que es Dot (lookCache)');

  // 8) movimiento reducido: nada de puntos en secuencia
  await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(200);
  await p.evaluate(() => ZC.ui.app.step(1)); await p.waitForTimeout(200);
  ok(await p.evaluate(() => { const l = document.querySelector('.dm.scan .l, .dm .l'); return document.documentElement.dataset.anim === 'soft' && (!l || getComputedStyle(l).animationName === 'none'); }), 'con movimiento reducido, sin el barrido de puntos');
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.evaluate(() => ZC.ui.app.go({ view: 'month', date: ZC.ui.cal.today(), sel: ZC.ui.cal.today() })); await p.waitForTimeout(300);

  // 9) el widget de escritorio también en Dot
  const wp = await ctx.newPage(); watch(wp, 'widget');
  await wp.setViewportSize({ width: 340, height: 420 });
  await wp.goto(`http://127.0.0.1:${PORT}/widget.html`); await wp.waitForSelector('html.ready'); await wp.waitForTimeout(300);
  ok(await wp.evaluate(() => document.documentElement.dataset.design === 'dot' && !!document.querySelector('.w-card.dot-w .w-date svg.dm')), 'widget.html en Dot: la fecha en matriz de puntos');
  await wp.close();

  // 10) volver a Zen: todo como estaba
  await p.evaluate(() => ZC.ui.settings.open('look')); await p.waitForTimeout(300);
  await p.click('.set-sec .dz-pick [data-design="zen"]'); await p.waitForTimeout(700);
  ok(await design() === 'zen', 'volver a Zen desde Ajustes');
  ok(await p.evaluate(() => !!document.querySelector('.set-sec .presets') && !document.querySelector('.set-sec .dz-acc')), 'Aspecto vuelve a enseñar los estilos y temas de Zen');
  await p.evaluate(() => ZC.ui.back()); await p.waitForTimeout(400);
  ok(await p.evaluate(() => !document.querySelector('.dm-month, .dm-title, #dotGlyph') && !!document.querySelector('#viewHost .mv-week')), 'con Zen otra vez: la rejilla de siempre y nada de Dot');
  const zenVars2 = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); return ['--a1', '--bg', '--s1', '--fg', '--rad', '--font-ui', '--o-main'].map(k => cs.getPropertyValue(k).trim()).join('|') + '|' + getComputedStyle(document.body).backgroundImage; });
  ok(zenVars === zenVars2, 'las variables de Zen son las mismas que antes de pasar por Dot');
  // misma pantalla, píxel a píxel (el evento movido vuelve a su sitio)
  await p.evaluate(async t => { const e = ZC.store.events().find(x => x.title === 'Mover me'); await ZC.store.saveEvent({ ...e, start: t + 'T12:00', end: t + 'T13:00' }); }, today);
  await p.evaluate(() => { ZC.ui.layers.slice().forEach(l => l.close()); document.querySelectorAll('#toasts .toast').forEach(x => x.remove()); ZC.ui.app.go({ view: 'month', date: ZC.ui.cal.today(), sel: ZC.ui.cal.today() }); });
  await p.mouse.move(2, 790); await p.waitForTimeout(900);
  const zenAfter = await p.screenshot();
  if (process.env.DEBUG) { fs.writeFileSync('/tmp/zen-before.png', zenBefore); fs.writeFileSync('/tmp/zen-after.png', zenAfter); }
  // (se comparan en el navegador: cuentan los píxeles que cambian más de 6 niveles; el suavizado de las esquinas
  // de vidrio puede bailar 1 o 2 niveles entre dos pintados y eso no es un cambio)
  const diff = await p.evaluate(async ([a, c]) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
    const [ia, ic] = await Promise.all([load(a), load(c)]);
    const px = im => { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
    const A = px(ia), B = px(ic); let n = 0;
    for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) > 6 || Math.abs(A[i + 1] - B[i + 1]) > 6 || Math.abs(A[i + 2] - B[i + 2]) > 6) n++;
    return n;
  }, [zenBefore.toString('base64'), zenAfter.toString('base64')]);
  ok(diff === 0, `Zen se ve igual (misma captura) tras ir a Dot y volver${diff ? ` (${diff} píxeles distintos)` : ''}`);
  ok(await p.evaluate(() => window.__themes[window.__themes.length - 1].design) === 'zen', 'setTheme recibe design: "zen" al volver');
  // el aviso del icono no vuelve a salir
  await p.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(x => x.remove()));
  await p.evaluate(() => ZC.ui.look.set({ design: 'dot', appIcon: 'pastel' })); await p.waitForTimeout(800);
  ok(await p.evaluate(() => ![...document.querySelectorAll('#toasts .toast')].some(x => /icono de Dot/.test(x.textContent))), 'el icono de Dot se ofrece solo una vez');
  await p.evaluate(() => ZC.ui.look.set({ design: 'zen' })); await p.waitForTimeout(300);
  await ctx.close();

  // ---------- móvil: bienvenida y Mes ----------
  const mctx = await mkCtx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mctx.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
  const m = await mctx.newPage(); watch(m, 'móvil');
  await m.goto(base + '?plat=android'); await m.waitForSelector('html.ready'); await m.waitForTimeout(900);
  await m.evaluate(() => ZC.store.local('dotIconAsked', true));
  ok(!!(await m.$('.welcome .dz-pick [data-design="dot"]')), 'bienvenida, paso 1: «Diseño: Zen / Dot»');
  await m.tap('.welcome [data-design="dot"]'); await m.waitForTimeout(500);
  ok(await m.evaluate(() => document.documentElement.dataset.design === 'dot' && document.querySelector('.welcome .wl-presets').hidden && !!document.querySelector('.welcome .wl-dotlogo')), 'elegir Dot en la bienvenida: cambia todo y esconde los estilos pastel');
  await m.tap('.welcome [data-design="zen"]'); await m.waitForTimeout(400);
  ok(await m.evaluate(() => document.documentElement.dataset.design === 'zen' && !document.querySelector('.welcome .wl-presets').hidden), 'y volver a Zen en la bienvenida');
  await m.tap('.welcome [data-design="dot"]'); await m.waitForTimeout(300);
  await m.evaluate(() => { ZC.store.local('welcomed', true); ZC.ui.layers.slice().forEach(l => l.close()); }); await m.waitForTimeout(500);
  ok(await m.evaluate(() => getComputedStyle(document.querySelector('#viewHost > .dm-month')).flexDirection === 'column' && !!document.querySelector('.dm-panel.mv-daylist')), 'móvil: la rejilla de puntos arriba y el día elegido debajo');
  const td = await m.evaluate(() => { const T = ZC.ui.cal.today(); return ZC.ui.cal.ymd(new Date(T.getFullYear(), T.getMonth(), T.getDate() === 12 ? 13 : 12)); });
  await m.tap(`.dm-day[data-d="${td}"]`); await m.waitForTimeout(250);
  ok(await m.evaluate(d => ZC.ui.cal.ymd(ZC.ui.app.state.sel) === d, td), 'móvil: tocar un punto elige ese día');
  // gestos con la rejilla de puntos: deslizar cambia de mes (asomando el de al lado) y doble toque crea
  const cdp = await mctx.newCDPSession(m);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mon = () => m.evaluate(() => ZC.ui.app.state.date.getMonth() + ZC.ui.app.state.date.getFullYear() * 12);
  const m0 = await mon(), gb = await (await m.$('.dm-grid')).boundingBox(), gy = gb.y + gb.height / 2;
  await touch('touchStart', [[330, gy]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[330 - i * 22, gy + 2]]); await sleep(14); }
  const peek = !!(await m.$('.view.peek.dm-month'));
  await touch('touchEnd', []); await sleep(700);
  ok(peek && await mon() === m0 + 1 && !!(await m.$('#viewHost .dm-month')), 'móvil: deslizar la rejilla de puntos pasa al mes siguiente (y asoma, también en puntos)');
  await m.evaluate(() => ZC.ui.app.goToday()); await sleep(500);
  const cb2 = await (await m.$(`.dm-day[data-d="${td}"] .dm-dot`)).boundingBox(), cx = cb2.x + cb2.width / 2, cy = cb2.y + cb2.height / 2;
  for (let k = 0; k < 2; k++) { await touch('touchStart', [[cx, cy]]); await sleep(30); await touch('touchEnd', []); await sleep(90); }
  await sleep(600);
  ok(await m.evaluate(d => !!document.querySelector('.ed-panel') && document.querySelector('.ed-panel input[name=sd]').value === d, td), 'móvil: doble toque en un punto abre el editor en ese día');
  await m.evaluate(() => ZC.ui.back()); await sleep(400);
  const fab = await m.evaluate(() => { const cs = getComputedStyle(document.getElementById('fab')); return cs.borderRadius === '50%' && cs.backgroundColor === 'rgb(215, 25, 33)'; });
  ok(fab, 'el «+» es un círculo rojo');
  await mctx.close();

  ok(!errs.length, 'sin errores en la consola' + (errs.length ? ':\n    ' + errs.join('\n    ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FALLO(S)` : '\nTodo bien');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
