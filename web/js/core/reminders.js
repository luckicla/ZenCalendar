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
// Alarma = lo mismo con alarm: true (y minutes: 0): suena como un despertador a la hora de
// inicio del evento (todo el día: a ev.alarmTime o a las 09:00). id = '<key>#alarm'.
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
      es: { now: 'Ahora', inM: 'En %n min', inH: 'En %n h', today: 'Hoy', tomorrow: 'Mañana', allDay: 'Todo el día', task: 'Tarea', empty: 'Nada a la vista ✿', snooze: 'Posponer 10 min', done: 'Hecho', stop: 'Parar', alarm: 'Alarma', alarmChannel: 'Alarmas', wTitle: '¿Qué enseña este widget?', wAll: 'Todo: mi calendario y los workspaces', wPersonal: 'Solo mi calendario', wCurrent: 'Lo que tenga abierto en la app', wCurrentSub: 'Cambia solo cuando cambias de workspace', wPick: 'Escoger cuáles', wMine: 'Mi calendario', wNoWs: 'Aún no tienes workspaces: créalos en la app o únete con un enlace y saldrán aquí.', wSave: 'Guardar', wCancel: 'Cancelar', wNext: 'Lo siguiente', wNone: 'Nada pendiente' },
      ca: { now: 'Ara', inM: "D'aquí %n min", inH: "D'aquí %n h", today: 'Avui', tomorrow: 'Demà', allDay: 'Tot el dia', task: 'Tasca', empty: 'Res a la vista ✿', snooze: 'Posposa 10 min', done: 'Fet', stop: 'Atura', alarm: 'Alarma', alarmChannel: 'Alarmes', wTitle: 'Què mostra aquest widget?', wAll: 'Tot: el meu calendari i els workspaces', wPersonal: 'Només el meu calendari', wCurrent: 'El que tingui obert a l\'app', wCurrentSub: 'Canvia quan canvies de workspace', wPick: 'Triar-ne', wMine: 'El meu calendari', wNoWs: 'Encara no tens workspaces: crea\'n a l\'app o uneix-t\'hi amb un enllaç i sortiran aquí.', wSave: 'Desa', wCancel: 'Cancel·la', wNext: 'El següent', wNone: 'Res pendent' },
      en: { now: 'Now', inM: 'In %n min', inH: 'In %n h', today: 'Today', tomorrow: 'Tomorrow', allDay: 'All day', task: 'Task', empty: 'Nothing coming up ✿', snooze: 'Snooze 10 min', done: 'Done', stop: 'Stop', alarm: 'Alarm', alarmChannel: 'Alarms', wTitle: 'What does this widget show?', wAll: 'Everything: my calendar and workspaces', wPersonal: 'Only my calendar', wCurrent: 'Whatever is open in the app', wCurrentSub: 'Follows you when you switch workspace', wPick: 'Choose which', wMine: 'My calendar', wNoWs: 'No workspaces yet: create one in the app or join with a link and they will show up here.', wSave: 'Save', wCancel: 'Cancel', wNext: 'Up next', wNone: 'Nothing pending' },
    }[lang] || null;
  };
  // textos en el idioma de la app (español si no se sabe)
  const T = () => L() || { now: 'Ahora', inM: 'En %n min', inH: 'En %n h', today: 'Hoy', tomorrow: 'Mañana', allDay: 'Todo el día', task: 'Tarea', empty: 'Nada a la vista ✿', snooze: 'Posponer 10 min', done: 'Hecho', stop: 'Parar', alarm: 'Alarma', alarmChannel: 'Alarmas' };

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
    // (lo tuyo y lo de todos tus workspaces, estés donde estés)
    try { occ = ZC.store.occurrences(from, to, { includeHidden: true, includeTasks: true, scope: 'all' }); } catch (e) { return []; }
    const dismissed = new Set(ZC.store.local('reminders.dismissed') || []);
    for (const o of occ) {
      if (o.isTask && o.done) continue;
      const rem = o.ev.reminders || [];
      const title = (o.ev.emoji ? o.ev.emoji + ' ' : '') + (o.ev.title || (o.isTask ? T().task : 'ZenCalendar'));
      // la alarma (aparte de los avisos)
      let alarmAt = null;
      if (o.ev.alarm) {
        const hm = /^(\d{2}):(\d{2})$/.exec(o.ev.alarmTime || '') || [0, 9, 0];
        const base = o.allDay ? new Date(o.start.getFullYear(), o.start.getMonth(), o.start.getDate(), +hm[1], +hm[2]) : o.start;
        const id = o.key + '#alarm';
        if (base.getTime() >= now - 60000 && !dismissed.has(id)) {
          alarmAt = base.getTime();
          out.push({ id, eventId: o.id, date: o.date, at: alarmAt, minutes: 0, task: o.isTask, alarm: true, title, body: body(o), color: o.color });
        }
      }
      for (const m of rem) {
        const base = o.allDay ? new Date(o.start.getFullYear(), o.start.getMonth(), o.start.getDate(), 9, 0) : o.start;
        const at = base.getTime() - m * 60000;
        if (at < now - 60000) continue;
        if (at === alarmAt) continue; // (a la misma hora ya suena la alarma)
        const id = o.key + '#' + m;
        if (dismissed.has(id)) continue;
        out.push({
          id, eventId: o.id, date: o.date, at, minutes: m, task: o.isTask,
          title, body: body(o), color: o.color,
        });
      }
    }
    // los pospuestos
    const snoozed = (ZC.store.local('reminders.snoozed') || []).filter(s => s.at > now - 60000);
    for (const s of snoozed) out.push(s);
    out.sort((a, b) => a.at - b.at);
    if (out.length <= MAX) return out;
    // (si hay demasiados, las alarmas de dentro del horizonte no se quedan fuera)
    const keep = out.slice(0, MAX);
    const extra = out.slice(MAX).filter(r => r.alarm).slice(0, 20);
    return keep.concat(extra);
  }

  // ---------- datos para los widgets de Android ----------
  function widgetData() {
    const u = U();
    const now = new Date();
    const from = u.startOfDay(now);
    const to = u.addDays(from, 15);
    // (todo: lo tuyo y los workspaces; cada widget de Android escoge qué enseña con «ws»: '' = mi calendario, si no el id)
    let occ = [];
    try { occ = ZC.store.occurrences(from, to, { includeHidden: false, includeTasks: true, scope: 'all' }); } catch (e) {}
    const wsOf = o => { const c = o.ev && o.ev.calendarId; return typeof c === 'string' && c.slice(0, 3) === 'ws:' ? c.slice(3) : ''; };
    const items = [], perWs = {};
    for (const o of occ) {
      if (!o.allDay && o.endEx < now && !o.isTask) continue; // lo que ya acabó hoy
      if (o.isTask && o.done) continue;
      // los de varios días salen en el primer día que se ve
      const day = o.start < from ? u.ymd(from) : o.date;
      items.push({
        id: o.id, date: day, title: (o.ev.emoji ? o.ev.emoji + ' ' : '') + (o.ev.title || '·'),
        time: o.allDay ? '' : fmtTime(o.start < from ? from : o.start), end: o.allDay ? '' : fmtTime(o.end),
        allDay: o.allDay, color: o.color, task: o.isTask, location: o.ev.location || '', ws: wsOf(o),
      });
      // (hasta 80 por calendario/workspace, para que un workspace muy lleno no deje a los demás sin sitio)
      const k = wsOf(o);
      perWs[k] = (perWs[k] || 0) + 1;
      if (perWs[k] > 80) items.pop();
      if (items.length >= 300) break;
    }
    items.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1));
    let theme = null;
    try { theme = ZC.store.local('theme'); } catch (e) {}
    let firstDay = 1;
    try { firstDay = ZC.store.getPrefs().cal.firstDay; } catch (e) {}
    // (en el diseño Dot, sin la florecita del «Nada a la vista ✿»)
    const strings = Object.assign({}, T());
    if (theme && theme.design === 'dot' && strings.empty) strings.empty = strings.empty.replace(/\s*✿\s*$/, '');
    // los workspaces (para el selector de cada widget) y en cuál está la app ahora
    let workspaces = [], current = '';
    try {
      workspaces = ZC.store.calendars('all').filter(c => typeof c.id === 'string' && c.id.slice(0, 3) === 'ws:')
        .map(c => ({ id: c.id.slice(3), name: c.name || '', color: c.color || '' }));
      current = ZC.store.inWorkspace() || '';
    } catch (e) {}
    // el widget «Mes»: qué días tienen algo (de la primera semana del mes a 6 semanas vista), con sus colores
    const marks = {};
    try {
      const mFrom = u.addDays(new Date(now.getFullYear(), now.getMonth(), 1), -7);
      const mTo = u.addDays(mFrom, 56);
      for (const o of ZC.store.occurrences(mFrom, mTo, { includeHidden: false, includeTasks: true, scope: 'all' })) {
        if (o.isTask && o.done) continue;
        const list = marks[o.date] || (marks[o.date] = []);
        const ws = wsOf(o);
        if (list.length < 12 && !list.some(m => m[0] === o.color && m[1] === ws)) list.push([o.color, ws]);
      }
    } catch (e) {}
    return { generated: Date.now(), today: u.ymd(from), items, theme, strings, firstDay, workspaces, current, marks };
  }

  // ---------- entregar a la plataforma ----------
  function deliver() {
    if (ZC.platform && ZC.platform.isWidget) return; // el widget de escritorio no programa nada
    list = compute();
    const A = root.ZCAndroid, D = root.zcDesktop;
    try {
      if (A && A.setReminders) A.setReminders(JSON.stringify({ items: list, strings: T() }));
      else if (D && D.setReminders) D.setReminders(list, T());
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
    if (r.alarm) {
      // alarma: no se va sola y vibra largo (el sonido lo pone el sistema)
      opts.requireInteraction = true;
      opts.vibrate = [800, 400, 800, 400, 800, 400, 800];
      opts.silent = false;
      opts.body = '⏰ ' + (r.body || T().alarm);
    }
    try {
      const reg = root.navigator && navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) {
        opts.actions = [{ action: 'snooze', title: T().snooze }, r.alarm ? { action: 'stop', title: T().stop } : { action: 'done', title: T().done }];
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
  // (at: la hora exacta que ya decidió la plataforma, p. ej. Android al posponer con la app cerrada;
  //  así el id coincide con el que ya tiene programado y no suena dos veces)
  async function snooze(r, minutes, atFixed) {
    minutes = minutes || 10;
    if (atFixed && atFixed < Date.now() - 60000) return; // (ya sonó en la plataforma mientras la app estaba cerrada)
    const at = atFixed ? +atFixed : Date.now() + minutes * 60000;
    const base = String(r.id).split('~')[0];
    const s = (ZC.store.local('reminders.snoozed') || []).filter(x => x.at > Date.now() && String(x.id).split('~')[0] !== base);
    s.push(Object.assign({}, r, { id: base + '~' + at, at }));
    ZC.store.local('reminders.snoozed', s.slice(-50));
    deliver();
  }

  // «Parar» una alarma: no vuelve a sonar (ni aunque la página reprograme en el mismo minuto)
  function dismiss(r) {
    const d = new Set(ZC.store.local('reminders.dismissed') || []);
    d.add(String(r.id || '').split('~')[0]);
    ZC.store.local('reminders.dismissed', [...d].slice(-300));
    const s = (ZC.store.local('reminders.snoozed') || []).filter(x => String(x.id).split('~')[0] !== String(r.id || '').split('~')[0]);
    ZC.store.local('reminders.snoozed', s);
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
    if (a.type === 'stop') dismiss(r);
    else if (a.type === 'done') await done(r);
    else if (a.type === 'snooze') await snooze(r, a.minutes || 10, a.at);
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
