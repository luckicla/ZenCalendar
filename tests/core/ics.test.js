'use strict';
// Pruebas de importar/exportar .ics (ZC.ics). node tests/core/ics.test.js
const { load, t, report, assert } = require('./_load');
const ZC = load(['config', 'util', 'recur', 'ics']);

// trozo parecido a una exportación de Google Calendar
const GOOGLE = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'VERSION:2.0',
  'CALSCALE:GREGORIAN',
  'X-WR-CALNAME:Personal',
  'X-WR-TIMEZONE:Europe/Madrid',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Madrid',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'DTSTART:19701025T030000',
  'END:STANDARD',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Madrid:20261127T213000',
  'DTEND;TZID=Europe/Madrid:20261127T230000',
  'UID:cena123@google.com',
  'SUMMARY:Cena con Marta',
  'LOCATION:Casa Pepe\\, Calle Mayor 3',
  'DESCRIPTION:Reservado a nombre de Lluc.\\nLlevar vino\; tinto. Esta línea es muy l',
  ' arga y Google la pliega en varias.',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'TRIGGER:-PT30M',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261203',
  'DTEND;VALUE=DATE:20261208',
  'UID:vacas@google.com',
  'SUMMARY:Vacaciones',
  'BEGIN:VALARM',
  'TRIGGER:-PT15H',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261102T180000Z',
  'DTEND:20261102T190000Z',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T225959Z',
  'EXDATE:20261104T180000Z',
  'UID:gym@google.com',
  'SUMMARY:Gimnasio',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261109T190000Z',
  'DTEND:20261109T200000Z',
  'RECURRENCE-ID:20261109T180000Z',
  'UID:gym@google.com',
  'SUMMARY:Gimnasio (tarde)',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/New_York:20261210T090000',
  'DTEND;TZID=America/New_York:20261210T100000',
  'UID:ny@google.com',
  'SUMMARY:Llamada con Nueva York',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Madrid:20261117T180000',
  'DURATION:PT1H30M',
  'RRULE:FREQ=MONTHLY;BYDAY=3TU;COUNT=5',
  'UID:club@google.com',
  'SUMMARY:Club de lectura',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261201',
  'UID:cancel@google.com',
  'STATUS:CANCELLED',
  'SUMMARY:Cancelado',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

