'use strict';
// Los datos de los widgets de Android (ZC.reminders.widgetData): lo tuyo y lo de los workspaces,
// cada cosa con su «ws», la lista de workspaces, en cuál está la app y los puntitos del widget «Mes».
// node tests/core/widgets.test.js
const { load, t, report, assert } = require('./_load');

(async () => {
  const quiet = { warn() {}, log: console.log, error: console.error };
  const ZCAndroid = { setWidgetData() {}, setReminders() {}, setTheme() {} };
  const ZC = load(['config', 'util', 'store', 'recur', 'holidays', 'platform', 'reminders'], { console: quiet, ZCAndroid });
  await ZC.store.init();
  const u = ZC.util;
  const now = new Date();
  const at = (days, h) => { const d = u.addDays(u.startOfDay(now), days); d.setHours(h, 0, 0, 0); return d; };
  const iso = d => d.toISOString();

  await ZC.store.saveEvent({ title: 'Dentista', start: iso(at(1, 10)), end: iso(at(1, 11)) });
  ZC.store._wsSet({
    calendars: [{ id: 'ws:piso', name: 'Piso', color: '#FFB3C7' }, { id: 'ws:curro', name: 'Curro', color: '#9AD0FF' }],
    items: [
      { id: 'a1', kind: 'event', title: 'Cena', calendarId: 'ws:piso', start: iso(at(2, 21)), end: iso(at(2, 22)), allDay: false, reminders: [], exdates: [] },
      { id: 'b1', kind: 'event', title: 'Reunión', calendarId: 'ws:curro', start: iso(at(3, 9)), end: iso(at(3, 10)), allDay: false, reminders: [], exdates: [] },
    ],
  });

  await t('widgetData: trae lo tuyo y lo de todos los workspaces, cada uno con su «ws»', () => {
    const w = ZC.reminders.widgetData();
    const by = Object.fromEntries(w.items.map(i => [i.title, i.ws]));
    assert.strictEqual(by['Dentista'], '');
    assert.strictEqual(by['Cena'], 'piso');
    assert.strictEqual(by['Reunión'], 'curro');
  });

  await t('widgetData: la lista de workspaces (para el selector de cada widget)', () => {
    const w = ZC.reminders.widgetData();
    const ids = w.workspaces.map(x => x.id).sort();
    assert.deepStrictEqual(ids, ['curro', 'piso']);
    const piso = w.workspaces.find(x => x.id === 'piso');
    assert.strictEqual(piso.name, 'Piso');
    assert.strictEqual(piso.color, '#FFB3C7');
  });

  await t('widgetData: «current» dice en qué workspace está la app («» = mi calendario)', () => {
    assert.strictEqual(ZC.reminders.widgetData().current, '');
    ZC.store._wsSet({ cur: 'piso' });
    assert.strictEqual(ZC.reminders.widgetData().current, 'piso');
    // (aunque la app esté en un workspace, los widgets siguen recibiendo todo)
    assert.ok(ZC.reminders.widgetData().items.some(i => i.title === 'Dentista'));
    ZC.store._wsSet({ cur: null });
  });

  await t('widgetData: los puntitos del «Mes» llevan color y workspace', () => {
    const w = ZC.reminders.widgetData();
    const day = u.ymd(at(2, 21));
    assert.ok(Array.isArray(w.marks[day]), 'falta el día ' + day);
    assert.ok(w.marks[day].some(m => m[1] === 'piso'));
    const mine = w.marks[u.ymd(at(1, 10))];
    assert.ok(mine.some(m => m[1] === ''));
  });

  await t('widgetData: los textos de la pantalla «¿Qué enseña este widget?»', () => {
    const s = ZC.reminders.widgetData().strings;
    for (const k of ['wTitle', 'wAll', 'wPersonal', 'wCurrent', 'wPick', 'wMine', 'wSave', 'wCancel', 'wNext']) assert.ok(s[k], 'falta ' + k);
  });

  report(__filename);
})();
