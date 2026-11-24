'use strict';
// (pruebas) Un Firebase de mentira en memoria con lo que usan los avisos de workspaces con la app cerrada
// (desktop/workspaces.js y android/…/WsSync.java): securetoken.googleapis.com/v1/token y el runQuery de
// Firestore por REST, con las reglas de verdad en lo que importa (solo miembros, el token tiene que valer).
// handle(url, { method, headers, body }) → { status, json() } (como fetch); listen() → servidor HTTP para Java.
const http = require('http');

const tsKey = ts => {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(String(ts || ''));
  return m ? m[1] + '.' + (m[2] || '').padEnd(9, '0') : '';
};

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v) ? { timestampValue: v } : { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  const fields = {};
  for (const k of Object.keys(v)) fields[k] = enc(v[k]);
  return { mapValue: { fields } };
}

function createFakeFirestore({ apiKey = 'AIza-prueba', projectId = 'zencalendar-prueba' } = {}) {
  const F = {
    apiKey, projectId,
    users: {},          // refreshToken → uid
    tokens: {},         // idToken → uid
    workspaces: {},     // wid → { name, emoji, color, members, memberIds }
    items: {},          // wid → { id → { fields, createTime } }
    calls: [],
    n: 0,
    addUser(uid, rt) { F.users[rt] = uid; },
    revoke(rt) { delete F.users[rt]; },
    expireTokens() { F.tokens = {}; },
    setWs(wid, ws) { F.workspaces[wid] = ws; F.items[wid] = F.items[wid] || {}; },
    put(wid, id, fields, createTime) {
      const prev = F.items[wid][id];
      F.items[wid][id] = { fields, createTime: createTime || (prev && prev.createTime) || fields.updated };
    },
  };

  function res(status, body) { return { status, ok: status === 200, json: async () => body, text: async () => JSON.stringify(body) }; }

  F.handle = async (url, o = {}) => {
    const u = new URL(url);
    F.calls.push(u.pathname);
    const auth = (o.headers && (o.headers.Authorization || o.headers.authorization)) || '';
    if (u.pathname === '/v1/token') {
      if (u.searchParams.get('key') !== F.apiKey) return res(400, { error: { message: 'API key not valid' } });
      const p = new URLSearchParams(o.body || '');
      const uid = F.users[p.get('refresh_token')];
      if (p.get('grant_type') !== 'refresh_token' || !uid) return res(400, { error: { code: 400, message: 'INVALID_REFRESH_TOKEN' } });
      const id = 'id-' + uid + '-' + (++F.n);
      F.tokens[id] = uid;
      return res(200, { id_token: id, refresh_token: p.get('refresh_token'), expires_in: '3600', user_id: uid, token_type: 'Bearer' });
    }
    const m = /^\/v1\/projects\/([^/]+)\/databases\/\(default\)\/documents(?:\/workspaces\/([^/:]+))?:runQuery$/.exec(decodeURIComponent(u.pathname));
    if (!m || o.method !== 'POST') return res(404, { error: { message: 'no existe' } });
    if (m[1] !== F.projectId) return res(403, { error: { message: 'proyecto' } });
    const uid = F.tokens[auth.replace(/^Bearer /, '')];
    if (!uid) return res(401, { error: { status: 'UNAUTHENTICATED' } });
    const q = JSON.parse(o.body).structuredQuery;
    const base = 'projects/' + F.projectId + '/databases/(default)/documents';
    const readTime = '2026-11-24T12:00:00.000000Z';
    if (!m[2]) {
      // workspaces donde memberIds contiene al usuario (las reglas solo dejan esa consulta)
      const f = q.where && q.where.fieldFilter;
      if (q.from[0].collectionId !== 'workspaces' || !f || f.field.fieldPath !== 'memberIds' || f.op !== 'ARRAY_CONTAINS' || f.value.stringValue !== uid) return res(403, { error: { status: 'PERMISSION_DENIED' } });
      const rows = Object.keys(F.workspaces).filter(w => F.workspaces[w].memberIds.includes(uid)).slice(0, q.limit || 1e9)
        .map(w => ({ document: { name: base + '/workspaces/' + w, fields: enc(F.workspaces[w]).mapValue.fields, createTime: '2026-11-01T00:00:00Z', updateTime: '2026-11-01T00:00:00Z' }, readTime }));
      return res(200, rows.length ? rows : [{ readTime }]);
    }
    const wid = m[2];
    const ws = F.workspaces[wid];
    if (!ws || !ws.memberIds.includes(uid)) return res(403, { error: { status: 'PERMISSION_DENIED' } });
    const f = q.where.fieldFilter;
    if (q.from[0].collectionId !== 'items' || f.field.fieldPath !== 'updated' || f.op !== 'GREATER_THAN' || !f.value.timestampValue) return res(400, { error: { message: 'consulta' } });
    const from = tsKey(f.value.timestampValue);
    if (!from) return res(400, { error: { message: 'marca de tiempo' } });
    const all = Object.entries(F.items[wid] || {}).filter(([, it]) => tsKey(it.fields.updated) > from)
      .sort((a, b) => (tsKey(a[1].fields.updated) < tsKey(b[1].fields.updated) ? -1 : 1)).slice(0, q.limit || 1e9);
    const rows = all.map(([id, it]) => ({ document: { name: base + '/workspaces/' + wid + '/items/' + id, fields: enc(it.fields).mapValue.fields, createTime: it.createTime, updateTime: it.fields.updated }, readTime }));
    return res(200, rows.length ? rows : [{ readTime }]);
  };

  F.listen = () => new Promise(resolve => {
    const srv = http.createServer((req, rs) => {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', async () => {
        const r = await F.handle('http://x' + req.url, { method: req.method, headers: { Authorization: req.headers.authorization || '' }, body });
        rs.writeHead(r.status, { 'Content-Type': 'application/json' });
        rs.end(JSON.stringify(await r.json()));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
  return F;
}

// El mismo guion para Windows y Android: dos workspaces míos y uno ajeno, cambios de otros y míos.
const T0 = Date.parse('2026-11-24T10:00:00Z');
function scenario(F) {
  F.addUser('yo', 'rt-yo');
  F.setWs('wA', { name: 'Piso Gràcia', emoji: '🏠', color: '#F4A6C1', owner: 'ana', memberIds: ['yo', 'ana'],
    members: { yo: { name: 'Lluc', email: 'yo@example.com' }, ana: { name: 'Ana', email: 'ana@example.com' } } });
  F.setWs('wB', { name: 'Viaje a Menorca con todos los primos y las primas del verano de 2027', emoji: '', color: '#9AD0F5', owner: 'yo', memberIds: ['yo', 'pepe'],
    members: { yo: { name: 'Lluc' }, pepe: { name: '', email: 'pepe.garcia@example.com' } } });
  F.setWs('wC', { name: 'Ajeno', emoji: '', color: '#000000', owner: 'ana', memberIds: ['ana'], members: { ana: { name: 'Ana' } } });
  // antes de T0: no sale
  F.put('wA', 'viejo', { title: 'Antiguo', kind: 'event', updated: '2026-11-24T09:59:59.999999Z', updatedBy: 'ana', createdBy: 'ana' });
  // después de T0
  F.put('wA', 'cena', { title: 'Cena el viernes', kind: 'event', updated: '2026-11-24T10:00:01.123456Z', updatedBy: 'ana', createdBy: 'ana', deleted: false });
  F.put('wA', 'mio', { title: 'Lo mío', kind: 'event', updated: '2026-11-24T10:00:02.5Z', updatedBy: 'yo', createdBy: 'yo' });
  F.put('wA', 'compra', { title: 'Compra', kind: 'task', updated: '2026-11-24T10:00:03.000001Z', updatedBy: 'ana', createdBy: 'yo', done: false }, '2026-11-20T08:00:00Z');
  F.put('wB', 'ferry', { title: 'Ferry', kind: 'event', updated: '2026-11-24T10:01:00Z', updatedBy: 'pepe', createdBy: 'yo', deleted: true }, '2026-11-10T08:00:00Z');
  F.put('wB', 'maleta', { title: 'Hacer la maleta', kind: 'task', updated: '2026-11-24T10:02:00.000Z', updatedBy: 'pepe', createdBy: 'pepe', assignee: 'yo' });
  F.put('wB', 'billetes', { title: 'Billetes', kind: 'task', updated: '2026-11-24T10:03:00Z', updatedBy: 'pepe', createdBy: 'yo', done: true }, '2026-11-01T08:00:00Z');
  F.put('wC', 'x', { title: 'Secreto', kind: 'event', updated: '2026-11-24T10:05:00Z', updatedBy: 'ana', createdBy: 'ana' });
}
const EXPECT_1 = {
  wA: ['Ana: Cena el viernes', 'Ana ha cambiado «Compra»'],
  wB: ['pepe.garcia ha borrado «Ferry»', 'pepe.garcia te ha asignado «Hacer la maleta»', 'pepe.garcia ha completado «Billetes»'],
};
// segunda tanda: un cambio con más decimales que el último visto (tiene que salir) y otro mío
function scenario2(F) {
  F.put('wA', 'cine', { title: 'Cine  el   sábado', kind: 'event', updated: '2026-11-24T10:00:03.0000011Z', updatedBy: 'ana', createdBy: 'yo' }, '2026-11-23T08:00:00Z');
  F.put('wB', 'mio2', { title: 'Otro mío', kind: 'event', updated: '2026-11-24T10:09:00Z', updatedBy: 'yo', createdBy: 'yo' });
}
const EXPECT_2 = { wA: ['Ana ha cambiado «Cine el sábado»'] };

module.exports = { createFakeFirestore, scenario, scenario2, EXPECT_1, EXPECT_2, T0 };
