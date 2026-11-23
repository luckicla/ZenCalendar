'use strict';
// Pruebas de las repeticiones (ZC.recur). node tests/core/recur.test.js
const { load, t, report, assert } = require('./_load');
const ZC = load(['config', 'util', 'recur']);
const U = ZC.util;
const D = (y, m, d, h, mi) => new Date(y, m - 1, d, h || 0, mi || 0);
const days = list => list.map(i => U.ymd(i.start));
const E = (o) => Object.assign({ allDay: false, exdates: [] }, o);

(async () => {
  await t('sin repetición: dentro y fuera del rango', () => {
    const ev = E({ start: '2026-11-27T21:30', end: '2026-11-27T23:00' });
    assert.strictEqual(ZC.recur.expand(ev, D(2026, 11, 1), D(2026, 12, 1)).length, 1);
    assert.strictEqual(ZC.recur.expand(ev, D(2026, 11, 28), D(2026, 12, 1)).length, 0);
  });
  await t('evento de varios días se ve en los días del medio', () => {
    const ev = E({ allDay: true, start: '2026-12-03', end: '2026-12-07' });
    const r = ZC.recur.expand(ev, D(2026, 12, 5), D(2026, 12, 6));
    assert.strictEqual(r.length, 1);
    assert.strictEqual(U.ymd(r[0].end), '2026-12-07');
  });
  await t('con hora que cruza la medianoche', () => {
    const ev = E({ start: '2026-11-27T22:00', end: '2026-11-28T02:00' });
    assert.strictEqual(ZC.recur.expand(ev, D(2026, 11, 28), D(2026, 11, 29)).length, 1);
  });
  await t('diario con intervalo', () => {
    const ev = E({ start: '2026-11-01T08:00', end: '2026-11-01T08:30', rrule: { freq: 'daily', interval: 2 } });
    assert.deepStrictEqual(days(ZC.recur.expand(ev, D(2026, 11, 1), D(2026, 11, 8))), ['2026-11-01', '2026-11-03', '2026-11-05', '2026-11-07']);
  });
  await t('semanal con días', () => {
    const ev = E({ start: '2026-11-02T19:00', end: '2026-11-02T20:00', rrule: { freq: 'weekly', byDay: ['MO', 'WE'] } });
    assert.deepStrictEqual(days(ZC.recur.expand(ev, D(2026, 11, 1), D(2026, 11, 15))), ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11']);
  });
  await t('semanal cada 2 semanas', () => {
    const ev = E({ start: '2026-11-03T10:00', end: '2026-11-03T11:00', rrule: { freq: 'weekly', interval: 2, byDay: ['TU'] } });
    assert.deepStrictEqual(days(ZC.recur.expand(ev, D(2026, 11, 1), D(2026, 12, 1))), ['2026-11-03', '2026-11-17']);
  });
  await t('mensual por día (el 31 se salta los meses cortos)', () => {
    const ev = E({ allDay: true, start: '2026-01-31', end: '2026-01-31', rrule: { freq: 'monthly', monthMode: 'day' } });
    assert.deepStrictEqual(days(ZC.recur.expand(ev, D(2026, 1, 1), D(2026, 6, 1))), ['2026-01-31', '2026-03-31', '2026-05-31']);
  });
  await t('mensual «tercer martes»', () => {
    const ev = E({ start: '2026-11-17T18:00', end: '2026-11-17T19:00', rrule: { freq: 'monthly', monthMode: 'weekday' } });
    assert.deepStrictEqual(days(ZC.recur.expand(ev, D(2026, 11, 1), D(2027, 2, 1))), ['2026-11-17', '2026-12-15', '2027-01-19']);
  });
  await t('mensual «último viernes» (nth -1)', () => {
    const ev = E({ start: '2026-11-27T18:00', end: '2026-11-27T19:00', rrule: { freq: 'monthly', monthMode: 'weekday', nth: -1 } });
    assert.deepStrictEqual(days(ZC.recur.expand(ev, D(2026, 11, 1), D(2027, 2, 1))), ['2026-11-27', '2026-12-25', '2027-01-29']);
  });
  await t('anual (29 de febrero solo en bisiestos)', () => {
    const ev = E({ allDay: true, start: '2024-02-29', end: '2024-02-29', rrule: { freq: 'yearly' } });
    assert.deepStrictEqual(days(ZC.recur.expand(ev, D(2024, 1, 1), D(2033, 1, 1))), ['2024-02-29', '2028-02-29', '2032-02-29']);
  });
  await t('until incluido', () => {
    const ev = E({ start: '2026-11-01T08:00', end: '2026-11-01T09:00', rrule: { freq: 'daily', until: '2026-11-03' } });
    assert.deepStrictEqual(days(ZC.recur.expand(ev, D(2026, 10, 1), D(2026, 12, 1))), ['2026-11-01', '2026-11-02', '2026-11-03']);
  });
  await t('count (cuentan también los quitados)', () => {
    const ev = E({ start: '2026-11-02T08:00', end: '2026-11-02T09:00', rrule: { freq: 'weekly', byDay: ['MO'], count: 3 }, exdates: ['2026-11-09'] });
    assert.deepStrictEqual(days(ZC.recur.expand(ev, D(2026, 10, 1), D(2027, 1, 1))), ['2026-11-02', '2026-11-16']);
  });
  await t('exdates', () => {
    const ev = E({ start: '2026-11-01T08:00', end: '2026-11-01T09:00', rrule: { freq: 'daily' }, exdates: ['2026-11-02'] });
    assert.deepStrictEqual(days(ZC.recur.expand(ev, D(2026, 11, 1), D(2026, 11, 4))), ['2026-11-01', '2026-11-03']);
  });
  await t('serie larga: salta directo a años después', () => {
    const ev = E({ start: '2000-01-01T08:00', end: '2000-01-01T09:00', rrule: { freq: 'daily' } });
    const r = ZC.recur.expand(ev, D(2026, 11, 23), D(2026, 11, 26));
    assert.deepStrictEqual(days(r), ['2026-11-23', '2026-11-24', '2026-11-25']);
    assert.strictEqual(U.hm(r[0].start), '08:00');
  });
  await t('horario de verano: la hora se mantiene', () => {
    const ev = E({ start: '2026-03-27T10:00', end: '2026-03-27T11:00', rrule: { freq: 'daily' } });
    const r = ZC.recur.expand(ev, D(2026, 3, 27), D(2026, 3, 31));
    assert.ok(r.every(i => U.hm(i.start) === '10:00' && U.hm(i.end) === '11:00'));
  });
  await t('evento de varios días que se repite se ve en medio', () => {
    const ev = E({ allDay: true, start: '2026-11-06', end: '2026-11-08', rrule: { freq: 'weekly', byDay: ['FR'] } });
    const r = ZC.recur.expand(ev, D(2026, 11, 15), D(2026, 11, 16));
    assert.deepStrictEqual(days(r), ['2026-11-13']);
  });
  await t('describe', () => {
    assert.strictEqual(ZC.recur.describe({ freq: 'weekly', byDay: ['MO', 'WE'] }, 'es'), 'Cada semana, lunes y miércoles');
    assert.strictEqual(ZC.recur.describe({ freq: 'daily', interval: 2 }, 'es'), 'Cada 2 días');
    assert.strictEqual(ZC.recur.describe({ freq: 'weekly', byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] }, 'es'), 'Cada semana, de lunes a viernes');
    assert.strictEqual(ZC.recur.describe({ freq: 'monthly', monthMode: 'weekday' }, 'es', '2026-11-17'), 'Cada mes, el tercer martes');
    assert.strictEqual(ZC.recur.describe({ freq: 'monthly' }, 'es', '2026-11-15'), 'Cada mes, el día 15');
    assert.strictEqual(ZC.recur.describe({ freq: 'yearly', until: '2030-01-01' }, 'es'), 'Cada año, hasta el 1 ene 2030');
    assert.strictEqual(ZC.recur.describe({ freq: 'weekly', byDay: ['SA', 'SU'] }, 'en'), 'Every week, Saturday and Sunday');
    assert.strictEqual(ZC.recur.describe({ freq: 'daily', count: 5 }, 'ca'), 'Cada dia, 5 vegades');
  });
  await t('lastDate', () => {
    assert.strictEqual(ZC.recur.lastDate({ start: '2026-11-02', allDay: true, rrule: { freq: 'weekly', count: 3 } }), '2026-11-16');
    assert.strictEqual(ZC.recur.lastDate({ start: '2026-11-02', allDay: true, rrule: { freq: 'weekly' } }), null);
  });
  report(__filename);
})();
