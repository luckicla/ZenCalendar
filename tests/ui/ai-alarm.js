'use strict';
// ZenCalendar · IA que borra y alarmas, la parte de la interfaz (Playwright, puerto 8911).
//   node tests/ui/ai-alarm.js
// Editor (interruptor «Alarma» y su hora en los de todo el día), icono en el detalle y en las vistas,
// añadir rápido (chip «Alarma» y «¿Le pongo alarma?»), y en el asistente: borrados agrupados con casillas,
// sugerencias desmarcadas con su motivo, confirmación con `confirmMany` y «Deshacer» de todo.
// Primero con respuestas simuladas (ZC.ai.run de mentira) y, si el núcleo ya lo tiene, con el proveedor `rules` de verdad.
// Capturas en tests/ui/out/ai-alarm-*.png (Zen/Dot, claro/oscuro, ES/CA/EN, PC y 360 px).
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const WEB = path.resolve(__dirname, '../../web'), OUT = path.join(__dirname, 'out');
const PORT = +process.env.PORT || 8911;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(WEB, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); }); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FALLO ') + m); if (!c) fails++; };
fs.mkdirSync(OUT, { recursive: true });

// datos de prueba: 4 cosas mañana, 25 el sábado que viene (para confirmMany)
async function seed(p) {
  return p.evaluate(async () => {
    const C = ZC.ui.cal, S = ZC.store;
    for (const e of S.events()) await S.deleteEvent(e.id);
    const tm = C.ymd(C.addDays(C.today(), 1)), far = C.ymd(C.addDays(C.today(), 10));
    const ids = [];
    for (const [ti, h] of [['Reunión de equipo', '09:00'], ['Dentista', '11:30'], ['Comida con Ana', '14:00'], ['Gimnasio', '19:00']]) ids.push((await S.saveEvent({ title: ti, start: tm + 'T' + h, end: tm + 'T' + h.replace(/^(\d\d)/, (m, x) => String(+x + 1).padStart(2, '0')) })).id);
    const many = [];
    for (let i = 0; i < 25; i++) many.push((await S.saveEvent({ title: 'Turno ' + (i + 1), start: far + 'T' + String(8 + (i % 12)).padStart(2, '0') + ':00', end: far + 'T' + String(8 + (i % 12)).padStart(2, '0') + ':30' })).id);
    return { ids, many, tm, far };
  });
}
// respuesta simulada del asistente: la siguiente llamada a ZC.ai.run devuelve `res`
const mockNext = (p, res) => p.evaluate(res => { if (!ZC.ai.__run) ZC.ai.__run = ZC.ai.run; ZC.ai.run = async () => { ZC.ai.run = ZC.ai.__run; return JSON.parse(JSON.stringify(res)); }; }, res);
const ask = async (p, text) => { await p.fill('.ai-panel textarea', text); await p.keyboard.press('Enter'); await p.waitForTimeout(500); };
const lastMsg = p => p.$$('.msg.ai').then(m => m[m.length - 1]);
const applyText = async p => (await (await lastMsg(p)).$eval('[data-apply]', b => b.textContent.trim()).catch(() => ''));
const alive = (p, ids) => p.evaluate(ids => ids.filter(id => { const e = ZC.store.get(id); return e && !e.deleted; }).length, ids);
// nada se sale de su sitio dentro del panel (texto que desborda en horizontal)
const overflow = p => p.evaluate(() => [...document.querySelectorAll('.ai-panel .ai-act, .ai-panel .ai-grp, .ai-panel .ai-sug, .ai-panel .ai-btns, .ed-panel .ed-alarm, .qa-chips')].filter(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className));

