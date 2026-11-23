'use strict';
// ZenCalendar: los avisos.
//
// Cada vez que cambia algo se calculan los avisos de los próximos días y se
// le pasan a la plataforma, que es la que los hace sonar aunque la app esté
// cerrada:
//   Android → AlarmManager (ZCAndroid.setReminders), se reprograman al reiniciar
//   Windows → temporizadores en el proceso principal (zcDesktop.setReminders),
//             aunque la ventana esté cerrada en la bandeja
//   web     → Notification mientras la pestaña está abierta
// También refresca los datos de los widgets de Android.
//
// Aviso = { id, eventId, date, at (ms), title, body, minutes, task }
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const U = () => ZC.util;
  const HORIZON_DAYS = 21;  // cuántos días por delante se programan
  const MAX = 120;          // y como mucho cuántos avisos
  const snoozeOptions = [5, 10, 15, 30, 60];

  let list = [];
  let webTimer = null;
  let started = false;

  const L = () => {
    let lang = 'es';
    try { const p = ZC.store.getPrefs().cal.lang; lang = p && p !== 'auto' ? p : String(navigator.language || 'es').slice(0, 2); } catch (e) {}
    return {
      es: { now: 'Ahora', inM: 'En %n min', inH: 'En %n h', today: 'Hoy', tomorrow: 'Mañana', allDay: 'Todo el día', task: 'Tarea', empty: 'Nada a la vista ✿', snooze: 'Posponer 10 min', done: 'Hecho' },
      ca: { now: 'Ara', inM: "D'aquí %n min", inH: "D'aquí %n h", today: 'Avui', tomorrow: 'Demà', allDay: 'Tot el dia', task: 'Tasca', empty: 'Res a la vista ✿', snooze: 'Posposa 10 min', done: 'Fet' },
      en: { now: 'Now', inM: 'In %n min', inH: 'In %n h', today: 'Today', tomorrow: 'Tomorrow', allDay: 'All day', task: 'Task', empty: 'Nothing coming up ✿', snooze: 'Snooze 10 min', done: 'Done' },
    }[lang] || null;
  };
  // textos en el idioma de la app (español si no se sabe)
  const T = () => L() || { now: 'Ahora', inM: 'En %n min', inH: 'En %n h', today: 'Hoy', tomorrow: 'Mañana', allDay: 'Todo el día', task: 'Tarea', empty: 'Nada a la vista ✿', snooze: 'Posponer 10 min', done: 'Hecho' };

  function fmtTime(d) {
    const u = U();
    let h24 = true;
    try { h24 = ZC.store.getPrefs().cal.timeFormat !== '12'; } catch (e) {}
    if (h24) return u.pad(d.getHours()) + ':' + u.pad(d.getMinutes());
    const h = d.getHours() % 12 || 12;
    return h + ':' + u.pad(d.getMinutes()) + (d.getHours() < 12 ? ' am' : ' pm');
  }

  function body(o) {
    const t = T();
    const parts = [];
    parts.push(o.allDay ? t.allDay : fmtTime(o.start) + (o.isTask ? '' : ' – ' + fmtTime(o.end)));
    if (o.ev.location) parts.push(o.ev.location);
    return parts.join(' · ');
  }

  /** Calcula los avisos de los próximos días (y los pospuestos). */
  function compute(now) {
    const u = U();
    now = now || Date.now();
    const from = u.addDays(u.startOfDay(new Date(now)), -2); // un poco hacia atrás, por los eventos largos
    const to = u.addDays(new Date(now), HORIZON_DAYS);
    const out = [];
    let occ = [];
    try { occ = ZC.store.occurrences(from, to, { includeHidden: true, includeTasks: true }); } catch (e) { return []; }
    const dismissed = new Set(ZC.store.local('reminders.dismissed') || []);
    for (const o of occ) {
      if (o.isTask && o.done) continue;
      const rem = o.ev.reminders || [];
      for (const m of rem) {
        const base = o.allDay ? new Date(o.start.getFullYear(), o.start.getMonth(), o.start.getDate(), 9, 0) : o.start;
        const at = base.getTime() - m * 60000;
        if (at < now - 60000) continue;
        const id = o.key + '#' + m;
        if (dismissed.has(id)) continue;
        out.push({
          id, eventId: o.id, date: o.date, at, minutes: m, task: o.isTask,
          title: (o.ev.emoji ? o.ev.emoji + ' ' : '') + (o.ev.title || (o.isTask ? T().task : 'ZenCalendar')),
          body: body(o), color: o.color,
        });
      }
    }
    // los pospuestos
    const snoozed = (ZC.store.local('reminders.snoozed') || []).filter(s => s.at > now - 60000);
    for (const s of snoozed) out.push(s);
    out.sort((a, b) => a.at - b.at);
    return out.slice(0, MAX);
  }

  // ---------- datos para los widgets de Android ----------
  function widgetData() {
    const u = U();
    const now = new Date();
    const from = u.startOfDay(now);
    const to = u.addDays(from, 15);
    let occ = [];
    try { occ = ZC.store.occurrences(from, to, { includeHidden: false, includeTasks: true }); } catch (e) {}
    const items = [];
    for (const o of occ) {
      if (!o.allDay && o.endEx < now && !o.isTask) continue; // lo que ya acabó hoy
      if (o.isTask && o.done) continue;
      // los de varios días salen en el primer día que se ve
      const day = o.start < from ? u.ymd(from) : o.date;
      items.push({
        id: o.id, date: day, title: (o.ev.emoji ? o.ev.emoji + ' ' : '') + (o.ev.title || '·'),
        time: o.allDay ? '' : fmtTime(o.start < from ? from : o.start), end: o.allDay ? '' : fmtTime(o.end),
        allDay: o.allDay, color: o.color, task: o.isTask, location: o.ev.location || '',
      });
      if (items.length >= 80) break;
    }
    items.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1));
    let theme = null;
    try { theme = ZC.store.local('theme'); } catch (e) {}
    let firstDay = 1;
    try { firstDay = ZC.store.getPrefs().cal.firstDay; } catch (e) {}
    // (en el diseño Dot, sin la florecita del «Nada a la vista ✿»)
    const strings = Object.assign({}, T());
    if (theme && theme.design === 'dot' && strings.empty) strings.empty = strings.empty.replace(/\s*✿\s*$/, '');
    return { generated: Date.now(), today: u.ymd(from), items, theme, strings, firstDay };
  }

  // ---------- entregar a la plataforma ----------
  function deliver() {
    if (ZC.platform && ZC.platform.isWidget) return; // el widget de escritorio no programa nada
    list = compute();
    const A = root.ZCAndroid, D = root.zcDesktop;
    try {
      if (A && A.setReminders) A.setReminders(JSON.stringify({ items: list, strings: T() }));
      else if (D && D.setReminders) D.setReminders(list);
      else webSchedule();
    } catch (e) { console.warn('[ZC] no se pudieron programar los avisos', e); }
    refreshWidgets();
  }
  const deliverSoon = () => { clearTimeout(deliverSoon.t); deliverSoon.t = setTimeout(deliver, 800); };

  function refreshWidgets() {
    const A = root.ZCAndroid;
    if (!A || !A.setWidgetData) return;
    clearTimeout(refreshWidgets.t);
    refreshWidgets.t = setTimeout(() => {
      try { A.setWidgetData(JSON.stringify(widgetData())); } catch (e) { console.warn('[ZC] widgets', e); }
    }, 300);
  }

  // ---------- web: mientras la pestaña está abierta ----------
  function webSchedule() {
    clearTimeout(webTimer);
    if (!root.Notification) return;
    const fired = new Set(ZC.store.local('reminders.fired') || []);
    const now = Date.now();
    const next = list.find(r => !fired.has(r.id + '@' + r.at));
    if (!next) return;
    const wait = Math.max(0, next.at - now);
    // (los temporizadores largos se recalculan: el ordenador puede dormirse)
    webTimer = setTimeout(() => {
      if (next.at - Date.now() > 1500) { webSchedule(); return; }
      webShow(next);
      fired.add(next.id + '@' + next.at);
      ZC.store.local('reminders.fired', [...fired].slice(-300));
      webSchedule();
    }, Math.min(wait, 60 * 60000));
  }

  async function webShow(r) {
    if (!root.Notification || Notification.permission !== 'granted') return;
    const data = { action: 'open', id: r.eventId, date: r.date, reminder: r };
    const opts = { body: r.body, tag: r.id, icon: 'img/icon-192.png', badge: 'img/icon-192.png', data, renotify: true };
    try {
      const reg = root.navigator && navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) {
        opts.actions = [{ action: 'snooze', title: T().snooze }, { action: 'done', title: T().done }];
        await reg.showNotification(r.title, opts);
        return;
      }
    } catch (e) {}
    try {
      const n = new Notification(r.title, opts);
      n.onclick = () => { try { root.focus(); } catch (e) {} ZC.platform._open(data); n.close(); };
    } catch (e) {}
  }

  // ---------- posponer / hecho ----------
  async function snooze(r, minutes) {
    minutes = minutes || 10;
    const at = Date.now() + minutes * 60000;
    const s = (ZC.store.local('reminders.snoozed') || []).filter(x => x.at > Date.now());
    s.push(Object.assign({}, r, { id: r.id.split('~')[0] + '~' + at, at }));
    ZC.store.local('reminders.snoozed', s.slice(-50));
    deliver();
  }

  async function done(r) {
    const ev = ZC.store.get(r.eventId);
    if (ev && ev.kind === 'task') {
      const isDone = ev.rrule ? (ev.doneDates || []).includes(r.date) : ev.done;
      if (!isDone) await ZC.store.toggleDone(ev.id, ev.rrule ? r.date : undefined);
    } else {
      const d = new Set(ZC.store.local('reminders.dismissed') || []);
      d.add(r.id);
      ZC.store.local('reminders.dismissed', [...d].slice(-300));
      deliver();
    }
  }

  // acción que llega de una notificación nativa o del service worker
  async function _action(a) {
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { return; } }
    if (!a) return;
    const r = a.reminder || { id: a.id || (a.eventId + '@' + a.date), eventId: a.eventId, date: a.date, title: a.title || '', body: a.body || '' };
    if (a.type === 'done') await done(r);
    else if (a.type === 'snooze') await snooze(r, a.minutes || 10);
  }

  // ---------- arranque ----------
  function init() {
    if (started) return;
    started = true;
    ZC.store.on('change', e => { if (e.type !== 'blobs') deliverSoon(); });
    // acciones pendientes de las notificaciones de Android (p. ej. «Hecho» con la app cerrada)
    const takePending = () => {
      try {
        const A = root.ZCAndroid;
        const raw = A && A.takeActions ? A.takeActions() : '';
        const arr = raw ? JSON.parse(raw) : [];
        for (const a of arr) _action(a);
      } catch (e) {}
    };
    takePending();
    try { if (root.zcDesktop && root.zcDesktop.onAction) root.zcDesktop.onAction(a => _action(a)); } catch (e) {}
    if (root.document) {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { takePending(); deliverSoon(); } });
    }
    // (Android avisa con estos eventos: «Hecho» con la app abierta, y al volver a la app)
    if (root.addEventListener) {
      root.addEventListener('zc-actions', takePending);
      root.addEventListener('zc-resume', () => { takePending(); deliverSoon(); });
    }
    // a medianoche y cada 30 min: los widgets y la lista cambian de día
    const tick = () => {
      const now = new Date();
      const mid = U().addDays(U().startOfDay(now), 1).getTime() - now.getTime() + 5000;
      setTimeout(() => { deliver(); tick(); }, Math.min(mid, 30 * 60000));
    };
    tick();
    deliver();
  }

  ZC.reminders = {
    snoozeOptions, init, compute, snooze, done, refreshWidgets, widgetData, deliver: deliverSoon,
    // próximos avisos para enseñarlos (pantalla de Notificaciones): [{ at, ev, id, title, … }]
    next: n => compute().slice(0, n || 5).map(r => Object.assign({}, r, { ev: (r.eventId && ZC.store.get(r.eventId)) || null })),
    get list() { return list; },
    _action,
  };
})(typeof window !== 'undefined' ? window : globalThis);
