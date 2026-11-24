'use strict';
// ZenCalendar: donde se guarda todo (eventos, calendarios, ajustes e imágenes).
//
//  - IndexedDB 'zencalendar' con una caché en memoria: después de init() todo
//    lo que se lee (events, calendars, occurrences…) responde al momento.
//  - Lo borrado no desaparece: se queda una «lápida» ({ id, deleted: true,
//    updated }) para que la sincronización con Drive sepa que se borró.
//  - Las ventanas de la misma app (la principal y el widget de escritorio) se
//    avisan entre ellas con BroadcastChannel('zencalendar').
//  - Las imágenes van aparte (blobmeta + blobdata) y no se cargan en memoria
//    hasta que se piden.
//  - local(key) es lo que solo vive en este dispositivo (localStorage 'zc.').
//
// Si el navegador no deja usar IndexedDB (algún modo privado), funciona igual
// en memoria y lo dice en la consola.
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const U = () => ZC.util;

  const DB_NAME = 'zencalendar';
  const DB_VER = 1;
  const STORES = ['events', 'calendars', 'kv', 'blobmeta', 'blobdata'];
  const TOMB_DAYS = 365; // las lápidas de más de un año se olvidan
  const instance = Math.random().toString(36).slice(2);

  // ---------- valores por defecto ----------
  function defaultCalendars() {
    let lang = 'es';
    try { lang = String((root.navigator && root.navigator.language) || 'es').slice(0, 2); } catch (e) {}
    const N = {
      es: ['Personal', 'Trabajo', 'Cumpleaños'],
      ca: ['Personal', 'Feina', 'Aniversaris'],
      en: ['Personal', 'Work', 'Birthdays'],
    }[lang] || ['Personal', 'Trabajo', 'Cumpleaños'];
    // updated: 1 → cualquier cambio del usuario (en cualquier dispositivo) gana
    return [
      { id: 'personal', name: N[0], color: '#C9B8FF', visible: true, order: 0, updated: 1, deleted: false },
      { id: 'work', name: N[1], color: '#A9D8FF', visible: true, order: 1, updated: 1, deleted: false },
      { id: 'birthdays', name: N[2], color: '#FFC8E3', visible: true, order: 2, updated: 1, deleted: false },
    ];
  }

  const DEFAULT_PREFS = {
    look: {},
    cal: { firstDay: 1, weekNumbers: false, timeFormat: '24', defaultView: 'month', defaultDuration: 60, defaultReminders: [10], holidays: 'ES', lang: 'auto' },
    ai: { provider: 'rules', model: '', baseUrl: '', autoApply: false },
  };

  // ---------- estado en memoria ----------
  const evMap = new Map();     // todos, también las lápidas
  const calMap = new Map();
  const blobMeta = new Map();  // id → { id, name, type, size, w, h, created, updated, deleted }
  let prefsRaw = {};           // { look, cal, ai, …, _updated, _stamps: { sección: ms } }
  let evList = null, calList = null; // listas ya filtradas/ordenadas (se rehacen al cambiar)
  const urlCache = new Map();  // id de imagen → objectURL
  const bus = () => (ZC.util ? (bus.e = bus.e || ZC.util.emitter()) : null);
  let db = null, initP = null, bc = null;

  // ---------- IndexedDB (o memoria) ----------
  function memoryDB() {
    const t = {};
    STORES.forEach(s => { t[s] = new Map(); });
    const c = o => o == null ? o : (o.data && typeof o.data.byteLength === 'number' ? Object.assign({}, o) : JSON.parse(JSON.stringify(o)));
    return {
      persistent: false,
      async getAll(s) { return [...t[s].values()].map(c); },
      async get(s, id) { return c(t[s].get(id)); },
      async put(s, objs) { for (const o of [].concat(objs)) t[s].set(o.id, c(o)); },
      async del(s, ids) { for (const id of [].concat(ids)) t[s].delete(id); },
      async clear(s) { t[s].clear(); },
    };
  }

  function openIDB() {
    return new Promise((ok, ko) => {
      let r;
      try { r = root.indexedDB.open(DB_NAME, DB_VER); } catch (e) { ko(e); return; }
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      };
      r.onsuccess = () => {
        const d = r.result;
        // otra pestaña con una versión más nueva: se cierra esta conexión
        d.onversionchange = () => { try { d.close(); } catch (e) {} };
        ok(d);
      };
      r.onerror = () => ko(r.error);
      r.onblocked = () => ko(new Error('IndexedDB bloqueada'));
    });
  }

  function idbBackend(d) {
    const run = (s, mode, fn) => new Promise((ok, ko) => {
      let t;
      try { t = d.transaction(s, mode); } catch (e) { ko(e); return; }
      const st = t.objectStore(s);
      let res;
      const rq = fn(st);
      if (rq) rq.onsuccess = () => { res = rq.result; };
      t.oncomplete = () => ok(res);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error || new Error('transacción cancelada'));
    });
    return {
      persistent: true,
      getAll: s => run(s, 'readonly', st => st.getAll()).then(r => r || []),
      get: (s, id) => run(s, 'readonly', st => st.get(id)),
      put: (s, objs) => run(s, 'readwrite', st => { for (const o of [].concat(objs)) st.put(o); }),
      del: (s, ids) => run(s, 'readwrite', st => { for (const id of [].concat(ids)) st.delete(id); }),
      clear: s => run(s, 'readwrite', st => { st.clear(); }),
    };
  }

  // ---------- avisos de cambios ----------
  function changed(type, source) {
    if (type === 'events') { evList = null; wsView = null; }
    if (type === 'calendars') { calList = null; evList = null; wsView = null; }
    if (source !== 'window' && bc) {
      try { bc.postMessage({ type, from: instance }); } catch (e) {}
    }
    const b = bus();
    if (b) b.emit('change', { type, source: source || 'local' });
  }

  async function reloadTable(type) {
    if (!db) return;
    if (type === 'events') { evMap.clear(); for (const e of await db.getAll('events')) evMap.set(e.id, e); }
    else if (type === 'calendars') { calMap.clear(); for (const c of await db.getAll('calendars')) calMap.set(c.id, c); }
    else if (type === 'prefs') { const r = await db.get('kv', 'prefs'); prefsRaw = (r && r.value) || {}; }
    else if (type === 'blobs') {
      blobMeta.clear();
      for (const m of await db.getAll('blobmeta')) blobMeta.set(m.id, m);
      for (const [id, url] of urlCache) if (!blobMeta.has(id) || blobMeta.get(id).deleted) { try { URL.revokeObjectURL(url); } catch (e) {} urlCache.delete(id); }
    }
  }

  // ---------- arranque ----------
  function init() {
    if (initP) return initP;
    initP = (async () => {
      try {
        if (!root.indexedDB) throw new Error('sin IndexedDB');
        db = idbBackend(await openIDB());
      } catch (e) {
        console.warn('[ZC] No se puede usar IndexedDB (' + (e && e.message) + '): los datos se quedan en memoria hasta cerrar.');
        db = memoryDB();
      }
      const [evs, cals, kv, bm] = await Promise.all([db.getAll('events'), db.getAll('calendars'), db.get('kv', 'prefs'), db.getAll('blobmeta')]);
      for (const e of evs) evMap.set(e.id, e);
      for (const c of cals) calMap.set(c.id, c);
      for (const m of bm) blobMeta.set(m.id, m);
      prefsRaw = (kv && kv.value) || {};
      if (!calMap.size) {
        const defs = defaultCalendars();
        for (const c of defs) calMap.set(c.id, c);
        await db.put('calendars', defs);
      }
      // que el navegador no borre los datos para hacer sitio
      try { if (root.navigator && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
      try {
        if (root.BroadcastChannel) {
          bc = new BroadcastChannel('zencalendar');
          bc.onmessage = async ev => {
            const m = ev.data || {};
            if (!m.type || m.from === instance) return;
            try { await reloadTable(m.type); } catch (e) { console.warn('[ZC] no se pudo releer', m.type, e); }
            changed(m.type, 'window');
          };
        }
      } catch (e) {}
    })();
    return initP;
  }

  // ---------- normalizar ----------
  function prefsSection(k) {
    const v = prefsRaw[k];
    if (DEFAULT_PREFS[k] && k !== 'look') return Object.assign({}, DEFAULT_PREFS[k], v || {});
    return v || (DEFAULT_PREFS[k] ? {} : undefined);
  }

  const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const T_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  const D_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ALARM_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

  function fixDate(s, allDay) {
    const u = U();
    const d = u.parse(s);
    if (!d) return null;
    if (allDay) return u.ymd(d);
    // 'YYYY-MM-DD' sin hora para un evento con hora → a las 9:00
    if (typeof s === 'string' && D_RE.test(s.trim())) d.setHours(9, 0, 0, 0);
    return u.toLocal(d, false);
  }

  function normEvent(p, prev) {
    const u = U();
    const now = Date.now();
    const cal = prefsSection('cal');
    const base = prev || {
      id: u.uid(), kind: 'event', title: '', notes: '', location: '', calendarId: 'personal', color: null, emoji: null,
      allDay: false, start: null, end: null, rrule: null, exdates: [], recurrenceOf: null,
      reminders: (cal.defaultReminders || []).slice(), attachments: [], checklist: [], done: false, doneAt: null,
      alarm: false, alarmTime: null,
      created: now, updated: 0, deleted: false,
    };
    const e = Object.assign({}, base, p);
    // algo nuevo nunca hereda la «ficha» de Google de otro (al duplicar, al copiar una aparición…)
    if (!e.calendarId) e.calendarId = 'personal';
    if (!prev) {
      for (const k of G_FIELDS) delete e[k];
      if (isGoogleId(e.calendarId)) {
        const g = googleNew(e.calendarId);
        if (p && p.id) delete g.id; // (si viene con id, se respeta)
        Object.assign(e, g);
      }
    }
    e.id = String(e.id || u.uid());
    e.kind = e.kind === 'task' ? 'task' : 'event';
    e.title = String(e.title == null ? '' : e.title);
    e.notes = String(e.notes == null ? '' : e.notes);
    e.location = String(e.location == null ? '' : e.location);
    if (!e.calendarId) e.calendarId = 'personal';
    // solo colores #rgb/#rrggbb (el color acaba en el CSS: nada de texto raro que venga de una copia o de la IA)
    e.color = COLOR_RE.test(String(e.color || '').trim()) ? String(e.color).trim() : null;
    e.allDay = !!e.allDay;
    let s = fixDate(e.start, e.allDay);
    if (!s) { // sin fecha: la próxima hora en punto
      const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
      s = u.toLocal(d, e.allDay);
    }
    e.start = s;
    let en = fixDate(e.end, e.allDay);
    if (e.kind === 'task') en = s;
    else if (!en || en < s) {
      en = e.allDay ? s : u.toLocal(u.addMinutes(u.parse(s), +cal.defaultDuration || 60), false);
    }
    e.end = en;
    e.rrule = ZC.recur ? ZC.recur.normRule(e.rrule) : (e.rrule || null);
    e.exdates = [...new Set((e.exdates || []).map(x => String(x).slice(0, 10)).filter(x => D_RE.test(x)))].sort();
    e.reminders = [...new Set((e.reminders || []).map(Number).filter(n => isFinite(n) && n >= 0))].sort((a, b) => a - b);
    // alarma (suena como un despertador a la hora de inicio; todo el día: a alarmTime o a las 09:00)
    e.alarm = e.alarm === true || e.alarm === 'true';
    e.alarmTime = ALARM_TIME_RE.test(String(e.alarmTime || '')) ? String(e.alarmTime) : null;
    e.attachments = Array.isArray(e.attachments) ? e.attachments : [];
    e.checklist = Array.isArray(e.checklist) ? e.checklist : [];
    e.done = !!e.done;
    if (e.done && !e.doneAt) e.doneAt = now;
    if (!e.done) e.doneAt = null;
    e.created = e.created || now;
    e.updated = Math.max(now, ((prev && prev.updated) || 0) + 1);
    e.deleted = !!e.deleted;
    return e;
  }

  // lápida. Las de Google (id 'g:…') guardan lo justo para poder borrarlo también en Google Calendar
  const tomb = (x, now) => {
    const t = { id: x.id, deleted: true, updated: Math.max(now || Date.now(), (x.updated || 0) + 1) };
    if (isGoogleId(x.id)) for (const k of ['calendarId', 'source', 'accountId', 'gid', 'gEventId', 'etag', 'gSynced']) if (x[k] != null) t[k] = x[k];
    // (las de un workspace se quedan con su calendario: así se sabe adónde va la lápida)
    if (isWsId(x.calendarId)) t.calendarId = x.calendarId;
    return t;
  };

  // ---------- Google Calendar (lo usa ZC.gcal) ----------
  // Lo de Google lleva id 'g:…' (eventos y calendarios) y NO viaja por Drive: cada
  // dispositivo lo baja de Google. Estos campos son la «ficha» de Google de un evento.
  const G_FIELDS = ['source', 'accountId', 'gid', 'gEventId', 'etag', 'gUpdated', 'htmlLink', 'gBase', 'gSynced', 'gSeries', 'gInstEx', 'gError', 'readOnly'];
  const isGoogleId = id => typeof id === 'string' && id.slice(0, 2) === 'g:';
  function stripGoogle(o) {
    for (const k of G_FIELDS) delete o[k];
    if (isGoogleId(o.id)) delete o.id;
    return o;
  }
  // id y ficha para algo nuevo en un calendario de Google ('g:<cuenta>:<calendario>:z<uuid>')
  function googleNew(calendarId) {
    const c = calMap.get(calendarId);
    if (!c || c.deleted || !c.accountId) return {};
    return {
      id: 'g:' + c.accountId + ':' + (c.gkey || 'c') + ':z' + U().uid().replace(/[^0-9a-z]/gi, '').toLowerCase(),
      source: 'google', accountId: c.accountId, gid: c.gid,
    };
  }
  // ¿va a Drive? (lo de Google no; tampoco un evento suelto en un calendario de Google)
  const forDrive = x => !!x && !isGoogleId(x.id) && !isGoogleId(x.calendarId) && !isWsId(x.calendarId) && !isWsId(x.id);

  // ---------- workspaces (lo usa ZC.ws) ----------
  // Lo de un workspace vive en Firestore, no aquí: ZC.ws lo pone en esta capa «virtual»
  // (en memoria) y cada workspace es un calendario 'ws:<wid>'. No va a IndexedDB ni a Drive.
  // En modo workspace (cur) las vistas solo ven ese calendario; con dim, también lo tuyo (atenuado).
  // Lo que se guarda en un calendario 'ws:…' se manda a ZC.ws._write (Firestore).
  const isWsId = id => typeof id === 'string' && id.slice(0, 3) === 'ws:';
  const wsV = { cur: null, dim: false, cals: new Map(), items: new Map() };
  let wsView = null; // caché de events() en modo workspace
  /** ZC.ws: { cur: wid|null, dim, calendars: [cal] (todos), items: [ev] (altas/cambios; deleted = fuera), purge: [ids], clear: wid } */
  function wsSet(w) {
    w = w || {};
    let ev = false, cal = false;
    if ('cur' in w && w.cur !== wsV.cur) { wsV.cur = w.cur || null; ev = cal = true; }
    if ('dim' in w && !!w.dim !== wsV.dim) { wsV.dim = !!w.dim; ev = cal = true; }
    if (w.calendars) {
      wsV.cals.clear();
      for (const c of w.calendars) wsV.cals.set(c.id, Object.assign({ visible: true, order: -1, source: 'ws', deleted: false }, c));
      cal = true;
    }
    if (w.reset) { wsV.items.clear(); ev = true; }
    if (w.clear) { for (const [id, e] of wsV.items) if (e.calendarId === 'ws:' + w.clear) wsV.items.delete(id); ev = true; }
    for (const e of (w.items || [])) { if (e.deleted) wsV.items.delete(e.id); else wsV.items.set(e.id, e); ev = true; }
    for (const id of (w.purge || [])) { if (wsV.items.delete(id)) ev = true; }
    if (cal) changed('calendars', 'sync');
    if (ev || cal) changed('events', 'sync');
  }
  const wsCurId = () => (wsV.cur ? 'ws:' + wsV.cur : null);
  async function wsPut(list, source) {
    for (const e of list) { if (e.deleted) wsV.items.delete(e.id); else wsV.items.set(e.id, e); }
    changed('events', source);
    if (ZC.ws && ZC.ws._write) {
      try { await ZC.ws._write(list); }
      catch (e) { console.warn('[ZC] workspace: no se pudo guardar', e); }
    }
  }

  /** ZC.gcal escribe aquí lo que baja de Google: { events, calendars, purgeEvents, purgeCalendars } (ids) */
  async function gwrite(w) {
    w = w || {};
    const evs = w.events || [], cals = w.calendars || [], pe = w.purgeEvents || [], pc = w.purgeCalendars || [];
    if (cals.length) { for (const c of cals) calMap.set(c.id, c); await db.put('calendars', cals); }
    if (pc.length) { for (const id of pc) calMap.delete(id); await db.del('calendars', pc); }
    if (evs.length) { for (const e of evs) evMap.set(e.id, e); await db.put('events', evs); }
    if (pe.length) { for (const id of pe) evMap.delete(id); await db.del('events', pe); }
    if (cals.length || pc.length) changed('calendars', 'sync');
    if (evs.length || pe.length || cals.length || pc.length) changed('events', 'sync');
  }
  // todo, también las lápidas (para ZC.gcal)
  const rawEvents = () => [...evMap.values()];
  const rawEvent = id => evMap.get(id) || null;

  async function putEvents(list, source) {
    const ws = list.filter(e => isWsId(e.calendarId));
    if (ws.length) {
      list = list.filter(e => !isWsId(e.calendarId));
      // (lo de Firestore no se espera: sin conexión se queda pendiente y se manda solo)
      const p = wsPut(ws, source);
      if (!list.length) { p.catch(() => {}); return; }
    }
    for (const e of list) evMap.set(e.id, e);
    await db.put('events', list);
    changed('events', source);
  }

  // ---------- eventos ----------
  // scope: 'view' (lo que se ve ahora: en un workspace, el workspace), 'personal' (lo tuyo) o 'all' (lo tuyo y todos los workspaces)
  function events(scope) {
    if (!evList) evList = [...evMap.values()].filter(e => !e.deleted);
    if (scope === 'personal') return evList;
    if (scope === 'all') return wsV.items.size ? evList.concat([...wsV.items.values()]) : evList;
    if (!wsV.cur) return evList;
    if (!wsView) {
      const id = wsCurId();
      const mine = [...wsV.items.values()].filter(e => e.calendarId === id);
      wsView = wsV.dim ? mine.concat(evList) : mine;
    }
    return wsView;
  }
  const get = id => { const w = wsV.items.get(id); if (w) return w; const e = evMap.get(id); return e && !e.deleted ? e : null; };
  const rawAny = id => wsV.items.get(id) || evMap.get(id) || null;

  async function saveEvent(partial) {
    if (!partial) throw new Error('saveEvent: falta el evento');
    const old = partial.id ? rawAny(partial.id) : null;
    // guardar algo que estaba borrado (una lápida) lo vuelve a crear desde cero
    const prev = old && !old.deleted ? old : null;
    // de lo tuyo a un workspace (o al revés): se rehace con otro id y lo de antes queda como lápida
    if (prev && 'calendarId' in partial && partial.calendarId && isWsId(partial.calendarId) !== isWsId(prev.calendarId)) {
      const copy = stripGoogle(Object.assign({}, prev, partial, { id: undefined, created: undefined, updated: 0 }));
      for (const k of ['createdBy', 'updatedBy', 'assignee', 'wsUpdated']) if (!isWsId(copy.calendarId)) delete copy[k];
      if (isWsId(copy.calendarId)) copy.attachments = [];
      const moved = normEvent(copy, null);
      await putEvents([tomb(prev)]);
      await putEvents([moved]);
      return moved;
    }
    const e = normEvent(partial, prev);
    if (old) e.updated = Math.max(e.updated, (old.updated || 0) + 1);
    await putEvents([e]);
    return e;
  }

  async function deleteEvent(id, opts) {
    opts = opts || {};
    const u = U();
    const ev = rawAny(id);
    if (!ev || ev.deleted) return;
    const now = Date.now();
    const mode = ev.rrule ? (opts.mode || 'all') : 'all';
    const date = opts.date ? u.ymd(u.parse(opts.date)) : null;
    const out = [];
    const detached = () => [...evMap.values(), ...wsV.items.values()].filter(x => !x.deleted && x.recurrenceOf === id);
    if (mode === 'one' && date) {
      out.push(Object.assign({}, ev, { exdates: [...new Set([...(ev.exdates || []), date])].sort(), updated: Math.max(now, ev.updated + 1) }));
    } else if (mode === 'future' && date) {
      const first = u.ymd(u.parse(ev.start));
      if (date <= first) {
        out.push(tomb(ev, now));
        for (const x of detached()) out.push(tomb(x, now));
      } else {
        const until = u.ymd(u.addDays(u.parse(date), -1));
        const rr = Object.assign({}, ev.rrule, { until, count: null });
        out.push(Object.assign({}, ev, { rrule: rr, updated: Math.max(now, ev.updated + 1) }));
        for (const x of detached()) if ((x.recurrenceDate || u.ymd(u.parse(x.start))) >= date) out.push(tomb(x, now));
      }
    } else {
      out.push(tomb(ev, now));
      if (ev.rrule) for (const x of detached()) out.push(tomb(x, now));
    }
    // imágenes de lo que se borra del todo (si no las usa nadie más)
    const gone = new Set();
    for (const t of out) {
      if (!t.deleted) continue;
      const was = t.id === id ? ev : rawAny(t.id);
      for (const a of ((was && was.attachments) || [])) gone.add(a.id);
    }
    await putEvents(out);
    if (gone.size) {
      for (const e of events('all')) for (const a of (e.attachments || [])) gone.delete(a.id);
      for (const b of gone) await deleteBlob(b).catch(() => {});
    }
  }

  // «solo esta»: copia suelta de una aparición + exdate en la serie
  async function saveEventOccurrence(id, date, changes) {
    const u = U();
    const ev = get(id);
    if (!ev) throw new Error('saveEventOccurrence: no existe ' + id);
    if (!ev.rrule) return saveEvent(Object.assign({}, changes, { id }));
    const day = u.parse(date);
    const dkey = u.ymd(day);
    const s0 = u.parse(ev.start), e0 = u.parse(ev.end);
    let start, end;
    if (ev.allDay) {
      start = dkey;
      end = u.ymd(u.addDays(day, u.daysBetween(s0, e0)));
    } else {
      const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s0.getHours(), s0.getMinutes());
      start = u.toLocal(s, false);
      end = u.toLocal(new Date(s.getTime() + (e0 - s0)), false);
    }
    const copy = Object.assign({}, ev, { start, end }, changes || {}, {
      id: undefined, rrule: null, exdates: [], recurrenceOf: id, recurrenceDate: dkey, created: Date.now(), updated: 0,
      doneDates: undefined,
    });
    stripGoogle(copy);
    if (isGoogleId(copy.calendarId)) Object.assign(copy, googleNew(copy.calendarId));
    if (!copy.id) copy.id = u.uid();
    if (ev.kind === 'task' && !(changes && 'done' in changes)) copy.done = (ev.doneDates || []).includes(dkey);
    const saved = normEvent(copy, null);
    const series = Object.assign({}, ev, { exdates: [...new Set([...(ev.exdates || []), dkey])].sort(), updated: Math.max(Date.now(), ev.updated + 1) });
    await putEvents([saved, series]);
    return saved;
  }

  // tareas: marcar/desmarcar. En una tarea que se repite, con `date` se marca solo ese día.
  async function toggleDone(id, date) {
    const u = U();
    const ev = get(id);
    if (!ev) return null;
    if (ev.rrule && date) {
      const d = u.ymd(u.parse(date));
      const set = new Set(ev.doneDates || []);
      if (set.has(d)) set.delete(d); else set.add(d);
      return saveEvent({ id, doneDates: [...set].sort() });
    }
    return saveEvent({ id, done: !ev.done, doneAt: ev.done ? null : Date.now() });
  }

  // ---------- calendarios ----------
  // scope como en events(): en un workspace, 'view' es ese calendario (y los tuyos detrás, si se ven atenuados)
  function calendars(scope) {
    if (!calList) calList = [...calMap.values()].filter(c => !c.deleted).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(b.name));
    if (scope === 'personal') return calList;
    if (scope === 'all') return wsV.cals.size ? [...wsV.cals.values()].concat(calList) : calList;
    if (!wsV.cur) return calList;
    const w = wsV.cals.get(wsCurId());
    return w ? (wsV.dim ? [w].concat(calList) : [w]) : (wsV.dim ? calList : []);
  }
  const calendar = id => { if (isWsId(id)) return wsV.cals.get(id) || null; const c = calMap.get(id); return c && !c.deleted ? c : null; };
  // el calendario donde va algo nuevo si no se dice otro (en un workspace, el workspace)
  const defaultCalendarId = () => (wsV.cur && wsV.cals.has(wsCurId()) ? wsCurId() : ((calendars('personal').find(c => c.visible !== false && !isGoogleId(c.id)) || calendars('personal')[0] || { id: 'personal' }).id));

  async function saveCalendar(partial) {
    // el calendario de un workspace es el workspace: lo cambia ZC.ws (color/nombre, si eres el dueño)
    if (partial && isWsId(partial.id)) return ZC.ws && ZC.ws._saveCalendar ? ZC.ws._saveCalendar(partial) : calendar(partial.id);
    const u = U();
    const prev = partial.id ? calMap.get(partial.id) : null;
    const now = Date.now();
    const c = Object.assign({ id: u.uid(), name: '', color: '#C9B8FF', visible: true, order: calendars('personal').length, deleted: false }, prev || {}, partial);
    c.name = String(c.name || '');
    if (!COLOR_RE.test(String(c.color || '').trim())) c.color = '#C9B8FF';
    c.visible = c.visible !== false;
    c.deleted = !!partial.deleted;
    c.updated = Math.max(now, ((prev && prev.updated) || 0) + 1);
    calMap.set(c.id, c);
    await db.put('calendars', c);
    changed('calendars');
    return c;
  }

  async function deleteCalendar(id) {
    if (isWsId(id)) return; // (un workspace se borra o se deja desde ZC.ws)
    const c = calMap.get(id);
    if (!c || c.deleted) return;
    if (isGoogleId(id)) {
      // un calendario de Google no se borra desde aquí: se deja de traer (y se quita lo bajado)
      if (ZC.gcal && ZC.gcal.setCalendarEnabled && c.accountId) return ZC.gcal.setCalendarEnabled(c.accountId, c.gid, false);
      const ids = [...evMap.values()].filter(e => e.calendarId === id).map(e => e.id);
      return gwrite({ purgeEvents: ids, purgeCalendars: [id] });
    }
    const now = Date.now();
    const t = tomb(c, now);
    calMap.set(id, t);
    await db.put('calendars', t);
    const evs = [...evMap.values()].filter(e => !e.deleted && e.calendarId === id).map(e => tomb(e, now));
    if (evs.length) await putEvents(evs); else changed('events');
    changed('calendars');
  }

  // ---------- apariciones ----------
  function occurrences(from, to, opts) {
    const u = U();
    opts = opts || {};
    const includeHidden = !!opts.includeHidden;
    const includeTasks = opts.includeTasks !== false;
    from = u.parse(from); to = u.parse(to);
    if (!from || !to || !ZC.recur) return [];
    const out = [];
    const dimOthers = !!(wsV.cur && wsV.dim && (opts.scope || 'view') === 'view');
    for (const ev of events(opts.scope || 'view')) {
      if (!includeTasks && ev.kind === 'task') continue;
      const cal = calendar(ev.calendarId);
      if (!includeHidden && cal && cal.visible === false) continue;
      let list;
      try { list = ZC.recur.expand(ev, from, to); } catch (e) { console.warn('[ZC] evento raro', ev.id, e); continue; }
      for (const inst of list) {
        const day = u.ymd(inst.start);
        const isTask = ev.kind === 'task';
        out.push({
          key: ev.id + '@' + day, id: ev.id, ev, start: inst.start, end: inst.end, allDay: !!ev.allDay,
          color: ev.color || (cal && cal.color) || '#C9B8FF', calendar: cal, isTask,
          done: isTask ? (ev.rrule ? (ev.doneDates || []).includes(day) : !!ev.done) : false,
          // extra: el final «exclusivo» (para todo el día, las 00:00 del día siguiente al último)
          endEx: ev.allDay ? u.addDays(inst.end, 1) : inst.end,
          date: day,
          // (en un workspace con lo tuyo a la vista: lo tuyo sale atenuado)
          dim: dimOthers && !isWsId(ev.calendarId),
        });
      }
    }
    out.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      if (a.start - b.start) return a.start - b.start;
      if (b.endEx - a.endEx) return b.endEx - a.endEx; // los largos primero
      return String(a.ev.title).localeCompare(b.ev.title);
    });
    return out;
  }

  function search(text) {
    const u = U();
    const words = u.fold(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const now = Date.now();
    return events()
      .filter(e => { const h = u.fold(e.title + ' ' + e.notes + ' ' + e.location); return words.every(w => h.includes(w)); })
      .sort((a, b) => Math.abs(u.parse(a.start) - now) - Math.abs(u.parse(b.start) - now));
  }

  // ---------- ajustes ----------
  function getPrefs() {
    const out = {};
    const keys = new Set([...Object.keys(DEFAULT_PREFS), ...Object.keys(prefsRaw).filter(k => k[0] !== '_')]);
    for (const k of keys) out[k] = U().clone(prefsSection(k));
    out._updated = prefsRaw._updated || 0;
    return out;
  }

  async function setPrefs(patch) {
    if (!patch) return getPrefs();
    const now = Date.now();
    const next = Object.assign({}, prefsRaw, { _stamps: Object.assign({}, prefsRaw._stamps) });
    for (const k of Object.keys(patch)) {
      if (k[0] === '_') continue;
      next[k] = U().clone(patch[k]);
      next._stamps[k] = Math.max(now, (next._stamps[k] || 0) + 1);
    }
    next._updated = Math.max(now, (prefsRaw._updated || 0) + 1);
    prefsRaw = next;
    await db.put('kv', { id: 'prefs', value: prefsRaw });
    changed('prefs');
    return getPrefs();
  }

  // ---------- solo este dispositivo ----------
  const memLocal = new Map();
  function local(key, value) {
    const k = 'zc.' + key;
    let ls = null;
    try { ls = root.localStorage || null; } catch (e) {}
    if (arguments.length < 2) {
      const raw = ls ? ls.getItem(k) : memLocal.get(k);
      if (raw == null) return null;
      try { return JSON.parse(raw); } catch (e) { return raw; }
    }
    if (value === null || value === undefined) { if (ls) ls.removeItem(k); else memLocal.delete(k); return null; }
    const s = JSON.stringify(value);
    try { if (ls) ls.setItem(k, s); else memLocal.set(k, s); } catch (e) { memLocal.set(k, s); }
    return value;
  }

  // ---------- imágenes ----------
  async function imageSize(blob) {
    try {
      if (root.createImageBitmap && /^image\//.test(blob.type)) {
        const bmp = await createImageBitmap(blob);
        const r = { w: bmp.width, h: bmp.height };
        if (bmp.close) bmp.close();
        return r;
      }
    } catch (e) {}
    return { w: 0, h: 0 };
  }

  async function putBlob(blob, opts) {
    opts = opts || {};
    const id = opts.id || U().uid();
    const data = await blob.arrayBuffer();
    const { w, h } = opts.w ? { w: opts.w, h: opts.h } : await imageSize(blob);
    const now = Date.now();
    const meta = { id, name: String(opts.name || blob.name || 'imagen'), type: blob.type || opts.type || 'application/octet-stream', size: data.byteLength, w, h, created: now, updated: opts.updated || now, deleted: false };
    await db.put('blobdata', { id, data });
    await db.put('blobmeta', meta);
    blobMeta.set(id, meta);
    changed('blobs', opts.source);
    return id;
  }

  async function getBlob(id) {
    if (!id) return null;
    const meta = blobMeta.get(id);
    if (meta && meta.deleted) return null;
    const rec = await db.get('blobdata', id);
    if (rec && rec.data) return new Blob([rec.data], { type: (meta && meta.type) || 'application/octet-stream' });
    // no está en este dispositivo: se baja de Drive si se puede
    if (ZC.drive && ZC.drive._fetchBlob) {
      try {
        const b = await ZC.drive._fetchBlob(id, meta);
        if (b) {
          await putBlob(b, Object.assign({}, meta || {}, { id, source: 'sync' }));
          return b;
        }
      } catch (e) { console.warn('[ZC] no se pudo bajar la imagen', id, e); }
    }
    return null;
  }

  async function blobURL(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const b = await getBlob(id);
    if (!b) return null;
    const url = URL.createObjectURL(b);
    urlCache.set(id, url);
    return url;
  }

  async function deleteBlob(id, source) {
    const meta = blobMeta.get(id) || { id };
    const t = { id, name: meta.name || '', type: meta.type || '', deleted: true, updated: Math.max(Date.now(), (meta.updated || 0) + 1) };
    blobMeta.set(id, t);
    await db.put('blobmeta', t);
    await db.del('blobdata', id);
    if (urlCache.has(id)) { try { URL.revokeObjectURL(urlCache.get(id)); } catch (e) {} urlCache.delete(id); }
    changed('blobs', source);
  }

  const blobInfo = id => { const m = blobMeta.get(id); return m && !m.deleted ? Object.assign({}, m) : null; };
  async function hasBlobData(id) { const r = await db.get('blobdata', id); return !!(r && r.data); }

  // ---------- copia de seguridad ----------
  function exportJSON() {
    return {
      app: 'ZenCalendar', format: 1, version: (ZC.config && ZC.config.version) || '', exported: Date.now(),
      // (lo de Google Calendar no: está en Google)
      events: U().clone(events('personal').filter(forDrive)), calendars: U().clone(calendars('personal').filter(forDrive)), prefs: getPrefs(),
    };
  }

  async function importJSON(obj, opts) {
    opts = opts || {};
    if (!obj || typeof obj !== 'object') throw new Error('El archivo no es una copia de ZenCalendar');
    const evs = Array.isArray(obj.events) ? obj.events.filter(e => e && e.id && forDrive(e)) : [];
    const cals = Array.isArray(obj.calendars) ? obj.calendars.filter(c => c && c.id && forDrive(c)) : [];
    if (!evs.length && !cals.length && !obj.prefs) throw new Error('El archivo no tiene eventos');
    const now = Date.now();
    if (opts.merge === false) {
      // sustituir: lo de aquí que no viene en la copia se borra (y se borrará en los demás dispositivos)
      const inE = new Set(evs.map(e => e.id)), inC = new Set(cals.map(c => c.id));
      const snap = snapshot({ drive: true });
      for (const e of snap.events) if (!e.deleted && !inE.has(e.id)) evs.push(tomb(e, now));
      for (const c of snap.calendars) if (!c.deleted && !inC.has(c.id)) cals.push(tomb(c, now));
      for (const x of evs.concat(cals)) x.updated = Math.max(now, x.updated || 0);
    }
    const fixed = evs.map(e => {
      if (e.deleted) return e;
      const n = normEvent(Object.assign({}, e), null);
      n.created = e.created || n.created;
      n.updated = opts.merge === false ? Math.max(now, e.updated || 0) : (e.updated || now);
      return n;
    });
    const res = await applyRemote({ events: fixed, calendars: cals, prefs: obj.prefs && opts.merge === false ? Object.assign({}, obj.prefs, { _stamps: { look: now, cal: now, ai: now }, _updated: now }) : null }, 'local');
    return { events: fixed.filter(e => !e.deleted).length, calendars: cals.filter(c => !c.deleted).length, changed: res };
  }

  // ---------- sincronización (lo usa ZC.drive) ----------
  // stableStringify: el mismo objeto da siempre el mismo texto (claves ordenadas)
  function stable(o) {
    if (o === undefined) return 'null';
    if (o === null || typeof o !== 'object') return JSON.stringify(o);
    if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
    return '{' + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  }

  // gana el más nuevo; si empatan, uno fijo (el mismo en todos los dispositivos)
  function winner(a, b) {
    const ua = a.updated || 0, ub = b.updated || 0;
    if (ua !== ub) return ua > ub ? a : b;
    return stable(a) >= stable(b) ? a : b;
  }

  function mergeLists(local, remote, cutoff) {
    local = (local || []).filter(x => x && x.id && !(x.deleted && (x.updated || 0) < cutoff));
    remote = (remote || []).filter(x => x && x.id && !(x.deleted && (x.updated || 0) < cutoff));
    const out = new Map();
    for (const x of local) out.set(x.id, x);
    let localChanged = false, remoteChanged = false;
    const rIds = new Set();
    const changedIds = [];
    for (const y of remote) {
      rIds.add(y.id);
      const x = out.get(y.id);
      if (!x) { out.set(y.id, y); localChanged = true; changedIds.push(y.id); continue; }
      if (stable(x) === stable(y)) continue;
      if (winner(x, y) === y) { out.set(y.id, y); localChanged = true; changedIds.push(y.id); }
      else remoteChanged = true;
    }
    for (const x of local) if (!rIds.has(x.id)) remoteChanged = true;
    return { list: [...out.values()], localChanged, remoteChanged, changedIds };
  }

  // ajustes: cada sección (look, cal, ai…) va por su cuenta, gana la más nueva
  function mergePrefs(a, b) {
    a = a || {}; b = b || {};
    const sa = a._stamps || {}, sb = b._stamps || {};
    const out = { _stamps: {} };
    let localChanged = false, remoteChanged = false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter(k => k[0] !== '_'));
    for (const k of keys) {
      const inA = k in a, inB = k in b;
      const ta = inA ? (sa[k] || 0) : -1, tb = inB ? (sb[k] || 0) : -1;
      const ja = stable(a[k]), jb = stable(b[k]);
      if (inA && inB && ja === jb) {
        out[k] = a[k]; out._stamps[k] = Math.max(ta, tb);
        if (tb > ta) localChanged = true;
        if (ta > tb) remoteChanged = true;
        continue;
      }
      if (k === 'gcal' && inA && inB) {
        // las cuentas de Google Calendar: cada una por su cuenta (si dos dispositivos añaden una a la vez, se quedan las dos)
        const g = mergeGcal(a[k], b[k]);
        out[k] = g; out._stamps[k] = Math.max(ta, tb);
        const jg = stable(g);
        if (jg !== ja || tb > ta) localChanged = true;
        if (jg !== jb || ta > tb) remoteChanged = true;
        continue;
      }
      const takeB = tb > ta || (tb === ta && jb > ja);
      if (takeB) { out[k] = b[k]; out._stamps[k] = tb; localChanged = true; }
      else { out[k] = a[k]; out._stamps[k] = ta; remoteChanged = true; }
    }
    out._updated = Math.max(a._updated || 0, b._updated || 0);
    return { prefs: out, localChanged, remoteChanged };
  }

  function mergeGcal(a, b) {
    const A = (a && a.accounts) || {}, B = (b && b.accounts) || {};
    const accounts = {};
    for (const id of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const x = A[id], y = B[id];
      accounts[id] = !x ? y : !y ? x : winner(x, y);
    }
    return Object.assign({}, a, b, { accounts });
  }

  /**
   * Junta dos copias completas ({ events, calendars, prefs, blobs }) elemento a
   * elemento. Devuelve la copia junta y si cambia respecto a cada lado:
   * localChanged = hay que guardar aquí, remoteChanged = hay que subirla.
   */
  function merge(local, remote, now) {
    local = local || {}; remote = remote || {};
    const cutoff = (now || Date.now()) - TOMB_DAYS * 86400000;
    const e = mergeLists(local.events, remote.events, cutoff);
    const c = mergeLists(local.calendars, remote.calendars, cutoff);
    const toList = o => Object.keys(o || {}).map(id => Object.assign({ id }, o[id]));
    const b = mergeLists(toList(local.blobs), toList(remote.blobs), cutoff);
    const p = mergePrefs(local.prefs, remote.prefs);
    const blobs = {};
    for (const x of b.list) { const y = Object.assign({}, x); delete y.id; blobs[x.id] = y; }
    return {
      data: { events: e.list, calendars: c.list, prefs: p.prefs, blobs },
      localChanged: e.localChanged || c.localChanged || b.localChanged || p.localChanged,
      remoteChanged: e.remoteChanged || c.remoteChanged || b.remoteChanged || p.remoteChanged,
      parts: { events: e, calendars: c, blobs: b, prefs: p },
    };
  }

  // copia completa de aquí, con lápidas (lo que se sube a Drive: con { drive: true }, sin lo de Google)
  function snapshot(opts) {
    const blobs = {};
    for (const m of blobMeta.values()) { const y = Object.assign({}, m); delete y.id; blobs[m.id] = y; }
    const only = opts && opts.drive ? forDrive : () => true;
    return {
      events: [...evMap.values()].filter(only),
      calendars: [...calMap.values()].filter(only),
      prefs: U().clone(prefsRaw),
      blobs,
    };
  }

  // quita de una copia lo de Google (lo que llega de Drive nunca lo trae, pero por si acaso)
  function driveOnly(data) {
    if (!data) return data;
    return Object.assign({}, data, {
      events: (data.events || []).filter(forDrive),
      calendars: (data.calendars || []).filter(forDrive),
    });
  }

  // junta lo que llega (de Drive o de una copia) con lo de aquí y guarda lo que gana
  async function applyRemote(remote, source) {
    source = source || 'sync';
    const m = merge(snapshot(), Object.assign({ events: [], calendars: [], blobs: {} }, remote, { prefs: remote.prefs || prefsRaw }));
    const types = [];
    const P = m.parts;
    if (P.events.changedIds.length) {
      const set = new Set(P.events.changedIds);
      const list = m.data.events.filter(x => set.has(x.id));
      for (const x of list) evMap.set(x.id, x);
      await db.put('events', list);
      types.push('events');
    }
    if (P.calendars.changedIds.length) {
      const set = new Set(P.calendars.changedIds);
      const list = m.data.calendars.filter(x => set.has(x.id));
      for (const x of list) calMap.set(x.id, x);
      await db.put('calendars', list);
      types.push('calendars');
    }
    if (P.blobs.changedIds.length) {
      for (const id of P.blobs.changedIds) {
        const meta = Object.assign({ id }, m.data.blobs[id]);
        blobMeta.set(id, meta);
        await db.put('blobmeta', meta);
        if (meta.deleted) {
          await db.del('blobdata', id);
          if (urlCache.has(id)) { try { URL.revokeObjectURL(urlCache.get(id)); } catch (e) {} urlCache.delete(id); }
        }
      }
      types.push('blobs');
    }
    if (P.prefs.localChanged) {
      prefsRaw = m.data.prefs;
      await db.put('kv', { id: 'prefs', value: prefsRaw });
      types.push('prefs');
    }
    // (los eventos al final: así cuando se pintan ya están sus calendarios)
    for (const t of ['calendars', 'prefs', 'blobs', 'events']) if (types.includes(t)) changed(t, source);
    return types;
  }

  // ---------- público ----------
  const on = (type, fn) => bus().on(type, fn);

  ZC.store = {
    init, events, calendars, get, calendar, saveEvent, deleteEvent, saveEventOccurrence, toggleDone,
    saveCalendar, deleteCalendar, occurrences, search, getPrefs, setPrefs, local,
    putBlob, getBlob, blobURL, deleteBlob, blobInfo, on, exportJSON, importJSON,
    // para la sincronización y las pruebas
    merge, snapshot, applyRemote, hasBlobData, stable, normEvent,
    // Google Calendar
    driveOnly, isGoogleId, stripGoogle, _gwrite: gwrite, _rawEvents: rawEvents, _rawEvent: rawEvent,
    // workspaces (ZC.ws)
    isWsId, defaultCalendarId, _wsSet: wsSet,
    inWorkspace: () => wsV.cur, get wsDim() { return wsV.dim; },
    get persistent() { return !!(db && db.persistent); },
    get ready() { return !!db; },
    DEFAULT_PREFS,
    _useMemory() { db = memoryDB(); initP = Promise.resolve(); if (!calMap.size) for (const c of defaultCalendars()) calMap.set(c.id, c); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
