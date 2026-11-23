'use strict';
// ZenCalendar · importar y exportar: .ics (entrada y salida) y copia de seguridad .json.
(function () {
  const ZC = window.ZC, UI = ZC.ui, t = (...a) => ZC.t(...a);
  // (fecha local: toISOString daría la de UTC, el día anterior pasada la medianoche en España)
  const stamp = () => UI.cal.ymd(new Date());

  async function importFile(file) {
    if (!file) return;
    const name = file.name || '';
    let text = '';
    try { text = await file.text(); } catch { UI.toast(t('No se ha podido leer el archivo')); return; }
    if (/\.json$/i.test(name) || /^\s*\{/.test(text)) {
      let obj; try { obj = JSON.parse(text); } catch { UI.toast(t('El archivo no es una copia válida')); return; }
      const ok = await UI.confirm(t('Restaurar copia de seguridad'), t('Se juntará con lo que ya tienes (si algo está en los dos sitios, gana lo más nuevo).'), { ok: t('Restaurar'), icon: 'database' });
      if (!ok) return;
      try { await ZC.store.importJSON(obj, { merge: true }); UI.toast(t('Copia restaurada'), { icon: 'check' }); } catch (e) { console.error(e); UI.toast(t('No se ha podido restaurar: {x}', { x: e.message })); }
      return;
    }
    if (!/BEGIN:VCALENDAR|BEGIN:VEVENT/.test(text)) { UI.toast(t('Este archivo no parece un calendario (.ics)')); return; }
    let evs = [];
    try { evs = ZC.ics.parse(text) || []; } catch (e) { console.error(e); }
    if (!evs.length) { UI.toast(t('No hay eventos en el archivo')); return; }
    const cals = ZC.store.calendars();
    const base = (evs.calendarName || '').trim() || name.replace(/\.ics$/i, '') || t('Importado');
    // al reimportar el mismo archivo no se ofrece otro calendario igual: ya está en la lista
    const same = cals.find(c => c.name === base);
    const v = await UI.choose(t('Importar {n} eventos', { n: evs.length }), [
      ...cals.map(c => ({ v: c.id, label: c.name, icon: 'calendar' })),
      ...(same ? [] : [{ v: '__new', label: t('Nuevo calendario «{x}»', { x: base }), icon: 'plus' }]),
    ], { text: t('¿En qué calendario los pongo?') });
    if (!v) return;
    let calId = v;
    if (v === '__new') { const c = await ZC.store.saveCalendar({ name: base, color: UI.side.CAL_COLORS[cals.length % UI.side.CAL_COLORS.length], visible: true, order: cals.length }); calId = c.id; }
    let n = 0;
    // (el id viene del UID del .ics: así reimportar no duplica y las excepciones RECURRENCE-ID siguen enlazadas)
    for (const ev of evs) { try { await ZC.store.saveEvent({ ...ev, calendarId: calId }); n++; } catch (e) { console.warn(e); } }
    UI.toast(ZC.i18n.tn(n, '{n} evento importado', '{n} eventos importados'), { icon: 'check' });
  }
  async function pickImport() {
    const f = await UI.pickFile({ accept: '.ics,.json,text/calendar,application/json' });
    if (f[0]) importFile(f[0]);
  }
  function exportICS(calId) {
    const evs = ZC.store.events().filter(e => !calId || e.calendarId === calId);
    if (!evs.length) { UI.toast(t('No hay eventos que exportar')); return; }
    const cal = calId && ZC.store.calendar(calId);
    UI.download(`zencalendar-${cal ? cal.name.replace(/[^\w\-áéíóúñ ]/gi, '') : t('todo')}-${stamp()}.ics`, ZC.ics.build(evs), 'text/calendar');
    UI.toast(ZC.i18n.tn(evs.length, '{n} evento exportado', '{n} eventos exportados'), { icon: 'download' });
  }
  function exportJSON() {
    const obj = ZC.store.exportJSON();
    UI.download(`zencalendar-copia-${stamp()}.json`, JSON.stringify(obj, null, 1), 'application/json');
    UI.toast(t('Copia de seguridad descargada'), { icon: 'download' });
  }
  async function wipe() {
    const n = ZC.store.events().length;
    const ok = await UI.confirm(t('¿Borrar todos los eventos?'), ZC.i18n.tn(n, 'Se borrará {n} evento de todos tus dispositivos sincronizados. Los calendarios y tus ajustes se quedan.', 'Se borrarán {n} eventos de todos tus dispositivos sincronizados. Los calendarios y tus ajustes se quedan.'), { ok: t('Borrar todo'), danger: true, icon: 'trash' });
    if (!ok) return;
    const ok2 = await UI.confirm(t('¿Seguro del todo?'), t('Esto no se puede deshacer. Si quieres, descarga antes una copia de seguridad.'), { ok: t('Sí, borrar'), danger: true });
    if (!ok2) return;
    for (const e of ZC.store.events()) { try { await ZC.store.deleteEvent(e.id, { mode: 'all' }); } catch {} }
    UI.toast(t('Todo borrado'), { icon: 'trash' });
  }
  UI.data = { importFile, pickImport, exportICS, exportJSON, wipe };
})();
