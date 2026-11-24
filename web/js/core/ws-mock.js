'use strict';
// ZenCalendar: un Firebase de mentira (Auth + Firestore) en memoria, para probar los workspaces sin red.
//
// No lo carga index.html: lo carga ZC.ws._mock() (y las pruebas de tests/core). Imita lo poco que usa
// web/js/core/ws.js del SDK modular de Firebase (doc, collection, query/where, onSnapshot, getDoc,
// getDocs, setDoc, writeBatch, serverTimestamp, deleteField, arrayUnion, arrayRemove; GoogleAuthProvider,
// signInWithCredential, signInWithPopup, onAuthStateChanged, signOut) y comprueba cada lectura y cada
// escritura con las MISMAS reglas que firestore.rules (portadas a JS más abajo: si cambias unas, cambia las otras).
//
//   const fb = ZC.wsMock.create({ users: [{ uid, name, email, token }], me: 'uid', delay: 0 });
//   fb.sdk(uid?)        → { auth, db, F, AU } como el de verdad (uid: con la sesión ya iniciada como esa persona)
//   fb.googleToken      → el «token de Google» que da la app al iniciar sesión (por defecto el de `me`); 'malo' = rechazado
//   fb.client(uid)      → atajos para hacer de otra persona: get(path), set(path, data, merge), update(path, patch),
//                         batch([[op, path, data]]), del(path), join(code), items(wid)
//   fb.offline = true   → las escrituras se quedan pendientes (como sin conexión) hasta volver a false
//   fb.raw(path)        → el documento tal cual está en el «servidor» (sin reglas)
//   fb.log              → [{ op, path, uid, ok, why }] lo que se ha pedido
//   fb.listening()      → las rutas que se están escuchando (onSnapshot) ahora mismo
(function (root) {
  const ZC = root.ZC = root.ZC || {};

  const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const S_TS = '__serverTimestamp', S_DEL = '__deleteField', S_UNION = '__arrayUnion', S_REMOVE = '__arrayRemove';
  const isTs = v => isObj(v) && typeof v.__ts === 'number';
  const eq = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (isObj(v)) { const o = {}; for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]); return o; }
    return v;
  }

  function err(code, msg) { const e = new Error(msg || code); e.code = code; e.name = 'FirebaseError'; return e; }

  function create(opts) {
    opts = opts || {};
    const users = new Map();
    for (const u of (opts.users || [
      { uid: 'u-lluc', name: 'Lluc', email: 'lluc@example.com' },
      { uid: 'u-ana', name: 'Ana', email: 'ana@example.com' },
      { uid: 'u-bea', name: 'Bea', email: 'bea@example.com' },
    ])) users.set(u.uid, Object.assign({ token: 'tok-' + u.uid, photo: '', verified: true }, u));
    const me = opts.me || [...users.keys()][0];
    const docs = new Map();            // path → { data, v }
    const listeners = new Set();       // { path, isQuery, where, uid, cb, err, last: Map(id → json) | json, first }
    let seq = 0, autoId = 0, now0 = Date.now();
    const pending = [];                // escrituras sin conexión
    const S = {
      delay: opts.delay || 0, log: [], _off: false,
      googleToken: (users.get(me) || {}).token,
      users: () => [...users.values()].map(clone),
    };
    const time = () => Math.max(Date.now(), ++now0);
    const wait = () => new Promise(r => setTimeout(r, S.delay));

    // ---------- valores ----------
    function tsObj(ms) { return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6, toMillis: () => ms, toDate: () => new Date(ms), __ts: ms }; }
    function out(v) { // lo guardado → lo que da data() (fechas del servidor como Timestamp)
      if (isTs(v)) return tsObj(v.__ts);
      if (Array.isArray(v)) return v.map(out);
      if (isObj(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = out(v[k]); return o; }
      return v;
    }
    function resolve(v, at, old) { // centinelas → valores
      if (isObj(v) && v[S_TS]) return { __ts: at };
      if (isObj(v) && v[S_UNION]) { const base = Array.isArray(old) ? old.slice() : []; for (const x of v[S_UNION]) if (!base.some(y => eq(x, y))) base.push(clone(x)); return base; }
      if (isObj(v) && v[S_REMOVE]) { const base = Array.isArray(old) ? old : []; return base.filter(y => !v[S_REMOVE].some(x => eq(x, y))); }
      if (isObj(v) && v.toMillis && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
      if (Array.isArray(v)) return v.map(x => resolve(x, at));
      if (isObj(v) && !isTs(v)) { const o = {}; for (const k of Object.keys(v)) { if (isObj(v[k]) && v[k][S_DEL]) continue; o[k] = resolve(v[k], at, isObj(old) ? old[k] : undefined); } return o; }
      return v;
    }
    function applyWrite(oldData, w, at) {
      if (w.op === 'delete') return null;
      if (w.op === 'set' && !w.merge) return resolve(w.data, at);
      if (w.op === 'update' && !oldData) throw err('not-found', 'No existe ' + w.path);
      const base = clone(oldData) || {};
      if (w.op === 'set') { mergeDeep(base, w.data, at); return base; }
      for (const k of Object.keys(w.data)) { // update: claves con puntos = campos anidados
        const parts = k.split('.');
        let o = base;
        for (let i = 0; i < parts.length - 1; i++) { if (!isObj(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
        const last = parts[parts.length - 1], v = w.data[k];
        if (isObj(v) && v[S_DEL]) delete o[last]; else o[last] = resolve(v, at, o[last]);
      }
      return base;
    }
    function mergeDeep(base, patch, at) {
      for (const k of Object.keys(patch)) {
        const v = patch[k];
        if (isObj(v) && v[S_DEL]) { delete base[k]; continue; }
        if (isObj(v) && !v[S_TS] && !v[S_UNION] && !v[S_REMOVE] && !isTs(v) && !v.toMillis) { if (!isObj(base[k])) base[k] = {}; mergeDeep(base[k], v, at); }
        else base[k] = resolve(v, at, base[k]);
      }
    }

    // ---------- reglas (las de firestore.rules, en JS) ----------
    const has = (d, k) => isObj(d) && Object.prototype.hasOwnProperty.call(d, k);
    const g = (d, k, def) => (has(d, k) ? d[k] : def);
    const str = (v, n) => typeof v === 'string' && v.length <= n;
    const isColor = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
    const onlyKeys = (d, ks) => isObj(d) && Object.keys(d).every(k => ks.includes(k));
    const setEq = (a, b) => { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every(x => B.has(x)); };
    const affected = (a, b) => { a = a || {}; b = b || {}; const ks = new Set([...Object.keys(a), ...Object.keys(b)]); return [...ks].filter(k => !has(a, k) || !has(b, k) || !eq(a[k], b[k])); };
    const ICONS = ['casa', 'corazon', 'grupo', 'trabajo', 'libro', 'deporte', 'balon', 'avion', 'playa', 'montana', 'coche', 'comida', 'copa', 'cafe', 'tarta', 'musica', 'juego', 'pata', 'bebe', 'hoja', 'estrella', 'rayo', 'luna', 'sol', 'regalo', 'dinero', 'carrito', 'herramienta', 'salud', 'fiesta', 'camara', 'codigo', 'pincel', 'chat', 'calendario', 'campana', 'bandera', 'ubicacion', 'iglu', 'llave', ''];
    const validIcon = v => ICONS.includes(v);
    const isImage = v => typeof v === 'string' && /^data:image\/(webp|jpeg|png);base64,.+$/s.test(v);
    const validMember = m => onlyKeys(m, ['name', 'email', 'photo', 'joined']) && str(g(m, 'name', ''), 80) && str(g(m, 'email', ''), 200) && str(g(m, 'photo', ''), 1000);
    function validWs(d) {
      return onlyKeys(d, ['name', 'color', 'emoji', 'icon', 'avatar', 'bg', 'owner', 'members', 'memberIds', 'invitedEmails', 'inviteToken', 'createdAt', 'updatedAt'])
        && typeof d.name === 'string' && d.name.length > 0 && d.name.length <= 60 && isColor(d.color) && str(g(d, 'emoji', ''), 16)
        && validIcon(g(d, 'icon', '')) && str(g(d, 'avatar', ''), 32)
        && onlyKeys(d.bg, ['kind', 'value']) && ['none', 'color', 'image', 'anim'].includes(d.bg.kind) && str(g(d.bg, 'value', ''), 64)
        && typeof d.owner === 'string' && Array.isArray(d.memberIds) && d.memberIds.length <= 50
        && isObj(d.members) && setEq(Object.keys(d.members), d.memberIds)
        && Array.isArray(d.invitedEmails) && d.invitedEmails.length <= 50
        && typeof d.inviteToken === 'string' && d.inviteToken.length >= 16 && d.inviteToken.length <= 64;
    }
    const ITEM_KEYS = ['id', 'kind', 'title', 'notes', 'location', 'color', 'emoji', 'allDay', 'start', 'end', 'rrule', 'exdates', 'recurrenceOf', 'recurrenceDate', 'reminders', 'checklist', 'done', 'doneAt', 'doneDates', 'alarm', 'alarmTime', 'created', 'deleted', 'createdBy', 'updatedBy', 'assignee', 'updated'];

    function allow(op, path, C) {
      // C: { auth: { uid, email, verified } | null, res (antes), req (después), get(p), getAfter(p), exists(p), existsAfter(p), time }
      const p = path.split('/');
      const signed = !!C.auth, uid = signed && C.auth.uid;
      const myMail = signed ? (C.auth.email || '') : '';
      const mailOk = signed && C.auth.verified === true && myMail !== '';
      const invitedTo = d => signed && mailOk && g(d, 'invitedEmails', []).includes(myMail);
      if (p[0] !== 'workspaces') return false;
      const wid = p[1], wsP = 'workspaces/' + wid;
      const wsD = () => { const d = C.get(wsP); if (!d) throw new Error('get() de algo que no existe'); return d; };
      const isMember = () => signed && wsD().memberIds.includes(uid);
      const isOwner = () => signed && wsD().owner === uid;
      const isTime = v => isTs(v) && v.__ts === C.time;
      const R = C.res, Q = C.req;
      try {
        if (p.length === 2) {
          if (op === 'read') return signed && (R.memberIds.includes(uid) || invitedTo(R));
          if (op === 'create') return signed && validWs(Q) && Q.owner === uid && eq(Q.memberIds, [uid]) && validMember(Q.members[uid]) && isTime(Q.createdAt) && isTime(Q.updatedAt);
          if (op === 'delete') return signed && R.owner === uid;
          if (op !== 'update') return false;
          const changed = affected(Q, R), mch = affected(R.members, Q.members);
          const removed = R.memberIds.filter(x => !Q.memberIds.includes(x));
          const hasOnly = (list, ks) => list.every(k => ks.includes(k));
          const ownerEdit = () => R.owner === uid && Q.memberIds.includes(uid)
            && Q.memberIds.every(x => R.memberIds.includes(x))
            && hasOnly(changed, ['name', 'color', 'emoji', 'icon', 'avatar', 'bg', 'invitedEmails', 'inviteToken', 'members', 'memberIds', 'updatedAt'])
            && mch.every(k => removed.includes(k) || k === uid) && validMember(Q.members[uid]);
          const leaving = () => R.owner !== uid && R.memberIds.includes(uid) && hasOnly(changed, ['members', 'memberIds', 'updatedAt'])
            && setEq(Q.memberIds, R.memberIds.filter(x => x !== uid)) && hasOnly(mch, [uid]) && !has(Q.members, uid);
          const joinP = wsP + '/joins/' + uid;
          const joining = () => !R.memberIds.includes(uid) && hasOnly(changed, ['members', 'memberIds', 'invitedEmails', 'updatedAt'])
            && setEq(Q.memberIds, R.memberIds.concat([uid])) && Q.memberIds.length === R.memberIds.length + 1
            && hasOnly(mch, [uid]) && validMember(Q.members[uid])
            && ((C.existsAfter(joinP) && C.getAfter(joinP).token === R.inviteToken && eq(Q.invitedEmails, R.invitedEmails))
              || (invitedTo(R) && setEq(Q.invitedEmails, R.invitedEmails.filter(x => x !== myMail))));
          const declining = () => !R.memberIds.includes(uid) && invitedTo(R) && hasOnly(changed, ['invitedEmails', 'updatedAt'])
            && setEq(Q.invitedEmails, R.invitedEmails.filter(x => x !== myMail));
          return signed && validWs(Q) && Q.owner === R.owner && eq(Q.createdAt, R.createdAt) && isTime(Q.updatedAt)
            && (ownerEdit() || leaving() || joining() || declining());
        }
        const sub = p[2], id = p[3];
        if (sub === 'items' && p.length === 4) {
          const validItem = d => onlyKeys(d, ITEM_KEYS) && d.id === id && typeof d.createdBy === 'string' && d.updatedBy === uid && isTime(d.updated)
            && typeof g(d, 'deleted', false) === 'boolean' && ['event', 'task'].includes(g(d, 'kind', 'event'))
            && str(g(d, 'title', ''), 500) && str(g(d, 'notes', ''), 5000) && str(g(d, 'location', ''), 500)
            && str(g(d, 'start', ''), 16) && str(g(d, 'end', ''), 16)
            && Array.isArray(g(d, 'exdates', [])) && g(d, 'exdates', []).length <= 1000
            && Array.isArray(g(d, 'reminders', [])) && g(d, 'reminders', []).length <= 20
            && Array.isArray(g(d, 'checklist', [])) && g(d, 'checklist', []).length <= 200
            && (g(d, 'assignee', null) == null || wsD().memberIds.includes(g(d, 'assignee', null)));
          if (op === 'read') return isMember();
          if (op === 'create') return isMember() && validItem(Q) && Q.createdBy === uid;
          if (op === 'update') return isMember() && validItem(Q) && Q.createdBy === R.createdBy;
          if (op === 'delete') return isOwner();
        }
        if (sub === 'assets' && p.length === 4) {
          if (op === 'read') return isMember();
          if (op === 'create' || op === 'update') return isOwner() && ['bg', 'avatar'].includes(id) && onlyKeys(Q, ['data', 'updatedAt']) && typeof Q.data === 'string' && Q.data.length < (id === 'bg' ? 900000 : 90000) && isImage(Q.data) && isTime(Q.updatedAt);
          if (op === 'delete') return isOwner();
        }
        if (sub === 'invite' && p.length === 4) {
          if (op === 'read') return C.exists(wsP) && id === wsD().inviteToken;   // (sin sesión también: la página del enlace)
          if (op === 'create' || op === 'update') { const A = C.getAfter(wsP); return signed && !!A && A.owner === uid && id === A.inviteToken && onlyKeys(Q, ['name', 'color', 'emoji', 'icon', 'avatar', 'bg', 'ownerName', 'count']) && str(Q.name, 60) && isColor(Q.color) && str(g(Q, 'emoji', ''), 16) && validIcon(g(Q, 'icon', '')) && (g(Q, 'avatar', '') === '' || (isImage(Q.avatar) && Q.avatar.length < 90000)) && str(Q.ownerName, 80) && Number.isInteger(Q.count) && isObj(Q.bg); }
          if (op === 'delete') return isOwner();
        }
        if (sub === 'joins' && p.length === 4) {
          if (op === 'read') return signed && (id === uid || isOwner());
          if (op === 'create' || op === 'update') return signed && id === uid && onlyKeys(Q, ['token', 'name', 'email', 'photo', 'at']) && Q.token === wsD().inviteToken && str(Q.name, 80) && str(Q.email, 200) && str(Q.photo, 1000) && isTime(Q.at);
          if (op === 'delete') return signed && (id === uid || isOwner());
        }
      } catch (e) { return false; } // (como en Firestore: un error en la regla = no)
      return false;
    }

    // ---------- lecturas ----------
    const authOf = uid => { const u = uid && users.get(uid); return u ? { uid: u.uid, email: String(u.email || '').toLowerCase(), verified: u.verified !== false } : null; };
    const getD = p => (docs.has(p) ? docs.get(p).data : null);
    function canRead(uid, path) {
      const d = getD(path);
      const ok = allow('read', path, { auth: authOf(uid), res: d || {}, req: null, get: getD, exists: p => docs.has(p), time: Date.now() });
      return ok;
    }
    function matchQuery(q, path, data) {
      const parent = path.slice(0, path.lastIndexOf('/'));
      if (parent !== q.path) return false;
      for (const w of q.where || []) {
        const v = data[w.f];
        if (w.op === 'array-contains' && !(Array.isArray(v) && v.includes(w.v))) return false;
        if (w.op === '==' && !eq(v, w.v)) return false;
        if (w.op === '>' && !(isTs(v) ? v.__ts > (w.v && w.v.toMillis ? w.v.toMillis() : w.v) : v > w.v)) return false;
      }
      return true;
    }
    function runQuery(uid, q) {
      const res = [];
      for (const [path, rec] of docs) {
        if (!matchQuery(q, path, rec.data)) continue;
        if (!canRead(uid, path)) throw err('permission-denied', 'Missing or insufficient permissions.');
        res.push({ path, data: rec.data });
      }
      // una consulta sin filtros de una colección de la que no puedes leer nada: también se niega
      if (!res.length && (q.where || []).length === 0 && /^workspaces\/[^/]+\/items$/.test(q.path)) {
        const wsP = q.path.split('/').slice(0, 2).join('/');
        const w = getD(wsP);
        if (!w || !(w.memberIds || []).includes(uid)) throw err('permission-denied', 'Missing or insufficient permissions.');
      }
      return res;
    }
    const docSnap = (path, data, pend) => ({
      id: path.split('/').pop(), ref: { path, id: path.split('/').pop() },
      exists: () => !!data, data: () => (data ? out(clone(data)) : undefined),
      metadata: { hasPendingWrites: !!pend, fromCache: false },
    });

    // ---------- escrituras ----------
    async function commit(uid, writes) {
      if (S.delay) await wait();
      if (S.offline) return new Promise((ok, ko) => pending.push({ uid, writes, ok, ko }));
      return commitNow(uid, writes);
    }
    function commitNow(uid, writes) {
      const at = time();
      const staged = new Map();
      for (const w of writes) {
        const before = staged.has(w.path) ? staged.get(w.path) : getD(w.path);
        staged.set(w.path, applyWrite(before, w, at));
      }
      const getAfter = p => (staged.has(p) ? staged.get(p) : getD(p));
      for (const w of writes) {
        const res = getD(w.path), req = staged.get(w.path);
        const op = w.op === 'delete' ? 'delete' : res ? 'update' : 'create';
        if (op === 'delete' && !res) continue; // borrar lo que no existe: nada
        const ok = allow(op, w.path, { auth: authOf(uid), res: res || {}, req: req || {}, get: getD, getAfter, exists: p => docs.has(p), existsAfter: p => getAfter(p) != null, time: at });
        S.log.push({ op, path: w.path, uid, ok });
        if (!ok) throw err('permission-denied', 'Missing or insufficient permissions.');
      }
      for (const [p, d] of staged) { if (d == null) docs.delete(p); else docs.set(p, { data: d, v: ++seq }); }
      notify();
      return true;
    }
    function flushPending() {
      while (pending.length && !S.offline) {
        const x = pending.shift();
        try { x.ok(commitNow(x.uid, x.writes)); } catch (e) { x.ko(e); }
      }
    }

    // ---------- avisos (onSnapshot) ----------
    let notifyT = null;
    function notify() { if (notifyT) return; notifyT = setTimeout(() => { notifyT = null; for (const l of [...listeners]) fire(l); }, 0); }
    function fire(l) {
      if (l.dead) return;
      if (!l.isQuery) {
        if (!canRead(l.uid, l.path) && docs.has(l.path)) { l.dead = true; listeners.delete(l); if (l.err) l.err(err('permission-denied', 'Missing or insufficient permissions.')); return; }
        const rec = docs.get(l.path), key = rec ? rec.v : 0;
        if (!l.first && key === l.last) return;
        l.first = false; l.last = key;
        l.cb(docSnap(l.path, rec && rec.data));
        return;
      }
      let rows;
      try { rows = runQuery(l.uid, l.q); }
      catch (e) { l.dead = true; listeners.delete(l); if (l.err) l.err(e); return; }
      const now = new Map(rows.map(r => [r.path, docs.get(r.path).v]));
      const changes = [];
      for (const [p, v] of now) { if (!l.last.has(p)) changes.push({ type: 'added', p }); else if (l.last.get(p) !== v) changes.push({ type: 'modified', p }); }
      for (const p of l.last.keys()) if (!now.has(p)) changes.push({ type: 'removed', p, data: l.lastData.get(p) });
      if (!l.first && !changes.length) return;
      l.first = false;
      l.last = now;
      const lastData = new Map(rows.map(r => [r.path, r.data]));
      const snap = {
        docs: rows.map(r => docSnap(r.path, r.data)),
        size: rows.length, empty: !rows.length,
        metadata: { hasPendingWrites: false, fromCache: false },
        docChanges: () => changes.map(c => ({ type: c.type, doc: docSnap(c.p, c.type === 'removed' ? c.data : lastData.get(c.p)) })),
      };
      l.lastData = lastData;
      l.cb(snap);
    }

    // ---------- el «SDK» ----------
    function sdk(asUid) {
      const auth = { currentUser: null, _ls: new Set() };
      const userObj = u => ({ uid: u.uid, displayName: u.name, email: u.email, photoURL: u.photo || null, emailVerified: u.verified !== false, refreshToken: 'refresh-' + u.uid, providerData: [{ providerId: 'google.com' }] });
      if (asUid && users.has(asUid)) auth.currentUser = userObj(users.get(asUid));
      const setUser = u => { auth.currentUser = u; for (const fn of auth._ls) try { fn(u); } catch (e) { console.error(e); } };
      const cur = () => (auth.currentUser ? auth.currentUser.uid : null);
      const db = { _mock: true };
      class GoogleAuthProvider { constructor() { this.scopes = []; } addScope(s) { this.scopes.push(s); return this; } static credential(idToken, accessToken) { return { providerId: 'google.com', idToken, accessToken }; } }
      const AU = {
        GoogleAuthProvider,
        async signInWithCredential(a, cred) {
          if (S.delay) await wait();
          if (S.offline) throw err('auth/network-request-failed', 'Sin conexión');
          const tok = cred && (cred.accessToken || cred.idToken);
          const u = [...users.values()].find(x => x.token === tok);
          if (!u) throw err('auth/invalid-credential', 'El token de Google no vale');
          setUser(userObj(u));
          return { user: auth.currentUser };
        },
        async signInWithPopup() {
          const u = [...users.values()].find(x => x.token === S.googleToken);
          if (!u) throw err('auth/popup-closed-by-user', 'Cerrada');
          setUser(userObj(u));
          return { user: auth.currentUser };
        },
        onAuthStateChanged(a, fn) { auth._ls.add(fn); setTimeout(() => fn(auth.currentUser), 0); return () => auth._ls.delete(fn); },
        async signOut() { setUser(null); },
      };
      const ref = path => ({ path, id: path.split('/').pop(), type: 'doc' });
      const F = {
        doc(base, ...segs) {
          if (base && base.type === 'collection') return ref(base.path + '/' + (segs[0] || ('m' + (++autoId).toString(36) + Math.random().toString(36).slice(2, 10))));
          return ref(segs.join('/'));
        },
        collection(base, ...segs) { const path = base && base.type === 'doc' ? base.path + '/' + segs.join('/') : segs.join('/'); return { path, type: 'collection' }; },
        where: (f, op, v) => ({ f, op, v }),
        query: (col, ...w) => ({ path: col.path, type: 'query', where: w }),
        serverTimestamp: () => ({ [S_TS]: true }),
        deleteField: () => ({ [S_DEL]: true }),
        arrayUnion: (...v) => ({ [S_UNION]: v }),
        arrayRemove: (...v) => ({ [S_REMOVE]: v }),
        async getDoc(r) {
          if (S.delay) await wait();
          const d = getD(r.path);
          if (!canRead(cur(), r.path) && !(d == null && allowMissingRead(cur(), r.path))) throw err('permission-denied', 'Missing or insufficient permissions.');
          return docSnap(r.path, d);
        },
        async getDocs(q) {
          if (S.delay) await wait();
          const rows = runQuery(cur(), q.type === 'query' ? q : { path: q.path, where: [] });
          return { docs: rows.map(r => docSnap(r.path, r.data)), size: rows.length, empty: !rows.length };
        },
        async setDoc(r, data, o) { return commit(cur(), [{ op: 'set', path: r.path, data: clone2(data), merge: !!(o && o.merge) }]); },
        async updateDoc(r, data) { return commit(cur(), [{ op: 'update', path: r.path, data: clone2(data) }]); },
        async deleteDoc(r) { return commit(cur(), [{ op: 'delete', path: r.path }]); },
        writeBatch() {
          const ws = [];
          return {
            set(r, data, o) { ws.push({ op: 'set', path: r.path, data: clone2(data), merge: !!(o && o.merge) }); return this; },
            update(r, data) { ws.push({ op: 'update', path: r.path, data: clone2(data) }); return this; },
            delete(r) { ws.push({ op: 'delete', path: r.path }); return this; },
            commit: () => commit(cur(), ws),
          };
        },
        onSnapshot(r, next, error) {
          const l = { path: r.path, isQuery: r.type !== 'doc', q: r.type === 'query' ? r : { path: r.path, where: [] }, uid: cur(), cb: next, err: error, first: true, last: r.type === 'doc' ? 0 : new Map(), lastData: new Map() };
          listeners.add(l);
          setTimeout(() => fire(l), 0);
          return () => { l.dead = true; listeners.delete(l); };
        },
      };
      return { auth, db, AU, F, mock: true };
    }
    // (leer algo que no existe donde podrías leer: Firestore contesta «no existe»; aquí se mira la regla con lo que habría)
    function allowMissingRead(uid, path) {
      const p = path.split('/');
      if (p.length === 4 && (p[2] === 'invite' || p[2] === 'joins' || p[2] === 'assets')) {
        try { return allow('read', path, { auth: authOf(uid), res: {}, req: null, get: getD, exists: x => docs.has(x), time: Date.now() }); } catch (e) { return false; }
      }
      return false;
    }
    const clone2 = d => { // copia que respeta los centinelas y los Timestamp
      if (Array.isArray(d)) return d.map(clone2);
      if (isObj(d)) { if (d.toMillis) return { __ts: d.toMillis() }; const o = {}; for (const k of Object.keys(d)) if (d[k] !== undefined) o[k] = clone2(d[k]); return o; }
      return d;
    };

    // ---------- hacer de otra persona (pruebas) ----------
    function client(uid) {
      const K = sdk(uid), F = K.F;
      const r = p => F.doc(null, ...p.split('/'));
      return {
        sdk: K,
        get: p => F.getDoc(r(p)).then(s => s.data() || null),
        set: (p, d, merge) => F.setDoc(r(p), d, { merge: !!merge }),
        update: (p, d) => F.updateDoc(r(p), d),
        del: p => F.deleteDoc(r(p)),
        batch: list => { const b = F.writeBatch(); for (const [op, p, d] of list) { if (op === 'delete') b.delete(r(p)); else b[op](r(p), d); } return b.commit(); },
        items: wid => F.getDocs(F.collection(null, 'workspaces', wid, 'items')).then(s => s.docs.map(x => x.data())),
        list: () => F.getDocs(F.query(F.collection(null, 'workspaces'), F.where('memberIds', 'array-contains', uid))).then(s => s.docs.map(x => Object.assign({ id: x.id }, x.data()))),
        async join(code) {
          const [wid, token] = String(code).split('.');
          const u = users.get(uid);
          const b = F.writeBatch();
          b.set(r('workspaces/' + wid + '/joins/' + uid), { token, name: u.name, email: u.email, photo: u.photo || '', at: F.serverTimestamp() });
          b.update(r('workspaces/' + wid), { memberIds: F.arrayUnion(uid), ['members.' + uid]: { name: u.name, email: u.email, photo: u.photo || '', joined: Date.now() }, updatedAt: F.serverTimestamp() });
          return b.commit();
        },
        F,
      };
    }

    Object.defineProperty(S, 'offline', { get: () => S._off, set: v => { S._off = !!v; if (!v) flushPending(); } });
    return Object.assign(S, {
      sdk, client, allow,
      raw: p => clone(getD(p)),
      paths: () => [...docs.keys()],
      listening: () => [...listeners].filter(l => !l.dead).map(l => l.path),
      addUser(u) { users.set(u.uid, Object.assign({ token: 'tok-' + u.uid, photo: '', verified: true }, u)); },
    });
  }

  ZC.wsMock = { create };
})(typeof window !== 'undefined' ? window : globalThis);
