'use strict';
// ZenCalendar: un Google Calendar de mentira, en memoria, para probar sin Google.
//
// No lo carga index.html: lo carga ZC.gcal._mock() cuando hace falta (y las
// pruebas de tests/core). Imita lo que usa ZC.gcal de la API v3: calendarList,
// events (list con syncToken/410, insert, get, patch e If-Match/412, delete,
// move, instances) y userinfo, más un «inicio de sesión» falso.
//
//   const g = await ZC.gcal._mock(cuentas?, { pick, delay, pageSize, afterChange });
//   cuentas: [{ email, name, photo, connected: true|false, authError: false,
//               calendars: [{ id, name, color, accessRole: 'owner'|'writer'|'reader'|'freeBusyReader', primary,
//                             events: [{ title, start: 'YYYY-MM-DDTHH:mm' | 'YYYY-MM-DD', end, notes, location, rrule: 'FREQ=WEEKLY', colorId }] }] }]
//   (sin cuentas: unas de ejemplo). connected: false = la «siguiente» que sale al pulsar «Añadir cuenta».
//
//   g.addEvent(email, gid, ev) · g.updateEvent(email, gid, id, cambios) · g.deleteEvent(email, gid, id)
//   g.events(email, gid) · g.event(email, gid, id) · g.addCalendar(email, cal) · g.removeCalendar(email, gid)
//   g.setAuthError(email, on) · g.expireSyncTokens() · g.fail(re, status, veces) · g.offline = true
//   g.delay = ms · g.pick(email) (la siguiente en el selector) · g.requests (lo pedido) · g.users()
(function (root) {
  const ZC = root.ZC = root.ZC || {};

  function create(list, opts) {
    opts = opts || {};
    const u = ZC.util;
    let seq = 1, nid = 1, minToken = 0, ntok = 1;
    const users = new Map();
    const tokens = new Map();
    const pickQ = (opts.pick || []).map(s => String(s).toLowerCase());
    const failures = [];
    const S = {
      delay: opts.delay || 0, offline: false, requests: [], pageSize: opts.pageSize || 2500,
      afterChange: opts.afterChange,
    };

    const iso = ms => new Date(ms).toISOString();
    const touch = ev => { ev._seq = ++seq; ev.etag = '"e' + seq + '"'; ev.updated = iso(Date.now()); return ev; };
    const strip = ev => { const o = JSON.parse(JSON.stringify(ev)); delete o._seq; return o; };
    const pad = n => String(n).padStart(2, '0');
    const utcStamp = d => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';

    // hora local sin zona ('2026-11-27T09:30:00') → instante con zona, como contesta Google
    function normTime(t) {
      if (!t) return t;
      const o = {};
      if (t.date) o.date = t.date;
      else if (t.dateTime) {
        o.dateTime = /[zZ]|[+-]\d\d:\d\d$/.test(t.dateTime) ? new Date(t.dateTime).toISOString() : new Date(u.parse(t.dateTime.slice(0, 16))).toISOString();
        if (t.timeZone) o.timeZone = t.timeZone;
      }
      return o;
    }

    function toG(d) {
      if (d.summary !== undefined || (d.start && typeof d.start === 'object')) return Object.assign({}, d, { start: normTime(d.start), end: normTime(d.end || d.start) });
      const allDay = /^\d{4}-\d{2}-\d{2}$/.test(d.start);
      const g = { summary: d.title || '' };
      if (d.id) g.id = d.id;
      if (d.notes) g.description = d.notes;
      if (d.location) g.location = d.location;
      if (allDay) {
        g.start = { date: d.start };
        g.end = { date: u.ymd(u.addDays(u.parse(d.end || d.start), 1)) };
      } else {
        const s = u.parse(d.start);
        g.start = { dateTime: s.toISOString(), timeZone: 'Europe/Madrid' };
        g.end = { dateTime: (d.end ? u.parse(d.end) : u.addMinutes(s, 60)).toISOString(), timeZone: 'Europe/Madrid' };
      }
      if (d.rrule) g.recurrence = ['RRULE:' + d.rrule];
      if (d.recurrence) g.recurrence = d.recurrence;
      if (d.colorId) g.colorId = String(d.colorId);
      if (d.reminders) g.reminders = { useDefault: false, overrides: d.reminders.map(m => ({ method: 'popup', minutes: m })) };
      return g;
    }

    function addUser(def) {
      const email = String(def.email).toLowerCase();
      const user = {
        email, name: def.name || email.split('@')[0], photo: def.photo || '', connected: def.connected !== false,
        authError: !!def.authError, cals: new Map(),
      };
      users.set(email, user);
      const cals = def.calendars || [{ name: email, primary: true }];
      for (const c of cals) addCalendar(email, c);
      return user;
    }

    function addCalendar(email, c) {
      const user = users.get(String(email).toLowerCase());
      const id = c.id || (c.primary ? user.email : 'c' + (nid++) + '@group.calendar.google.com');
      const cal = {
        entry: { kind: 'calendar#calendarListEntry', id, summary: c.name || id, backgroundColor: c.color || '#9fc6e7', accessRole: c.accessRole || 'owner', primary: !!c.primary, defaultReminders: c.defaultReminders || (c.accessRole === 'reader' ? [] : [{ method: 'popup', minutes: 30 }]) },
        events: new Map(),
      };
      user.cals.set(id, cal);
      for (const e of c.events || []) insert(cal, toG(e));
      return id;
    }

    function insert(cal, body) {
      const id = body.id || ('ev' + (nid++) + 'q' + Math.random().toString(32).slice(2, 7));
      if (cal.events.has(id) && cal.events.get(id).status !== 'cancelled') return { status: 409, json: { error: { message: 'The requested identifier already exists.' } } };
      const ev = Object.assign({ kind: 'calendar#event', status: 'confirmed', reminders: { useDefault: true } }, body, {
        id, iCalUID: id + '@google.com', created: iso(Date.now()), htmlLink: 'https://www.google.com/calendar/event?eid=' + id,
        start: normTime(body.start), end: normTime(body.end || body.start),
      });
      if (ev.colorId == null) delete ev.colorId;
      cal.events.set(id, touch(ev));
      return { status: 200, json: strip(ev) };
    }

    // ---- repeticiones (lo justo para las pruebas: una o varias RRULE + EXDATE) ----
    function localStart(g) { return g.start.date || u.toLocal(new Date(g.start.dateTime), false); }
    function instanceId(parent, startDate, allDay) { return parent.id + '_' + (allDay ? u.ymd(startDate).replace(/-/g, '') : utcStamp(startDate)); }
    function expand(parent, from, to) {
      const allDay = !!parent.start.date;
      const s = localStart(parent);
      const e = parent.end.date ? u.ymd(u.addDays(u.parse(parent.end.date), -1)) : u.toLocal(new Date(parent.end.dateTime), false);
      const ex = new Set();
      for (const l of parent.recurrence || []) {
        if (!/^EXDATE/i.test(l)) continue;
        const i = l.indexOf(':');
        const params = {};
        for (const kv of l.slice(0, i).split(';').slice(1)) { const j = kv.indexOf('='); params[kv.slice(0, j).toUpperCase()] = kv.slice(j + 1); }
        for (const v of l.slice(i + 1).split(',')) { const d = ZC.ics.icalDate(v, params); if (d) ex.add(d.local.slice(0, 10)); }
      }
      const out = new Map();
      for (const l of parent.recurrence || []) {
        if (!/^RRULE:/i.test(l)) continue;
        const rule = ZC.ics.parseRRule(l.slice(6), s);
        if (!rule) continue;
        for (const inst of ZC.recur.expand({ start: s, end: e, allDay, rrule: rule, exdates: [...ex] }, from, to)) {
          const id = instanceId(parent, inst.start, allDay);
          if (out.has(id)) continue;
          const os = allDay ? { date: u.ymd(inst.start) } : { dateTime: inst.start.toISOString(), timeZone: parent.start.timeZone };
          out.set(id, Object.assign({}, parent, {
            id, recurringEventId: parent.id, recurrence: undefined, originalStartTime: os,
            start: os, end: allDay ? { date: u.ymd(u.addDays(inst.end, 1)) } : { dateTime: inst.end.toISOString(), timeZone: parent.start.timeZone },
          }));
        }
      }
      return [...out.values()];
    }
    function virtualInstance(cal, id) {
      const m = /^(.+)_(\d{8}(?:T\d{6}Z)?)$/.exec(id);
      if (!m) return null;
      const parent = cal.events.get(m[1]);
      if (!parent || parent.status === 'cancelled' || !parent.recurrence) return null;
      const far = new Date(2100, 0, 1), near = new Date(1990, 0, 1);
      return expand(parent, near, far).find(i => i.id === id) || null;
    }

    // ---- la «API» ----
    function res(status, json) { return { status, json }; }
    function auth(headers) {
      const h = headers.Authorization || headers.authorization || '';
      const t = h.replace(/^Bearer\s+/, '');
      const email = tokens.get(t);
      if (!email) return null;
      const user = users.get(email);
      if (!user || user.authError) return null;
      return user;
    }

    function route(method, url, headers, body) {
      const U2 = new URL(url);
      const q = U2.searchParams;
      const path = decodeURIComponent(U2.pathname);
      const user = auth(headers);
      if (!user) return res(401, { error: { message: 'Invalid Credentials' } });
      if (/\/oauth2\/v3\/userinfo$/.test(path)) return res(200, { email: user.email, name: user.name, picture: user.photo });
      if (/\/users\/me\/calendarList$/.test(path)) return res(200, { items: [...user.cals.values()].map(c => Object.assign({}, c.entry)) });
      let m = /\/calendars\/([^/]+)\/events(?:\/([^/]+))?(?:\/(move|instances))?$/.exec(U2.pathname);
      if (!m) return res(404, { error: { message: 'Not Found' } });
      const gid = decodeURIComponent(m[1]), id = m[2] ? decodeURIComponent(m[2]) : null, sub = m[3];
      const cal = user.cals.get(gid);
      if (!cal) return res(404, { error: { message: 'Not Found' } });
      const ro = cal.entry.accessRole === 'reader' || cal.entry.accessRole === 'freeBusyReader';
      // lista
      if (!id && method === 'GET') {
        const st = q.get('syncToken');
        let from = 0;
        if (st) { from = +st.slice(1); if (from < minToken) return res(410, { error: { message: 'Sync token is no longer valid, a full sync is required.' } }); }
        let items = [...cal.events.values()].filter(e => st ? e._seq > from : true).sort((a, b) => a._seq - b._seq);
        if (!st && q.get('showDeleted') !== 'true') items = items.filter(e => e.status !== 'cancelled');
        const max = Math.min(+q.get('maxResults') || 250, S.pageSize);
        const off = +(q.get('pageToken') || 0);
        const page = items.slice(off, off + max);
        const out = { items: page.map(strip) };
        if (off + max < items.length) out.nextPageToken = String(off + max);
        else out.nextSyncToken = 'S' + seq;
        return res(200, out);
      }
      if (!id && method === 'POST') {
        if (ro) return res(403, { error: { message: 'Forbidden' } });
        return insert(cal, body || {});
      }
      if (sub === 'instances') {
        const parent = cal.events.get(id);
        if (!parent || parent.status === 'cancelled') return res(410, { error: { message: 'Gone' } });
        let from = new Date(1990, 0, 1), to = new Date(2100, 0, 1);
        if (q.get('timeMin')) from = new Date(q.get('timeMin'));
        if (q.get('timeMax')) to = new Date(q.get('timeMax'));
        let items = expand(parent, from, to).map(i => cal.events.get(i.id) || i);
        // excepciones movidas fuera de la ventana: también
        for (const e of cal.events.values()) if (e.recurringEventId === id && !items.some(i => i.id === e.id)) items.push(e);
        const os = q.get('originalStart');
        if (os) items = items.filter(i => { const o = i.originalStartTime || {}; return o.date ? o.date === os : new Date(o.dateTime).getTime() === new Date(os).getTime(); });
        if (q.get('showDeleted') !== 'true') items = items.filter(i => i.status !== 'cancelled');
        return res(200, { items: items.map(strip) });
      }
      let ev = cal.events.get(id);
      if (sub === 'move' && method === 'POST') {
        if (!ev || ev.status === 'cancelled') return res(404, { error: { message: 'Not Found' } });
        const dest = user.cals.get(q.get('destination'));
        if (!dest) return res(404, { error: { message: 'Not Found' } });
        const moved = Object.assign({}, ev);
        cal.events.set(id, touch({ id, status: 'cancelled', _seq: 0 }));
        dest.events.set(id, touch(moved));
        return res(200, strip(moved));
      }
      if (method === 'GET') {
        if (!ev) { const v = virtualInstance(cal, id); if (v) return res(200, strip(v)); return res(404, { error: { message: 'Not Found' } }); }
        return res(200, strip(ev));
      }
      if (ro) return res(403, { error: { message: 'Forbidden' } });
      const ifm = headers['If-Match'] || headers['if-match'];
      if (method === 'DELETE') {
        if (!ev) {
          const v = virtualInstance(cal, id);
          if (!v) return res(404, { error: { message: 'Not Found' } });
          cal.events.set(id, touch({ id, recurringEventId: v.recurringEventId, originalStartTime: v.originalStartTime, status: 'cancelled' }));
          return res(204, null);
        }
        if (ev.status === 'cancelled') return res(410, { error: { message: 'Resource has been deleted' } });
        if (ifm && ifm !== ev.etag) return res(412, { error: { message: 'Precondition Failed' } });
        cal.events.set(id, touch({ id, status: 'cancelled', recurringEventId: ev.recurringEventId, originalStartTime: ev.originalStartTime }));
        if (ev.recurrence) for (const x of cal.events.values()) if (x.recurringEventId === id && x.status !== 'cancelled') { x.status = 'cancelled'; touch(x); }
        return res(204, null);
      }
      if (method === 'PATCH' || method === 'PUT') {
        if (!ev) {
          const v = virtualInstance(cal, id);
          if (!v) return res(404, { error: { message: 'Not Found' } });
          ev = Object.assign({}, v, { status: 'confirmed' });
          cal.events.set(id, touch(ev));
        } else if (ifm && ifm !== ev.etag) return res(412, { error: { message: 'Precondition Failed' } });
        else if (ev.status === 'cancelled' && !(body && body.status === 'confirmed')) return res(404, { error: { message: 'Not Found' } });
        applyPatch(ev, body || {});
        touch(ev);
        return res(200, strip(ev));
      }
      return res(400, { error: { message: 'Bad Request' } });
    }

    function applyPatch(ev, body) {
      for (const k of Object.keys(body)) {
        const v = body[k];
        if (k === 'start' || k === 'end') ev[k] = normTime(v);
        else if (k === 'extendedProperties') {
          ev.extendedProperties = ev.extendedProperties || {};
          for (const part of ['private', 'shared']) if (v[part]) ev.extendedProperties[part] = Object.assign({}, ev.extendedProperties[part], v[part]);
        } else if (v === null) delete ev[k];
        else ev[k] = JSON.parse(JSON.stringify(v));
      }
    }

    async function fetch(url, o) {
      o = o || {};
      if (S.delay) await new Promise(r => setTimeout(r, S.delay));
      if (S.offline) { const e = new Error('Sin conexión'); e.network = true; throw e; }
      const method = String(o.method || 'GET').toUpperCase();
      const headers = o.headers || {};
      let body = null;
      if (o.body) { try { body = JSON.parse(typeof o.body === 'string' ? o.body : new TextDecoder().decode(o.body)); } catch (e) {} }
      S.requests.push({ method, url, body, ifMatch: headers['If-Match'] || null });
      let r = null;
      for (const f of failures) {
        if (f.times > 0 && f.re.test(method + ' ' + url)) { f.times--; r = res(f.status, { error: { message: 'Simulado ' + f.status } }); break; }
      }
      if (!r) r = route(method, url, headers, body);
      const text = r.json == null ? '' : JSON.stringify(r.json);
      return ZC.net._makeResponse(r.status, '', { 'content-type': 'application/json' }, new TextEncoder().encode(text));
    }

    function issue(email) { const t = 'mock-' + (ntok++) + '-' + email; tokens.set(t, email); return t; }
    function authErr(msg) { const e = new Error(msg); e.auth = true; return e; }

    const authAdapter = {
      async add(o) {
        if (S.delay) await new Promise(r => setTimeout(r, S.delay));
        let email = o && o.email ? String(o.email).toLowerCase() : null;
        if (!email) {
          const here = new Set(((ZC.gcal && ZC.gcal.accounts()) || []).filter(a => a.connected).map(a => a.email));
          email = pickQ.shift() || [...users.values()].map(x => x.email).find(e => !here.has(e) && !users.get(e).connected);
          if (!email) email = [...users.values()].map(x => x.email).find(e => !here.has(e));
          if (!email) { email = 'nueva' + (nid++) + '@example.com'; }
        }
        if (!users.has(email)) addUser({ email, connected: false });
        const user = users.get(email);
        if (user.denyAdd) throw authErr('No diste permiso a ZenCalendar');
        user.authError = false;
        user.connected = true;
        return { token: issue(email), exp: Date.now() + 3600000, email };
      },
      async token(email) {
        const user = users.get(String(email).toLowerCase());
        if (!user || user.authError) throw authErr('Hay que volver a conectar esta cuenta');
        return { token: issue(user.email), exp: Date.now() + 3600000 };
      },
      save() {},
      async remove(email) { const user = users.get(String(email).toLowerCase()); if (user) user.connected = false; },
    };

    // ---- datos de ejemplo ----
    function demo() {
      const d = n => u.ymd(u.addDays(new Date(), n));
      return [
        { email: 'ana@example.com', name: 'Ana García', connected: true, calendars: [
          { name: 'ana@example.com', primary: true, color: '#9fc6e7', events: [
            { title: 'Dentista', start: d(1) + 'T10:00', end: d(1) + 'T10:45', location: 'Clínica Sonrisas' },
            { title: 'Yoga', start: d(-6) + 'T19:00', end: d(-6) + 'T20:00', rrule: 'FREQ=WEEKLY' },
            { title: 'Escapada', start: d(5), end: d(7) },
          ] },
          { name: 'Familia', color: '#f691b2', events: [{ title: 'Comida con los abuelos', start: d(3) + 'T14:00', end: d(3) + 'T16:00' }] },
          { id: 'es.spain#holiday@group.v.calendar.google.com', name: 'Festivos en España', color: '#16a765', accessRole: 'reader', events: [{ title: 'Día de prueba festivo', start: d(10) }] },
          { id: 'addressbook#contacts@group.v.calendar.google.com', name: 'Cumpleaños', color: '#92e1c0', accessRole: 'reader', events: [] },
        ] },
        { email: 'equipo@example.com', name: 'Equipo', connected: true, calendars: [
          { name: 'equipo@example.com', primary: true, color: '#b99aff', events: [{ title: 'Reunión semanal', start: d(2) + 'T09:30', end: d(2) + 'T10:30' }] },
          { name: 'Turnos (solo lectura)', color: '#ffad46', accessRole: 'reader', events: [{ title: 'Turno de tarde', start: d(4) + 'T15:00', end: d(4) + 'T20:00' }] },
        ] },
        { email: 'nueva@example.com', name: 'Cuenta nueva', connected: false, calendars: [
          { name: 'nueva@example.com', primary: true, color: '#7bd148', events: [{ title: 'Clase de cerámica', start: d(2) + 'T18:00', end: d(2) + 'T19:30' }] },
        ] },
      ];
    }

    for (const def of (list == null ? demo() : list)) addUser(def);

    function find(email, gid) {
      const user = users.get(String(email).toLowerCase());
      const cal = user && user.cals.get(gid || user.email);
      if (!cal) throw new Error('mock: no existe ' + email + ' / ' + gid);
      return cal;
    }

    return Object.assign(S, {
      fetch, auth: authAdapter,
      afterChange: opts.afterChange,
      users: () => [...users.values()].map(x => ({ email: x.email, name: x.name, connected: x.connected, authError: x.authError, calendars: [...x.cals.keys()] })),
      addUser,
      addCalendar,
      removeCalendar(email, gid) { users.get(String(email).toLowerCase()).cals.delete(gid); },
      addEvent(email, gid, e) { return insert(find(email, gid), toG(e)).json; },
      updateEvent(email, gid, id, changes) {
        const cal = find(email, gid);
        let ev = cal.events.get(id);
        if (!ev) { const v = virtualInstance(cal, id); if (!v) throw new Error('mock: no existe ' + id); ev = Object.assign({}, v, { status: 'confirmed' }); cal.events.set(id, ev); }
        applyPatch(ev, changes.title !== undefined || typeof changes.start === 'string' ? toPatch(changes) : changes);
        touch(ev);
        return strip(ev);
      },
      deleteEvent(email, gid, id) {
        const cal = find(email, gid);
        const ev = cal.events.get(id);
        if (!ev) { const v = virtualInstance(cal, id); if (v) cal.events.set(id, touch({ id, recurringEventId: v.recurringEventId, originalStartTime: v.originalStartTime, status: 'cancelled' })); return; }
        cal.events.set(id, touch({ id, status: 'cancelled', recurringEventId: ev.recurringEventId, originalStartTime: ev.originalStartTime }));
        if (ev.recurrence) for (const x of cal.events.values()) if (x.recurringEventId === id && x.status !== 'cancelled') { x.status = 'cancelled'; touch(x); }
      },
      events(email, gid) { return [...find(email, gid).events.values()].filter(e => e.status !== 'cancelled').map(strip); },
      event(email, gid, id) { const e = find(email, gid).events.get(id); return e ? strip(e) : null; },
      setAuthError(email, on) { const x = users.get(String(email).toLowerCase()); if (x) x.authError = on !== false; },
      denyAdd(email, on) { const x = users.get(String(email).toLowerCase()); if (x) x.denyAdd = on !== false; },
      expireSyncTokens() { minToken = seq + 1; },
      fail(re, status, times) { failures.push({ re: re instanceof RegExp ? re : new RegExp(re), status: status || 500, times: times || 1 }); },
      pick(email) { pickQ.push(String(email).toLowerCase()); },
    });

    function toPatch(c) {
      const p = {};
      if (c.title !== undefined) p.summary = c.title;
      if (c.notes !== undefined) p.description = c.notes;
      if (c.location !== undefined) p.location = c.location;
      if (typeof c.start === 'string') { const g = toG({ title: '', start: c.start, end: c.end }); p.start = g.start; p.end = g.end; }
      for (const k of Object.keys(c)) if (!['title', 'notes', 'location', 'start', 'end'].includes(k)) p[k] = c[k];
      return p;
    }
  }

  ZC.gcalMock = { create };
})(typeof window !== 'undefined' ? window : globalThis);
