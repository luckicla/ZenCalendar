'use strict';
// Pruebas de los festivos (ZC.holidays). node tests/core/holidays.test.js
const { load, t, report, assert } = require('./_load');
const ZC = load(['config', 'util', 'holidays']);
const D = (y, m, d) => new Date(y, m - 1, d);

(async () => {
  await t('Pascua (varios años conocidos)', () => {
    const known = { 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2030: '2030-04-21', 2038: '2038-04-25' };
    for (const y of Object.keys(known)) assert.strictEqual(ZC.util.ymd(ZC.holidays.easter(+y)), known[y], y);
  });
  await t('fiestas nacionales de España 2026', () => {
    const h = ZC.holidays.between(D(2026, 1, 1), D(2027, 1, 1), 'ES');
    assert.deepStrictEqual(h.map(x => x.date), ['2026-01-01', '2026-01-06', '2026-04-03', '2026-05-01', '2026-08-15', '2026-10-12', '2026-11-01', '2026-12-06', '2026-12-08', '2026-12-25']);
    assert.strictEqual(h.find(x => x.date === '2026-04-03').name, 'Viernes Santo');
  });
  await t('rango [from, to)', () => {
    assert.strictEqual(ZC.holidays.between(D(2026, 12, 1), D(2026, 12, 25)).length, 2);
    assert.strictEqual(ZC.holidays.between(D(2026, 12, 1), D(2026, 12, 26)).length, 3);
  });
  await t('cruza de año', () => assert.deepStrictEqual(ZC.holidays.between(D(2026, 12, 20), D(2027, 1, 10)).map(x => x.date), ['2026-12-25', '2027-01-01', '2027-01-06']));
  await t('Cataluña suma las suyas', () => {
    const h = ZC.holidays.between(D(2026, 1, 1), D(2027, 1, 1), 'ES-CT', 'ca');
    assert.ok(h.some(x => x.date === '2026-04-06' && x.name === 'Dilluns de Pasqua'));
    assert.ok(h.some(x => x.date === '2026-09-11'));
  });
  await t('none y país desconocido', () => {
    assert.strictEqual(ZC.holidays.between(D(2026, 1, 1), D(2027, 1, 1), 'none').length, 0);
    assert.strictEqual(ZC.holidays.between(D(2026, 1, 1), D(2027, 1, 1), 'XX').length, 0);
  });
  await t('registrar otro país', () => {
    ZC.holidays.register('PT', 'Portugal', y => [[4, 25, 'liberdade'], [6, 10, 'portugal']]);
    assert.strictEqual(ZC.holidays.between(D(2026, 1, 1), D(2027, 1, 1), 'PT').length, 2);
  });
  report(__filename);
})();
