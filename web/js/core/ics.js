'use strict';
// ZenCalendar: archivos .ics (iCalendar).
//
// parse(text) → eventos en nuestro formato (importar lo que exporta Google
//   Calendar: VEVENT, VTODO, DTSTART con/sin TZID y VALUE=DATE, RRULE básicas,
//   EXDATE, RECURRENCE-ID, VALARM, textos con escapes y líneas plegadas).
//   El array lleva además .calendarName (X-WR-CALNAME) si el archivo lo trae.
//   Los ids salen del UID: importar dos veces el mismo archivo no duplica nada.
// build(events, { name }) → texto .ics para exportar.
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const U = () => ZC.util;
  const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  // ---------- leer ----------
  function unfold(text) {
    return String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  }

  // «DTSTART;TZID=Europe/Madrid:20261127T213000» → { name, params, value }
  function parseLine(line) {
    let i = 0, inQ = false;
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQ = !inQ;
      else if (c === ':' && !inQ) break;
    }
    if (i >= line.length) return null;
    const head = line.slice(0, i), value = line.slice(i + 1);
    const parts = head.split(';');
    const params = {};
    for (const p of parts.slice(1)) {
      const k = p.indexOf('=');
      if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, '');
    }
    return { name: parts[0].toUpperCase(), params, value };
  }

  const unescape = s => String(s || '').replace(/\\([\\;,nN])/g, (m, c) => (c === 'n' || c === 'N') ? '\n' : c);

  // diferencia (ms) entre la hora de una zona y UTC en un instante
  function tzOffset(utcMs, tz) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    for (const x of f.formatToParts(new Date(utcMs))) p[x.type] = x.value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asUTC - utcMs;
  }

  // hora de reloj en la zona tz → Date (instante real)
  function zonedToDate(y, mo, d, h, mi, s, tz) {
    const guess = Date.UTC(y, mo, d, h, mi, s);
    try {
      let off = tzOffset(guess, tz);
      let t = guess - off;
      const off2 = tzOffset(t, tz);
      if (off2 !== off) t = guess - off2;
      return new Date(t);
    } catch (e) { return null; }
  }

  // nombres de zona de Windows que a veces salen en los .ics de Outlook
  const WIN_TZ = {
    'romance standard time': 'Europe/Paris', 'w. europe standard time': 'Europe/Berlin', 'central european standard time': 'Europe/Warsaw',
    'gmt standard time': 'Europe/London', 'utc': 'UTC', 'eastern standard time': 'America/New_York', 'pacific standard time': 'America/Los_Angeles',
    'central standard time': 'America/Chicago', 'mountain standard time': 'America/Denver',
  };

  /** Valor de fecha iCal → { local: 'YYYY-MM-DD' | 'YYYY-MM-DDTHH:mm', allDay } */
  function icalDate(value, params) {
    const u = U();
    params = params || {};
    const v = String(value || '').trim();
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
    if (!m) return null;
    const y = +m[1], mo = +m[2] - 1, d = +m[3];
    if (!m[4] || params.VALUE === 'DATE') return { local: u.ymd(new Date(y, mo, d)), allDay: true };
    const h = +m[4], mi = +m[5], s = +(m[6] || 0);
    let date;
    if (m[7]) date = new Date(Date.UTC(y, mo, d, h, mi, s));
    else if (params.TZID) {
      let tz = params.TZID.replace(/^\/+/, '');
      if (WIN_TZ[tz.toLowerCase()]) tz = WIN_TZ[tz.toLowerCase()];
      date = tz === u.timeZone() ? new Date(y, mo, d, h, mi, s) : zonedToDate(y, mo, d, h, mi, s, tz);
      if (!date) date = new Date(y, mo, d, h, mi, s); // zona desconocida: como hora local
    } else date = new Date(y, mo, d, h, mi, s); // «flotante»
    return { local: u.toLocal(date, false), allDay: false };
  }

  // «-PT30M», «-P1D», «PT0S», «-P1DT2H» → minutos (con signo)
  function duration(v) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || '').trim());
    if (!m) return null;
    const mins = (+(m[2] || 0)) * 10080 + (+(m[3] || 0)) * 1440 + (+(m[4] || 0)) * 60 + (+(m[5] || 0)) + Math.round((+(m[6] || 0)) / 60);
    return m[1] === '-' ? -mins : mins;
  }

  function parseRRule(v, startLocal) {
    const u = U();
    const p = {};
    for (const kv of String(v || '').split(';')) { const i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); }
    const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[String(p.FREQ || '').toUpperCase()];
    if (!freq) return null;
    const r = { freq, interval: Math.max(1, +p.INTERVAL || 1), byDay: null, monthMode: 'day', until: null, count: null };
    if (p.COUNT) r.count = Math.max(1, +p.COUNT);
    if (p.UNTIL) { const d = icalDate(p.UNTIL, {}); if (d) r.until = d.local.slice(0, 10); }
    const byDay = p.BYDAY ? p.BYDAY.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [];
    if (freq === 'weekly' && byDay.length) r.byDay = byDay.map(s => s.slice(-2)).filter(s => DAYS.includes(s));
    else if (freq === 'daily' && byDay.length) {
      // DAILY;BYDAY=MO,TU,… (laborables) = semanal con esos días
      r.freq = 'weekly'; r.byDay = byDay.map(s => s.slice(-2)).filter(s => DAYS.includes(s));
    } else if (freq === 'monthly' && byDay.length) {
      const m = /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(byDay[0]);
      if (m) {
        r.monthMode = 'weekday';
        let n = m[1] ? +m[1] : (p.BYSETPOS ? +p.BYSETPOS : null);
        if (n != null) r.nth = n < 0 ? -1 : Math.min(5, n);
      }
    }
    return r;
  }

  function hashId(s) {
    // id estable a partir del UID (FNV-1a de 2×32 bits)
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    }
    return 'ics-' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  function parse(text) {
    const u = U();
    const lines = unfold(text);
    const out = [];
    let calName = '';
    let cur = null, alarm = null, depth = [];
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const l = parseLine(raw);
      if (!l) continue;
      if (l.name === 'BEGIN') {
        const what = l.value.toUpperCase();
        depth.push(what);
        if (what === 'VEVENT' || what === 'VTODO') cur = { _type: what, _alarms: [], _exdates: [] };
        else if (what === 'VALARM' && cur) alarm = {};
        continue;
      }
      if (l.name === 'END') {
        const what = l.value.toUpperCase();
        depth.pop();
        if (what === 'VALARM' && cur && alarm) { cur._alarms.push(alarm); alarm = null; }
        else if ((what === 'VEVENT' || what === 'VTODO') && cur) { out.push(cur); cur = null; }
        continue;
      }
      if (!cur) { if (l.name === 'X-WR-CALNAME') calName = unescape(l.value); continue; }
      if (alarm) { alarm[l.name] = l; continue; }
      if (l.name === 'EXDATE') cur._exdates.push(l);
      else cur[l.name] = l;
    }

    // de lo leído a nuestros eventos
    const events = [];
    const byUid = {};
    for (const c of out) {
      if (c.STATUS && /CANCELLED/i.test(c.STATUS.value)) continue;
      const isTodo = c._type === 'VTODO';
      const startL = c.DTSTART || (isTodo ? c.DUE : null);
      const st = startL ? icalDate(startL.value, startL.params) : null;
      if (!st) continue;
      const ev = {
        kind: isTodo ? 'task' : 'event',
        title: c.SUMMARY ? unescape(c.SUMMARY.value).trim() : '',
        notes: c.DESCRIPTION ? unescape(c.DESCRIPTION.value).trim() : '',
        location: c.LOCATION ? unescape(c.LOCATION.value).trim() : '',
        allDay: st.allDay, start: st.local, end: st.local,
        rrule: null, exdates: [], reminders: [], recurrenceOf: null,
      };
      if (!isTodo) {
        const en = c.DTEND ? icalDate(c.DTEND.value, c.DTEND.params) : null;
        if (en && en.allDay === st.allDay) {
          // DTEND de todo el día es exclusivo: nuestro end es el último día incluido
          ev.end = st.allDay ? u.ymd(u.addDays(u.parse(en.local), -1)) : en.local;
        } else if (c.DURATION) {
          const mins = duration(c.DURATION.value) || 0;
          ev.end = st.allDay ? u.ymd(u.addDays(u.parse(st.local), Math.max(0, Math.round(mins / 1440) - 1))) : u.toLocal(u.addMinutes(u.parse(st.local), mins), false);
        } else if (!st.allDay) ev.end = st.local;
        if (ev.end < ev.start) ev.end = ev.start;
      } else {
        ev.done = !!(c.STATUS && /COMPLETED/i.test(c.STATUS.value)) || !!c.COMPLETED;
      }
      if (c.RRULE) ev.rrule = parseRRule(c.RRULE.value, st.local);
      for (const x of c._exdates) {
        for (const v of x.value.split(',')) {
          const d = icalDate(v, Object.assign({}, x.params, st.allDay ? { VALUE: 'DATE' } : {}));
          if (d) ev.exdates.push(d.local.slice(0, 10));
        }
      }
      for (const a of c._alarms) {
        const tr = a.TRIGGER;
        if (!tr) continue;
        let mins = null;
        if (tr.params.VALUE === 'DATE-TIME') {
          const d = icalDate(tr.value, tr.params);
          if (d) mins = Math.round((u.parse(st.allDay ? st.local + 'T09:00' : st.local) - u.parse(d.local)) / 60000);
        } else {
          const dmin = duration(tr.value);
          if (dmin != null) {
            // los de todo el día van relativos a las 9:00 de ese día:
            // «-PT15H» (el día antes a las 9:00, como Google) = 1440 min antes
            mins = st.allDay ? 9 * 60 - dmin : -dmin;
          }
        }
        if (mins != null && mins >= 0) ev.reminders.push(mins);
        else if (mins != null && mins < 0 && st.allDay && mins > -24 * 60) ev.reminders.push(0);
      }
      ev.reminders = [...new Set(ev.reminders)].sort((x, y) => x - y);
      if (c.COLOR) ev.color = null; // (los colores con nombre CSS no se usan)
      const uidv = c.UID ? c.UID.value.trim() : '';
      const rid = c['RECURRENCE-ID'];
      if (rid) {
        const d = icalDate(rid.value, rid.params);
        ev._rid = d ? d.local.slice(0, 10) : null;
      }
      ev.id = hashId((uidv || (ev.title + ev.start)) + (ev._rid ? '#' + ev._rid : ''));
      ev._uid = uidv;
      events.push(ev);
      if (uidv && !ev._rid) byUid[uidv] = ev;
    }
    // apariciones cambiadas sueltas (RECURRENCE-ID): copia suelta + exdate en la serie
    for (const ev of events) {
      if (ev._rid) {
        const master = byUid[ev._uid];
        if (master) {
          ev.recurrenceOf = master.id;
          ev.recurrenceDate = ev._rid;
          if (!master.exdates.includes(ev._rid)) master.exdates.push(ev._rid);
        }
      }
    }
    for (const ev of events) { ev.exdates = [...new Set(ev.exdates)].sort(); delete ev._rid; delete ev._uid; }
    events.calendarName = calName;
    return events;
  }

  // ---------- escribir ----------
  const escape = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  // plegar a 75 bytes (UTF-8) por línea
  function fold(line) {
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const b = ch.codePointAt(0) < 0x80 ? 1 : ch.codePointAt(0) < 0x800 ? 2 : ch.codePointAt(0) < 0x10000 ? 3 : 4;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }

  const dateVal = s => s.replace(/-/g, '');
  const dtVal = s => s.replace(/[-:]/g, '') + '00';
  function utcStamp(ms) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }

  function rruleText(r, ev) {
    const R = ZC.recur.normRule(r);
    if (!R) return '';
    const u = U();
    const parts = ['FREQ=' + R.freq.toUpperCase()];
    if (R.interval > 1) parts.push('INTERVAL=' + R.interval);
    if (R.freq === 'weekly' && R.byDay) parts.push('BYDAY=' + R.byDay.join(','));
    if (R.freq === 'monthly' && R.monthMode === 'weekday') {
      const s = u.parse(ev.start);
      const n = R.nth || (ZC.recur.nthOf(s) === 5 ? -1 : ZC.recur.nthOf(s));
      parts.push('BYDAY=' + n + DAYS[s.getDay()]);
    }
    if (R.count) parts.push('COUNT=' + R.count);
    else if (R.until) parts.push('UNTIL=' + dateVal(R.until) + (ev.allDay ? '' : 'T235959'));
    return parts.join(';');
  }

  function build(events, opts) {
    const u = U();
    opts = opts || {};
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//luckicla//ZenCalendar//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (opts.name) L.push('X-WR-CALNAME:' + escape(opts.name));
    const tz = u.timeZone();
    if (tz) L.push('X-WR-TIMEZONE:' + tz);
    const byId = {};
    for (const ev of events || []) byId[ev.id] = ev;
    const now = utcStamp(Date.now());
    for (const ev of events || []) {
      if (!ev || ev.deleted || !ev.start) continue;
      const task = ev.kind === 'task';
      L.push(task ? 'BEGIN:VTODO' : 'BEGIN:VEVENT');
      const master = ev.recurrenceOf ? byId[ev.recurrenceOf] : null;
      L.push('UID:' + (master ? master.id : ev.id) + '@zencalendar');
      L.push('DTSTAMP:' + now);
      if (ev.created) L.push('CREATED:' + utcStamp(ev.created));
      if (ev.updated) L.push('LAST-MODIFIED:' + utcStamp(ev.updated));
      if (ev.allDay) L.push((task ? 'DUE' : 'DTSTART') + ';VALUE=DATE:' + dateVal(ev.start.slice(0, 10)));
      else L.push((task ? 'DUE' : 'DTSTART') + ':' + dtVal(ev.start));
      if (task) {
        // (algunas apps quieren DTSTART también en las tareas)
        L.push(ev.allDay ? 'DTSTART;VALUE=DATE:' + dateVal(ev.start.slice(0, 10)) : 'DTSTART:' + dtVal(ev.start));
        L.push('STATUS:' + (ev.done ? 'COMPLETED' : 'NEEDS-ACTION'));
        if (ev.done && ev.doneAt) L.push('COMPLETED:' + utcStamp(ev.doneAt));
      } else if (ev.allDay) {
        L.push('DTEND;VALUE=DATE:' + dateVal(u.ymd(u.addDays(u.parse(ev.end || ev.start), 1))));
      } else {
        L.push('DTEND:' + dtVal(ev.end || ev.start));
      }
      if (master && ev.recurrenceDate) {
        L.push(master.allDay ? 'RECURRENCE-ID;VALUE=DATE:' + dateVal(ev.recurrenceDate) : 'RECURRENCE-ID:' + dtVal(ev.recurrenceDate + master.start.slice(10)));
      }
      L.push('SUMMARY:' + escape(ev.emoji ? ev.emoji + ' ' + ev.title : ev.title));
      if (ev.notes) L.push('DESCRIPTION:' + escape(ev.notes));
      if (ev.location) L.push('LOCATION:' + escape(ev.location));
      if (ev.rrule) {
        const rr = rruleText(ev.rrule, ev);
        if (rr) L.push('RRULE:' + rr);
        if (ev.exdates && ev.exdates.length) {
          L.push(ev.allDay ? 'EXDATE;VALUE=DATE:' + ev.exdates.map(dateVal).join(',') : 'EXDATE:' + ev.exdates.map(d => dtVal(d + ev.start.slice(10))).join(','));
        }
      }
      for (const m of ev.reminders || []) {
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escape(ev.title || 'Aviso'));
        // todo el día: relativo a las 9:00 de ese día
        const mins = ev.allDay ? m - 9 * 60 : m;
        L.push('TRIGGER:' + (mins > 0 ? '-' : '') + 'PT' + Math.abs(mins) + 'M');
        L.push('END:VALARM');
      }
      L.push(task ? 'END:VTODO' : 'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  ZC.ics = { parse, build, icalDate, duration, parseRRule };
})(typeof window !== 'undefined' ? window : globalThis);
