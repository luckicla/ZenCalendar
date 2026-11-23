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
  // color legible para texto sobre el color del evento
  function evVars(o) { return `--c:${o.color || (o.calendar && o.calendar.color) || 'var(--a1)'}`; }

  // ---------- mover / cambiar duración (con la pregunta de las series) ----------
  async function askSeries(o, verb) {
    if (!o.ev.rrule) return 'all';
    return UI.choose(verb === 'delete' ? t('Borrar evento repetido') : t('Cambiar evento repetido'), [
      { v: 'one', label: t('Solo este'), icon: 'calendar' },
      { v: 'future', label: t('Este y los siguientes'), icon: 'chevR' },
      { v: 'all', label: t('Todos'), icon: 'repeat', danger: verb === 'delete' },
    ]);
  }
  async function moveOccurrence(o, newStart, newEnd) {
    const ev = o.ev;
    const changes = { start: toLocal(newStart, ev.allDay), end: toLocal(newEnd, ev.allDay) };
    if (ev.kind === 'task') changes.end = changes.start;
    const mode = await askSeries(o, 'move');
    if (!mode) { UI.app && UI.app.render(); return; }
    const before = JSON.parse(JSON.stringify(ev));
    try {
      if (mode === 'one') await ZC.store.saveEventOccurrence(ev.id, ymd(o.start), changes);
      else if (mode === 'future' && !sameDay(o.start, parse(ev.start))) {
        // corta la serie aquí y crea una nueva desde esta ocurrencia
        const until = ymd(addDays(o.start, -1));
        await ZC.store.saveEvent({ id: ev.id, rrule: { ...ev.rrule, until, count: null } });
        const copy = { ...JSON.parse(JSON.stringify(ev)), ...changes }; delete copy.id; delete copy.created; delete copy.updated;
        copy.exdates = []; await ZC.store.saveEvent(copy);
      } else {
        // toda la serie: desplaza el original lo mismo que se ha movido esta ocurrencia
        const dS = newStart - o.start, dur = newEnd - newStart;
        const s0 = new Date(parse(ev.start).getTime() + dS);
        let e0 = new Date(s0.getTime() + dur);
        if (ev.allDay) { const span = daysBetween(newStart, newEnd); e0 = addDays(s0, span); }
        await ZC.store.saveEvent({ id: ev.id, start: toLocal(s0, ev.allDay), end: ev.kind === 'task' ? toLocal(s0, ev.allDay) : toLocal(e0, ev.allDay) });
      }
      UI.haptic('ok');
      UI.toast(t('Movido'), { icon: 'check', undo: () => ZC.store.saveEvent(before) });
    } catch (e) { console.error(e); UI.toast(t('No se ha podido guardar')); UI.app && UI.app.render(); }
  }
  async function deleteOccurrence(o) {
    const ev = o.ev;
    const mode = await askSeries(o, 'delete');
    if (!mode) return false;
    const before = JSON.parse(JSON.stringify(ev));
    try {
      await ZC.store.deleteEvent(ev.id, { mode, date: ymd(o.start) });
      UI.haptic('warn');
      UI.toast(t('«{x}» borrado', { x: (ev.title || t('Sin título')).slice(0, 40) }), { icon: 'trash', undo: () => ZC.store.saveEvent({ ...before, deleted: false }) });
      return true;
    } catch (e) { console.error(e); UI.toast(t('No se ha podido borrar')); return false; }
  }
  async function toggleTask(o, el) {
    const wasDone = o.done != null ? o.done : o.ev.done;
    try {
      if (el && !wasDone) { const r = el.getBoundingClientRect(); UI.confetti(r.left + r.width / 2, r.top + r.height / 2); el.classList.add('on', 'pop'); }
      UI.haptic(wasDone ? 'tap' : 'ok');
      await ZC.store.toggleDone(o.ev.id, o.ev.rrule ? ymd(o.start) : undefined);
    } catch (e) { console.error(e); }
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

  UI.cal = { CAL0, prefsCal, pad, ymd, parse, sod, addDays, addMonths, sameDay, daysBetween, sow, toLocal, isoWeek, today, lastDay, multiDay, occ, onDay, clearCache, holidays, whenText, durText, remText, titleOf, evVars, moveOccurrence, deleteOccurrence, toggleTask, askSeries, occOf, fmtT, esc };
})();