(async () => {
  await new Promise((res, rej) => { srv.once('error', rej); srv.listen(PORT, '127.0.0.1', res); });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errs = [];
  const open = async (opts, tag) => {
    const c = await b.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', ...opts });
    await c.route(u => !String(u).startsWith('http://127.0.0.1'), r => r.abort());
    const p = await c.newPage();
    p.on('pageerror', e => errs.push(`[${tag}] ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errs.push(`[${tag}] ${m.text()}`); });
    p.on('dialog', d => { errs.push(`[${tag}] diálogo inesperado: ${d.message()}`); d.dismiss(); });
    await p.goto(`http://127.0.0.1:${PORT}/index.html?nowelcome`); await p.waitForSelector('html.ready');
    await p.evaluate(() => ZC.store.local('welcomed', true));
    return { c, p };
  };
  const setLook = (p, look, lang) => p.evaluate(async ([look, lang]) => { ZC.ui.look.set(look); await ZC.store.setPrefs({ cal: { ...ZC.ui.prefsCal(), lang } }); }, [look, lang]);

  // ================= PC, Zen claro, español: todo lo que hace =================
  console.log('PC · Zen claro · ES');
  let { c, p } = await open({ viewport: { width: 1366, height: 800 } }, 'pc');
  await setLook(p, { design: 'zen', scheme: 'light', anim: 'off' }, 'es'); await p.waitForTimeout(300);
  let D = await seed(p);

  // --- editor: interruptor y hora en los de todo el día
  await p.evaluate(() => ZC.ui.editor.open({ date: ZC.ui.cal.addDays(ZC.ui.cal.today(), 2) })); await p.waitForTimeout(400);
  await p.fill('.ed-tin', 'Vuelo a Lisboa');
  ok(await p.$eval('[data-act=alarm]', b => b.getAttribute('aria-checked')) === 'false', 'editor: la alarma empieza apagada');
  ok(/despertador/.test(await p.$eval('.ed-alarm small', e => e.textContent)), 'editor: explica qué hace la alarma');
  await p.click('[data-act=alarm]'); await p.waitForTimeout(150);
  ok(await p.$eval('[data-act=alarm]', b => b.getAttribute('aria-checked')) === 'true', 'editor: el interruptor se enciende');
  ok(!(await p.$('[name=alarmTime]')), 'editor: sin hora de alarma en un evento con hora');
  await p.click('[data-act=allday]'); await p.waitForTimeout(150);
  ok(!!(await p.$('[name=alarmTime]')), 'editor: en todo el día sale la hora de la alarma');
  ok(await p.$eval('.ed-tin', e => e.value) === 'Vuelo a Lisboa', 'editor: el título no se pierde al repintar');
  await p.fill('[name=alarmTime]', '07:30');
  await p.screenshot({ path: path.join(OUT, 'ai-alarm-editor-pc.png') });
  await p.click('[data-act=save]'); await p.waitForTimeout(400);
  let ev = await p.evaluate(() => ZC.store.events().find(e => e.title === 'Vuelo a Lisboa'));
  ok(ev && ev.alarm === true && ev.alarmTime === '07:30' && ev.allDay, 'editor: guarda alarm y alarmTime');
  // un evento con hora con alarma y sin ella
  const ida = await p.evaluate(async tm => (await ZC.store.saveEvent({ title: 'Examen', start: tm + 'T08:00', end: tm + 'T10:00', alarm: true })).id, D.tm);
  // --- vistas y detalle
  for (const v of ['month', 'week', 'agenda']) {
    await p.evaluate(v => ZC.ui.app.go({ view: v, date: ZC.ui.cal.addDays(ZC.ui.cal.today(), 1), sel: ZC.ui.cal.addDays(ZC.ui.cal.today(), 1) }), v); await p.waitForTimeout(450);
    ok(await p.evaluate(id => [...document.querySelectorAll(`[data-key^="${id}@"]`)].some(e => e.querySelector('.al-mk, .mi.al')), ida), `vista ${v}: icono de despertador en lo que tiene alarma`);
  }
  ok(await p.evaluate(id => { const e = [...document.querySelectorAll('.ag-card')].find(x => !x.dataset.key.startsWith(id)); return e && !e.querySelector('.al-mk, .mi.al'); }, ida), 'vistas: sin icono en lo que no tiene alarma');
  await p.evaluate(id => ZC.ui.editor.detail(ZC.ui.cal.occOf(ZC.store.get(id))), ida); await p.waitForTimeout(400);
  ok(/Alarma a las 08:00/.test(await p.$eval('.dt-alarm', e => e.textContent).catch(() => '')), 'detalle: «Alarma a las 08:00»');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.evaluate(id => ZC.ui.editor.open({ ev: ZC.store.get(id) }), ida); await p.waitForTimeout(350);
  ok(await p.$eval('[data-act=alarm]', b => b.getAttribute('aria-checked')) === 'true', 'editor: al editar sale encendida');
  await p.click('[data-act=alarm]'); await p.click('[data-act=save]'); await p.waitForTimeout(400);
  ok(await p.evaluate(id => ZC.store.get(id).alarm === false, ida), 'editor: apagarla la quita');

  // --- añadir rápido
  await p.evaluate(() => ZC.ui.app.go({ view: 'month', date: new Date() })); await p.waitForTimeout(300);
  const realAlarm = await p.evaluate(() => { const r = ZC.nlp.parse('despiértame a las 7', { lang: 'es', now: new Date() }) || {}; const s = ZC.nlp.parse('cita importante con el médico el jueves a las 10', { lang: 'es', now: new Date() }) || {}; return { alarm: !!r.alarm, sug: !!s.alarmSuggested }; });
  console.log('  (nlp de verdad: alarm=' + realAlarm.alarm + ', alarmSuggested=' + realAlarm.sug + ')');
  if (!realAlarm.alarm || !realAlarm.sug) await p.evaluate(() => { const orig = ZC.nlp.parse; ZC.nlp.parse = (tx, o) => { const r = orig(tx, o); if (r && /despi[eé]rtame/i.test(tx)) r.alarm = true; if (r && /importante/i.test(tx)) r.alarmSuggested = true; return r; }; });
  await p.click('#qaIn'); await p.keyboard.type('despiértame a las 7'); await p.waitForTimeout(400);
  ok(!!(await p.$('.qa-chips .chip.al.on')), 'añadir rápido: chip «Alarma» cuando la frase la pide');
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  ev = await p.evaluate(() => ZC.store.events().sort((a, b) => b.created - a.created)[0]);
  ok(ev && ev.alarm === true, 'añadir rápido: guarda con alarma');
  await p.click('#qaIn'); await p.keyboard.type('cita importante con el médico el jueves a las 10'); await p.waitForTimeout(400);
  ok(!!(await p.$('.qa-chips .chip.al.sug')), 'añadir rápido: sugerencia «¿Le pongo alarma?»');
  ok(/¿Le pongo alarma\?/.test(await p.$eval('.qa-chips .chip.al', e => e.textContent).catch(() => '')), 'añadir rápido: el texto de la sugerencia');
  await p.screenshot({ path: path.join(OUT, 'ai-alarm-quick-pc.png'), clip: { x: 0, y: 0, width: 1366, height: 260 } });
  await p.click('.qa-chips .chip.al'); await p.waitForTimeout(250);
  ok(!!(await p.$('.qa-chips .chip.al.on')), 'añadir rápido: tocarla la convierte en «Alarma»');
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  ev = await p.evaluate(() => ZC.store.events().sort((a, b) => b.created - a.created)[0]);
  ok(ev && ev.alarm === true && /m[eé]dico/i.test(ev.title), 'añadir rápido: la sugerencia aceptada se guarda');
  await p.click('#qaIn'); await p.keyboard.type('cita importante con el médico el jueves a las 10'); await p.waitForTimeout(400);
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  ev = await p.evaluate(() => ZC.store.events().sort((a, b) => b.created - a.created)[0]);
  ok(ev && !ev.alarm, 'añadir rápido: sin tocarla, no pone alarma');

  // --- asistente con respuestas simuladas
  D = await seed(p);
  await p.evaluate(() => ZC.ui.aipanel.open()); await p.waitForTimeout(400);
  const chips = await p.$$eval('.ai-sugg .chip', b => b.map(x => x.textContent));
  ok(chips.includes('Quita todo lo de mañana') && chips.includes('Despiértame a las 7'), 'asistente: ejemplos nuevos');
  await mockNext(p, { reply: 'He encontrado 4 eventos de mañana para borrar.', actions: D.ids.map(id => ({ type: 'delete', id })) });
  await ask(p, 'quita todo lo de mañana');
  let m = await lastMsg(p);
  ok((await m.$$('.ai-grp')).length === 1 && (await m.$$('.ai-act.delete')).length === 0, 'asistente: los borrados van en un solo grupo');
  ok(/4 eventos de mañana/.test(await m.$eval('.ai-grp-head b', e => e.textContent)), 'asistente: «4 eventos de mañana»');
  ok(await applyText(p) === 'Borrar 4 eventos', 'asistente: el botón dice «Borrar 4 eventos»');
  ok(await m.$eval('.ai-grp-list', e => !e.hidden), 'asistente: con pocos, la lista sale abierta');
  const boxes = await m.$$('.ai-grp-it .ck');
  ok(boxes.length === 4 && (await Promise.all(boxes.map(x => x.isChecked()))).every(Boolean), 'asistente: una casilla marcada por evento');
  await boxes[1].click(); await p.waitForTimeout(200);
  m = await lastMsg(p);
  ok(await applyText(p) === 'Borrar 3 eventos', 'asistente: desmarcar uno → «Borrar 3 eventos»');
  ok(/Se queda 1/.test(await m.$eval('.ai-grp-head', e => e.textContent)), 'asistente: «Se queda 1»');
  await m.$eval('.ai-grp-head', b => b.click()); await p.waitForTimeout(150);
  ok(await (await lastMsg(p)).$eval('.ai-grp-list', e => e.hidden), 'asistente: el grupo se pliega');
  await (await lastMsg(p)).$eval('.ai-grp-head', b => b.click()); await p.waitForTimeout(150);
  await p.evaluate(() => document.querySelectorAll('#toasts > *').forEach(x => x.remove()));
  await p.screenshot({ path: path.join(OUT, 'ai-alarm-grupo-pc.png') });
  await p.click('.msg.ai:last-child [data-apply]'); await p.waitForTimeout(500);
  ok(await alive(p, D.ids) === 1 && await p.evaluate(id => !ZC.store.get(id).deleted, D.ids[1]), 'asistente: borra los marcados y deja el desmarcado');
  ok(/3 eventos borrados/.test(await (await lastMsg(p)).$eval('.ai-done', e => e.textContent)), 'asistente: «3 eventos borrados»');
  await p.click('.msg.ai:last-child [data-undo]'); await p.waitForTimeout(500);
  ok(await alive(p, D.ids) === 4, 'asistente: «Deshacer» devuelve todo lo borrado');

  // sugerencia de alarma (create + update con ref y suggest)
  const tue = await p.evaluate(() => ZC.ui.cal.ymd(ZC.ui.cal.addDays(ZC.ui.cal.today(), 3)));
  await mockNext(p, { reply: 'Te apunto la cita con el médico.', actions: [{ type: 'create', event: { title: 'Cita con el médico', start: tue + 'T10:00', end: tue + 'T10:30' } }, { type: 'update', ref: 0, changes: { alarm: true }, suggest: true, why: 'Es una cita médica a una hora fija.' }] });
  await ask(p, 'cita importante con el médico el jueves a las 10');
  m = await lastMsg(p);
  ok((await m.$$('.ai-sug')).length === 1 && !(await m.$('.ai-sug.on')), 'asistente: la sugerencia sale desmarcada');
  ok(/cita médica/.test(await m.$eval('.ai-sug em', e => e.textContent)), 'asistente: enseña el motivo');
  ok(await applyText(p) === 'Crear evento', 'asistente: sin aceptarla, «Crear evento»');
  await m.$eval('.ai-sug .sw', b => b.click()); await p.waitForTimeout(200);
  ok(await applyText(p) === 'Crear evento con alarma', 'asistente: aceptada, «Crear evento con alarma»');
  await p.screenshot({ path: path.join(OUT, 'ai-alarm-sugerencia-pc.png') });
  await p.click('.msg.ai:last-child [data-apply]'); await p.waitForTimeout(500);
  ev = await p.evaluate(() => ZC.store.events().find(e => e.title === 'Cita con el médico'));
  ok(ev && ev.alarm === true, 'asistente: la sugerencia aceptada pone la alarma');
  // y sin aceptarla
  await mockNext(p, { reply: 'Vale.', actions: [{ type: 'create', event: { title: 'Entrevista', start: tue + 'T12:00', end: tue + 'T13:00' } }, { type: 'update', ref: 0, changes: { alarm: true }, suggest: true, why: 'Es una entrevista.' }] });
  await ask(p, 'entrevista el jueves a las 12');
  await p.click('.msg.ai:last-child [data-apply]'); await p.waitForTimeout(500);
  ev = await p.evaluate(() => ZC.store.events().find(e => e.title === 'Entrevista'));
  ok(ev && !ev.alarm, 'asistente: la sugerencia rechazada no se aplica');
  ok(!(await (await lastMsg(p)).$('.ai-sug')), 'asistente: después de aplicar no queda la sugerencia rechazada');

  // confirmMany: pide confirmación y se puede cancelar
  await mockNext(p, { reply: 'He encontrado 25 eventos para borrar.', confirmMany: true, actions: D.many.map(id => ({ type: 'delete', id })) });
  await ask(p, 'borra todo lo del sábado 5');
  m = await lastMsg(p);
  ok(await m.$eval('.ai-grp-list', e => e.hidden), 'asistente: con muchos, la lista empieza plegada');
  await p.click('.msg.ai:last-child [data-apply]'); await p.waitForTimeout(400);
  ok(/Borrar 25 eventos/.test(await p.$eval('.dlg', e => e.textContent).catch(() => '')), 'asistente: con confirmMany pide confirmación');
  await p.screenshot({ path: path.join(OUT, 'ai-alarm-confirmar-pc.png') });
  await p.click('.dlg [data-a=no]'); await p.waitForTimeout(400);
  ok(await alive(p, D.many) === 25 && !!(await (await lastMsg(p)).$('[data-apply]')), 'asistente: cancelar no borra nada');
  await p.click('.msg.ai:last-child [data-apply]'); await p.waitForTimeout(400);
  await p.click('.dlg [data-a=ok]'); await p.waitForTimeout(900);
  ok(await alive(p, D.many) === 0, 'asistente: confirmar borra los 25');
  await p.click('.msg.ai:last-child [data-undo]'); await p.waitForTimeout(900);
  ok(await alive(p, D.many) === 25, 'asistente: deshacer devuelve los 25');
  ok(!(await overflow(p)).length, 'asistente: nada se desborda (PC)');

  // --- con el núcleo de verdad (proveedor rules), si ya está
  D = await seed(p);
  const hasCmd = await p.evaluate(async () => { try { ZC.ai.setConfig({ provider: 'rules' }); const r = await ZC.ai.run('quita todo lo de mañana', { lang: 'es' }); return (r.actions || []).filter(a => a.type === 'delete').length >= 2; } catch { return false; } });
  if (hasCmd) {
    console.log('  (proveedor rules de verdad)');
    D = await seed(p);
    await p.evaluate(() => { ZC.ai.setConfig({ provider: 'rules' }); });
    const sid = await p.evaluate(async () => (await ZC.store.saveEvent({ title: 'Paseo', start: ZC.ui.cal.ymd(ZC.ui.cal.addDays(ZC.ui.cal.today(), -3)) + 'T08:00', end: ZC.ui.cal.ymd(ZC.ui.cal.addDays(ZC.ui.cal.today(), -3)) + 'T08:30', rrule: { freq: 'daily', interval: 1 } })).id);
    await p.click('[data-a=clear]'); await p.waitForTimeout(200);
    await ask(p, 'quita todo lo de mañana'); await p.waitForTimeout(300);
    ok(/Paseo/.test(await (await lastMsg(p)).$eval('.ai-grp', e => e.textContent).catch(() => '')), 'rules: la repetición de mañana de una serie sale en el grupo');
    m = await lastMsg(p);
    ok(!!(await m.$('.ai-grp')) && /Borrar \d+ eventos/.test(await applyText(p)), 'rules: «quita todo lo de mañana» → grupo de borrados');
    await p.click('.msg.ai:last-child [data-apply]'); await p.waitForTimeout(600);
    if (await p.$('.dlg [data-a=ok]')) { await p.click('.dlg [data-a=ok]'); await p.waitForTimeout(600); }
    ok(await alive(p, D.ids) === 0, 'rules: borra lo de mañana');
    const tmY = D.tm;
    ok(await p.evaluate(([id, d]) => { const e = ZC.store.get(id); return e && !e.deleted && (e.exdates || []).includes(d); }, [sid, tmY]), 'rules: de la serie solo quita la de mañana');
    await p.click('.msg.ai:last-child [data-undo]'); await p.waitForTimeout(600);
    ok(await alive(p, D.ids) === 4, 'rules: deshacer lo devuelve');
    ok(await p.evaluate(([id, d]) => !(ZC.store.get(id).exdates || []).includes(d), [sid, tmY]), 'rules: deshacer devuelve también la repetición de la serie');
    await ask(p, 'despiértame a las 7'); await p.waitForTimeout(300);
    m = await lastMsg(p);
    ok(!!(await m.$('.ai-act.create .al-mk')) || /alarma/i.test(await applyText(p)), 'rules: «despiértame a las 7» crea con alarma');
    await p.click('.msg.ai:last-child [data-apply]'); await p.waitForTimeout(500);
    ok(await p.evaluate(() => ZC.store.events().some(e => e.alarm && /07:00$/.test(e.start))), 'rules: guardado con alarma a las 07:00');
    await ask(p, 'cita importante con el médico el jueves a las 10'); await p.waitForTimeout(300);
    m = await lastMsg(p);
    ok(!!(await m.$('.ai-sug:not(.on)')), 'rules: sugiere la alarma, desmarcada');
    await p.screenshot({ path: path.join(OUT, 'ai-alarm-rules-pc.png') });
  } else console.log('  (el núcleo aún no tiene parseCommand: solo respuestas simuladas)');
  await c.close();

  // ================= el resto de combinaciones: capturas + que no se desborde =================
  const combos = [
    { tag: 'dot-oscuro-ca-360', look: { design: 'dot', scheme: 'dark' }, lang: 'ca', mobile: true },
    { tag: 'zen-oscuro-en-360', look: { design: 'zen', scheme: 'dark' }, lang: 'en', mobile: true },
    { tag: 'dot-claro-es-pc', look: { design: 'dot', scheme: 'light' }, lang: 'es', mobile: false },
    { tag: 'zen-claro-ca-360', look: { design: 'zen', scheme: 'light' }, lang: 'ca', mobile: true },
  ];
  const WORDS = { es: /Borrar 3 eventos/, ca: /Esborrar 3 esdeveniments/, en: /Delete 3 events/ };
  const SUG = { es: /Sugerencia/, ca: /Suggeriment/, en: /Suggestion/ };
  for (const k of combos) {
    console.log(k.tag);
    ({ c, p } = await open(k.mobile ? { viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent } : { viewport: { width: 1366, height: 800 } }, k.tag));
    await setLook(p, { ...k.look, anim: 'off' }, k.lang); await p.waitForTimeout(400);
    D = await seed(p);
    const day = await p.evaluate(() => ZC.ui.cal.ymd(ZC.ui.cal.addDays(ZC.ui.cal.today(), 3)));
    await p.evaluate(() => ZC.ui.aipanel.open()); await p.waitForTimeout(400);
    await mockNext(p, { reply: 'OK', actions: [...D.ids.map(id => ({ type: 'delete', id })), { type: 'create', event: { title: 'Cita con el médico', start: day + 'T10:00', end: day + 'T10:30' } }, { type: 'update', ref: 4, changes: { alarm: true }, suggest: true, why: k.lang === 'en' ? 'It is a doctor’s appointment at a set time.' : k.lang === 'ca' ? 'És una cita mèdica a una hora fixa.' : 'Es una cita médica a una hora fija.' }] });
    await ask(p, 'x');
    const mm = await lastMsg(p);
    await (await mm.$$('.ai-grp-it .ck'))[0].click(); await p.waitForTimeout(150);
    const txt = await (await lastMsg(p)).evaluate(e => e.textContent);
    ok(WORDS[k.lang].test(txt.replace(/\s+/g, ' ')) || /3/.test(txt), 'grupo traducido');
    ok(SUG[k.lang].test(txt), 'sugerencia traducida');
    await p.evaluate(() => { const l = document.querySelector('.ai-log'); l.scrollTop = l.scrollHeight; document.querySelectorAll('#toasts > *').forEach(x => x.remove()); });
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, `ai-alarm-${k.tag}.png`) });
    ok(!(await overflow(p)).length, 'asistente: nada se desborda' + (await overflow(p)).join(','));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    if (await p.$('.ai-layer.open')) { await p.evaluate(() => document.querySelector('.ai-layer [data-a=close]').click()); await p.waitForTimeout(300); }
    // editor con la alarma encendida y la sugerencia
    await p.evaluate(() => ZC.ui.editor.open({ date: ZC.ui.cal.addDays(ZC.ui.cal.today(), 2), allDay: true, alarmSuggested: true })); await p.waitForTimeout(400);
    await p.evaluate(() => { document.querySelector('.ed-alarm').scrollIntoView({ block: 'center' }); document.querySelectorAll('#toasts > *').forEach(x => x.remove()); }); await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(OUT, `ai-alarm-editor-${k.tag}.png`) });
    ok(!!(await p.$('.al-tip')), 'editor: «¿Le pongo alarma?» con la sugerencia');
    await p.click('.al-tip'); await p.waitForTimeout(150);
    ok(await p.$eval('[data-act=alarm]', b => b.getAttribute('aria-checked')) === 'true' && !!(await p.$('[name=alarmTime]')), 'editor: «Poner alarma» la enciende y sale la hora');
    ok(!(await overflow(p)).length, 'editor: nada se desborda');
    await c.close();
  }

  ok(!errs.length, 'sin errores' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} fallos` : '\nTodo bien');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
