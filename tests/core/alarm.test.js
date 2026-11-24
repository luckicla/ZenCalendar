'use strict';
// Pruebas de «IA que borra y alarmas» (1.2.0): nlp.parse con alarm/alarmSuggested, nlp.parseCommand,
// el integrado borrando y sugiriendo, validate/apply con ref/suggest/mode y las alarmas en ZC.reminders.
// node tests/core/alarm.test.js
const { load, t, report, assert } = require('./_load');

(async () => {
  // ---------- nlp (hora fija: lunes 23 de noviembre de 2026, 10:42) ----------
  const N = load(['config', 'util', 'recur', 'nlp']);
  const now = new Date(2026, 10, 23, 10, 42);
  const P = (s, o) => N.nlp.parse(s, Object.assign({ now }, o));
  const C = (s, o) => N.nlp.parseCommand(s, Object.assign({ now }, o));
  const day = d => d ? N.util.ymd(d) : null;
  const F = (s, o) => { const r = C(s, o); return r && Object.assign({}, r.filter, { from: day(r.filter.from), to: day(r.filter.to), all: r.all }); };
  const has = (r, exp) => { for (const k of Object.keys(exp)) assert.strictEqual(JSON.stringify(r[k]), JSON.stringify(exp[k]), k + ': ' + JSON.stringify(r[k]) + ' ≠ ' + JSON.stringify(exp[k])); };

  await t('parse: despiértame a las 7 → mañana 07:00, Despertarse, alarma', () => has(P('despiértame a las 7'), { title: 'Despertarse', start: '2026-11-24T07:00', end: '2026-11-24T07:15', alarm: true, alarmSuggested: false, reminders: [] }));
  await t('parse: despiértame a las 11 → hoy (aún no ha pasado)', () => has(P('despiértame a las 11'), { start: '2026-11-23T11:00', alarm: true }));
  await t('parse: wake me up / desperta\'m (título en su idioma)', () => {
    has(P('wake me up at 6:30'), { title: 'Wake up', start: '2026-11-24T06:30', alarm: true });
    has(P("desperta'm a les 7"), { title: 'Despertar-se', start: '2026-11-24T07:00', alarm: true });
  });
  await t('parse: pon una alarma / con alarma / que suene', () => {
    has(P('pon una alarma mañana a las 8 para tomar la pastilla'), { title: 'Tomar la pastilla', alarm: true });
    has(P('recuérdame llamar a mamá a las 6 con alarma'), { kind: 'task', title: 'Llamar a mamá', alarm: true, reminders: [] });
    has(P('vuelo el viernes a las 9 que suene'), { title: 'Vuelo', alarm: true });
  });
  await t('parse: «alarma 10 min antes» es un aviso, no una alarma; «sin alarma» tampoco', () => {
    has(P('reunión mañana a las 10 con alarma 10 min antes'), { reminders: [10], alarm: false });
    has(P('reunión mañana a las 10 sin alarma'), { reminders: [], alarm: false });
  });
  await t('parse: importante / sin falta / entrevista → alarmSuggested', () => {
    has(P('dentista mañana a las 5, importante'), { title: 'Dentista', alarmSuggested: true, alarm: false });
    has(P('entrevista el lunes a las 10 sin falta'), { title: 'Entrevista', alarmSuggested: true });
    has(P('examen el 3 de diciembre a las 9'), { alarmSuggested: true });
    has(P('cena con Marta el viernes a las 21:30'), { alarm: false, alarmSuggested: false });
  });

  await t('parseCommand: no es una orden → null', () => {
    for (const s of ['mañana dentista', 'limpia la casa el sábado', 'limpiar el coche mañana', 'borrar', '']) assert.strictEqual(C(s), null, s);
  });
  await t('parseCommand: quita todo lo de mañana', () => has(F('Quita todo lo de mañana'), { from: '2026-11-24', to: '2026-11-25', text: null, all: true }));
  await t('parseCommand: borra la reunión del lunes', () => has(F('borra la reunión del lunes'), { from: '2026-11-30', to: '2026-12-01', text: 'Reunión', all: false }));
  await t('parseCommand: quita lo del gimnasio de esta semana', () => has(F('quita lo del gimnasio de esta semana'), { from: '2026-11-23', to: '2026-11-30', text: 'Gimnasio', all: true }));
  await t('parseCommand: vacía el viernes / delete everything tomorrow / esborra-ho tot de demà', () => {
    has(F('vacía el viernes'), { from: '2026-11-27', to: '2026-11-28', all: true });
    has(F('delete everything tomorrow'), { from: '2026-11-24', to: '2026-11-25', all: true });
    has(F('esborra-ho tot de demà'), { from: '2026-11-24', to: '2026-11-25', all: true });
  });
  await t('parseCommand: semana que viene, este mes, diciembre, del 3 al 7', () => {
    has(F('borra todo de la semana que viene'), { from: '2026-11-30', to: '2026-12-07' });
    has(F('quita todo este mes'), { from: '2026-11-01', to: '2026-12-01' });
    has(F('borra todo lo de diciembre'), { from: '2026-12-01', to: '2027-01-01', text: null });
    has(F('borra todo del 3 al 7 de diciembre'), { from: '2026-12-03', to: '2026-12-08' });
    has(F('quita todo del 25 al 30'), { from: '2026-11-25', to: '2026-12-01' });
    has(F('cancela la cena del 3 de diciembre'), { from: '2026-12-03', text: 'Cena', all: false });
  });
  await t('parseCommand: calendarios y tipo', () => {
    has(F('borra todo del calendario Trabajo'), { calendarId: 'work', from: null, all: true });
    has(F('borra todo lo de trabajo de mañana'), { calendarId: 'work', from: '2026-11-24', text: null });
    has(F('quita los cumpleaños'), { calendarId: 'birthdays', from: null, all: true });
    has(F('remove all events from my work calendar'), { calendarId: 'work', kind: 'event' });
    has(F('elimina las tareas de hoy'), { kind: 'task', from: '2026-11-23', all: true });
    has(F('borra todo de Gym', { calendars: [{ id: 'g1', name: 'Gym' }] }), { calendarId: 'g1' });
  });
  await t('parseCommand: infinitivo = weak; texto sin fecha', () => {
    assert.strictEqual(C('borrar el disco duro el lunes').weak, true);
    has(F('borra el dentista'), { text: 'Dentista', from: null, all: false });
  });

  // ---------- asistente integrado + apply (con la fecha de verdad) ----------
  const ZC = load(['config', 'util', 'store', 'recur', 'holidays', 'nlp', 'net', 'ics', 'ai', 'reminders'], { console: { warn() {}, log: console.log, error: console.error } });
  await ZC.store.init();
  const u = ZC.util;
  const today = u.startOfDay(new Date()), tm = u.addDays(today, 1), tm2 = u.addDays(today, 2);
  const at = (d, h) => u.toLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0), false);
  const many = [];
  for (let h = 0; h < 22; h++) many.push(await ZC.store.saveEvent({ title: 'Cosa ' + h, start: at(tm2, h) }));
  const a1 = await ZC.store.saveEvent({ title: 'Café', start: at(tm, 9) });
  const a2 = await ZC.store.saveEvent({ title: 'Recado', kind: 'task', start: at(tm, 12) });
  const gym = await ZC.store.saveEvent({ title: 'Gimnasio', start: at(today, 23), rrule: { freq: 'daily' } });
  const short = await ZC.store.saveEvent({ title: 'Curso', start: at(tm, 18), rrule: { freq: 'daily', count: 1 } });
  const run = async s => ZC.ai.run(s, { lang: 'es' });

  await t('integrado: quita todo lo de mañana → un delete por cosa, serie cortada → one/all', async () => {
    const r = await run('quita todo lo de mañana');
    const ids = r.actions.map(a => a.id);
    assert.ok(ids.includes(a1.id) && ids.includes(a2.id), JSON.stringify(r.actions));
    assert.deepStrictEqual(r.actions.find(a => a.id === gym.id), { type: 'delete', id: gym.id, mode: 'one', date: u.ymd(tm) });
    assert.deepStrictEqual(r.actions.find(a => a.id === short.id), { type: 'delete', id: short.id, mode: 'all' });
    assert.ok(/He encontrado 4 cosas de mañana para borrar/.test(r.reply), r.reply);
    assert.ok(!r.confirmMany);
  });
  await t('integrado: más de 20 → confirmMany', async () => {
    const r = await run('borra todo de pasado mañana');
    assert.ok(r.actions.length >= 22 && r.confirmMany === true, r.actions.length);
  });
  await t('integrado: nada que borrar lo dice; «borra» solo pregunta', async () => {
    const r = await run('borra lo del dentista de mañana');
    assert.strictEqual(r.actions.length, 0); assert.ok(/No encuentro nada/.test(r.reply), r.reply);
    const q = await run('borra');
    assert.ok(/Qué borro/.test(q.reply) && !q.actions.length, q.reply);
  });
  await t('integrado: infinitivo sin nada que borrar → se apunta como tarea', async () => {
    const r = await run('borrar el disco duro el lunes');
    assert.strictEqual(r.actions[0].type, 'create');
  });
  await t('integrado: despiértame → create con alarma; importante → sugerencia con ref', async () => {
    const w = await run('despiértame a las 7');
    assert.strictEqual(w.actions[0].event.alarm, true);
    const s = await run('dentista mañana a las 5, importante');
    assert.strictEqual(s.actions.length, 2);
    assert.ok(!s.actions[0].event.alarm);
    const sug = s.actions[1];
    assert.ok(sug.type === 'update' && sug.ref === 0 && sug.refId === s.actions[0].cid && sug.suggest === true && sug.why && sug.changes.alarm === true, JSON.stringify(sug));
    assert.ok(/alarma/.test(s.reply));
  });
  await t('validate: ref/refId, suggest/why, mode/date, repetidos', () => {
    const v = ZC.ai.validate([
      { type: 'create', event: { title: 'Vuelo', start: '2026-12-10T06:00' } },
      { type: 'update', ref: 0, changes: { alarm: true, hack: 1 }, suggest: true, why: 'Es un vuelo' },
      { type: 'update', ref: 5, changes: { alarm: true } },            // ref que no existe
      { type: 'delete', id: gym.id, mode: 'one', date: '2026-12-01' },
      { type: 'delete', id: gym.id, mode: 'one', date: '2026-12-01' }, // repetido
      { type: 'delete', id: gym.id, mode: 'one' },                     // sin fecha
      { type: 'delete', id: a1.id, mode: 'one', date: '2026-12-01' },  // no es serie: sin modo
    ]);
    const A = v.actions;
    assert.deepStrictEqual(A[1], { type: 'update', ref: 0, refId: A[0].cid, changes: { alarm: true }, suggest: true, why: 'Es un vuelo' });
    assert.deepStrictEqual(A[2], { type: 'delete', id: gym.id, mode: 'one', date: '2026-12-01' });
    assert.deepStrictEqual(A[3], { type: 'delete', id: a1.id });
    assert.strictEqual(A.length, 4);
    assert.strictEqual(v.dropped, 2);
    // una serie sin modo = entera; con la serie entera, lo demás de esa serie sobra
    const w = ZC.ai.validate([{ type: 'delete', id: gym.id, mode: 'one', date: '2026-12-02' }, { type: 'delete', id: gym.id }]);
    assert.deepStrictEqual(w.actions, [{ type: 'delete', id: gym.id, mode: 'all' }]);
  });
  await t('validate: alarm y alarmTime', () => {
    const v = ZC.ai.validate([{ type: 'create', event: { title: 'Cumple', start: '2026-12-10', alarm: 'true', alarmTime: '8:30' } }]);
    assert.strictEqual(v.actions[0].event.alarm, true);
    assert.strictEqual(v.actions[0].event.alarmTime, '08:30');
  });
  await t('apply: se salta las sugerencias; aceptada (sin suggest) va por refId aunque se quiten acciones', async () => {
    const r = await run('entrevista pasado mañana a las 10 sin falta');
    let out = await ZC.ai.apply(r.actions);
    assert.strictEqual(out.length, 1); assert.strictEqual(out[0].alarm, false);
    const r2 = await run('examen pasado mañana a las 11 sin falta');
    const acts = [{ type: 'delete', id: 'no-existe' }].concat(r2.actions.map(a => { const b = Object.assign({}, a); delete b.suggest; return b; }));
    out = await ZC.ai.apply(acts);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(ZC.store.get(out[0].id).alarm, true);
  });
  await t('apply: delete mode one (exdate, una vez por serie) y all (con sus copias)', async () => {
    const d1 = u.ymd(u.addDays(today, 3)), d2 = u.ymd(u.addDays(today, 4));
    const copy = await ZC.store.saveEventOccurrence(gym.id, u.addDays(today, 5), { title: 'Gimnasio (solo este)' });
    let out = await ZC.ai.apply([{ type: 'delete', id: gym.id, mode: 'one', date: d1 }, { type: 'delete', id: gym.id, mode: 'one', date: d2 }]);
    assert.ok(ZC.store.get(gym.id).exdates.includes(d1) && ZC.store.get(gym.id).exdates.includes(d2));
    assert.strictEqual(out.length, 1);
    assert.ok(!out[0].exdates.includes(d1) && out[0].removedDate === d1, JSON.stringify(out[0].exdates));
    out = await ZC.ai.apply([{ type: 'delete', id: gym.id, mode: 'all' }]);
    assert.strictEqual(ZC.store.get(gym.id), null);
    assert.strictEqual(ZC.store.get(copy.id), null);
    assert.ok(out.some(e => e.id === copy.id && e.deleted));
  });
  await t('el prompt explica borrar en bloque, alarmas y sugerencias', () => {
    const p = ZC.ai.systemPrompt();
    assert.ok(/Borrar en bloque/.test(p) && /"alarm":true/.test(p) && /"suggest":true/.test(p) && /"mode":"one"/.test(p) && /"ref"/.test(p));
  });
  await t('modelo: confirmMany con más de 20 borrados', async () => {
    // (un modelo de mentira que devuelve 22 delete)
    const ZC2 = load(['config', 'util', 'store', 'recur', 'holidays', 'nlp', 'net', 'ics', 'ai'], {
      console: { warn() {}, log: console.log, error: console.error }, Response, AbortController,
      fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: 'Borro', actions: ids.map(id => ({ type: 'delete', id })) }) } }] }), { status: 200 }),
    });
    await ZC2.store.init();
    const ids = [];
    for (let i = 0; i < 22; i++) ids.push((await ZC2.store.saveEvent({ title: 'X' + i, start: '2026-12-01T10:00' })).id);
    await ZC2.ai.setConfig({ provider: 'custom', baseUrl: 'http://x/v1', model: 'm' });
    const r = await ZC2.ai.run('quita todo del 1 de diciembre');
    assert.strictEqual(r.actions.length, 22); assert.strictEqual(r.confirmMany, true);
  });

  // ---------- ZC.store y ZC.reminders ----------
  await t('store: alarm/alarmTime normalizados', async () => {
    const e = await ZC.store.saveEvent({ title: 'A', start: at(tm, 7), alarm: 'true', alarmTime: '25:00' });
    assert.strictEqual(e.alarm, true); assert.strictEqual(e.alarmTime, null);
    const f = await ZC.store.saveEvent({ title: 'B', start: at(tm, 7) });
    assert.strictEqual(f.alarm, false);
  });
  await t('reminders: la alarma a la hora de inicio, sin duplicar el aviso de las 0', async () => {
    const e = await ZC.store.saveEvent({ title: 'Despertarse', start: at(tm, 6), alarm: true, reminders: [0, 10] });
    const list = ZC.reminders.compute().filter(r => r.eventId === e.id);
    const al = list.find(r => r.alarm);
    assert.ok(al && al.at === u.parse(at(tm, 6)).getTime() && /#alarm$/.test(al.id), JSON.stringify(list));
    assert.deepStrictEqual(list.filter(r => !r.alarm).map(r => r.minutes), [10]);
  });
  await t('reminders: todo el día → 09:00 o alarmTime', async () => {
    const e = await ZC.store.saveEvent({ title: 'Cumple', allDay: true, start: u.ymd(tm), alarm: true, reminders: [] });
    let al = ZC.reminders.compute().find(r => r.eventId === e.id && r.alarm);
    assert.strictEqual(new Date(al.at).getHours(), 9);
    await ZC.store.saveEvent({ id: e.id, alarmTime: '07:45' });
    al = ZC.reminders.compute().find(r => r.eventId === e.id && r.alarm);
    assert.strictEqual(new Date(al.at).getHours() * 60 + new Date(al.at).getMinutes(), 7 * 60 + 45);
  });
  await t('reminders: «Parar» no vuelve a sonar; posponer con la hora de la plataforma', async () => {
    const e = await ZC.store.saveEvent({ title: 'Alarma X', start: at(tm, 5), alarm: true, reminders: [] });
    const al = ZC.reminders.compute().find(r => r.eventId === e.id && r.alarm);
    const when = Date.now() + 10 * 60000;
    await ZC.reminders._action({ type: 'snooze', reminder: al, at: when });
    const sn = ZC.reminders.compute().find(r => r.id === al.id + '~' + when);
    assert.ok(sn && sn.alarm, 'pospuesta');
    await ZC.reminders._action({ type: 'stop', reminder: al });
    assert.ok(!ZC.reminders.compute().some(r => String(r.id).split('~')[0] === al.id), 'parada');
  });
  report(__filename);
})();