(async () => {
  const evs = ZC.ics.parse(GOOGLE);
  const by = title => evs.find(e => e.title === title);
  await t('lee todos menos el cancelado', () => assert.strictEqual(evs.length, 6));
  await t('nombre del calendario', () => assert.strictEqual(evs.calendarName, 'Personal'));
  await t('TZID de aquí, escapes y líneas plegadas', () => {
    const e = by('Cena con Marta');
    assert.strictEqual(e.start, '2026-11-27T21:30');
    assert.strictEqual(e.end, '2026-11-27T23:00');
    assert.strictEqual(e.location, 'Casa Pepe, Calle Mayor 3');
    assert.strictEqual(e.notes, 'Reservado a nombre de Lluc.\nLlevar vino; tinto. Esta línea es muy larga y Google la pliega en varias.');
    assert.deepStrictEqual(e.reminders, [30]);
  });
  await t('todo el día: DTEND exclusivo → último día incluido; aviso del día antes', () => {
    const e = by('Vacaciones');
    assert.strictEqual(e.allDay, true);
    assert.strictEqual(e.start, '2026-12-03');
    assert.strictEqual(e.end, '2026-12-07');
    assert.deepStrictEqual(e.reminders, [1440]);
  });
  await t('UTC → hora local, RRULE semanal, UNTIL y EXDATE', () => {
    const e = by('Gimnasio');
    assert.strictEqual(e.start, '2026-11-02T19:00');
    assert.strictEqual(e.rrule.freq, 'weekly');
    assert.deepStrictEqual(e.rrule.byDay, ['MO', 'WE']);
    assert.strictEqual(e.rrule.until, '2026-12-31');
    assert.ok(e.exdates.includes('2026-11-04'));
  });
  await t('RECURRENCE-ID → copia suelta + exdate en la serie', () => {
    const s = by('Gimnasio'), x = by('Gimnasio (tarde)');
    assert.strictEqual(x.recurrenceOf, s.id);
    assert.strictEqual(x.recurrenceDate, '2026-11-09');
    assert.ok(s.exdates.includes('2026-11-09'));
    assert.strictEqual(x.start, '2026-11-09T20:00');
  });
  await t('otra zona horaria', () => assert.strictEqual(by('Llamada con Nueva York').start, '2026-12-10T15:00'));
  await t('DURATION y BYDAY=3TU', () => {
    const e = by('Club de lectura');
    assert.strictEqual(e.end, '2026-11-17T19:30');
    assert.strictEqual(e.rrule.monthMode, 'weekday');
    assert.strictEqual(e.rrule.nth, 3);
    assert.strictEqual(e.rrule.count, 5);
  });
  await t('ids estables (importar dos veces no duplica)', () => {
    const again = ZC.ics.parse(GOOGLE);
    assert.deepStrictEqual(again.map(e => e.id), evs.map(e => e.id));
    assert.ok(evs.every(e => /^ics-[0-9a-f]{16}$/.test(e.id)));
  });
  await t('exportar y volver a leer', () => {
    const mine = [
      { id: 'a1', kind: 'event', title: 'Cena, con; Marta', notes: 'línea 1\nlínea 2', location: 'Casa Pepe', allDay: false, start: '2026-11-27T21:30', end: '2026-11-27T23:00', reminders: [10, 60], rrule: null, exdates: [] },
      { id: 'a2', kind: 'event', title: 'Vacaciones', allDay: true, start: '2026-12-03', end: '2026-12-07', reminders: [0], rrule: null, exdates: [] },
      { id: 'a3', kind: 'event', title: 'Gimnasio', allDay: false, start: '2026-11-02T19:00', end: '2026-11-02T20:00', rrule: { freq: 'weekly', byDay: ['MO', 'WE'], until: '2026-12-31' }, exdates: ['2026-11-04'], reminders: [] },
      { id: 'a4', kind: 'task', title: 'Comprar pan', allDay: true, start: '2026-11-24', end: '2026-11-24', done: true, reminders: [], exdates: [] },
      { id: 'a5', kind: 'event', title: 'Club', allDay: false, start: '2026-11-17T18:00', end: '2026-11-17T19:00', rrule: { freq: 'monthly', monthMode: 'weekday' }, exdates: [], reminders: [] },
      { id: 'a6', kind: 'event', title: 'Gimnasio (tarde)', allDay: false, start: '2026-11-09T20:00', end: '2026-11-09T21:00', recurrenceOf: 'a3', recurrenceDate: '2026-11-09', exdates: [], reminders: [] },
      { id: 'a7', kind: 'event', title: 'Un título muy muy largo con tildes áéíóú y emojis 🎂🎉 para que haya que plegar la línea en varios trozos seguro', allDay: true, start: '2026-12-01', end: '2026-12-01', exdates: [], reminders: [] },
    ];
    const txt = ZC.ics.build(mine, { name: 'Mío' });
    assert.ok(txt.split('\r\n').every(l => Buffer.byteLength(l) <= 75), 'líneas de más de 75 bytes');
    const back = ZC.ics.parse(txt);
    const B = title => back.find(e => e.title === title);
    assert.strictEqual(back.calendarName, 'Mío');
    assert.strictEqual(back.length, 7);
    assert.strictEqual(B('Cena, con; Marta').notes, 'línea 1\nlínea 2');
    assert.deepStrictEqual(B('Cena, con; Marta').reminders, [10, 60]);
    assert.strictEqual(B('Vacaciones').end, '2026-12-07');
    assert.deepStrictEqual(B('Vacaciones').reminders, [0]);
    assert.deepStrictEqual(B('Gimnasio').rrule.byDay, ['MO', 'WE']);
    assert.ok(B('Gimnasio').exdates.includes('2026-11-04'));
    assert.ok(B('Gimnasio').exdates.includes('2026-11-09'));
    assert.strictEqual(B('Gimnasio (tarde)').recurrenceOf, B('Gimnasio').id);
    assert.strictEqual(B('Comprar pan').kind, 'task');
    assert.strictEqual(B('Comprar pan').done, true);
    assert.strictEqual(B('Club').rrule.nth, 3);
    assert.ok(B(mine[6].title));
  });
  await t('basura no rompe', () => { assert.strictEqual(ZC.ics.parse('hola').length, 0); assert.strictEqual(ZC.ics.parse('').length, 0); });
  await t('exportar y reimportar lo de ZenCalendar conserva los ids (no duplica)', () => {
    const mine = [
      { id: 'serie-1234', kind: 'event', title: 'Yoga', allDay: false, start: '2026-11-02T10:00', end: '2026-11-02T11:00', rrule: { freq: 'weekly', interval: 1, byDay: ['MO'] }, exdates: ['2026-11-16'], reminders: [] },
      { id: 'suelta-5678', kind: 'event', title: 'Yoga (cambiada)', allDay: false, start: '2026-11-16T12:00', end: '2026-11-16T13:00', recurrenceOf: 'serie-1234', recurrenceDate: '2026-11-16', exdates: [], reminders: [] },
    ];
    const back = ZC.ics.parse(ZC.ics.build(mine));
    assert.deepStrictEqual(back.map(e => e.id).sort(), ['serie-1234', 'suelta-5678']);
    assert.strictEqual(back.find(e => e.id === 'suelta-5678').recurrenceOf, 'serie-1234');
  });
  report(__filename);
})();
