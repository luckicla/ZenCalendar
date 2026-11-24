'use strict';
// ZenCalendar · ayudas comunes de las vistas: preferencias del calendario, fechas, ocurrencias,
// tarjetas de eventos y mover/borrar con la pregunta de las series.
(function () {
  const ZC = window.ZC, UI = ZC.ui, t = (...a) => ZC.t(...a);
  const CAL0 = { firstDay: 1, weekNumbers: false, timeFormat: '24', defaultView: 'month', defaultDuration: 60, defaultReminders: [10], holidays: 'ES', lang: 'auto' };
  const prefsCal = () => ({ ...CAL0, ...((ZC.store.getPrefs() || {}).cal || {}) });
  UI.prefsCal = prefsCal;

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { if (s instanceof Date) return new Date(s); const [d, tm] = String(s).split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = (tm || '00:00').split(':').map(Number); return new Date(y, m - 1, dd, h || 0, mi || 0); };
  const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const addMonths = (d, n) => { const x = new Date(d); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; };
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const daysBetween = (a, b) => Math.round((sod(b) - sod(a)) / 864e5);
  const sow = (d, fd = prefsCal().firstDay) => { const x = sod(d); return addDays(x, -((x.getDay() - fd + 7) % 7)); };
  const toLocal = (d, allDay) => allDay ? ymd(d) : ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const isoWeek = d => { if (ZC.util && ZC.util.isoWeek) return ZC.util.isoWeek(d); const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 864e5 + 1) / 7); };
  const today = () => sod(new Date());

  // último día (inclusive) que ocupa una ocurrencia
  function lastDay(o) {
    if (o.allDay) {
      const ev = o.ev, span = Math.max(0, daysBetween(parse(ev.start), parse(ev.end || ev.start)));
      return addDays(sod(o.start), span);
    }
    const e = new Date(o.end);
    if (e > o.start && e.getHours() === 0 && e.getMinutes() === 0) return addDays(sod(e), -1);
    return sod(e < o.start ? o.start : e);
  }
  const multiDay = o => o.allDay || daysBetween(o.start, lastDay(o)) > 0;

  // ocurrencias con caché por render (se vacía cuando cambia el almacén)
  let cache = new Map();
  ZC.store.on && ZC.store.on('change', () => cache.clear());
  function occ(from, to, opts) {
    const k = +from + '|' + +to + '|' + JSON.stringify(opts || {});
    if (!cache.has(k)) {
      if (cache.size > 40) cache.clear();
      let list = [];
      try { list = ZC.store.occurrences(from, to, opts || {}) || []; } catch (e) { console.error(e); }
      cache.set(k, list);
    }
    return cache.get(k);
  }
  const clearCache = () => cache.clear();
  // ocurrencias que tocan un día concreto
  function onDay(list, d) { const s = sod(d); return list.filter(o => sod(o.start) <= s && lastDay(o) >= s); }

  // festivos
  const holCache = new Map();
  function holidays(from, to) {
    const c = prefsCal().holidays || 'ES';
    if (c === 'none' || !ZC.holidays) return new Map();
    const k = c + ZC.i18n.lang() + ymd(from) + ymd(to);
    if (!holCache.has(k)) {
      const m = new Map();
      try { for (const h of ZC.holidays.between(from, to, c, ZC.i18n.lang()) || []) m.set(h.date, h.name); } catch (e) { console.warn(e); }
      if (holCache.size > 30) holCache.clear();
      holCache.set(k, m);
    }
    return holCache.get(k);
  }

  const D = () => ZC.i18n.D;
  const fmtT = d => D().time(d);
  function whenText(o, { withDate = false } = {}) {
    const ld = lastDay(o);
    if (o.allDay) {
      if (sameDay(o.start, ld)) return withDate ? D().day(o.start) : t('Todo el día');
      return D().short(o.start) + ' – ' + D().short(ld);
    }
    if (o.isTask) return (withDate ? D().short(o.start) + ', ' : '') + fmtT(o.start);
    if (sameDay(o.start, ld)) return (withDate ? D().day(o.start) + ', ' : '') + fmtT(o.start) + ' – ' + fmtT(o.end);
    return D().short(o.start) + ' ' + fmtT(o.start) + ' – ' + D().short(ld) + ' ' + fmtT(o.end);
  }
  function durText(min) {
    if (min < 60) return t('{n} min', { n: min });
    const h = Math.floor(min / 60), m = min % 60;
    return m ? t('{h} h {m} min', { h, m }) : t('{h} h', { h });
  }
  function remText(m) {
    if (m === 0) return t('A la hora');
    if (m < 60) return t('{n} min antes', { n: m });
    if (m < 1440) return m % 60 ? t('{n} min antes', { n: m }) : t('{n} h antes', { n: m / 60 });
    if (m % 10080 === 0) return ZC.i18n.tn(m / 10080, '{n} semana antes', '{n} semanas antes');
    return m % 1440 === 0 ? ZC.i18n.tn(m / 1440, '{n} día antes', '{n} días antes') : t('{n} min antes', { n: m });
  }
  const esc = s => UI.esc(s);
  const titleOf = ev => (ev.emoji ? ev.emoji + ' ' : '') + (ev.title || (ev.kind === 'task' ? t('Tarea sin título') : t('Sin título')));
  // color del evento para el CSS (solo colores de verdad: el valor acaba dentro de un atributo style)
  const safeColor = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '').trim()) ? String(c).trim() : '');
  function evVars(o) { return `--c:${safeColor(o.color) || safeColor(o.calendar && o.calendar.color) || 'var(--a1)'}`; }

  // ---------- mover / cambiar duración (con la pregunta de las series) ----------
  async function askSeries(o, verb) {
    if (!o.ev.rrule) return 'all';
    return UI.choose(verb === 'delete' ? t('Borrar evento repetido') : t('Cambiar evento repetido'), [
      { v: 'one', label: t('Solo este'), icon: 'calendar' },
      { v: 'future', label: t('Este y los siguientes'), icon: 'chevR' },
      { v: 'all', label: t('Todos'), icon: 'repeat', danger: verb === 'delete' },
    ]);
  }
  // ---------- series: mover, dividir y deshacer ----------
  const WDS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const clone = x => JSON.parse(JSON.stringify(x));
  // cuánto se ha movido algo «de calendario»: días y minutos de reloj (así el horario de verano no cambia la hora)
  const shiftOf = (a, b) => ({ days: daysBetween(a, b), mins: (b.getHours() * 60 + b.getMinutes()) - (a.getHours() * 60 + a.getMinutes()) });
  function applyShift(d, sh) { const x = addDays(d, sh.days); x.setMinutes(x.getMinutes() + sh.mins); return x; }
  const moveYmd = (s, days) => ymd(addDays(parse(s), days));
  // una serie semanal que se mueve n días: sus días de la semana se mueven con ella
  function shiftRule(rr, days) {
    if (!rr || !days) return rr;
    const r = { ...rr };
    if (r.freq === 'weekly' && Array.isArray(r.byDay) && r.byDay.length) r.byDay = r.byDay.map(d => WDS[(((WDS.indexOf(d) + days) % 7) + 7) % 7]);
    if (r.until) r.until = moveYmd(r.until, days);
    return r;
  }
  /** Cambios para mover toda la serie lo mismo que se ha movido una aparición (de occStart a newStart). */
  function seriesShifted(ev, occStart, newStart, newEnd, { allDay = ev.allDay, kind = ev.kind, rrule = ev.rrule, moveDays = true } = {}) {
    const sh = shiftOf(occStart, newStart), s0 = applyShift(parse(ev.start), sh);
    const out = { start: toLocal(s0, allDay), rrule };
    if (kind === 'task') out.end = out.start;
    else if (allDay) out.end = toLocal(addDays(s0, Math.max(0, daysBetween(newStart, newEnd))), true);
    else out.end = toLocal(new Date(s0.getTime() + Math.max(0, newEnd - newStart)), false);
    if (sh.days) {
      if (moveDays) out.rrule = shiftRule(rrule, sh.days);
      out.exdates = (ev.exdates || []).map(d => moveYmd(d, sh.days));
      if (ev.doneDates) out.doneDates = ev.doneDates.map(d => moveYmd(d, sh.days));
    }
    return out;
  }
  /**
   * «Este y los siguientes»: corta la serie el día antes de occStart y crea otra desde ahí con los cambios.
   * Conserva lo que queda de `count`, las repeticiones quitadas y las apariciones sueltas de después.
   */
  async function splitSeries(ev, occStart, changes, { moveDays = 0 } = {}) {
    const date = ymd(occStart);
    const copy = { ...clone(ev), ...clone(changes) };
    delete copy.id; delete copy.created; delete copy.updated;
    copy.recurrenceOf = null; delete copy.recurrenceDate;
    const sameRule = JSON.stringify(ZC.recur.normRule(changes.rrule === undefined ? ev.rrule : changes.rrule)) === JSON.stringify(ZC.recur.normRule(ev.rrule));
    let rr = changes.rrule === undefined ? ev.rrule : changes.rrule;
    if (rr && sameRule) {
      rr = { ...rr };
      if (rr.count) {
        // las que ya han pasado cuentan para el total
        const before = ZC.recur.expand({ ...ev, exdates: [], end: ev.start }, parse(ev.start), sod(occStart)).length;
        rr.count = Math.max(1, rr.count - before);
      }
      if (moveDays) rr = shiftRule(rr, moveDays);
    }
    copy.rrule = rr;
    copy.exdates = (ev.exdates || []).filter(d => d >= date).map(d => moveDays ? moveYmd(d, moveDays) : d);
    if (ev.doneDates) copy.doneDates = ev.doneDates.filter(d => d >= date).map(d => moveDays ? moveYmd(d, moveDays) : d);
    await ZC.store.saveEvent({ id: ev.id, rrule: { ...ev.rrule, until: ymd(addDays(occStart, -1)), count: null } });
    const saved = await ZC.store.saveEvent(copy);
    // las apariciones cambiadas sueltas de ahí en adelante pasan a ser de la serie nueva
    for (const x of ZC.store.events().filter(x => x.recurrenceOf === ev.id && (x.recurrenceDate || ymd(parse(x.start))) >= date)) await ZC.store.saveEvent({ id: x.id, recurrenceOf: saved.id });
    return saved;
  }
  /**
   * Foto de una serie (con sus apariciones sueltas) antes de cambiarla. Después del cambio, snap() apunta lo que
   * se ha creado y devuelve el «deshacer»: quita eso y deja la serie como estaba.
   */
  function snapshotSeries(ev) {
    const before = clone(ev), kids = ZC.store.events().filter(x => x.recurrenceOf === ev.id).map(clone);
    const ids = new Set(ZC.store.events().map(e => e.id));
    return () => {
      const created = ZC.store.events().filter(e => !ids.has(e.id)).map(e => e.id);
      return async () => {
        for (const id of created) await ZC.store.deleteEvent(id, { mode: 'all' });
        await ZC.store.saveEvent({ ...before, deleted: false });
        for (const k of kids) await ZC.store.saveEvent({ ...k, deleted: false });
      };
    };
  }
  /** Guarda en memoria las imágenes que se van a borrar → función que las vuelve a poner (para «Deshacer»). */
  async function holdBlobs(ids) {
    const kept = [];
    for (const id of new Set(ids)) { try { const b = await ZC.store.getBlob(id), info = ZC.store.blobInfo(id); if (b) kept.push([id, b, info && info.name]); } catch {} }
    return async () => { for (const [id, b, name] of kept) if (!ZC.store.blobInfo(id)) await ZC.store.putBlob(b, { id, name }); };
  }
  /** Borra las imágenes que ya no usa ningún evento. */
  async function dropUnusedBlobs(ids) {
    const used = new Set(); for (const e of ZC.store.events()) for (const a of (e.attachments || [])) used.add(a.id);
    for (const id of new Set(ids)) if (!used.has(id)) await ZC.store.deleteBlob(id).catch(() => {});
  }
  // (eventos de calendarios de Google de solo lectura: ni mover, ni borrar, ni completar)
  const ro = ev => !!(UI.gacc && UI.gacc.readOnly(ev));
  async function moveOccurrence(o, newStart, newEnd) {
    const ev = o.ev;
    if (ro(ev)) { UI.gacc.roToast(); UI.app && UI.app.render(); return; }
    const changes = { start: toLocal(newStart, ev.allDay), end: toLocal(newEnd, ev.allDay) };
    if (ev.kind === 'task') changes.end = changes.start;
    const mode = await askSeries(o, 'move');
    if (!mode) { UI.app && UI.app.render(); return; }
    const snap = snapshotSeries(ev);
    try {
      if (!ev.rrule) await ZC.store.saveEvent({ id: ev.id, ...changes });
      else if (mode === 'one') await ZC.store.saveEventOccurrence(ev.id, ymd(o.start), changes);
      else if (mode === 'future' && !sameDay(o.start, parse(ev.start))) await splitSeries(ev, o.start, changes, { moveDays: daysBetween(o.start, newStart) });
      // toda la serie: se mueve lo mismo que esta aparición (días de la semana y repeticiones quitadas incluidos)
      else await ZC.store.saveEvent({ id: ev.id, ...seriesShifted(ev, o.start, newStart, newEnd) });
      UI.haptic('ok');
      UI.toast(t('Movido'), { icon: 'check', undo: snap() });
    } catch (e) { console.error(e); UI.toast(t('No se ha podido guardar')); UI.app && UI.app.render(); }
  }
  async function deleteOccurrence(o) {
    const ev = o.ev;
    if (ro(ev)) { UI.gacc.roToast(); return false; }
    const mode = await askSeries(o, 'delete');
    if (!mode) return false;
    const snap = snapshotSeries(ev);
    // (el núcleo borra las imágenes de lo borrado: se guardan un rato por si se deshace)
    const imgs = mode === 'one' ? [] : [ev, ...ZC.store.events().filter(x => x.recurrenceOf === ev.id)].flatMap(x => (x.attachments || []).map(a => a.id));
    const restoreImgs = imgs.length ? await holdBlobs(imgs) : null;
    try {
      await ZC.store.deleteEvent(ev.id, { mode, date: ymd(o.start) });
      UI.haptic('warn');
      const undo = snap();
      UI.toast(t('«{x}» borrado', { x: (ev.title || t('Sin título')).slice(0, 40) }), { icon: 'trash', undo: async () => { if (restoreImgs) await restoreImgs(); await undo(); } });
      return true;
    } catch (e) { console.error(e); UI.toast(t('No se ha podido borrar')); return false; }
  }
  async function toggleTask(o, el) {
    if (ro(o.ev)) { UI.gacc.roToast(); return; }
    const wasDone = o.done != null ? o.done : o.ev.done;
    try {
      if (el && !wasDone) { const r = el.getBoundingClientRect(); UI.confetti(r.left + r.width / 2, r.top + r.height / 2); el.classList.add('on', 'pop'); }
      UI.haptic(wasDone ? 'tap' : 'ok');
      await ZC.store.toggleDone(o.ev.id, o.ev.rrule ? ymd(o.start) : undefined);
    } catch (e) { console.error(e); }
  }

  // la aparición de una tarea que toca: en las que se repiten, la primera sin hacer de hoy en adelante
  // (si la serie ya acabó, la última sin hacer); en las demás, la tarea tal cual
  function taskOcc(ev) {
    if (!ev.rrule) return occOf(ev);
    const td = today();
    const list = occ(addDays(td, -60), addDays(td, 400), { includeHidden: true }).filter(o => o.id === ev.id);
    return list.find(o => !o.done && o.start >= td) || list.filter(o => !o.done).pop() || null;
  }

  // ocurrencia «virtual» de un evento en su fecha (para abrir desde búsqueda, IA…)
  function occOf(ev, date) {
    const d = date ? parse(date) : parse(ev.start);
    const list = occ(sod(d), addDays(sod(d), 1), { includeHidden: true });
    const found = list.find(o => o.id === ev.id);
    if (found) return found;
    const cal = ZC.store.calendar(ev.calendarId);
    return { key: ev.id + '@' + ymd(parse(ev.start)), id: ev.id, ev, start: parse(ev.start), end: parse(ev.end || ev.start), allDay: ev.allDay, color: ev.color || (cal && cal.color), calendar: cal, isTask: ev.kind === 'task', done: !!ev.done };
  }

  // alarma (suena como un despertador): a la hora del evento o, en los de todo el día, a alarmTime (09:00 si no hay)
  function alarmTime(ev) {
    if (!ev) return '';
    if (ev.allDay || !/T\d/.test(ev.start || '')) { const [h, m] = (/^\d{1,2}:\d{2}$/.test(ev.alarmTime || '') ? ev.alarmTime : '09:00').split(':').map(Number); const d = new Date(2000, 0, 1, h, m); return fmtT(d); }
    return fmtT(parse(ev.start));
  }
  const alarmText = ev => t('Alarma a las {x}', { x: alarmTime(ev) });
  const alarmMark = (ev, size = 13) => ev && ev.alarm ? `<i class="al-mk" title="${esc(alarmText(ev))}" aria-label="${esc(alarmText(ev))}">${UI.icon('alarm', size)}</i>` : '';

  UI.cal = { CAL0, alarmTime, alarmText, alarmMark, prefsCal, pad, ymd, parse, sod, addDays, addMonths, sameDay, daysBetween, sow, toLocal, isoWeek, today, lastDay, multiDay, occ, onDay, clearCache, holidays, whenText, durText, remText, titleOf, evVars, moveOccurrence, deleteOccurrence, toggleTask, askSeries, occOf, taskOcc, safeColor, fmtT, esc, shiftOf, applyShift, seriesShifted, splitSeries, snapshotSeries, holdBlobs, dropUnusedBlobs };
})();
