'use strict';
// Pruebas de Google Calendar (ZC.gcal) contra un Google Calendar simulado
// (web/js/core/gcal-mock.js). node tests/core/gcal.test.js
const { load, t, report, assert } = require('./_load');

const FILES = ['config', 'util', 'store', 'recur', 'holidays', 'nlp', 'ics', 'net', 'platform', 'reminders', 'drive', 'gcal', 'gcal-mock', 'ai', 'core'];
const quiet = { log: console.log, error: console.error, warn() {}, info() {} };

function device() {
  const ls = new Map();
  const ZC = load(FILES, {
    console: quiet, Response, AbortController,
    setInterval: () => 0,
    location: { protocol: 'https:', hostname: 'luckicla.github.io', pathname: '/zencalendar/app/index.html', search: '' },
    localStorage: { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
  });
  return ZC;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function idle(ZC, ms) {
  // deja que salten las sync «tras un cambio» y espera a que acaben
  await wait(ms || 120);
  for (let i = 0; i < 50 && ZC.gcal.accounts().some(a => a.syncing); i++) await wait(20);
}
const pad = n => String(n).padStart(2, '0');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const gEvents = ZC => ZC.store.events().filter(e => e.source === 'google');
const byTitle = (ZC, title) => ZC.store.events().find(e => e.title === title);

const ANA = 'ana@example.com', PEPE = 'pepe@example.com';
function accountsDef() {
  return [
    { email: ANA, name: 'Ana', connected: false, calendars: [
      { name: ANA, primary: true, color: '#9fc6e7', events: [
        { id: 'dentista1', title: 'Dentista', start: day(1) + 'T10:00', end: day(1) + 'T10:45', location: 'Clínica' },
        { id: 'yoga1', title: 'Yoga', start: day(-7) + 'T19:00', end: day(-7) + 'T20:00', rrule: 'FREQ=WEEKLY' },
        { id: 'viaje1', title: 'Viaje', start: day(5), end: day(7) },
      ] },
      { id: 'fam@group.calendar.google.com', name: 'Familia', color: '#f691b2', events: [] },
      { id: 'es.spain#holiday@group.v.calendar.google.com', name: 'Festivos', accessRole: 'reader', events: [{ title: 'Festivo', start: day(3) }] },
      { id: 'compartido@group.calendar.google.com', name: 'Compartido', accessRole: 'reader', events: [{ id: 'turno1', title: 'Turno', start: day(2) + 'T15:00', end: day(2) + 'T20:00' }] },
    ] },
    { email: PEPE, name: 'Pepe', connected: false, calendars: [
      { name: PEPE, primary: true, events: [{ id: 'reunion1', title: 'Reunión', start: day(2) + 'T09:30', end: day(2) + 'T10:30' }] },
    ] },
  ];
}

async function setup(defs, opts) {
  const ZC = device();
  await ZC.core.init();
  const g = await ZC.gcal._mock(defs || accountsDef(), Object.assign({ afterChange: 20 }, opts));
  return { ZC, g };
}

(async () => {
  // ---------- conversiones (sin red) ----------
  {
    const ZC = device();
    const I = ZC.gcal._internals;
    await t('Google → ZenCalendar: evento con hora en otra zona pasa a hora local', () => {
      const e = I.fromGoogle({ summary: 'A', start: { dateTime: '2026-11-27T09:30:00+01:00' }, end: { dateTime: '2026-11-27T10:00:00+01:00' } }, {});
      assert.strictEqual(e.start, '2026-11-27T09:30');
      assert.strictEqual(e.end, '2026-11-27T10:00');
      const f = I.fromGoogle({ summary: 'B', start: { dateTime: '2026-07-01T08:00:00Z' }, end: { dateTime: '2026-07-01T09:00:00Z' } }, {});
      assert.strictEqual(f.start, '2026-07-01T10:00'); // verano en Madrid: UTC+2
    });
    await t('Google → ZenCalendar: todo el día (fin exclusivo → inclusivo) y avisos por defecto del calendario', () => {
      const e = I.fromGoogle({ summary: 'V', start: { date: '2026-12-05' }, end: { date: '2026-12-08' }, reminders: { useDefault: true } }, { defaults: [900] });
      assert.strictEqual(e.allDay, true);
      assert.strictEqual(e.end, '2026-12-07');
      assert.deepStrictEqual(e.reminders, [1440]); // 1 día antes a las 9:00
    });
    await t('Google → ZenCalendar: recurrencia, EXDATE, color y propiedades de ZenCalendar', () => {
      const e = I.fromGoogle({
        summary: 'Gym', start: { dateTime: '2026-11-02T19:00:00+01:00', timeZone: 'Europe/Madrid' }, end: { dateTime: '2026-11-02T20:00:00+01:00' },
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'EXDATE;TZID=Europe/Madrid:20261104T190000,20261109T190000'],
        colorId: '11', reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
        extendedProperties: { private: { zcEmoji: '🏋️', zcAlarm: '1', zcChecklistN: '1', zcChecklist0: '[{"id":"1","text":"toalla","done":false}]' } },
      }, {});
      assert.deepStrictEqual(e.rrule.byDay, ['MO', 'WE']);
      assert.deepStrictEqual(e.exdates, ['2026-11-04', '2026-11-09']);
      assert.strictEqual(e.color, I.GCOLORS[11]);
      assert.deepStrictEqual(e.reminders, [15]);
      assert.strictEqual(e.emoji, '🏋️');
      assert.strictEqual(e.alarm, true);
      assert.strictEqual(e.checklist[0].text, 'toalla');
    });
    await t('recurrencias que ZenCalendar no sabe repetir se marcan como complejas', () => {
      assert.ok(I.parseRecurrence(['RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15'], '2026-11-01T10:00').complex);
      assert.ok(I.parseRecurrence(['RRULE:FREQ=WEEKLY', 'RRULE:FREQ=DAILY'], '2026-11-01T10:00').complex);
      assert.ok(I.parseRecurrence(['RDATE:20261105'], '2026-11-01').complex);
      assert.ok(!I.parseRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=3TU'], '2026-11-17T10:00').complex);
      assert.ok(!I.parseRecurrence(['RRULE:FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=17'], '2026-11-17').complex);
    });
    await t('ZenCalendar → Google: hora con zona, todo el día con fin exclusivo, RRULE con UNTIL en UTC', () => {
      const b = I.toGoogle({ title: 'X', start: '2026-11-27T21:30', end: '2026-11-27T23:00', allDay: false, rrule: { freq: 'weekly', interval: 2, byDay: ['FR'], until: '2026-12-31' }, exdates: ['2026-12-11'], reminders: [10] },
        ['title', 'start', 'end', 'rrule', 'reminders']);
      assert.strictEqual(b.start.dateTime, '2026-11-27T21:30:00');
      assert.strictEqual(b.start.timeZone, 'Europe/Madrid');
      assert.strictEqual(b.recurrence[0], 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;UNTIL=20261231T225959Z');
      assert.strictEqual(b.recurrence[1], 'EXDATE;TZID=Europe/Madrid:20261211T213000');
      assert.deepStrictEqual(b.reminders.overrides, [{ method: 'popup', minutes: 10 }]);
      const c = I.toGoogle({ title: 'V', start: '2026-12-05', end: '2026-12-07', allDay: true, reminders: [1440, 0] }, ['start', 'end', 'reminders']);
      assert.strictEqual(c.end.date, '2026-12-08');
      assert.deepStrictEqual(c.reminders.overrides.map(o => o.minutes), [0, 900]);
    });
    await t('ZenCalendar → Google: notas HTML de Google se leen como texto', () => {
      assert.strictEqual(I.htmlToText('Hola<br>mundo &amp; <b>más</b>'), 'Hola\nmundo & más');
    });
  }

  // ---------- alta de cuenta, lista y primera sync ----------
  await t('añadir cuenta: selector, calendarios (festivos desactivados) y eventos traídos', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    const acc = await ZC.gcal.addAccount();
    assert.strictEqual(acc.email, ANA);
    assert.strictEqual(acc.connected, true);
    const names = acc.calendars.map(c => c.name + ':' + c.enabled + ':' + c.readOnly);
    assert.ok(names.includes('Festivos:false:true'), names.join());
    assert.ok(names.includes('Compartido:true:true'), names.join());
    assert.ok(names.includes('Familia:true:false'));
    const cals = ZC.store.calendars().filter(c => c.source === 'google');
    assert.strictEqual(cals.length, 3);
    assert.ok(cals.every(c => c.id.startsWith('g:') && c.accountId === acc.id));
    const titles = gEvents(ZC).map(e => e.title).sort();
    assert.deepStrictEqual(titles, ['Dentista', 'Turno', 'Viaje', 'Yoga']);
    const yoga = byTitle(ZC, 'Yoga');
    assert.strictEqual(yoga.rrule.freq, 'weekly');
    assert.ok(byTitle(ZC, 'Turno').readOnly);
    assert.ok(byTitle(ZC, 'Dentista').htmlLink);
    assert.ok(byTitle(ZC, 'Viaje').allDay);
    assert.strictEqual(byTitle(ZC, 'Viaje').end, day(7));
    // las apariciones de la serie salen en el calendario
    const occ = ZC.store.occurrences(new Date(), new Date(Date.now() + 21 * 86400000)).filter(o => o.ev.title === 'Yoga');
    assert.ok(occ.length >= 3);
  });

  await t('los eventos y calendarios de Google no van a Drive; las cuentas sí (sin tokens)', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    await ZC.gcal.addAccount();
    const snap = ZC.store.snapshot({ drive: true });
    assert.ok(!snap.events.some(e => e.id.startsWith('g:')));
    assert.ok(!snap.calendars.some(c => c.id.startsWith('g:')));
    const acc = Object.values(snap.prefs.gcal.accounts)[0];
    assert.strictEqual(acc.email, ANA);
    assert.ok(!JSON.stringify(snap.prefs).includes('mock-'), 'sin tokens');
    assert.ok(!ZC.store.exportJSON().events.some(e => e.source === 'google'));
  });

  await t('con Drive: la fusión no ve lo de Google (no hay subidas de más) y lo de Drive no lo borra', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    await ZC.gcal.addAccount();
    const fromDrive = JSON.parse(JSON.stringify(ZC.store.snapshot({ drive: true })));
    const m = ZC.store.merge(ZC.store.snapshot({ drive: true }), fromDrive);
    assert.ok(!m.remoteChanged && !m.localChanged);
    // un archivo de Drive viejo que trajera cosas de Google: se ignoran
    fromDrive.events.push({ id: 'g:x:y:z', title: 'Colado', calendarId: 'g:x:y', start: day(1), end: day(1), allDay: true, updated: Date.now() + 1e6 });
    await ZC.store.applyRemote(ZC.store.driveOnly(fromDrive), 'sync');
    assert.ok(!byTitle(ZC, 'Colado'));
    assert.strictEqual(gEvents(ZC).length, 4, 'lo de Google sigue');
  });

  // ---------- incremental ----------
  await t('sync incremental: lo nuevo, lo cambiado y lo borrado en Google llega aquí (con syncToken)', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    await ZC.gcal.addAccount();
    g.addEvent(ANA, ANA, { title: 'Cena', start: day(4) + 'T21:00', end: day(4) + 'T23:00' });
    g.updateEvent(ANA, ANA, 'dentista1', { title: 'Dentista (revisión)' });
    g.deleteEvent(ANA, ANA, 'viaje1');
    const n0 = g.requests.length;
    await ZC.gcal.sync();
    const lists = g.requests.slice(n0).filter(r => r.method === 'GET' && /\/events\?/.test(r.url));
    assert.ok(lists.every(r => /syncToken=/.test(r.url)), 'usa syncToken');
    assert.ok(byTitle(ZC, 'Cena'));
    assert.ok(byTitle(ZC, 'Dentista (revisión)'));
    assert.ok(!byTitle(ZC, 'Viaje'));
  });

  await t('410 (syncToken caducado): lista completa y quita lo que ya no está', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    await ZC.gcal.addAccount();
    g.deleteEvent(ANA, ANA, 'dentista1');
    g.addEvent(ANA, ANA, { title: 'Nuevo tras 410', start: day(6) + 'T12:00' });
    g.expireSyncTokens();
    await ZC.gcal.sync();
    assert.ok(!byTitle(ZC, 'Dentista'));
    assert.ok(byTitle(ZC, 'Nuevo tras 410'));
    assert.ok(byTitle(ZC, 'Yoga'));
    assert.ok(!ZC.gcal.accounts()[0].error);
  });

  // ---------- de aquí a Google ----------
  await t('crear, editar y borrar aquí se hace en Google (alarma, emoji y lista en extendedProperties)', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    const acc = await ZC.gcal.addAccount();
    const calId = 'g:' + acc.id + ':' + ANA;
    const e = await ZC.store.saveEvent({ title: 'Peluquería', calendarId: calId, start: day(3) + 'T17:00', end: day(3) + 'T18:00', emoji: '💇', alarm: true, checklist: [{ id: 'a', text: 'pagar', done: false }], reminders: [30] });
    assert.ok(e.id.startsWith('g:'), 'id de Google');
    await idle(ZC);
    const remote = g.events(ANA, ANA).find(x => x.summary === 'Peluquería');
    assert.ok(remote, 'está en Google');
    assert.strictEqual(remote.start.dateTime, new Date(day(3) + 'T17:00:00').toISOString());
    assert.strictEqual(remote.extendedProperties.private.zcEmoji, '💇');
    assert.strictEqual(remote.extendedProperties.private.zcAlarm, '1');
    assert.deepStrictEqual(remote.reminders.overrides, [{ method: 'popup', minutes: 30 }]);
    const local = ZC.store.get(e.id);
    assert.strictEqual(local.gEventId, remote.id);
    assert.ok(local.updated <= local.gSynced, 'ya no está pendiente');
    // editar: solo se manda lo cambiado, con If-Match
    const n0 = g.requests.length;
    await ZC.store.saveEvent({ id: e.id, title: 'Peluquería y barba' });
    await idle(ZC);
    const patch = g.requests.slice(n0).find(r => r.method === 'PATCH');
    assert.ok(patch && patch.ifMatch, 'PATCH con If-Match');
    assert.deepStrictEqual(Object.keys(patch.body), ['summary']);
    assert.strictEqual(g.event(ANA, ANA, remote.id).summary, 'Peluquería y barba');
    // borrar
    await ZC.store.deleteEvent(e.id);
    await idle(ZC);
    assert.ok(!g.events(ANA, ANA).some(x => x.id === remote.id), 'borrado en Google');
    assert.ok(!ZC.store._rawEvent(e.id), 'y la lápida local ya no hace falta');
  });

  await t('serie de Google: «solo esta» y quitar una repetición crean la excepción en Google', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    await ZC.gcal.addAccount();
    const yoga = byTitle(ZC, 'Yoga');
    // «solo esta» la semana que viene
    const copy = await ZC.store.saveEventOccurrence(yoga.id, day(7), { title: 'Yoga (en el parque)' });
    assert.ok(copy.id.startsWith('g:') && copy.recurrenceOf === yoga.id);
    // quitar la de dentro de dos semanas
    await ZC.store.deleteEvent(yoga.id, { mode: 'one', date: day(14) });
    await idle(ZC, 200);
    const inst = g.events(ANA, ANA).filter(x => x.recurringEventId === 'yoga1');
    const moved = inst.find(x => x.summary === 'Yoga (en el parque)');
    assert.ok(moved, 'excepción en Google');
    assert.strictEqual(moved.originalStartTime.dateTime.slice(0, 10) <= day(7), true);
    const cancelled = g.requests.filter(r => r.method === 'DELETE' && /yoga1_/.test(r.url));
    assert.strictEqual(cancelled.length, 1, 'se canceló una aparición');
    // y aquí sigue igual tras bajar
    await ZC.gcal.sync();
    const occ = ZC.store.occurrences(new Date(), new Date(Date.now() + 20 * 86400000)).filter(o => /Yoga/.test(o.ev.title));
    const days = occ.map(o => o.date);
    assert.ok(!days.includes(day(14)), 'la quitada no sale');
    assert.ok(occ.some(o => o.ev.title === 'Yoga (en el parque)' && o.date === day(7)));
    assert.strictEqual(occ.filter(o => o.date === day(7)).length, 1, 'sin repetir la de la excepción');
  });

  await t('excepciones creadas en Google (cambiada y cancelada) llegan como «solo esta» + exdate', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    await ZC.gcal.addAccount();
    const start = new Date(day(7) + 'T19:00:00');
    const id7 = 'yoga1_' + start.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const start14 = new Date(day(14) + 'T19:00:00');
    const id14 = 'yoga1_' + start14.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    g.updateEvent(ANA, ANA, id7, { summary: 'Yoga largo', end: { dateTime: new Date(day(7) + 'T21:00:00').toISOString() } });
    g.deleteEvent(ANA, ANA, id14);
    await ZC.gcal.sync();
    const yoga = byTitle(ZC, 'Yoga');
    assert.ok(yoga.exdates.includes(day(7)) && yoga.exdates.includes(day(14)), JSON.stringify(yoga.exdates));
    const ex = byTitle(ZC, 'Yoga largo');
    assert.strictEqual(ex.recurrenceOf, yoga.id);
    assert.strictEqual(ex.end, day(7) + 'T21:00');
    // borrar la serie en Google se lleva también la excepción
    g.deleteEvent(ANA, ANA, 'yoga1');
    await ZC.gcal.sync();
    assert.ok(!ZC.store.events().some(e => /Yoga/.test(e.title)));
  });

  await t('serie que ZenCalendar no sabe repetir: llega como apariciones sueltas que se pueden editar', async () => {
    const defs = accountsDef();
    defs[0].calendars[0].events.push({ id: 'raro1', title: 'Raro', start: day(1) + 'T08:00', end: day(1) + 'T08:30', recurrence: ['RRULE:FREQ=WEEKLY;COUNT=3', 'RRULE:FREQ=DAILY;COUNT=2'] });
    const { ZC, g } = await setup(defs);
    g.pick(ANA);
    await ZC.gcal.addAccount();
    const raros = ZC.store.events().filter(e => e.title === 'Raro');
    assert.strictEqual(raros.length, 4, 'semanal ×3 + diario ×2, sin repetir el primero');
    assert.ok(raros.every(e => !e.rrule && e.gSeries === 'raro1'));
    const second = raros.sort((a, b) => a.start < b.start ? -1 : 1)[1];
    await ZC.store.saveEvent({ id: second.id, title: 'Raro cambiado' });
    await idle(ZC);
    assert.ok(g.events(ANA, ANA).some(x => x.summary === 'Raro cambiado' && x.recurringEventId === 'raro1'));
  });

  // ---------- choques ----------
  await t('412: cambios distintos aquí y en Google se juntan; si chocan, gana Google', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    await ZC.gcal.addAccount();
    const d = byTitle(ZC, 'Dentista');
    // en Google cambian el lugar y el título; aquí las notas y el título
    g.updateEvent(ANA, ANA, 'dentista1', { location: 'Clínica nueva', title: 'Dentista Google' });
    g.delay = 0;
    await ZC.store.saveEvent({ id: d.id, notes: 'llevar radiografía', title: 'Dentista mío' });
    await idle(ZC, 200);
    const remote = g.event(ANA, ANA, 'dentista1');
    assert.ok(g.requests.some(r => r.method === 'PATCH' && r.ifMatch), 'probó con If-Match');
    assert.strictEqual(remote.description, 'llevar radiografía', 'lo nuestro que no chocaba llega a Google');
    assert.strictEqual(remote.location, 'Clínica nueva');
    assert.strictEqual(remote.summary, 'Dentista Google', 'en el choque gana Google');
    const local = ZC.store.get(d.id);
    assert.strictEqual(local.title, 'Dentista Google');
    assert.strictEqual(local.notes, 'llevar radiografía');
    assert.strictEqual(local.location, 'Clínica nueva');
  });

  await t('borrado aquí pero cambiado en Google (412): vuelve con lo de Google', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    await ZC.gcal.addAccount();
    const d = byTitle(ZC, 'Dentista');
    g.updateEvent(ANA, ANA, 'dentista1', { title: 'Dentista importante' });
    await ZC.store.deleteEvent(d.id);
    await idle(ZC, 200);
    assert.ok(g.event(ANA, ANA, 'dentista1').status !== 'cancelled');
    assert.ok(byTitle(ZC, 'Dentista importante'));
  });

  // ---------- calendarios ----------
  await t('solo lectura: un cambio aquí se deshace; activar/desactivar un calendario', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA);
    const acc = await ZC.gcal.addAccount();
    const turno = byTitle(ZC, 'Turno');
    await ZC.store.saveEvent({ id: turno.id, title: 'Turno hackeado' });
    await idle(ZC);
    assert.strictEqual(ZC.store.get(turno.id).title, 'Turno');
    assert.ok(!g.requests.some(r => r.method === 'PATCH'));
    await ZC.gcal.setCalendarEnabled(acc.id, 'es.spain#holiday@group.v.calendar.google.com', true);
    assert.ok(byTitle(ZC, 'Festivo'));
    await ZC.gcal.setCalendarEnabled(acc.id, 'es.spain#holiday@group.v.calendar.google.com', false);
    assert.ok(!byTitle(ZC, 'Festivo'));
    assert.ok(!ZC.store.calendars().some(c => c.gid === 'es.spain#holiday@group.v.calendar.google.com'));
    // deleteCalendar de uno de Google = desactivarlo (no se borra nada en Google)
    await ZC.store.deleteCalendar('g:' + acc.id + ':fam@group.calendar.google.com');
    assert.strictEqual(ZC.gcal.accounts()[0].calendars.find(c => c.name === 'Familia').enabled, false);
  });

  await t('mover un evento: de ZenCalendar a Google, entre calendarios de Google y de vuelta a ZenCalendar', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA); const ana = await ZC.gcal.addAccount();
    g.pick(PEPE); const pepe = await ZC.gcal.addAccount();
    const mine = await ZC.store.saveEvent({ title: 'Mío', calendarId: 'personal', start: day(2) + 'T12:00' });
    await ZC.store.saveEvent({ id: mine.id, calendarId: 'g:' + ana.id + ':' + ANA });
    await idle(ZC);
    let ev = byTitle(ZC, 'Mío');
    assert.ok(ev.id.startsWith('g:') && ev.gEventId, 'ahora es de Google');
    assert.ok(g.events(ANA, ANA).some(x => x.summary === 'Mío'));
    assert.ok(ZC.store._rawEvent(mine.id).deleted, 'el de ZenCalendar queda como lápida (para Drive)');
    // a Familia (misma cuenta): move
    await ZC.store.saveEvent({ id: ev.id, calendarId: 'g:' + ana.id + ':fam@group.calendar.google.com' });
    await idle(ZC);
    assert.ok(g.requests.some(r => /\/move\?/.test(r.url)));
    assert.ok(g.events(ANA, 'fam@group.calendar.google.com').some(x => x.summary === 'Mío'));
    assert.ok(!g.events(ANA, ANA).some(x => x.summary === 'Mío'));
    // a la otra cuenta
    ev = byTitle(ZC, 'Mío');
    await ZC.store.saveEvent({ id: ev.id, calendarId: 'g:' + pepe.id + ':' + PEPE });
    await idle(ZC, 200);
    assert.ok(g.events(PEPE, PEPE).some(x => x.summary === 'Mío'));
    assert.ok(!g.events(ANA, 'fam@group.calendar.google.com').some(x => x.summary === 'Mío'));
    // de vuelta a ZenCalendar
    ev = byTitle(ZC, 'Mío');
    await ZC.store.saveEvent({ id: ev.id, calendarId: 'work' });
    await idle(ZC, 200);
    assert.ok(!g.events(PEPE, PEPE).some(x => x.summary === 'Mío'));
    const back = ZC.store.events().filter(e => e.title === 'Mío');
    assert.strictEqual(back.length, 1);
    assert.ok(!back[0].id.startsWith('g:') && back[0].calendarId === 'work' && !back[0].gEventId);
    assert.strictEqual(ZC.store.snapshot({ drive: true }).events.filter(e => e.title === 'Mío').length, 1, 'y va a Drive');
  });

  // ---------- varias cuentas ----------
  await t('varias cuentas a la vez, cada una con sus calendarios; un error en una no para a la otra', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA); await ZC.gcal.addAccount();
    g.pick(PEPE); await ZC.gcal.addAccount();
    const accs = ZC.gcal.accounts();
    assert.strictEqual(accs.length, 2);
    assert.ok(byTitle(ZC, 'Reunión') && byTitle(ZC, 'Dentista'));
    assert.notStrictEqual(byTitle(ZC, 'Reunión').accountId, byTitle(ZC, 'Dentista').accountId);
    g.setAuthError(PEPE);
    g.addEvent(ANA, ANA, { title: 'Para Ana', start: day(8) + 'T10:00' });
    g.addEvent(PEPE, PEPE, { title: 'Para Pepe', start: day(8) + 'T11:00' });
    await ZC.gcal.sync();
    const p = ZC.gcal.accounts().find(a => a.email === PEPE);
    assert.ok(p.reauth && p.error, 'Pepe pide volver a conectar');
    assert.ok(byTitle(ZC, 'Para Ana'));
    assert.ok(!byTitle(ZC, 'Para Pepe'));
    assert.ok(byTitle(ZC, 'Reunión'), 'lo de Pepe se queda mientras');
    await ZC.gcal.reconnect(p.id);
    assert.ok(byTitle(ZC, 'Para Pepe'));
    assert.ok(!ZC.gcal.accounts().find(a => a.email === PEPE).reauth);
  });

  await t('quitar cuenta: fuera sus calendarios y eventos (Google no se toca); las demás siguen', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA); const ana = await ZC.gcal.addAccount();
    g.pick(PEPE); await ZC.gcal.addAccount();
    await ZC.gcal.removeAccount(ana.id);
    assert.deepStrictEqual(ZC.gcal.accounts().map(a => a.email), [PEPE]);
    assert.ok(!ZC.store.calendars().some(c => c.accountId === ana.id));
    assert.ok(!ZC.store._rawEvents().some(e => e.accountId === ana.id));
    assert.ok(byTitle(ZC, 'Reunión'));
    assert.ok(g.events(ANA, ANA).length >= 3, 'en Google sigue todo');
    assert.ok(!g.requests.some(r => r.method === 'DELETE'));
  });

  await t('otro dispositivo: la cuenta llega por Drive como «sin conectar aquí» y se conecta con un toque', async () => {
    const A = await setup();
    A.g.pick(ANA); await A.ZC.gcal.addAccount();
    const B = await setup();
    // lo que viaja por Drive (prefs)
    await B.ZC.store.applyRemote({ prefs: A.ZC.store.snapshot({ drive: true }).prefs }, 'sync');
    await wait(20);
    const acc = B.ZC.gcal.accounts()[0];
    assert.strictEqual(acc.email, ANA);
    assert.strictEqual(acc.connected, false);
    assert.ok(!gEvents(B.ZC).length, 'sin eventos hasta conectar');
    await B.ZC.gcal.reconnect(acc.id);
    assert.ok(B.ZC.gcal.accounts()[0].connected);
    assert.ok(byTitle(B.ZC, 'Dentista'));
    // quitarla en A la quita también en B
    await A.ZC.gcal.removeAccount(acc.id);
    await B.ZC.store.applyRemote({ prefs: A.ZC.store.snapshot({ drive: true }).prefs }, 'sync');
    await wait(30);
    assert.strictEqual(B.ZC.gcal.accounts().length, 0);
    assert.ok(!gEvents(B.ZC).length);
  });

  await t('dos dispositivos añaden cuentas distintas a la vez: se quedan las dos', async () => {
    const A = await setup(); A.g.pick(ANA); await A.ZC.gcal.addAccount();
    const B = await setup(); B.g.pick(PEPE); await B.ZC.gcal.addAccount();
    const m = A.ZC.store.merge(A.ZC.store.snapshot({ drive: true }), B.ZC.store.snapshot({ drive: true }));
    const emails = Object.values(m.data.prefs.gcal.accounts).map(a => a.email).sort();
    assert.deepStrictEqual(emails, [ANA, PEPE]);
    assert.ok(m.localChanged && m.remoteChanged);
  });

  await t('sin conexión no se pierde nada: se sube al volver', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA); const acc = await ZC.gcal.addAccount();
    g.offline = true;
    await ZC.store.saveEvent({ title: 'Offline', calendarId: 'g:' + acc.id + ':' + ANA, start: day(9) + 'T09:00' });
    await idle(ZC);
    assert.ok(ZC.gcal.accounts()[0].error, 'avisa');
    g.offline = false;
    await ZC.gcal.sync();
    assert.ok(g.events(ANA, ANA).some(x => x.summary === 'Offline'));
    assert.ok(!ZC.gcal.accounts()[0].error);
  });

  await t('Google falla un rato (500/429): reintenta; un 400 no se reintenta en bucle', async () => {
    const { ZC, g } = await setup();
    g.pick(ANA); const acc = await ZC.gcal.addAccount();
    g.fail(/^POST .*\/events$/, 503, 2);
    await ZC.store.saveEvent({ title: 'Insistente', calendarId: 'g:' + acc.id + ':' + ANA, start: day(9) + 'T10:00' });
    await idle(ZC, 200);
    assert.ok(g.events(ANA, ANA).some(x => x.summary === 'Insistente'));
    g.fail(/^POST .*\/events$/, 400, 1);
    await ZC.store.saveEvent({ title: 'Rechazado', calendarId: 'g:' + acc.id + ':' + ANA, start: day(9) + 'T11:00' });
    await idle(ZC, 200);
    const posts = g.requests.filter(r => r.method === 'POST' && r.body && r.body.summary === 'Rechazado').length;
    assert.strictEqual(posts, 1);
    assert.ok(/Rechazado/.test(ZC.gcal.accounts()[0].error || ''));
    assert.ok(byTitle(ZC, 'Rechazado'), 'se queda aquí');
  });

  await t('el permiso denegado al añadir da un error claro y no deja cuenta a medias', async () => {
    const { ZC, g } = await setup();
    g.denyAdd(ANA); g.pick(ANA);
    let err = null;
    try { await ZC.gcal.addAccount(); } catch (e) { err = e; }
    assert.ok(err && /permiso/.test(err.message));
    assert.strictEqual(ZC.gcal.accounts().length, 0);
  });

  await t('paginación de la lista de eventos', async () => {
    const defs = accountsDef();
    for (let i = 0; i < 7; i++) defs[1].calendars[0].events.push({ title: 'P' + i, start: day(i) + 'T08:00' });
    const { ZC, g } = await setup(defs, { pageSize: 3 });
    g.pick(PEPE); await ZC.gcal.addAccount();
    assert.strictEqual(ZC.store.events().filter(e => /^P\d$/.test(e.title)).length, 7);
  });

  report(__filename);
  process.exit(process.exitCode || 0);
})();
