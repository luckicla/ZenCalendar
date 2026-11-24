'use strict';
// ZenCalendar: Google Calendar con varias cuentas, en las dos direcciones.
//
// Cada cuenta de Google conectada trae sus calendarios como calendarios de
// ZenCalendar (id 'g:<cuenta>:<calendario>') y sus eventos (id 'g:…'). Lo que se
// crea, cambia o borra aquí en un calendario de Google se hace también en Google
// Calendar, y lo de Google aparece aquí. Todo con la API REST v3 de Google
// Calendar y ZC.net.fetch (en Android y Windows la petición la hace el lado
// nativo: sin CORS).
//
//   - Lo de Google NO va al zencalendar.json de Drive: cada dispositivo lo baja de
//     Google. Por Drive viaja solo la lista de cuentas (sin tokens), en
//     prefs.gcal, para que en el otro dispositivo salga «Conecta también aquí…».
//   - Sincronización incremental con syncToken por calendario (y completa cuando
//     caduca: 410). Primero se sube lo de aquí (con If-Match/etag; si Google lo
//     cambió mientras, 412, se junta campo a campo y en caso de choque gana
//     Google) y luego se baja lo de Google.
//   - Tokens por cuenta: web → Google Identity Services; Windows → el proceso
//     principal (desktop/google.js, un refresh token por cuenta); Android →
//     AuthorizationClient con la cuenta elegida (GoogleAuth.java).
//
// Modo simulado para probar la interfaz sin Google: await ZC.gcal._mock(cuentas)
// (ver web/js/core/gcal-mock.js y docs/CONTRATO.md).
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const API = 'https://www.googleapis.com/calendar/v3';
  const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';
  const SCOPES = 'https://www.googleapis.com/auth/calendar openid email profile';
  const EVERY = 5 * 60000;        // cada 5 min
  const AFTER_CHANGE = 2000;      // y 2 s después de cada cambio
  const CAL_LIST_EVERY = 30 * 60000;
  const ACC_COLORS = ['#C9B8FF', '#FFC8E3', '#BFF0E4', '#FFD8B8', '#A9D8FF', '#FFF1B8', '#D7F5C2'];
  // colores de evento de Google (colorId → hex), los de siempre de /colors
  const GCOLORS = { 1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e', 7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000' };
  // lo que se compara para saber qué ha cambiado (y lo que se junta si hay choque)
  const FIELDS = ['title', 'notes', 'location', 'allDay', 'start', 'end', 'rrule', 'exdates', 'reminders', 'color', 'emoji', 'alarm', 'alarmTime', 'checklist', 'kind', 'done', 'doneDates', 'attachments'];
  const ZC_PROPS = ['kind', 'done', 'doneDates', 'emoji', 'alarm', 'alarmTime', 'checklist', 'attachments', 'reminders', 'color'];

  const U = () => ZC.util;
  const S = () => ZC.store;
  const cfg = () => ZC.config || {};
  const kind = () => (ZC.platform && ZC.platform.kind) || 'web';
  let bus = null;
  const E = () => (bus = bus || U().emitter());
  const on = (type, fn) => E().on(type, fn);

  let MOCK = null;                // servidor simulado (gcal-mock.js)
  let started = false;
  const tokens = new Map();       // cuenta → { token, exp } (en memoria)
  const running = new Map();      // cuenta → promesa de la sync en marcha
  const again = new Set();
  let timer = null, retryTimer = null;

  // ---------- utilidades ----------
  function fnv(s) {
    let h = 0x811c9dc5;
    s = String(s || '');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(36);
  }
  const accId = email => 'a' + fnv(String(email || '').trim().toLowerCase());
  const calKey = gid => fnv(gid);
  const zcCalId = (aid, gid) => 'g:' + aid + ':' + gid;
  const evId = (aid, gid, geid) => 'g:' + aid + ':' + calKey(gid) + ':' + geid;
  const st = o => S().stable(o);
  const eq = (a, b) => st(a == null ? null : a) === st(b == null ? null : b);
  const clone = o => U().clone(o);
  const dirty = e => !!e && (e.updated || 0) > (e.gSynced || 0);
  const isReadOnlyRole = r => r === 'reader' || r === 'freeBusyReader';
  const enc = encodeURIComponent;

  // ---------- datos: cuentas (prefs.gcal, viajan por Drive) y estado de este dispositivo ----------
  function gprefs() { return (S().getPrefs().gcal) || {}; }
  function rawAccounts() { return Object.assign({}, gprefs().accounts || {}); }
  function account(id) { const a = rawAccounts()[id]; return a && !a.removed ? a : null; }
  async function saveAccount(a) {
    const all = rawAccounts();
    const prev = all[a.id];
    a = Object.assign({}, a, { updated: Math.max(Date.now(), ((prev && prev.updated) || 0) + 1) });
    all[a.id] = a;
    await S().setPrefs({ gcal: Object.assign({}, gprefs(), { accounts: all }) });
    return a;
  }

  // lo de este dispositivo (no viaja): { [cuenta]: { here, lastSync, error, reauth, tokens: { gid: syncToken }, calSync, complex: { gid: [ids] }, defaults: { gid: [min] } } }
  function locals() { return S().local('gcal') || {}; }
  function L(id) { const all = locals(); return all[id] || { here: false, tokens: {}, complex: {}, defaults: {} }; }
  function setL(id, patch) {
    const all = locals();
    const cur = all[id] || { here: false, tokens: {}, complex: {}, defaults: {} };
    if (patch === null) delete all[id];
    else all[id] = Object.assign({}, cur, patch);
    S().local('gcal', all);
  }
  const syncing = new Set();

  /** Las cuentas (también las conectadas solo en otro dispositivo: connected: false). */
  function accounts() {
    const out = [];
    for (const a of Object.values(rawAccounts())) {
      if (!a || a.removed) continue;
      const l = L(a.id);
      out.push({
        id: a.id, email: a.email, name: a.name || '', photo: a.photo || '', color: a.color,
        calendars: (a.calendars || []).map(c => ({
          gid: c.gid, id: zcCalId(a.id, c.gid), name: c.name, color: c.color, primary: !!c.primary,
          accessRole: c.accessRole, readOnly: isReadOnlyRole(c.accessRole), enabled: c.enabled !== false,
        })),
        connected: !!l.here, lastSync: l.lastSync || null, error: l.here ? (l.error || null) : null,
        reauth: !!(l.here && l.reauth), syncing: syncing.has(a.id),
        isDrive: !!(ZC.drive && ZC.drive.state && ZC.drive.state().email && ZC.drive.state().email.toLowerCase() === String(a.email).toLowerCase()),
        added: a.added || 0,
      });
    }
    return out.sort((x, y) => (x.added || 0) - (y.added || 0) || String(x.email).localeCompare(y.email));
  }
  function emit() { E().emit('state', accounts()); }
  function state() { return { available: available(), syncing: syncing.size > 0, accounts: accounts() }; }

  function available() {
    if (MOCK) return true;
    const C = cfg();
    if (kind() === 'android') return !!(root.ZCAndroid && root.ZCAndroid.googleAccount && (C.googleAndroid === '1' || C.googleWebClientId));
    if (kind() === 'desktop') return !!(C.googleDesktopClientId && C.googleDesktopClientSecret && root.zcDesktop && root.zcDesktop.google);
    if (!C.googleWebClientId) return false;
    try { return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'; } catch (e) { return false; }
  }

  // ---------- errores ----------
  function authError(msg, soft) {
    const e = new Error(msg || 'Hay que volver a conectar esta cuenta');
    e.auth = true; e.soft = !!soft;
    return e;
  }
  function friendly(e) {
    if (!e) return 'Algo ha fallado';
    if (e.network) return 'Sin conexión: se sincroniza sola cuando vuelva internet';
    if (e.auth) return e.message;
    if (e.status >= 500 || e.status === 429) return 'Google Calendar no responde ahora; se vuelve a intentar en un rato';
    return 'No se pudo sincronizar: ' + (e.message || e);
  }

  // ---------- inicio de sesión (uno por plataforma) ----------
  const scopes = () => cfg().googleCalendarScopes || SCOPES;
  const desktopCfg = extra => Object.assign({ clientId: cfg().googleDesktopClientId, clientSecret: cfg().googleDesktopClientSecret, scopes: scopes() }, extra || {});
  const driveEmail = () => { try { return String((ZC.drive && ZC.drive.state().email) || '').toLowerCase(); } catch (e) { return ''; } };

  // --- web: Google Identity Services (token client) ---
  let gisP = null, gestureArmed = false;
  function loadGIS() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    if (gisP) return gisP;
    gisP = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => { gisP = null; const e = new Error('No se pudo cargar Google'); e.network = true; ko(e); };
      document.head.appendChild(s);
    });
    return gisP;
  }
  function gisToken(email, prompt) {
    return loadGIS().then(() => new Promise((ok, ko) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: cfg().googleWebClientId,
        scope: scopes(),
        include_granted_scopes: true,
        login_hint: email || undefined,
        callback: r => {
          if (!r || r.error) { ko(authError(r && (r.error === 'access_denied' || r.error_description === 'access_denied') ? 'No diste permiso a ZenCalendar' : 'No se pudo conectar con Google')); return; }
          if (google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(r, 'https://www.googleapis.com/auth/calendar')) {
            ko(authError('Hace falta marcar el permiso de Google Calendar')); return;
          }
          ok({ token: r.access_token, exp: Date.now() + (+r.expires_in || 3600) * 1000 });
        },
        error_callback: e => ko(authError(e && e.type === 'popup_closed' ? 'Se cerró la ventana de Google' : e && e.type === 'popup_failed_to_open' ? 'El navegador bloqueó la ventana de Google' : 'No se pudo conectar con Google')),
      });
      tc.requestAccessToken({ prompt });
    }));
  }
  const webCache = () => S().local('gcal.tok') || {};
  function webSave(email, t) { const c = webCache(); if (t) c[email] = t; else delete c[email]; S().local('gcal.tok', c); }
  // el siguiente toque en la página renueva la sesión de una cuenta caducada (una por toque: el navegador solo deja una ventana)
  function armGesture() {
    if (gestureArmed || !root.document) return;
    gestureArmed = true;
    loadGIS().catch(() => {});
    const go = () => {
      document.removeEventListener('pointerdown', go, true);
      gestureArmed = false;
      const acc = accounts().find(a => a.connected && a.reauth && L(a.id).soft);
      if (!acc) return;
      getToken(acc, true).then(() => sync(acc.id)).catch(() => {});
    };
    document.addEventListener('pointerdown', go, true);
  }

  const WEB = {
    async add(opts) {
      // con correo (la cuenta de Drive, o volver a conectar): sin selector, solo el permiso que falte
      const t = await gisToken(opts.email || '', opts.email ? '' : 'select_account');
      return t;
    },
    async token(email, interactive) {
      const c = webCache()[email];
      if (c && c.token && c.exp > Date.now() + 60000) return c;
      const activated = root.navigator && navigator.userActivation ? navigator.userActivation.isActive : false;
      if (!interactive && !activated) { armGesture(); throw authError('La sesión de Google ha caducado: toca la app para seguir', true); }
      const t = await gisToken(email, '');
      webSave(email, t);
      return t;
    },
    save(email, t) { webSave(email, t); },
    async remove(email, token, revoke) {
      webSave(email, null);
      if (revoke && token && root.google && google.accounts && google.accounts.oauth2 && google.accounts.oauth2.revoke) { try { google.accounts.oauth2.revoke(token, () => {}); } catch (e) {} }
    },
  };

  const DESKTOP = {
    async add(opts) {
      const r = await root.zcDesktop.google('add', desktopCfg({ loginHint: opts.email || '' }));
      if (!r || !r.access_token) throw authError(r && r.error ? r.error : 'No se pudo conectar con Google');
      return { token: r.access_token, exp: r.expires_at || Date.now() + 50 * 60000, email: r.email || '' };
    },
    async token(email) {
      const r = await root.zcDesktop.google('token', desktopCfg({ account: email }));
      if (!r || !r.access_token) {
        if (r && r.error === 'offline') { const e = new Error('Sin conexión'); e.network = true; throw e; }
        throw authError();
      }
      return { token: r.access_token, exp: r.expires_at || Date.now() + 50 * 60000 };
    },
    save() {},
    async remove(email, token, revoke) { await root.zcDesktop.google('remove', { account: email, revoke: !!revoke }); },
  };

  function androidErr(r) {
    if (r && r.network) { const e = new Error('Sin conexión'); e.network = true; return e; }
    let msg = r && r.cancelled ? 'Se canceló el inicio de sesión' : r && r.needsConsent ? 'Hay que volver a conectar esta cuenta' : (r && r.error) || null;
    if (msg && /\b10\b|DEVELOPER_ERROR|developer|not registered|unregistered|API_NOT_CONNECTED|\b17\b/i.test(msg)) msg = 'Google aún no reconoce esta versión de la app (falta registrarla en Google Cloud).';
    return authError(msg);
  }
  const ANDROID = {
    async add(opts) {
      const r = await ZC.native.call('googleAccount', opts.email || '', true, scopes());
      if (!r || !r.token) throw androidErr(r);
      return { token: r.token, exp: Date.now() + 50 * 60000, email: r.email || '' };
    },
    async token(email, interactive) {
      const r = await ZC.native.call('googleAccount', email, !!interactive, scopes());
      if (!r || !r.token) throw androidErr(r);
      return { token: r.token, exp: Date.now() + 50 * 60000 };
    },
    save() {},
    async remove(email, token, revoke) {
      if (token && root.ZCAndroid && root.ZCAndroid.googleClear) root.ZCAndroid.googleClear(token);
      if (revoke && token) await ZC.net.fetch('https://oauth2.googleapis.com/revoke?token=' + enc(token), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }).catch(() => {});
    },
  };

  const AUTH = () => MOCK ? MOCK.auth : kind() === 'desktop' ? DESKTOP : kind() === 'android' ? ANDROID : WEB;

  async function getToken(acc, interactive) {
    const c = tokens.get(acc.id);
    if (c && c.exp > Date.now() + 60000) return c.token;
    try {
      const t = await AUTH().token(acc.email, interactive);
      tokens.set(acc.id, t);
      if (L(acc.id).reauth) setL(acc.id, { reauth: false, soft: false });
      return t.token;
    } catch (e) {
      if (e.auth) setL(acc.id, { reauth: true, soft: !!e.soft });
      throw e;
    }
  }

  // ---------- peticiones ----------
  const http = (url, opts) => (MOCK ? MOCK.fetch(url, opts) : ZC.net.fetch(url, opts));

  /** Petición a Google con el token de la cuenta. opts: { method, query, body, headers, allow: [estados que no son error] } → { status, json } */
  async function api(acc, path, opts, attempt) {
    opts = opts || {}; attempt = attempt || 0;
    const tok = opts.token || await getToken(acc, false);
    let url = /^https?:/.test(path) ? path : API + path;
    if (opts.query) {
      const q = Object.keys(opts.query).filter(k => opts.query[k] != null && opts.query[k] !== '').map(k => enc(k) + '=' + enc(opts.query[k])).join('&');
      if (q) url += (url.includes('?') ? '&' : '?') + q;
    }
    const headers = Object.assign({ Authorization: 'Bearer ' + tok }, opts.headers || {});
    let body;
    if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
    const r = await http(url, { method: opts.method || 'GET', headers, body, timeout: opts.timeout || 60000 });
    if (r.status === 401 && attempt < 1 && !opts.token) { tokens.delete(acc.id); return api(acc, path, opts, attempt + 1); }
    let json = null;
    try { const text = await r.text(); json = text ? JSON.parse(text) : null; } catch (e) {}
    let reason = '';
    if (r.status === 403 || r.status === 429) reason = (((json && json.error && json.error.errors) || [])[0] || {}).reason || '';
    if ((r.status === 429 || r.status >= 500 || /rateLimit/i.test(reason)) && attempt < 4) {
      await U().sleep((MOCK ? 5 : 800) * Math.pow(2, attempt) + Math.random() * (MOCK ? 5 : 400));
      return api(acc, path, opts, attempt + 1);
    }
    if (!r.ok && !(opts.allow || []).includes(r.status)) {
      const msg = (json && json.error && (json.error.message || json.error)) || ('HTTP ' + r.status);
      const e = new Error(typeof msg === 'string' ? msg : 'HTTP ' + r.status); e.status = r.status;
      if (r.status === 401 || (r.status === 403 && /insufficient|scope|auth/i.test(e.message))) {
        e.auth = true; e.message = 'Hay que volver a conectar esta cuenta';
        if (acc.id !== '_') { tokens.delete(acc.id); setL(acc.id, { reauth: true, soft: false }); }
      }
      throw e;
    }
    return { status: r.status, json };
  }

  // ---------- Google → ZenCalendar ----------
  function htmlToText(s) {
    s = String(s || '');
    if (!/<[a-z!/]/i.test(s)) return s;
    return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, (m, href, txt) => txt && txt !== href ? txt + ' (' + href + ')' : href)
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  // lo que ZenCalendar sabe repetir; si no, la serie se trae como apariciones sueltas
  const RR_KEYS = ['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'WKST', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS'];
  function parseRecurrence(lines, startLocal, allDay) {
    const u = U();
    const rr = [], ex = [];
    let complex = false;
    for (const line of lines || []) {
      const l = String(line);
      if (/^RRULE:/i.test(l)) rr.push(l.slice(6));
      else if (/^EXDATE/i.test(l)) ex.push(l);
      else complex = true; // RDATE, EXRULE…
    }
    if (rr.length !== 1) complex = true;
    let rule = null;
    if (!complex) {
      const p = {};
      for (const kv of rr[0].split(';')) { const i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1).toUpperCase(); }
      const s = u.parse(startLocal);
      const freq = p.FREQ;
      if (Object.keys(p).some(k => !RR_KEYS.includes(k))) complex = true;
      if (p.BYMONTHDAY && (!/^(MONTHLY|YEARLY)$/.test(freq) || p.BYMONTHDAY.includes(',') || +p.BYMONTHDAY !== s.getDate())) complex = true;
      if (p.BYMONTH && (freq !== 'YEARLY' || p.BYMONTH.includes(',') || +p.BYMONTH !== s.getMonth() + 1)) complex = true;
      if (p.BYSETPOS && (freq !== 'MONTHLY' || p.BYSETPOS.includes(','))) complex = true;
      if (p.BYDAY) {
        if (freq === 'YEARLY') complex = true;
        if (freq === 'MONTHLY' && (p.BYDAY.includes(',') || p.BYMONTHDAY)) complex = true;
        if ((freq === 'WEEKLY' || freq === 'DAILY') && /\d/.test(p.BYDAY)) complex = true;
      }
      if (!complex) {
        rule = ZC.ics.parseRRule(rr[0], startLocal);
        if (!rule) complex = true;
      }
    }
    const exdates = [];
    for (const l of ex) {
      const i = l.indexOf(':');
      if (i < 0) continue;
      const params = {};
      for (const kv of l.slice(0, i).split(';').slice(1)) { const j = kv.indexOf('='); if (j > 0) params[kv.slice(0, j).toUpperCase()] = kv.slice(j + 1); }
      for (const v of l.slice(i + 1).split(',')) { const d = ZC.ics.icalDate(v.trim(), params); if (d) exdates.push(d.local.slice(0, 10)); }
    }
    return { rule: complex ? null : ZC.recur.normRule(rule), exdates, complex };
  }

  // privados de ZenCalendar en Google (extendedProperties.private): texto, 1000 letras por trozo
  function readProps(g) { return (g.extendedProperties && g.extendedProperties.private) || {}; }
  function readChunks(p, key) {
    const n = +p[key + 'N'];
    if (!(n > 0)) return p[key] || '';
    let s = '';
    for (let i = 0; i < n; i++) s += p[key + i] || '';
    return s;
  }
  function jsonOr(s, def) { try { const v = JSON.parse(s); return v == null ? def : v; } catch (e) { return def; } }

  function allDayRemToZC(m) { return m + 540; }                 // Google: antes de las 00:00 · ZenCalendar: antes de las 09:00
  function allDayRemToG(m) { return Math.max(0, m - 540); }

  /** Evento de Google → campos de ZenCalendar (sin id ni ficha). */
  function fromGoogle(g, cal, prev) {
    const u = U();
    const p = readProps(g);
    const allDay = !!(g.start && g.start.date);
    let start, end;
    if (allDay) {
      start = g.start.date;
      end = g.end && g.end.date ? u.ymd(u.addDays(u.parse(g.end.date), -1)) : start;
      if (end < start) end = start;
    } else {
      start = u.toLocal(new Date(g.start.dateTime), false);
      end = g.end && g.end.dateTime ? u.toLocal(new Date(g.end.dateTime), false) : start;
    }
    const out = {
      title: g.summary != null ? String(g.summary) : (cal && cal.accessRole === 'freeBusyReader' ? 'Ocupado' : ''),
      notes: htmlToText(g.description), location: g.location || '', allDay, start, end,
      rrule: null, exdates: [],
    };
    if (g.recurrence && g.recurrence.length) {
      const r = parseRecurrence(g.recurrence, start, allDay);
      out.rrule = r.rule;
      out.exdates = r.exdates;
    }
    if (prev && prev.gInstEx && out.rrule) out.exdates = [...new Set(out.exdates.concat(prev.gInstEx))];
    out.exdates.sort();
    // avisos
    let rem;
    const rr = g.reminders || {};
    if (rr.useDefault !== false) rem = (cal && cal.defaults) || [];
    else rem = (rr.overrides || []).map(o => +o.minutes).filter(n => isFinite(n));
    rem = [...new Set(rem)].sort((a, b) => a - b);
    let zcRem = allDay ? rem.map(allDayRemToZC) : rem;
    if (p.zcRem != null) {
      const mine = jsonOr(p.zcRem, null);
      if (Array.isArray(mine) && eq(mine.map(m => allDay ? allDayRemToG(m) : m).sort((a, b) => a - b), rem)) zcRem = mine;
    }
    out.reminders = [...new Set(zcRem)].sort((a, b) => a - b);
    // color: el exacto de ZenCalendar si sigue siendo el mismo colorId
    out.color = g.colorId && GCOLORS[g.colorId] ? GCOLORS[g.colorId] : null;
    if (p.zcColor && (g.colorId || '') === (nearestColorId(p.zcColor) || '')) out.color = p.zcColor;
    out.kind = p.zcKind === 'task' ? 'task' : 'event';
    out.done = p.zcDone === '1';
    out.doneDates = jsonOr(p.zcDoneDates || '', undefined);
    out.emoji = p.zcEmoji || null;
    out.alarm = p.zcAlarm === '1';
    out.alarmTime = p.zcAlarmTime || null;
    out.checklist = jsonOr(readChunks(p, 'zcChecklist'), []);
    out.attachments = jsonOr(readChunks(p, 'zcAtt'), []);
    if (out.kind === 'task') out.end = out.start;
    return out;
  }

  function nearestColorId(hex) {
    const c = U().rgb(hex);
    if (!c) return null;
    let best = null, bd = Infinity;
    for (const id of Object.keys(GCOLORS)) {
      const g = U().rgb(GCOLORS[id]);
      const d = (c[0] - g[0]) ** 2 + (c[1] - g[1]) ** 2 + (c[2] - g[2]) ** 2;
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  // ---------- ZenCalendar → Google ----------
  const ymdC = s => String(s).slice(0, 10).replace(/-/g, '');
  function utcStamp(d) {
    const p = U().pad;
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }
  function rruleLine(r, e) {
    const u = U();
    const R = ZC.recur.normRule(r);
    if (!R) return null;
    const parts = ['FREQ=' + R.freq.toUpperCase()];
    if (R.interval > 1) parts.push('INTERVAL=' + R.interval);
    if (R.freq === 'weekly' && R.byDay) parts.push('BYDAY=' + R.byDay.join(','));
    if (R.freq === 'monthly' && R.monthMode === 'weekday') {
      const s = u.parse(e.start);
      const n = R.nth || (ZC.recur.nthOf(s) === 5 ? -1 : ZC.recur.nthOf(s));
      parts.push('BYDAY=' + n + ZC.recur.DAYS[s.getDay()]);
    }
    if (R.count) parts.push('COUNT=' + R.count);
    else if (R.until) parts.push('UNTIL=' + (e.allDay ? ymdC(R.until) : utcStamp(new Date(u.parse(R.until).getTime() + 86399000))));
    return 'RRULE:' + parts.join(';');
  }
  function recurrenceOf(e, liveChildDates) {
    if (!e.rrule) return [];
    const out = [rruleLine(e.rrule, e)].filter(Boolean);
    const ex = (e.exdates || []).filter(d => !liveChildDates.has(d));
    if (ex.length) {
      if (e.allDay) out.push('EXDATE;VALUE=DATE:' + ex.map(ymdC).join(','));
      else {
        const hm = String(e.start).slice(11, 16).replace(':', '') + '00';
        out.push('EXDATE;TZID=' + (U().timeZone() || 'UTC') + ':' + ex.map(d => ymdC(d) + 'T' + hm).join(','));
      }
    }
    return out;
  }
  function gTime(e, which) {
    const u = U();
    if (e.allDay) {
      const d = which === 'start' ? e.start : u.ymd(u.addDays(u.parse(e.end || e.start), 1));
      return { date: d, dateTime: null, timeZone: null };
    }
    let v = which === 'start' ? e.start : e.end;
    if (e.kind === 'task' && which === 'end') v = u.toLocal(u.addMinutes(u.parse(e.start), 15), false);
    return { dateTime: v + ':00', timeZone: u.timeZone() || 'UTC', date: null };
  }
  function chunks(key, text, out) {
    const n = Math.ceil(text.length / 1000);
    out[key] = '';
    out[key + 'N'] = String(n);
    for (let i = 0; i < n; i++) out[key + i] = text.slice(i * 1000, (i + 1) * 1000);
  }
  function zcProps(e) {
    const p = {
      zcKind: e.kind === 'task' ? 'task' : '', zcDone: e.done ? '1' : '', zcDoneDates: e.doneDates && e.doneDates.length ? JSON.stringify(e.doneDates) : '',
      zcEmoji: e.emoji || '', zcAlarm: e.alarm ? '1' : '', zcAlarmTime: e.alarmTime || '',
      zcRem: JSON.stringify(e.reminders || []), zcColor: e.color || '',
    };
    chunks('zcChecklist', e.checklist && e.checklist.length ? JSON.stringify(e.checklist) : '', p);
    chunks('zcAtt', e.attachments && e.attachments.length ? JSON.stringify(e.attachments.map(a => ({ id: a.id, name: a.name, type: a.type, w: a.w, h: a.h }))) : '', p);
    return p;
  }

  /** Campos de ZenCalendar → cuerpo para Google (solo los de `fields`). */
  function toGoogle(e, fields, liveChildDates) {
    const f = new Set(fields);
    const b = {};
    if (f.has('title')) b.summary = e.title || '';
    if (f.has('notes')) b.description = e.notes || '';
    if (f.has('location')) b.location = e.location || '';
    if (f.has('start') || f.has('end') || f.has('allDay') || (f.has('kind') && e.kind === 'task')) { b.start = gTime(e, 'start'); b.end = gTime(e, 'end'); }
    if (f.has('rrule')) b.recurrence = recurrenceOf(e, liveChildDates || new Set());
    if (f.has('reminders')) {
      const rem = (e.reminders || []).map(m => e.allDay ? allDayRemToG(m) : m).filter(m => m <= 40320);
      b.reminders = { useDefault: false, overrides: [...new Set(rem)].sort((x, y) => x - y).slice(0, 5).map(m => ({ method: 'popup', minutes: m })) };
    }
    if (f.has('color')) b.colorId = e.color ? nearestColorId(e.color) : null;
    if (ZC_PROPS.some(k => f.has(k))) b.extendedProperties = { private: zcProps(e) };
    return b;
  }

  function changedFields(e, base) {
    if (!base) return FIELDS.slice();
    return FIELDS.filter(k => !eq(e[k], base[k]));
  }
  // lo de aquí que cambió (respecto a la última versión de Google) y Google no tocó, se queda; lo demás, como Google
  function merge3(local, base, remote) {
    const out = Object.assign({}, remote), ours = [];
    for (const k of FIELDS) {
      if (base && !eq(local[k], base[k]) && eq(remote[k], base[k])) { out[k] = local[k]; ours.push(k); }
    }
    return { fields: out, ours };
  }
  const baseOf = e => { const b = {}; for (const k of FIELDS) b[k] = e[k] === undefined ? null : clone(e[k]); return b; };

  // ---------- escribir en el store ----------
  function gcal(acc, gid) {
    const a = account(acc.id) || acc;
    const c = (a.calendars || []).find(x => x.gid === gid);
    return c ? Object.assign({ defaults: (L(acc.id).defaults || {})[gid] || [] }, c) : { gid, accessRole: 'owner', defaults: [] };
  }

  /** Crea el evento de ZenCalendar a partir del de Google (prev = el de aquí, si había). */
  function buildLocal(acc, gid, g, prev, extra) {
    const cal = gcal(acc, gid);
    const mapped = fromGoogle(g, cal, prev);
    const fields = Object.assign({}, mapped);
    if (prev && !prev.deleted) { fields.attachments = mapped.attachments.length ? mapped.attachments : (prev.attachments || []); }
    const base = Object.assign({ id: prev ? prev.id : evId(acc.id, gid, g.id), calendarId: zcCalId(acc.id, gid), recurrenceOf: null }, fields, extra || {});
    const ev = S().normEvent(base, prev && !prev.deleted ? prev : null);
    Object.assign(ev, {
      id: base.id, calendarId: zcCalId(acc.id, gid),
      source: 'google', accountId: acc.id, gid, gEventId: g.id, etag: g.etag || null, gUpdated: g.updated || null,
      htmlLink: g.htmlLink || null, readOnly: isReadOnlyRole(cal.accessRole), gBase: baseOf(Object.assign({}, mapped, extra && extra.exdates ? { exdates: extra.exdates } : {})),
      gError: undefined,
    });
    if (prev && prev.gInstEx && !('gInstEx' in (extra || {}))) ev.gInstEx = prev.gInstEx;
    if (extra && extra.gSeries) ev.gSeries = extra.gSeries;
    if (prev && prev.created) ev.created = prev.created;
    ev.gSynced = ev.updated;
    return ev;
  }

  // ---------- calendarios ----------
  function defaultEnabled(item) {
    // los de festivos, cumpleaños de contactos, números de semana… salen en la lista pero desactivados
    return !(isReadOnlyRole(item.accessRole) && /group\.v\.calendar\.google\.com$/i.test(item.id || ''));
  }

  async function fetchCalendarList(acc, token) {
    const out = [];
    let page = '';
    do {
      const r = await api(acc, '/users/me/calendarList', { token, query: { maxResults: 250, pageToken: page } });
      out.push(...((r.json && r.json.items) || []));
      page = (r.json && r.json.nextPageToken) || '';
    } while (page);
    return out.filter(i => !i.deleted);
  }

  function mergeCalendarList(prevCals, items) {
    const prev = new Map((prevCals || []).map(c => [c.gid, c]));
    return items.map(i => {
      const p = prev.get(i.id);
      return {
        gid: i.id, name: i.summaryOverride || i.summary || i.id,
        color: p && p.customColor ? p.color : (i.backgroundColor || (p && p.color) || '#C9B8FF'),
        customColor: !!(p && p.customColor),
        primary: !!i.primary, accessRole: i.accessRole || 'reader',
        enabled: p ? p.enabled !== false : defaultEnabled(i),
      };
    }).sort((a, b) => (b.primary - a.primary) || (isReadOnlyRole(a.accessRole) - isReadOnlyRole(b.accessRole)) || String(a.name).localeCompare(b.name));
  }

  async function refreshCalendars(acc, token) {
    const items = await fetchCalendarList(acc, token);
    const cur = account(acc.id) || acc;
    const cals = mergeCalendarList(cur.calendars, items);
    const defaults = {};
    for (const i of items) defaults[i.id] = ((i.defaultReminders || []).filter(r => r.method === 'popup' || !r.method)).map(r => +r.minutes);
    setL(acc.id, { calSync: Date.now(), defaults });
    if (!eq(cals, cur.calendars)) return saveAccount(Object.assign({}, cur, { calendars: cals }));
    return cur;
  }

  /** Deja los calendarios de ZenCalendar de cada cuenta como dicen las cuentas (y quita lo de las que ya no están aquí). */
  async function reconcile() {
    const st0 = S();
    const want = new Map();
    let i = 0;
    for (const a of Object.values(rawAccounts())) {
      if (!a || a.removed || !L(a.id).here) continue;
      for (const c of a.calendars || []) {
        if (c.enabled === false) continue;
        want.set(zcCalId(a.id, c.gid), { a, c, order: 100 + (i++) });
      }
    }
    const cals = [], purgeC = [];
    for (const [id, w] of want) {
      const cur = st0.calendar(id);
      const next = {
        id, name: w.c.name, color: w.c.color || '#C9B8FF', visible: cur ? cur.visible !== false : true, order: cur && cur.order != null && cur.order >= 100 ? cur.order : w.order,
        source: 'google', accountId: w.a.id, gid: w.c.gid, gkey: calKey(w.c.gid), readOnly: isReadOnlyRole(w.c.accessRole),
        primary: !!w.c.primary, accessRole: w.c.accessRole, email: w.a.email, deleted: false,
      };
      if (!cur || !eq(Object.assign({}, cur, { updated: 0 }), Object.assign({}, next, { updated: 0 }))) cals.push(Object.assign(next, { updated: Date.now() }));
    }
    for (const c of st0.snapshot().calendars) if (S().isGoogleId(c.id) && !want.has(c.id)) purgeC.push(c.id);
    const purgeE = [];
    if (purgeC.length) {
      const gone = new Set(purgeC);
      for (const e of st0._rawEvents()) if (gone.has(e.calendarId) && S().isGoogleId(e.id)) purgeE.push(e.id);
      // y lo de sus syncTokens
      for (const id of purgeC) {
        const parts = /^g:([^:]+):(.*)$/.exec(id);
        if (parts) { const l = L(parts[1]); if (l.tokens && l.tokens[parts[2]]) { const t = Object.assign({}, l.tokens); delete t[parts[2]]; setL(parts[1], { tokens: t }); } }
      }
    }
    if (cals.length || purgeC.length || purgeE.length) await st0._gwrite({ calendars: cals, purgeCalendars: purgeC, purgeEvents: purgeE });
  }

  // ---------- bajar de Google ----------
  async function listEvents(acc, gid, syncToken) {
    const items = [];
    let page = '', next = null;
    do {
      const r = await api(acc, '/calendars/' + enc(gid) + '/events', {
        query: { showDeleted: 'true', maxResults: 2500, singleEvents: 'false', syncToken: syncToken || '', pageToken: page },
        allow: [410],
      });
      if (r.status === 410) return { gone: true };
      items.push(...((r.json && r.json.items) || []));
      page = (r.json && r.json.nextPageToken) || '';
      next = (r.json && r.json.nextSyncToken) || next;
    } while (page);
    return { items, next };
  }

  async function fetchInstances(acc, gid, baseId, query) {
    const items = [];
    let page = '';
    do {
      const r = await api(acc, '/calendars/' + enc(gid) + '/events/' + enc(baseId) + '/instances', { query: Object.assign({ maxResults: 2500, pageToken: page }, query || {}), allow: [404, 410] });
      if (r.status !== 200) return items;
      items.push(...((r.json && r.json.items) || []));
      page = (r.json && r.json.nextPageToken) || '';
    } while (page);
    return items;
  }

  async function pullCalendar(acc, cal) {
    const gid = cal.gid;
    let l = L(acc.id);
    let tok = (l.tokens || {})[gid] || null;
    let res = await listEvents(acc, gid, tok);
    let full = !tok;
    if (res.gone) { full = true; res = await listEvents(acc, gid, null); }
    if (res.gone) throw new Error('Google no deja sincronizar ' + cal.name);
    await applyItems(acc, gid, res.items, full);
    l = L(acc.id);
    setL(acc.id, { tokens: Object.assign({}, l.tokens, { [gid]: res.next || null }) });
  }

  function indexOf(acc, gid) {
    const calId = zcCalId(acc.id, gid);
    const byG = new Map();
    for (const e of S()._rawEvents()) {
      if (!S().isGoogleId(e.id) || e.accountId !== acc.id) continue;
      if (e.calendarId !== calId && e.gid !== gid) continue;
      if (e.gEventId) byG.set(e.gEventId, e);
    }
    return byG;
  }

  async function applyItems(acc, gid, items, full) {
    const u = U();
    const calId = zcCalId(acc.id, gid);
    const idx = indexOf(acc, gid);
    const writes = new Map();         // id → evento
    const purge = new Set();
    const cur = gEventId => { const x = idx.get(gEventId); if (!x || purge.has(x.id)) return null; return writes.has(x.id) ? writes.get(x.id) : x; };
    const put = ev => { writes.set(ev.id, ev); idx.set(ev.gEventId, ev); purge.delete(ev.id); };
    const drop = ev => { if (!ev) return; purge.add(ev.id); writes.delete(ev.id); };
    const l = L(acc.id);
    const complex = new Set(full ? [] : ((l.complex || {})[gid] || []));
    const seen = new Set();
    const complexToFetch = [];
    const origDate = g => g.originalStartTime ? (g.originalStartTime.date || u.ymd(new Date(g.originalStartTime.dateTime))) : null;
    const parentOf = rid => { const p = cur(rid); return p && !p.deleted ? p : null; };
    const children = id => [...S()._rawEvents(), ...writes.values()].filter(x => x.recurrenceOf === id && !x.deleted);
    const addInstEx = (parent, d) => {
      if (!parent || !d) return;
      const p = Object.assign({}, parent);
      p.gInstEx = [...new Set([...(p.gInstEx || []), d])].sort();
      p.exdates = [...new Set([...(p.exdates || []), d])].sort();
      if (p.gBase) p.gBase = Object.assign({}, p.gBase, { exdates: [...new Set([...(p.gBase.exdates || []), d])].sort() });
      if (!dirty(parent)) { p.updated = Math.max(Date.now(), (parent.updated || 0) + 1); p.gSynced = p.updated; }
      put(p);
    };
    // en una lista completa los gInstEx se rehacen desde cero
    if (full) for (const e of idx.values()) if (e.gInstEx && !dirty(e)) { const c = Object.assign({}, e, { gInstEx: [] }); writes.set(c.id, c); idx.set(c.gEventId, c); }

    const upsert = (g, extra) => {
      const prev = cur(g.id);
      if (prev && dirty(prev)) {
        if (prev.deleted) return; // se borró aquí: lo decide la subida (si Google lo cambió, 412 → gana Google)
        // cambió aquí y en Google: campo a campo, en caso de choque gana Google
        const remote = fromGoogle(g, gcal(acc, gid), prev);
        const m = merge3(prev, prev.gBase, remote);
        const ev = Object.assign({}, prev, m.fields, { etag: g.etag, gUpdated: g.updated, gBase: baseOf(remote) });
        if (!m.ours.length) ev.gSynced = ev.updated;
        put(ev);
        return;
      }
      put(buildLocal(acc, gid, g, prev, extra));
    };

    // primero las series y los sueltos, luego las excepciones (que necesitan su serie)
    const sorted = items.slice().sort((a, b) => (a.recurringEventId ? 1 : 0) - (b.recurringEventId ? 1 : 0));
    for (const g of sorted) {
      seen.add(g.id);
      if (g.status === 'cancelled') {
        if (g.recurringEventId) {
          if (complex.has(g.recurringEventId)) { drop(cur(g.id)); continue; }
          const child = cur(g.id);
          if (child && !child.deleted) drop(child);
          addInstEx(parentOf(g.recurringEventId), origDate(g));
        } else {
          const ev = cur(g.id);
          if (ev) { drop(ev); for (const c of children(ev.id)) drop(c); }
          if (complex.has(g.id)) {
            for (const x of idx.values()) if (x.gSeries === g.id) drop(x);
            complex.delete(g.id);
          }
        }
        continue;
      }
      if (g.recurringEventId) {
        const parent = parentOf(g.recurringEventId);
        if (complex.has(g.recurringEventId) || !parent) {
          upsert(g, { gSeries: g.recurringEventId, rrule: null, exdates: [] });
        } else {
          const d = origDate(g);
          upsert(g, { recurrenceOf: parent.id, recurrenceDate: d, rrule: null, exdates: [] });
          addInstEx(parent, d);
        }
        continue;
      }
      if (g.recurrence && g.recurrence.length) {
        const startLocal = g.start.date || u.toLocal(new Date(g.start.dateTime), false);
        if (parseRecurrence(g.recurrence, startLocal, !!g.start.date).complex) {
          complex.add(g.id);
          const prev = cur(g.id);
          if (prev) drop(prev);
          complexToFetch.push(g);
          continue;
        }
      }
      complex.delete(g.id);
      upsert(g);
    }

    // series que ZenCalendar no sabe repetir: sus apariciones (de hace un año a dentro de dos) como eventos sueltos
    const now = Date.now();
    for (const g of complexToFetch) {
      const inst = await fetchInstances(acc, gid, g.id, { timeMin: new Date(now - 365 * 86400000).toISOString(), timeMax: new Date(now + 730 * 86400000).toISOString() });
      const keep = new Set();
      for (const i of inst) {
        if (i.status === 'cancelled') continue;
        keep.add(i.id); seen.add(i.id);
        upsert(Object.assign({}, i, { recurrence: undefined }), { gSeries: g.id, rrule: null, exdates: [] });
      }
      for (const x of [...idx.values()]) if (x.gSeries === g.id && !keep.has(x.gEventId) && !dirty(x)) drop(x);
    }

    // lista completa: lo de aquí que ya no está en Google, fuera (menos lo nuevo que aún no se ha subido)
    if (full) {
      for (const x of idx.values()) {
        if (seen.has(x.gEventId) || purge.has(x.id)) continue;
        if (x.gSeries && complex.has(x.gSeries)) continue;
        drop(x); // (si además se cambió aquí: Google lo borró y gana Google)
      }
      // y lo que se quedó sin serie
      for (const x of S()._rawEvents()) if (x.calendarId === calId && x.recurrenceOf && !x.deleted && purge.has(x.recurrenceOf)) drop(x);
    }
    setL(acc.id, { complex: Object.assign({}, L(acc.id).complex, { [gid]: [...complex] }) });
    const evs = [...writes.values()].filter(x => !purge.has(x.id));
    if (evs.length || purge.size) await S()._gwrite({ events: evs, purgeEvents: [...purge] });
  }

  // ---------- subir a Google ----------
  function liveChildDates(e) {
    const out = new Set();
    for (const x of S()._rawEvents()) if (!x.deleted && x.recurrenceOf === e.id) out.add(x.recurrenceDate || String(x.start).slice(0, 10));
    return out;
  }

  async function findInstance(acc, gid, parent, date) {
    const u = U();
    const q = parent.allDay ? { originalStart: date } : { originalStart: new Date(u.parse(date + 'T' + String(parent.start).slice(11, 16)).getTime()).toISOString() };
    const items = await fetchInstances(acc, gid, parent.gEventId, Object.assign({ showDeleted: 'true' }, q));
    return items.find(i => {
      const o = i.originalStartTime || {};
      return (o.date || (o.dateTime && u.ymd(new Date(o.dateTime)))) === date;
    }) || null;
  }

  // guarda lo que contestó Google, sin pisar lo que se haya cambiado aquí mientras tanto
  async function afterPush(acc, gid, sent, g, extra) {
    const now = S()._rawEvent(sent.id);
    if (!now) return;
    if ((now.updated || 0) === (sent.updated || 0)) {
      const ev = buildLocal(acc, gid, g, now, extra);
      // lo que no viaja a Google se queda como estaba
      ev.attachments = now.attachments || [];
      if (sent.recurrenceOf) { ev.recurrenceOf = sent.recurrenceOf; ev.recurrenceDate = sent.recurrenceDate; }
      if (sent.gSeries) ev.gSeries = sent.gSeries;
      await S()._gwrite({ events: [ev] });
    } else {
      const ev = Object.assign({}, now, { gEventId: g.id, etag: g.etag, gid, accountId: acc.id, gBase: baseOf(fromGoogle(g, gcal(acc, gid), now)) });
      await S()._gwrite({ events: [ev] });
    }
  }

  async function markSynced(e, patch) {
    const now = S()._rawEvent(e.id);
    if (!now) return;
    const ev = Object.assign({}, now, patch || {});
    if ((now.updated || 0) === (e.updated || 0)) ev.gSynced = ev.updated;
    await S()._gwrite({ events: [ev] });
  }

  async function gGet(acc, gid, geid) {
    const r = await api(acc, '/calendars/' + enc(gid) + '/events/' + enc(geid), { allow: [404, 410] });
    return r.status === 200 && r.json && r.json.status !== 'cancelled' ? r.json : null;
  }

  // Google lo cambió mientras (412): se baja, se junta campo a campo y se vuelve a subir lo nuestro si queda algo
  async function resolveConflict(acc, gid, e, tries) {
    const g = await gGet(acc, gid, e.gEventId);
    if (!g) { await S()._gwrite({ purgeEvents: [e.id] }); return; } // Google lo borró: gana Google
    const remote = fromGoogle(g, gcal(acc, gid), e);
    const m = merge3(e, e.gBase, remote);
    const ev = Object.assign({}, e, m.fields, { etag: g.etag, gUpdated: g.updated, gBase: baseOf(remote) });
    if (!m.ours.length || tries > 1) { ev.gSynced = ev.updated; await S()._gwrite({ events: [ev] }); return; }
    await S()._gwrite({ events: [ev] });
    await patchEvent(acc, gid, ev, m.ours, tries + 1);
  }

  async function patchEvent(acc, gid, e, fields, tries) {
    const body = toGoogle(e, fields, liveChildDates(e));
    const r = await api(acc, '/calendars/' + enc(gid) + '/events/' + enc(e.gEventId), {
      method: 'PATCH', body, headers: e.etag ? { 'If-Match': e.etag } : {}, allow: [404, 410, 412],
    });
    if (r.status === 412) return resolveConflict(acc, gid, e, tries || 0);
    if (r.status === 404 || r.status === 410) {
      // ya no está en Google: si lo borraron allí, gana Google
      await S()._gwrite({ purgeEvents: [e.id] });
      return;
    }
    await afterPush(acc, gid, e, r.json);
  }

  async function gDelete(acc, gid, geid, etag) {
    const r = await api(acc, '/calendars/' + enc(gid) + '/events/' + enc(geid), { method: 'DELETE', headers: etag ? { 'If-Match': etag } : {}, allow: [404, 410, 412] });
    return r.status;
  }

  function accFor(id) { const a = account(id); return a ? Object.assign({ id }, a) : null; }

  async function pushOne(acc, e) {
    const st0 = S();
    const cal = st0.calendar(e.calendarId);
    const isG = !!(cal && cal.source === 'google');
    // borrado aquí
    if (e.deleted) {
      if (e.gEventId) {
        const from = e.accountId === acc.id ? acc : accFor(e.accountId);
        if (from) {
          const s = await gDelete(from, e.gid, e.gEventId, e.etag);
          if (s === 412) {
            // Google lo cambió mientras: gana Google (vuelve a aparecer con lo nuevo)
            const g = await gGet(from, e.gid, e.gEventId);
            if (g) { await st0._gwrite({ events: [buildLocal(from, e.gid, g, null, null)] }); return; }
            await gDelete(from, e.gid, e.gEventId, null);
          }
        }
      }
      await st0._gwrite({ purgeEvents: [e.id] });
      return;
    }
    // su calendario ya no está aquí (desactivado, cuenta quitada): solo se quita de aquí
    if (!cal) { await st0._gwrite({ purgeEvents: [e.id] }); return; }
    // pasado a un calendario de ZenCalendar: se borra de Google y se queda como evento normal (que sí va por Drive)
    if (!isG) {
      if (e.gEventId) { const from = accFor(e.accountId); if (from) await gDelete(from, e.gid, e.gEventId, null); }
      const copy = st0.stripGoogle(Object.assign({}, e));
      delete copy.updated; delete copy.recurrenceOf;
      await st0._gwrite({ purgeEvents: [e.id] });
      await st0.saveEvent(copy);
      return;
    }
    if (cal.accountId !== acc.id) return; // lo sube la otra cuenta
    // traído desde un calendario de ZenCalendar: se rehace con id de Google
    if (!st0.isGoogleId(e.id)) {
      const copy = st0.stripGoogle(Object.assign({}, e));
      delete copy.id; delete copy.updated; delete copy.recurrenceOf;
      const created = await st0.saveEvent(copy);
      await st0.deleteEvent(e.id);
      return pushOne(acc, st0._rawEvent(created.id));
    }
    const gid = cal.gid;
    // calendario de solo lectura: se deshace (se vuelve a lo de Google)
    if (cal.readOnly) {
      if (e.gEventId) { const g = await gGet(acc, e.gid || gid, e.gEventId); if (g) { await st0._gwrite({ events: [buildLocal(acc, e.gid || gid, g, e, null)] }); return; } }
      await st0._gwrite({ purgeEvents: [e.id] });
      return;
    }
    // cambiado de calendario de Google
    if (e.gEventId && (e.gid !== gid || e.accountId !== acc.id)) {
      if (e.accountId === acc.id) {
        const r = await api(acc, '/calendars/' + enc(e.gid) + '/events/' + enc(e.gEventId) + '/move', { method: 'POST', query: { destination: gid }, body: {}, allow: [404, 410] });
        if (r.status === 200) e = Object.assign({}, e, { gid, etag: r.json.etag });
        else e = Object.assign({}, e, { gEventId: null, etag: null, gBase: null });
      } else {
        const from = accFor(e.accountId);
        if (from) await gDelete(from, e.gid, e.gEventId, null);
        e = Object.assign({}, e, { gEventId: null, etag: null, gBase: null, accountId: acc.id, gid });
      }
    }
    // nuevo
    if (!e.gEventId) {
      if (e.recurrenceOf) {
        // «solo esta» de una serie de Google: se cambia esa aparición en Google
        let parent = st0._rawEvent(e.recurrenceOf);
        if (parent && !parent.deleted && dirty(parent) && !parent.gEventId) { await pushOne(acc, parent); parent = st0._rawEvent(e.recurrenceOf); }
        if (parent && parent.gEventId && !parent.deleted) {
          const inst = await findInstance(acc, gid, parent, e.recurrenceDate || String(e.start).slice(0, 10));
          if (inst) {
            const r = await api(acc, '/calendars/' + enc(gid) + '/events/' + enc(inst.id), { method: 'PATCH', body: Object.assign(toGoogle(e, FIELDS.filter(k => k !== 'rrule' && k !== 'exdates')), { status: 'confirmed' }) });
            await afterPush(acc, gid, e, r.json, { recurrenceOf: e.recurrenceOf, recurrenceDate: e.recurrenceDate, rrule: null, exdates: [] });
            return;
          }
        }
      }
      const r = await api(acc, '/calendars/' + enc(gid) + '/events', { method: 'POST', body: toGoogle(e, FIELDS, liveChildDates(e)) });
      const extra = e.recurrenceOf ? { recurrenceOf: null } : null;
      await afterPush(acc, gid, e, r.json, extra);
      return;
    }
    // cambiado
    const changed = changedFields(e, e.gBase);
    let fields = changed;
    if (e.rrule && changed.includes('exdates') && !changed.includes('rrule')) {
      // repeticiones quitadas aquí: se cancela esa aparición en Google (menos las que son «solo esta», que ya la cambian)
      const live = liveChildDates(e);
      const before = new Set((e.gBase && e.gBase.exdates) || []);
      const added = (e.exdates || []).filter(d => !before.has(d) && !live.has(d));
      for (const d of added) {
        const inst = await findInstance(acc, gid, e, d);
        if (inst && inst.status !== 'cancelled') await gDelete(acc, gid, inst.id, null);
      }
      const now = st0._rawEvent(e.id) || e;
      const inst = [...new Set([...(now.gInstEx || []), ...added])].sort();
      e = Object.assign({}, now, { gInstEx: inst, gBase: Object.assign({}, now.gBase, { exdates: (now.exdates || []).slice() }) });
      await st0._gwrite({ events: [e] });
      fields = changed.filter(k => k !== 'exdates');
      if (!fields.length) { await markSynced(e); return; }
    }
    if (!fields.length) { await markSynced(e); return; }
    await patchEvent(acc, gid, e, fields, 0);
  }

  async function pushAccount(acc) {
    const st0 = S();
    const mine = c => { const k = st0.calendar(c); return !!(k && k.accountId === acc.id); };
    const list = st0._rawEvents().filter(e => dirty(e) && (
      (st0.isGoogleId(e.id) && (e.accountId === acc.id || mine(e.calendarId))) ||
      (!e.deleted && !st0.isGoogleId(e.id) && mine(e.calendarId))
    ));
    // primero las series y lo suelto, luego las «solo esta», y lo borrado al final
    const rank = e => e.deleted ? 2 : e.recurrenceOf ? 1 : 0;
    list.sort((a, b) => rank(a) - rank(b));
    let problem = null;
    for (const e0 of list) {
      const e = st0._rawEvent(e0.id);
      if (!e || !dirty(e)) continue;
      try { await pushOne(acc, e); }
      catch (err) {
        if (err.auth || err.network || err.status === 429 || err.status >= 500) throw err;
        // Google no lo acepta (p. ej. 400/403): no se reintenta en bucle; se apunta y se sigue
        console.warn('[ZC] Google Calendar no aceptó', e.title, err);
        problem = 'Google no aceptó «' + (e.title || 'sin título') + '»: ' + (err.message || err.status);
        await markSynced(e, { gError: String(err.message || err.status) });
      }
    }
    return problem;
  }

  // ---------- la sincronización ----------
  async function syncAccount(id) {
    const a = account(id);
    if (!a || !L(id).here) return;
    const acc = Object.assign({ id }, a);
    syncing.add(id); emit();
    try {
      const token = await getToken(acc, false);
      if (!L(id).calSync || Date.now() - L(id).calSync > CAL_LIST_EVERY) await refreshCalendars(acc, token);
      await reconcile();
      const problem = await pushAccount(acc);
      const fresh = account(id) || acc;
      for (const c of fresh.calendars || []) {
        if (c.enabled === false) continue;
        try { await pullCalendar(acc, c); }
        catch (e) {
          // calendario que ya no existe o al que ya no hay acceso: se vuelve a pedir la lista
          if (e.status === 404 || e.status === 403 && !e.auth) { setL(id, { calSync: 0 }); continue; }
          throw e;
        }
      }
      // lo que haya cambiado aquí mientras bajaba
      const problem2 = await pushAccount(acc);
      setL(id, { lastSync: Date.now(), error: problem || problem2 || null, reauth: false, soft: false });
    } catch (e) {
      console.warn('[ZC] gcal sync', a.email, e);
      setL(id, { error: friendly(e) });
      if (!e.auth) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => sync(), MOCK ? 200 : 60000);
      }
    } finally {
      syncing.delete(id);
      emit();
    }
  }

  /** Sincroniza ya una cuenta (o todas las conectadas aquí). Si ya estaba, repite al acabar. */
  function sync(id) {
    if (!id) {
      const ids = accounts().filter(a => a.connected).map(a => a.id);
      return ids.reduce((p, x) => p.then(() => sync(x)), Promise.resolve()).then(() => accounts());
    }
    if (!ZC.net.online() && !MOCK) { setL(id, { error: friendly({ network: true }) }); emit(); return Promise.resolve(accounts()); }
    if (running.has(id)) { again.add(id); return running.get(id); }
    const p = syncAccount(id).finally(() => {
      running.delete(id);
      if (again.has(id)) { again.delete(id); setTimeout(() => sync(id), MOCK ? 10 : 300); }
    }).then(() => accounts());
    running.set(id, p);
    return p;
  }

  const syncSoon = (() => {
    let t = null;
    return () => { clearTimeout(t); t = setTimeout(() => sync(), MOCK ? (MOCK.afterChange != null ? MOCK.afterChange : 50) : AFTER_CHANGE); };
  })();

  // ---------- cuentas ----------
  /**
   * Añade (o vuelve a conectar) una cuenta. Sin opciones enseña el selector de cuentas de Google.
   * opts.email: esa cuenta (p. ej. la de Drive, pidiendo solo el permiso que falta; o «Volver a conectar»).
   */
  async function addAccount(opts) {
    opts = opts || {};
    if (!available()) throw new Error('Falta configurar Google en esta versión (mira docs/GOOGLE-SETUP.md)');
    const t = await AUTH().add({ email: opts.email || '' });
    let info = {};
    try { info = (await api({ id: '_', email: '' }, USERINFO, { token: t.token })).json || {}; } catch (e) { if (!t.email) throw e; }
    const email = String(info.email || t.email || '').toLowerCase();
    if (!email) throw new Error('Google no dijo qué cuenta es');
    if (opts.email && email !== String(opts.email).toLowerCase()) throw authError('Has elegido otra cuenta (' + email + ')');
    const id = accId(email);
    tokens.set(id, { token: t.token, exp: t.exp });
    AUTH().save(email, { token: t.token, exp: t.exp });
    const prev = rawAccounts()[id];
    const base = prev && !prev.removed ? prev : null;
    const acc = {
      id, email, name: info.name || (base && base.name) || '', photo: info.picture || (base && base.photo) || '',
      color: (base && base.color) || ACC_COLORS[Object.keys(rawAccounts()).length % ACC_COLORS.length],
      calendars: (base && base.calendars) || [], added: (base && base.added) || Date.now(), removed: false,
    };
    setL(id, { here: true, reauth: false, soft: false, error: null });
    await saveAccount(acc);
    await refreshCalendars(Object.assign({}, acc), t.token);
    await reconcile();
    start();
    emit();
    await sync(id);
    return accounts().find(a => a.id === id);
  }

  /** Vuelve a conectar una cuenta (la de otro dispositivo, o una con error). */
  function reconnect(id) {
    const a = account(id);
    if (!a) return Promise.reject(new Error('No existe esa cuenta'));
    return addAccount({ email: a.email });
  }

  async function removeAccount(id) {
    const a = rawAccounts()[id];
    if (!a) return accounts();
    const t = tokens.get(id);
    tokens.delete(id);
    // (revocar quita el permiso de toda la app en esa cuenta: con la cuenta de Drive, no, que se cortaría la sync)
    const revoke = String(a.email).toLowerCase() !== driveEmail();
    try { if (L(id).here) await AUTH().remove(a.email, t && t.token, revoke); } catch (e) {}
    setL(id, null);
    await saveAccount(Object.assign({}, a, { removed: true, calendars: [], name: '', photo: '' }));
    await reconcile();
    emit();
    return accounts();
  }

  async function setCalendarEnabled(id, gid, on) {
    const a = account(id);
    if (!a) return accounts();
    const cals = (a.calendars || []).map(c => c.gid === gid ? Object.assign({}, c, { enabled: !!on }) : c);
    await saveAccount(Object.assign({}, a, { calendars: cals }));
    if (!on) { const l = L(id); const t = Object.assign({}, l.tokens); delete t[gid]; setL(id, { tokens: t }); }
    await reconcile();
    emit();
    if (on && L(id).here) await sync(id);
    return accounts();
  }

  // el color que el usuario pone a un calendario de Google se guarda en la cuenta (y viaja por Drive)
  async function captureCalendarEdits() {
    for (const c of S().calendars('personal')) {
      if (c.source !== 'google' || !c.accountId) continue;
      const a = account(c.accountId);
      if (!a) continue;
      const k = (a.calendars || []).find(x => x.gid === c.gid);
      if (k && k.color !== c.color) {
        await saveAccount(Object.assign({}, a, { calendars: a.calendars.map(x => x.gid === c.gid ? Object.assign({}, x, { color: c.color, customColor: true }) : x) }));
      }
    }
  }

  // ---------- arranque ----------
  function start() {
    if (started) return;
    started = true;
    S().on('change', e => {
      if (e.source === 'local' && e.type === 'events') {
        if (S()._rawEvents().some(x => dirty(x) && (S().isGoogleId(x.id) || S().isGoogleId(x.calendarId)))) syncSoon();
      } else if (e.source === 'local' && e.type === 'calendars') {
        captureCalendarEdits().catch(() => {});
      } else if (e.type === 'prefs' && e.source !== 'local') {
        // llega de Drive / de otra ventana: cuentas quitadas en otro dispositivo, calendarios activados…
        onPrefsChanged().catch(err => console.warn('[ZC] gcal prefs', err));
      }
    });
    timer = setInterval(() => { if (accounts().some(a => a.connected)) sync(); }, EVERY);
    if (root.document) document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeSync(); });
    if (root.addEventListener) {
      root.addEventListener('online', () => sync());
      root.addEventListener('zc-resume', () => resumeSync());
    }
  }
  function resumeSync() {
    for (const a of accounts()) if (a.connected && (!a.lastSync || Date.now() - a.lastSync > 60000)) sync(a.id);
  }

  async function onPrefsChanged() {
    // cuentas quitadas en otro dispositivo: fuera de aquí también
    for (const a of Object.values(rawAccounts())) {
      if (a && a.removed && L(a.id).here) { tokens.delete(a.id); setL(a.id, null); }
    }
    await reconcile();
    emit();
    // calendarios activados en otro dispositivo
    for (const a of accounts()) {
      if (!a.connected) continue;
      const l = L(a.id);
      if (a.calendars.some(c => c.enabled && !(l.tokens || {})[c.gid])) sync(a.id);
    }
  }

  async function init() {
    if (ZC.platform && ZC.platform.isWidget) return;
    await reconcile();
    if (accounts().some(a => a.connected)) {
      start();
      setTimeout(() => sync(), MOCK ? 10 : 2500);
    } else {
      // por si se conecta una cuenta en otro dispositivo (llega por Drive)
      S().on('change', e => { if (e.type === 'prefs' && e.source !== 'local' && !started) emit(); });
    }
  }

  // (web) cargar ya Google Identity Services al abrir la pantalla de cuentas, para que la ventanita no la bloquee el navegador
  function prepare() {
    if (!MOCK && kind() === 'web' && available() && root.document) return loadGIS().catch(() => {});
    return Promise.resolve();
  }

  // ---------- modo simulado (para la interfaz y las pruebas) ----------
  /**
   * await ZC.gcal._mock(cuentas?, opciones?) → el Google simulado (ver gcal-mock.js).
   * Sin Google de verdad ni red: addAccount enseña la «siguiente» cuenta simulada, la sync
   * va contra un Google Calendar de mentira en memoria. ZC.gcal._mock(false) lo apaga.
   */
  async function _mock(list, opts) {
    if (list === false) {
      MOCK = null;
      return null;
    }
    if (!ZC.gcalMock && root.document) {
      await new Promise((ok, ko) => {
        const cur = [...document.scripts].find(s => /core\/gcal\.js/.test(s.src));
        const s = document.createElement('script');
        s.src = cur ? cur.src.replace(/gcal\.js.*$/, 'gcal-mock.js') : 'js/core/gcal-mock.js';
        s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar gcal-mock.js'));
        document.head.appendChild(s);
      });
    }
    MOCK = ZC.gcalMock.create(list, opts);
    // las cuentas marcadas como conectadas entran ya conectadas en este dispositivo
    for (const u of MOCK.users()) if (u.connected) await addAccount({ email: u.email }).catch(e => console.warn('[ZC] mock', u.email, e.message));
    emit();
    return MOCK;
  }

  ZC.gcal = {
    available, accounts, state, on, addAccount, reconnect, removeAccount, setCalendarEnabled, sync, init, prepare,
    _mock,
    // para las pruebas
    _internals: { fromGoogle, toGoogle, parseRecurrence, merge3, accId, evId, zcCalId, nearestColorId, GCOLORS, htmlToText, reconcile, locals },
    get _mocked() { return MOCK; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
