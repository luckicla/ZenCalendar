'use strict';
// Workspaces en Windows (proceso principal), sin nada de Electron dentro para poder probarlo en node
// (tests/core/desktop-ws.test.js):
//
//  - parseJoin / joinFromArgv: el código «<wid>.<token>» de un enlace zencalendar://join/#… (o del de la web
//    https://luckicla.github.io/zencalendar/w/#…, o de ?join=…).
//  - createChecker: la comprobación periódica con la app cerrada en la bandeja. Con el refresh token de
//    Firebase que pasa la página (ZC.platform.wsCreds) renueva el ID token (securetoken.googleapis.com),
//    busca por REST los workspaces del usuario (memberIds array-contains uid) y, en cada uno, los items con
//    `updated` posterior a lo último visto; los que no ha tocado él salen en una notificación por workspace.
//    Android (Workspaces.java) hace exactamente lo mismo; si se cambia algo aquí, allí también.
//
// Las marcas de tiempo de Firestore («2026-11-24T10:00:00.123456Z») se guardan tal cual llegan y se
// vuelven a mandar como filtro (así no se repite ni se pierde nada por redondeos); para compararlas se
// rellenan los decimales a 9 cifras (tsKey).

const SECURETOKEN = 'https://securetoken.googleapis.com/v1/token';
const FIRESTORE = 'https://firestore.googleapis.com/v1';
const LIMIT = 50;           // items por workspace y vuelta (el resto, en la siguiente)
const MAX_WS = 30;          // workspaces mirados por vuelta
const CODE_RE = /^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_~-]{1,128}$/;

const DEFAULT_STRINGS = {
  added: '{who}: {title}',
  changed: '{who} ha cambiado «{title}»',
  deleted: '{who} ha borrado «{title}»',
  assigned: '{who} te ha asignado «{title}»',
  done: '{who} ha completado «{title}»',
  more: 'y {n} más',
  someone: 'Alguien',
  untitled: '(sin título)',
  // (solo Android: el nombre del canal de notificaciones)
  channel: 'Workspaces',
  channelDesc: 'Lo que cambian los demás en tus workspaces',
};

