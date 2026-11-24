'use strict';
// Asistente integrado: varias cosas en un solo mensaje. node tests/core/multi.test.js
const { load, t, report, assert } = require('./_load');

(async () => {
  const ZC = load(['config', 'util', 'store', 'recur', 'holidays', 'nlp', 'net', 'ics', 'ai', 'reminders'], { console: { warn() {}, log: console.log, error: console.error } });
  await ZC.store.init();
  const creates = async s => (await ZC.ai.run(s, { lang: 'es' })).actions.filter(a => a.type === 'create').map(a => a.event);

  await t('examen con Pérez y el día siguiente con Gómez → 2 eventos, mismo título base, todo el día', async () => {
    const e = await creates('el 3 de diciembre hay EXAMEN con Pérez y el día siguiente con Gómez');
    assert.strictEqual(e.length, 2);
    assert.strictEqual(e[0].title, 'EXAMEN con Pérez'); assert.strictEqual(e[1].title, 'EXAMEN con Gómez');
    assert.strictEqual(e[0].start.slice(5, 10), '12-03'); assert.strictEqual(e[1].start.slice(5, 10), '12-04');
    assert.ok(e[0].allDay && e[1].allDay);
  });
  await t('«dos días después» hereda la hora del anterior', async () => {
    const e = await creates('examen de historia el 10 de diciembre a las 10\ndos días después examen de física');
    assert.strictEqual(e.length, 2);
    assert.strictEqual(e[1].title, 'Examen de física');
    assert.strictEqual(e[1].start.slice(5), '12-12T10:00');
  });
  await t('tres cosas separadas por comas y «y»', async () => {
    const e = await creates('el 1 de diciembre examen de mates a las 9, el 2 de diciembre examen de inglés y el 4 de diciembre a las 11 entrega del trabajo');
    assert.strictEqual(e.length, 3);
    assert.deepStrictEqual(e.map(x => x.start.slice(5, 10)), ['12-01', '12-02', '12-04']);
    assert.ok(e[1].allDay); assert.strictEqual(e[2].start.slice(11), '11:00');
  });
  await t('punto y coma + horas propias', async () => {
    const e = await creates('el 5 de diciembre dentista a las 5; el 6 de diciembre cena con Marta a las 9');
    assert.strictEqual(e.length, 2);
    assert.strictEqual(e[0].start.slice(11), '17:00'); assert.strictEqual(e[1].title, 'Cena con Marta');
  });
  await t('una sola cosa sigue siendo una', async () => assert.strictEqual((await creates('cena con Marta el 6 de diciembre a las 9')).length, 1));
  await t('en inglés: «and on …»', async () => {
    const e = (await ZC.ai.run('December 7 at 10 meeting with Bob and on December 9 lunch with Sue at 2', { lang: 'en' })).actions.filter(a => a.type === 'create');
    assert.strictEqual(e.length, 2);
  });
  report(__filename);
})();
