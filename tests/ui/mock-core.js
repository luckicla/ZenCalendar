'use strict';
// Mock TEMPORAL del backend (solo para probar la UI mientras web/js/core/ no existe).
// Sigue docs/CONTRATO.md. Nunca se copia a web/js/core/.
(function () {
  const ZC = window.ZC = window.ZC || {};
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { if (s instanceof Date) return new Date(s); const [d, t] = String(s).split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = (t || '00:00').split(':').map(Number); return new Date(y, m - 1, dd, h, mi); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  ZC.util = {
    uid: () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)),
    pad, ymd, parse, addDays, startOfDay,
    toLocal: (d, allDay) => allDay ? ymd(d) : ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()),
    addMinutes: (d, n) => new Date(d.getTime() + n * 60000),
    startOfWeek: (d, fd = 1) => { const x = startOfDay(d); const k = (x.getDay() - fd + 7) % 7; return addDays(x, -k); },
    sameDay: (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(),
    daysBetween: (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 864e5),
    isoWeek: d => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 864e5 + 1) / 7); },
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  };
  const U = ZC.util;

  // ---------- recur ----------
  const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  ZC.recur = {
    expand(ev, from, to) {
      const s0 = parse(ev.start), e0 = parse(ev.end), dur = ev.allDay ? (U.daysBetween(s0, e0)) : (e0 - s0);
      const mk = s => ({ start: s, end: ev.allDay ? addDays(s, dur) : new Date(s.getTime() + dur) });
      const r = ev.rrule;
      if (!r) return (mk(s0).end >= from && s0 < to) ? [mk(s0)] : [];
      const out = [], ex = new Set(ev.exdates || []), until = r.until ? addDays(parse(r.until), 1) : null, iv = r.interval || 1;
      let n = 0;
      const push = s => { n++; if (r.count && n > r.count) return false; if (until && s >= until) return false; if (s > to) return false; const o = mk(s); if (!ex.has(ymd(s)) && o.end >= from) out.push(o); return true; };
      for (let i = 0; i < 3000; i++) {
        let s;
        if (r.freq === 'daily') s = addDays(s0, i * iv);
        else if (r.freq === 'weekly') {
          const byDay = r.byDay && r.byDay.length ? r.byDay : [DAYS[s0.getDay()]];
          const wk = U.startOfWeek(s0, 1), base = addDays(wk, i * 7 * iv);
          let stop = false;
          for (let k = 0; k < 7; k++) { const d = addDays(base, k); if (!byDay.includes(DAYS[d.getDay()])) continue; const ss = new Date(d); ss.setHours(s0.getHours(), s0.getMinutes()); if (ss < s0) continue; if (!push(ss)) { stop = true; break; } }
          if (stop) break; continue;
        } else if (r.freq === 'monthly') {
          if (r.monthMode === 'weekday') { const nth = Math.ceil(s0.getDate() / 7), wd = s0.getDay(); const m = new Date(s0.getFullYear(), s0.getMonth() + i * iv, 1, s0.getHours(), s0.getMinutes()); let c = 0, d = new Date(m); while (d.getMonth() === m.getMonth()) { if (d.getDay() === wd && ++c === nth) break; d = addDays(d, 1); } if (d.getMonth() !== m.getMonth()) continue; s = d; }
          else { s = new Date(s0.getFullYear(), s0.getMonth() + i * iv, s0.getDate(), s0.getHours(), s0.getMinutes()); if (s.getDate() !== s0.getDate()) continue; }
        } else s = new Date(s0.getFullYear() + i * iv, s0.getMonth(), s0.getDate(), s0.getHours(), s0.getMinutes());
        if (!push(s)) break;
      }
      return out;
    },
    describe(r, lang = 'es') {
      if (!r) return lang === 'en' ? 'Does not repeat' : 'No se repite';
      const W = { MO: 'lunes', TU: 'martes', WE: 'miércoles', TH: 'jueves', FR: 'viernes', SA: 'sábado', SU: 'domingo' };
      const iv = r.interval || 1;
      let t = { daily: iv > 1 ? `Cada ${iv} días` : 'Cada día', weekly: iv > 1 ? `Cada ${iv} semanas` : 'Cada semana', monthly: iv > 1 ? `Cada ${iv} meses` : 'Cada mes', yearly: iv > 1 ? `Cada ${iv} años` : 'Cada año' }[r.freq];
      if (r.freq === 'weekly' && r.byDay && r.byDay.length) t += ', ' + r.byDay.map(d => W[d]).join(', ').replace(/, ([^,]*)$/, ' y $1');
      if (r.freq === 'monthly' && r.monthMode === 'weekday') t += ' (mismo día de la semana)';
      if (r.until) t += ', hasta el ' + r.until; if (r.count) t += `, ${r.count} veces`;
      return t;
    },
  };

  // ---------- holidays ----------
  ZC.holidays = {
    between(from, to, country = 'ES') {
      if (country === 'none') return [];
      const out = [];
      for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
        const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
        const easter = new Date(y, mo - 1, da);
        const list = [[0, 1, 'Año Nuevo'], [0, 6, 'Reyes'], [4, 1, 'Día del Trabajo'], [7, 15, 'Asunción'], [9, 12, 'Fiesta Nacional'], [10, 1, 'Todos los Santos'], [11, 6, 'Constitución'], [11, 8, 'Inmaculada'], [11, 25, 'Navidad']].map(([mm, dd, n]) => ({ date: ymd(new Date(y, mm, dd)), name: n }));
        list.push({ date: ymd(addDays(easter, -2)), name: 'Viernes Santo' });
        for (const x of list) { const dd = parse(x.date); if (dd >= startOfDay(from) && dd <= to) out.push(x); }
      }
      return out.sort((a, b) => a.date < b.date ? -1 : 1);
    },
  };

  // ---------- store ----------
  const LS = 'zcmock.data';
  let D = { events: {}, calendars: {}, prefs: { look: {}, cal: { firstDay: 1, weekNumbers: false, timeFormat: '24', defaultView: 'month', defaultDuration: 60, defaultReminders: [10], holidays: 'ES', lang: 'auto' }, ai: { provider: 'rules', model: '', baseUrl: '', autoApply: false } } };
  const blobs = new Map(), blobURLs = new Map();
  const listeners = { change: [] };
  const emit = (type, source = 'local') => listeners.change.forEach(fn => { try { fn({ type, source }); } catch (e) { console.error(e); } });
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(D)); } catch {} };
  const now = () => Date.now();
  ZC.store = {
    async init() {
      try { const x = JSON.parse(localStorage.getItem(LS) || 'null'); if (x) D = Object.assign(D, x); } catch {}
      if (!Object.keys(D.calendars).length) {
        [['personal', 'Personal', '#B9A2FF'], ['work', 'Trabajo', '#7CC8F2'], ['birthdays', 'Cumpleaños', '#FF9CCB']].forEach(([id, name, color], i) => D.calendars[id] = { id, name, color, visible: true, order: i, updated: now(), deleted: false });
        persist();
      }
    },
    events: () => Object.values(D.events).filter(e => !e.deleted),
    calendars: () => Object.values(D.calendars).filter(c => !c.deleted).sort((a, b) => a.order - b.order),
    get: id => D.events[id] || null,
    calendar: id => D.calendars[id] || null,
    async saveEvent(p) {
      const old = p.id && D.events[p.id];
      const ev = Object.assign({ kind: 'event', title: '', notes: '', location: '', calendarId: 'personal', color: null, emoji: null, allDay: false, rrule: null, exdates: [], recurrenceOf: null, reminders: [], attachments: [], checklist: [], done: false, doneAt: null, deleted: false, created: now() }, old || {}, p);
      ev.id = ev.id || U.uid(); ev.updated = now();
      if (ev.kind === 'task') ev.end = ev.start;
      D.events[ev.id] = ev; persist(); emit('events'); return ev;
    },
    async deleteEvent(id, { mode = 'all', date } = {}) {
      const ev = D.events[id]; if (!ev) return;
      if (ev.rrule && mode === 'one') ev.exdates = [...(ev.exdates || []), date];
      else if (ev.rrule && mode === 'future') { const d = addDays(parse(date), -1); ev.rrule = { ...ev.rrule, until: ymd(d), count: null }; }
      else ev.deleted = true;
      ev.updated = now(); persist(); emit('events');
    },
    async saveEventOccurrence(id, date, changes) {
      const ev = D.events[id]; ev.exdates = [...(ev.exdates || []), date]; ev.updated = now();
      const copy = Object.assign({}, ev, { id: U.uid(), rrule: null, exdates: [], recurrenceOf: id }, changes);
      D.events[copy.id] = copy; persist(); emit('events'); return copy;
    },
    async toggleDone(id) { const ev = D.events[id]; ev.done = !ev.done; ev.doneAt = ev.done ? now() : null; ev.updated = now(); persist(); emit('events'); return ev; },
    async saveCalendar(p) { const c = Object.assign({ visible: true, order: Object.keys(D.calendars).length, deleted: false }, D.calendars[p.id] || {}, p); c.id = c.id || U.uid(); c.updated = now(); D.calendars[c.id] = c; persist(); emit('calendars'); return c; },
    async deleteCalendar(id) { D.calendars[id].deleted = true; for (const e of Object.values(D.events)) if (e.calendarId === id) e.deleted = true; persist(); emit('calendars'); emit('events'); },
    occurrences(from, to, { includeHidden = false, includeTasks = true } = {}) {
      const out = [];
      for (const ev of ZC.store.events()) {
        const cal = D.calendars[ev.calendarId] || ZC.store.calendars()[0];
        if (!includeHidden && cal && !cal.visible) continue;
        if (!includeTasks && ev.kind === 'task') continue;
        for (const o of ZC.recur.expand(ev, from, to)) {
          let end = o.end; if (ev.allDay) end = addDays(startOfDay(o.end), 1);
          if (end <= from && !(ev.allDay && U.sameDay(o.start, from))) continue;
          out.push({ key: ev.id + '@' + ymd(o.start), id: ev.id, ev, start: o.start, end: ev.allDay ? addDays(startOfDay(o.end), 0) : o.end, allDay: ev.allDay, color: ev.color || (cal && cal.color) || '#B9A2FF', calendar: cal, isTask: ev.kind === 'task', done: !!ev.done });
        }
      }
      return out.sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
    },
    search(text) { const q = String(text).toLowerCase().trim(); if (!q) return []; return ZC.store.events().filter(e => (e.title + ' ' + e.notes + ' ' + e.location).toLowerCase().includes(q)); },
    getPrefs: () => JSON.parse(JSON.stringify(D.prefs)),
    async setPrefs(p) { Object.assign(D.prefs, p, { _updated: now() }); persist(); emit('prefs'); },
    local(k, v) { if (v === undefined) { try { return JSON.parse(localStorage.getItem('zc.' + k)); } catch { return null; } } localStorage.setItem('zc.' + k, JSON.stringify(v)); },
    async putBlob(blob, { name } = {}) { const id = U.uid(); blobs.set(id, blob); emit('blobs'); return id; },
    async getBlob(id) { return blobs.get(id) || null; },
    async blobURL(id) { if (!blobURLs.has(id)) { const b = blobs.get(id); if (!b) return null; blobURLs.set(id, URL.createObjectURL(b)); } return blobURLs.get(id); },
    async deleteBlob(id) { blobs.delete(id); },
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    exportJSON: () => JSON.parse(JSON.stringify({ app: 'zencalendar', version: 1, ...D })),
    async importJSON(obj, { merge = true } = {}) { if (!merge) { D.events = {}; } Object.assign(D.events, obj.events || {}); Object.assign(D.calendars, obj.calendars || {}); persist(); emit('events'); emit('calendars'); },
  };

  // ---------- nlp (muy básico) ----------
  const WD = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6 };
  ZC.nlp = {
    parse(text, { now: nw = new Date() } = {}) {
      let t = ' ' + String(text || '') + ' ', d = null, time = null, loc = '', rem = [], kind = 'event', rrule = null;
      if (!text || text.trim().length < 2) return null;
      if (/recu[eé]rdame|tarea/i.test(t)) { kind = 'task'; t = t.replace(/recu[eé]rdame( que)?|tarea:?/i, ' '); }
      t = t.replace(/ avísame (\d+) ?(min|minutos|h|horas?) antes/i, (m, n, u) => { rem.push(+n * (/^h/.test(u) ? 60 : 1)); return ' '; });
      t = t.replace(/ y recu[eé]rdamelo (\d+) ?(min|minutos|h|horas?) antes/i, (m, n, u) => { rem.push(+n * (/^h/.test(u) ? 60 : 1)); return ' '; });
      if (/ pasado mañana /i.test(t)) { d = addDays(nw, 2); t = t.replace(/ pasado mañana /i, ' '); }
      else if (/ mañana /i.test(t)) { d = addDays(nw, 1); t = t.replace(/ mañana /i, ' '); }
      else if (/ hoy /i.test(t)) { d = new Date(nw); t = t.replace(/ hoy /i, ' '); }
      t = t.replace(/ cada (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo) /i, (m, w) => { const k = WD[w.toLowerCase()]; d = addDays(nw, (k - nw.getDay() + 7) % 7); rrule = { freq: 'weekly', interval: 1, byDay: [DAYS[k]], until: null, count: null }; return ' '; });
      t = t.replace(/ (el )?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo) /i, (m, _, w) => { const k = WD[w.toLowerCase()]; d = addDays(nw, ((k - nw.getDay() + 7) % 7) || 7); return ' '; });
      t = t.replace(/ a las (\d{1,2})(?::(\d{2}))?( de la (tarde|noche))? /i, (m, h, mi, x) => { h = +h; if (x || h < 8) h = h < 12 ? h + 12 : h; time = [h, +(mi || 0)]; return ' '; });
      t = t.replace(/ (\d{1,2}):(\d{2}) /, (m, h, mi) => { time = [+h, +mi]; return ' '; });
      t = t.replace(/ en ([A-ZÁÉÍÓÚ][\wáéíóúñ]*(?: [A-ZÁÉÍÓÚ][\wáéíóúñ]*)*) /, (m, l) => { loc = l; return ' '; });
      const title = t.replace(/\s+/g, ' ').trim().replace(/^./, c => c.toUpperCase());
      if (!d && !time && !loc && !rrule && kind !== 'task') return { kind, title, start: null, end: null, allDay: false, location: '', reminders: rem, rrule: null, confidence: 0.2 };
      d = d || new Date(nw);
      let start, end, allDay = !time;
      if (time) { const s = new Date(d); s.setHours(time[0], time[1], 0, 0); start = U.toLocal(s); end = kind === 'task' ? start : U.toLocal(U.addMinutes(s, 60)); }
      else { start = end = ymd(d); }
      return { kind, title, start, end, allDay, location: loc, reminders: rem, rrule, confidence: 0.8 };
    },
  };

  // ---------- platform ----------
  const qs = new URLSearchParams(location.search);
  ZC.platform = {
    kind: qs.get('plat') || 'web',
    hasTitlebar: qs.get('plat') === 'desktop',
    win: { minimize() {}, maximize() {}, close() {}, onState() {} },
    setTheme(t) { window.__lastTheme = t; },
    openExternal(u) { window.open(u, '_blank'); },
    share() {},
    appIcons: [{ id: 'default', name: 'Lavanda', src: 'img/ui/logo.svg' }, { id: 'mint', name: 'Menta', src: 'img/ui/logo.svg' }, { id: 'peach', name: 'Melocotón', src: 'img/ui/logo.svg' }],
    setAppIcon() {},
    desktopWidget() {}, desktopWidgetOn: () => false, setAutostart() {}, autostart: () => false,
    onOpen() {}, notifyPermission: async () => 'granted', canPinWidget: () => qs.get('plat') === 'android', pinWidget() {},
  };
  ZC.reminders = { snoozeOptions: [5, 10, 30, 60], next: () => [] };

  // ---------- drive ----------
  let ds = { connected: false, email: '', name: '', photo: '', lastSync: null, syncing: false, error: null };
  const dl = [];
  ZC.drive = {
    available: () => qs.get('drive') !== 'off',
    state: () => ({ ...ds }),
    async connect() { ds = { ...ds, syncing: true }; dl.forEach(f => f(ds)); await new Promise(r => setTimeout(r, 800)); ds = { connected: true, email: 'lluc@example.com', name: 'Lluc', photo: '', lastSync: Date.now(), syncing: false, error: null }; dl.forEach(f => f(ds)); },
    async disconnect() { ds = { connected: false, email: '', name: '', photo: '', lastSync: null, syncing: false, error: null }; dl.forEach(f => f(ds)); },
    async sync() { ds.syncing = true; dl.forEach(f => f(ds)); await new Promise(r => setTimeout(r, 600)); ds.syncing = false; ds.lastSync = Date.now(); dl.forEach(f => f(ds)); },
    on(e, fn) { dl.push(fn); },
  };

  // ---------- ai ----------
  let aiCfg = { provider: 'rules', model: '', baseUrl: '', autoApply: false };
  const keys = {};
  ZC.ai = {
    providers: [
      { id: 'rules', name: 'Integrado', free: true, offline: true, needsKey: false, desc: 'Entiende frases sencillas sin internet. Instantáneo y privado.' },
      { id: 'device', name: 'Modelo privado en el dispositivo', free: true, offline: true, needsKey: false, desc: 'Un modelo abierto que se descarga una vez y funciona sin internet (WebGPU).' },
      { id: 'ollama', name: 'Ollama (PC)', free: true, offline: true, needsKey: false, defaultModel: 'llama3.2', desc: 'Usa los modelos que tengas instalados en Ollama.' },
      { id: 'gemini', name: 'Google Gemini', free: true, offline: false, needsKey: true, keyUrl: 'https://aistudio.google.com/apikey', defaultModel: 'gemini-2.0-flash', vision: true, desc: 'Gratis con una clave de Google AI Studio. Entiende fotos.' },
      { id: 'groq', name: 'Groq', free: true, offline: false, needsKey: true, keyUrl: 'https://console.groq.com/keys', defaultModel: 'llama-3.3-70b-versatile', desc: 'Gratis con clave, muy rápido.' },
      { id: 'openrouter', name: 'OpenRouter', free: true, offline: false, needsKey: true, keyUrl: 'https://openrouter.ai/keys', defaultModel: 'meta-llama/llama-3.3-70b-instruct:free', desc: 'Muchos modelos, algunos gratis.' },
      { id: 'openai', name: 'OpenAI', free: false, offline: false, needsKey: true, keyUrl: 'https://platform.openai.com/api-keys', defaultModel: 'gpt-4o-mini', vision: true, desc: 'De pago.' },
      { id: 'anthropic', name: 'Anthropic Claude', free: false, offline: false, needsKey: true, keyUrl: 'https://console.anthropic.com/', defaultModel: 'claude-haiku', vision: true, desc: 'De pago.' },
      { id: 'mistral', name: 'Mistral', free: false, offline: false, needsKey: true, keyUrl: 'https://console.mistral.ai/', defaultModel: 'mistral-small-latest', desc: 'De pago (tiene nivel gratuito).' },
      { id: 'custom', name: 'Otro (compatible con OpenAI)', free: false, offline: false, needsKey: true, desc: 'Cualquier URL compatible con la API de OpenAI.' },
    ],
    getConfig: () => ({ ...aiCfg, hasKey: !!keys[aiCfg.provider] }),
    setConfig(p) { Object.assign(aiCfg, p); },
    setKey(p, k) { keys[p] = k; }, hasKey: p => !!keys[p],
    async test() { await new Promise(r => setTimeout(r, 500)); return { ok: true, message: 'Conexión correcta' }; },
    async run(text, { onToken } = {}) {
      await new Promise(r => setTimeout(r, 400));
      if (/qu[eé] tengo/i.test(text)) {
        const t0 = /mañana/.test(text) ? addDays(startOfDay(new Date()), 1) : startOfDay(new Date());
        const occ = ZC.store.occurrences(t0, addDays(t0, 1));
        const reply = occ.length ? 'Tienes ' + occ.length + ' cosas:\n' + occ.map(o => '• ' + (o.allDay ? '' : U.pad(o.start.getHours()) + ':' + U.pad(o.start.getMinutes()) + ' ') + o.ev.title).join('\n') : 'No tienes nada. ¡Día libre!';
        if (onToken) for (const ch of reply.match(/.{1,6}/gs)) { onToken(ch); await new Promise(r => setTimeout(r, 15)); }
        return { reply, actions: [], provider: 'rules' };
      }
      const m = text.match(/mueve (?:el |la )?(.+?) al (\w+)/i);
      if (m) { const ev = ZC.store.search(m[1])[0]; if (ev) { const p = ZC.nlp.parse('x el ' + m[2]); const s = parse(ev.start), ns = parse(p.start); ns.setHours(s.getHours(), s.getMinutes()); const dur = parse(ev.end) - s; return { reply: `Muevo «${ev.title}» al ${m[2]}.`, actions: [{ type: 'update', id: ev.id, changes: { start: U.toLocal(ns, ev.allDay), end: U.toLocal(new Date(ns.getTime() + dur), ev.allDay) } }], provider: 'rules' }; } }
      const p = ZC.nlp.parse(text);
      if (!p || !p.start) return { reply: 'No he entendido qué quieres hacer. Prueba con algo como «cena con Marta el viernes a las 9».', actions: [], provider: 'rules' };
      return { reply: 'Vale, te lo apunto:', actions: [{ type: 'create', event: { kind: p.kind, title: p.title, start: p.start, end: p.end, allDay: p.allDay, location: p.location, reminders: p.reminders, rrule: p.rrule, calendarId: 'personal' } }], provider: 'rules' };
    },
    async apply(actions) {
      const out = [];
      for (const a of actions) {
        if (a.type === 'create') out.push(await ZC.store.saveEvent(a.event));
        if (a.type === 'update') out.push(await ZC.store.saveEvent({ id: a.id, ...a.changes }));
        if (a.type === 'delete') await ZC.store.deleteEvent(a.id);
        if (a.type === 'complete') out.push(await ZC.store.toggleDone(a.id));
      }
      return out;
    },
    device: {
      supported: () => !!navigator.gpu || true,
      _s: { ready: false, downloading: false, progress: 0, model: 'Qwen2.5 1.5B', sizeMB: 900 },
      status() { return { ...this._s }; },
      async download(cb) { this._s.downloading = true; for (let i = 1; i <= 20; i++) { await new Promise(r => setTimeout(r, 80)); this._s.progress = i / 20; cb && cb(this._s.progress); } this._s.downloading = false; this._s.ready = true; },
      async remove() { this._s.ready = false; this._s.progress = 0; },
      models: [{ id: 'qwen', name: 'Qwen2.5 1.5B', sizeMB: 900 }],
    },
    async ollamaModels() { return ['llama3.2', 'qwen2.5']; },
  };

  // ---------- ics ----------
  ZC.ics = {
    parse(text) {
      const out = []; let cur = null;
      const un = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
      const dt = v => { const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/); if (!m) return null; return m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`; };
      for (const line of un) {
        if (line === 'BEGIN:VEVENT') cur = { kind: 'event', title: '', notes: '', location: '' };
        else if (line === 'END:VEVENT' && cur) { cur.allDay = !String(cur.start).includes('T'); if (!cur.end) cur.end = cur.start; else if (cur.allDay) cur.end = ymd(addDays(parse(cur.end), -1)); out.push(cur); cur = null; }
        else if (cur) { const i = line.indexOf(':'); const k = line.slice(0, i).split(';')[0], v = line.slice(i + 1); if (k === 'SUMMARY') cur.title = v; if (k === 'DESCRIPTION') cur.notes = v.replace(/\\n/g, '\n'); if (k === 'LOCATION') cur.location = v; if (k === 'DTSTART') cur.start = dt(v); if (k === 'DTEND') cur.end = dt(v); }
      }
      return out;
    },
    build(events) {
      const f = s => s.replace(/[-:]/g, '') + (s.includes('T') ? '00' : '');
      return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZenCalendar//ES', ...events.flatMap(e => ['BEGIN:VEVENT', 'UID:' + e.id, 'SUMMARY:' + e.title, (e.allDay ? 'DTSTART;VALUE=DATE:' : 'DTSTART:') + f(e.start), (e.allDay ? 'DTEND;VALUE=DATE:' + f(ymd(addDays(parse(e.end), 1))) : 'DTEND:' + f(e.end)), 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
    },
  };

  ZC.core = {
    version: '0.0.0-mock',
    async init() { await ZC.store.init(); },
    on(ev, fn) { ZC.platform.onOpen(fn); },
  };
})();