// ---------- enlaces ----------
function parseJoin(s) {
  s = String(s || '').trim();
  if (!s) return null;
  let code = null;
  const m = /^zencalendar:\/\/join\/?(?:\?([^#]*))?(?:#(.*))?$/i.exec(s);
  if (m) {
    code = m[2] || (m[1] ? new URLSearchParams(m[1]).get('code') || new URLSearchParams(m[1]).get('join') : null);
  } else if (/^https:\/\/luckicla\.github\.io\/zencalendar\//i.test(s)) {
    const h = s.indexOf('#');
    const q = /[?&]join=([^&#]*)/.exec(s);
    if (/\/w\/?(#|$)/i.test(s) && h >= 0) code = s.slice(h + 1);
    else if (q) code = q[1];
  } else {
    return null;
  }
  try { code = decodeURIComponent(code || ''); } catch (e) { return null; }
  return CODE_RE.test(code) ? code : null;
}

function joinFromArgv(argv) {
  for (const a of argv || []) {
    if (typeof a !== 'string' || !/^zencalendar:/i.test(a)) continue;
    const c = parseJoin(a);
    if (c) return c;
  }
  return null;
}

// ---------- Firestore REST ----------
function tsKey(ts) {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(String(ts || ''));
  if (!m) return '';
  return m[1] + '.' + (m[2] || '').padEnd(9, '0');
}
const isoNow = ms => new Date(ms).toISOString(); // («…T10:00:00.000Z»: también lo entiende Firestore)

function val(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) { const o = {}; const f = v.mapValue.fields || {}; for (const k of Object.keys(f)) o[k] = val(f[k]); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  return null;
}
const fields = doc => val({ mapValue: { fields: (doc && doc.fields) || {} } });
const lastPart = name => String(name || '').split('/').pop();

function fill(tpl, o) { return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (o[k] != null ? String(o[k]) : '')); }
function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/** El texto de un cambio: «Ana: Cena el viernes», «Ana ha borrado «Cena»»… */
function lineFor(item, createTime, ws, uid, S) {
  const m = (ws.members && ws.members[item.updatedBy]) || {};
  const who = clip(m.name || (m.email ? String(m.email).split('@')[0] : '') || S.someone, 40);
  const title = clip(item.title || S.untitled, 80);
  // recién creado: la fecha de creación del documento y la del último cambio casi coinciden
  const created = createTime && item.updated && Math.abs(Date.parse(item.updated) - Date.parse(createTime)) < 3000;
  let k;
  if (item.deleted) k = 'deleted';
  else if (created && item.assignee && item.assignee === uid) k = 'assigned';
  else if (created) k = 'added';
  else if (item.kind === 'task' && item.done) k = 'done';
  else k = 'changed';
  return fill(S[k] || DEFAULT_STRINGS[k], { who, title });
}

/**
 * fetch(url, { method, headers, body }) → { status, json() } (en Electron, net.fetch).
 * load() → estado guardado | null; save(estado) (null = borrar). notify({ wid, name, emoji, color, lines, total }).
 * isForeground() → true si la página está a la vista (entonces avisa ella y aquí solo se avanza lo visto).
 */
function createChecker({ fetch, load, save, notify, now = () => Date.now(), isForeground = () => false, log = () => {} }) {
  let st = null;
  const state = () => (st = st || load() || { creds: null, seen: {} });
  let running = null;

  function setCreds(c) {
    if (!c) { st = { creds: null, seen: {} }; save(null); return true; }
    const ok = c && typeof c === 'object' && ['apiKey', 'projectId', 'uid', 'refreshToken'].every(k => typeof c[k] === 'string' && c[k] && c[k].length < 4096);
    if (!ok) return false;
    const s = state();
    const same = s.creds && s.creds.uid === c.uid && s.creds.projectId === c.projectId;
    const strings = {};
    if (c.strings && typeof c.strings === 'object') for (const k of Object.keys(DEFAULT_STRINGS)) if (typeof c.strings[k] === 'string' && c.strings[k]) strings[k] = c.strings[k].slice(0, 120);
    s.creds = { apiKey: c.apiKey, projectId: c.projectId, uid: c.uid, refreshToken: c.refreshToken, strings };
    if (!same) { s.seen = {}; s.idToken = null; s.idExp = 0; }
    if (typeof c.idToken === 'string' && c.idToken && +c.expiresAt > now() + 120e3) { s.idToken = c.idToken; s.idExp = +c.expiresAt; }
    // desde cuándo avisar en los workspaces que aún no se han mirado (por defecto, desde ahora)
    s.since = +c.since > 0 ? isoNow(+c.since) : (s.since && same ? s.since : isoNow(now()));
    save(s);
    return true;
  }

  async function token(force) {
    const s = state();
    if (!force && s.idToken && s.idExp > now() + 60e3) return s.idToken;
    const r = await fetch(SECURETOKEN + '?key=' + encodeURIComponent(s.creds.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(s.creds.refreshToken),
    });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (r.status === 400 || r.status === 403) {
      const msg = String((j.error && j.error.message) || '');
      // sesión caducada, revocada o usuario borrado: se olvida (la página manda otra al volver a abrirse)
      if (/TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN|INVALID_GRANT|PROJECT_NUMBER_MISMATCH/.test(msg)) {
        st = { creds: null, seen: {} }; save(null);
        const e = new Error('auth: ' + msg); e.auth = true; throw e;
      }
    }
    if (r.status !== 200 || !j.id_token) throw new Error('token ' + r.status);
    s.idToken = j.id_token;
    s.idExp = now() + (+j.expires_in || 3600) * 1000;
    if (j.refresh_token) s.creds.refreshToken = j.refresh_token;
    return s.idToken;
  }

  async function runQuery(parent, query) {
    const s = state();
    const url = FIRESTORE + '/projects/' + encodeURIComponent(s.creds.projectId) + '/databases/(default)/documents' + parent + ':runQuery';
    for (let i = 0; i < 2; i++) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token(i > 0) },
        body: JSON.stringify({ structuredQuery: query }),
      });
      if (r.status === 401 && i === 0) continue;
      if (r.status !== 200) { const e = new Error('firestore ' + r.status); e.status = r.status; throw e; }
      const rows = await r.json();
      return (Array.isArray(rows) ? rows : []).filter(x => x && x.document).map(x => x.document);
    }
    return [];
  }

  async function run() {
    const s = state();
    if (!s.creds) return { skipped: 'sin credenciales', groups: [] };
    const uid = s.creds.uid;
    const S = Object.assign({}, DEFAULT_STRINGS, s.creds.strings || {});
    const wsDocs = await runQuery('', {
      from: [{ collectionId: 'workspaces' }],
      where: { fieldFilter: { field: { fieldPath: 'memberIds' }, op: 'ARRAY_CONTAINS', value: { stringValue: uid } } },
      limit: MAX_WS,
    });
    const groups = [];
    const seen = {};
    for (const d of wsDocs) {
      const wid = lastPart(d.name);
      const ws = fields(d);
      const from = (s.seen || {})[wid] || s.since || isoNow(now());
      seen[wid] = from;
      let items;
      try {
        items = await runQuery('/workspaces/' + encodeURIComponent(wid), {
          from: [{ collectionId: 'items' }],
          where: { fieldFilter: { field: { fieldPath: 'updated' }, op: 'GREATER_THAN', value: { timestampValue: from } } },
          orderBy: [{ field: { fieldPath: 'updated' }, direction: 'ASCENDING' }],
          limit: LIMIT,
        });
      } catch (e) {
        if (e.status === 403 || e.status === 404) { delete seen[wid]; continue; } // ya no es miembro
        throw e;
      }
      const lines = [];
      let max = from;
      for (const doc of items) {
        const it = fields(doc);
        if (typeof it.updated === 'string' && tsKey(it.updated) > tsKey(max)) max = it.updated;
        if (!it.updatedBy || it.updatedBy === uid) continue;
        lines.push(lineFor(it, doc.createTime, ws, uid, S));
      }
      seen[wid] = max;
      if (lines.length) groups.push({ wid, name: clip(ws.name || 'Workspace', 60), emoji: ws.emoji || '', color: ws.color || '', lines, total: lines.length });
    }
    // (los workspaces de los que ya no es miembro se olvidan)
    s.seen = seen;
    save(s);
    const fg = isForeground();
    if (!fg) for (const g of groups) { try { notify(g, S); } catch (e) { log('ws notify ' + e.message); } }
    return { groups, foreground: fg };
  }

  /** Una vuelta (si ya hay una en marcha, se espera a esa). */
  function check() {
    if (!running) running = run().catch(e => { log('ws ' + (e && e.message)); return { error: (e && e.message) || 'error', auth: !!(e && e.auth), groups: [] }; }).finally(() => { running = null; });
    return running;
  }

  return { setCreds, check, has: () => !!state().creds, _state: state };
}

/** El cuerpo de la notificación de un grupo: hasta 4 líneas y «y N más». */
function groupBody(g, S) {
  const lines = g.lines.slice(-4);
  const rest = g.total - lines.length;
  return lines.join('\n') + (rest > 0 ? '\n' + fill((S && S.more) || DEFAULT_STRINGS.more, { n: rest }) : '');
}

module.exports = { parseJoin, joinFromArgv, tsKey, createChecker, groupBody, lineFor, DEFAULT_STRINGS, _val: val };
