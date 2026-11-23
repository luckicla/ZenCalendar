'use strict';
// ZenCalendar: utilidades pequeñas que usa todo el mundo (fechas, ids, HTML…).
//
// Las fechas de los eventos van como texto «flotante» y local, igual que
// Google Calendar con los eventos sin zona horaria:
//   'YYYY-MM-DDTHH:mm' → con hora      'YYYY-MM-DD' → todo el día
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const DAY = 86400000;

  const pad = n => String(n).padStart(2, '0');

  // id único (uuid v4 si el navegador lo trae; si no, uno parecido)
  function uid() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
    let s = '';
    for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20, 32);
  }

  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());

  // Date → texto de evento
  function toLocal(d, allDay) {
    d = parse(d);
    if (!d) return null;
    return allDay ? ymd(d) : ymd(d) + 'T' + hm(d);
  }

  // texto de evento (o Date, o ms) → Date local. null si no se entiende.
  function parse(s) {
    if (s == null || s === '') return null;
    if (s instanceof Date) return isNaN(s) ? null : new Date(s.getTime());
    if (typeof s === 'number') return new Date(s);
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s).trim());
    if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
    const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0, 0);
    return isNaN(d) ? null : d;
  }

  // sumar días respetando el horario de verano (por calendario, no por ms)
  function addDays(d, n) {
    const r = new Date(d.getTime());
    r.setDate(r.getDate() + n);
    return r;
  }
  const addMinutes = (d, n) => new Date(d.getTime() + n * 60000);
  function addMonths(d, n) {
    const r = new Date(d.getTime());
    const day = r.getDate();
    r.setDate(1);
    r.setMonth(r.getMonth() + n);
    r.setDate(Math.min(day, daysInMonth(r.getFullYear(), r.getMonth())));
    return r;
  }
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // primer día de la semana: 1 = lunes (por defecto), 0 = domingo, 6 = sábado
  function startOfWeek(d, firstDay) {
    if (firstDay == null) firstDay = 1;
    const s = startOfDay(d);
    const diff = (s.getDay() - firstDay + 7) % 7;
    return addDays(s, -diff);
  }
  const sameDay = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  // días de calendario entre dos fechas (b - a), sin líos de horario de verano
  function daysBetween(a, b) {
    const x = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const y = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((y - x) / DAY);
  }
  // número de semana ISO 8601 (la semana 1 es la del primer jueves)
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / DAY + 1) / 7);
  }

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);

  function debounce(fn, ms) {
    let t = null;
    const f = function (...a) { clearTimeout(t); t = setTimeout(() => { t = null; fn.apply(this, a); }, ms); };
    f.cancel = () => { clearTimeout(t); t = null; };
    f.flush = function (...a) { clearTimeout(t); t = null; fn.apply(this, a); };
    return f;
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // --- extras (no están en el contrato, pero vienen bien) ---

  // emisor de eventos mínimo: on(tipo, fn) → función para dejar de escuchar
  function emitter() {
    const map = {};
    return {
      on(type, fn) { (map[type] = map[type] || []).push(fn); return () => this.off(type, fn); },
      off(type, fn) { const l = map[type]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
      emit(type, data) {
        for (const fn of (map[type] || []).slice()) {
          try { fn(data); } catch (e) { console.error('[ZC] error en un aviso de ' + type, e); }
        }
      },
      count(type) { return (map[type] || []).length; },
    };
  }

  // texto sin tildes y en minúsculas (para buscar)
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // copia profunda de datos simples (JSON)
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ArrayBuffer/Uint8Array ↔ base64 (para el puente de Android)
  function toBase64(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (typeof Buffer !== 'undefined' && !root.document) return Buffer.from(b).toString('base64');
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromBase64(str) {
    if (typeof Buffer !== 'undefined' && !root.document) return new Uint8Array(Buffer.from(str, 'base64'));
    const s = atob(str);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  // color #rrggbb → [r, g, b]
  function rgb(hex) {
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // zona horaria del dispositivo ('Europe/Madrid')
  function timeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }

  ZC.util = {
    DAY, uid, pad, ymd, hm, toLocal, parse, addDays, addMinutes, addMonths, daysInMonth, startOfDay, startOfWeek,
    sameDay, daysBetween, isoWeek, esc, debounce, clamp,
    emitter, fold, clone, sleep, toBase64, fromBase64, rgb, timeZone,
  };
})(typeof window !== 'undefined' ? window : globalThis);
