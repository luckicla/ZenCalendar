'use strict';
// ZenCalendar: workspaces compartidos (calendarios con amigos) sobre Firebase (Firestore + Auth con Google).
//
// Un workspace es un calendario que comparten varias personas: todos ven y editan sus eventos y tareas
// casi al momento. Vive en Firestore (workspaces/{wid} + items/…, ver docs/WORKSPACES.md y firestore.rules),
// nunca en Drive. Aquí se:
//   - carga el SDK de Firebase bajo demanda desde gstatic (import()), con la caché sin conexión de Firestore;
//   - inicia sesión en Firebase con el token de Google que ya tiene la app (ZC.drive) o, en la web, con su ventanita;
//   - escucha mis workspaces, las invitaciones por correo y los eventos de cada workspace (onSnapshot);
//   - pone cada workspace en ZC.store como un calendario virtual 'ws:<wid>' (las vistas, el editor y la IA
//     funcionan igual) y manda a Firestore lo que se guarda en él (ZC.store → ZC.ws._write);
//   - avisa de lo que cambian los demás (on('notice')) y da a Android/Windows lo necesario para avisar con la
//     app cerrada (ZC.platform.wsCreds).
// Sin configurar (config.firebase*) o sin sesión de Google, no hace nada y la app va como siempre.
//
// Modo simulado para probar sin red: await ZC.ws._mock({ users, me, signedIn }) (web/js/core/ws-mock.js).
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const SDK_V = '10.14.1';
  const SDK = 'https://www.gstatic.com/firebasejs/' + SDK_V + '/';
  const ITEM_KEYS = ['id', 'kind', 'title', 'notes', 'location', 'color', 'emoji', 'allDay', 'start', 'end', 'rrule', 'exdates',
    'recurrenceOf', 'recurrenceDate', 'reminders', 'checklist', 'done', 'doneAt', 'doneDates', 'alarm', 'alarmTime', 'created'];
  // los iconos propios de los workspaces (los dibujos, en web/js/ui/ws-icons.js; la lista, también en firestore.rules)
  const ICONS = ['casa', 'corazon', 'grupo', 'trabajo', 'libro', 'deporte', 'balon', 'avion', 'playa', 'montana', 'coche', 'comida',
    'copa', 'cafe', 'tarta', 'musica', 'juego', 'pata', 'bebe', 'hoja', 'estrella', 'rayo', 'luna', 'sol', 'regalo', 'dinero', 'carrito',
    'herramienta', 'salud', 'fiesta', 'camara', 'codigo', 'pincel', 'chat', 'calendario', 'campana', 'bandera', 'ubicacion', 'iglu', 'llave'];
  const ICON0 = 'estrella';                      // (el de los que no tienen, o tenían un emoji de antes)
  const AV_MAX = 90000, AV_PX = 256;             // foto de perfil: 256 px, < 60 KB (en base64, < 90 000 letras)
  const COLORS = ['#B9A2FF', '#FF9CCB', '#7CC8F2', '#7ED6C3', '#FFB38A', '#F2C14E', '#C38BEB', '#FF8A8A', '#86B862', '#6AAEF5'];
  const MSG = {
    off: 'Esta versión aún no tiene configurados los workspaces',
    net: 'Sin conexión: se guardará cuando vuelva internet',
    cred: 'Google no ha aceptado el inicio de sesión. Vuelve a intentarlo.',
    popup: 'Se cerró la ventana de Google',
    blocked: 'El navegador bloqueó la ventana de Google',
    perm: 'No tienes permiso para hacer esto en este workspace',
    link: 'Este enlace ya no vale: pide uno nuevo',
    load: 'No se pudieron cargar los workspaces',
    google: 'Conecta primero con Google',
    owner: 'El dueño no puede salirse: puede borrar el workspace',
    mail: 'Ese correo no parece válido',
    save: 'No se pudo guardar en el workspace',
    name: 'Ponle un nombre',
    big: 'La foto es demasiado grande',
  };

  const U = () => ZC.util;
  const S = () => ZC.store;
  const P = () => ZC.platform || {};
  const cfg = () => ZC.config || {};
  let bus = null;
  const E = () => (bus = bus || U().emitter());
  const on = (type, fn) => E().on(type, fn);
  const emit = (type, x) => { try { E().emit(type, x); } catch (e) { console.error(e); } };
  const local = (k, v) => (v === undefined ? S().local('ws.' + k) : S().local('ws.' + k, v));

  // ---------- estado ----------
  let K = null, loadP = null, MOCK = null;        // K: { auth, db, F, AU }
  const st = { connecting: false, error: null, signedIn: false, user: null, ready: false };
  const spaces = new Map();      // wid → workspace (ya normalizado)
  const invites = new Map();     // wid → workspace al que te han invitado por correo
  const itemDocs = new Map();    // wid → Map(id → documento tal cual)
  const itemUnsub = new Map();   // wid → función para dejar de escuchar
  const loaded = new Set();      // workspaces con la primera carga hecha
  const bgCache = new Map();     // wid → { v, url }
  const avCache = new Map();     // wid → { v, url } (foto de perfil)
  const creating = new Set();    // workspaces recién creados que el servidor aún no ha confirmado (no se escuchan todavía)
  const retries = new Map();     // wid → reintentos de escuchar sus eventos tras un «sin permiso»
  let unsubs = [], current = null, listening = false, queued = [], lastCreds = '';

  function available() {
    if (MOCK) return true;
    const c = cfg();
    if (P().isWidget) return false;
    return !!(c.firebaseApiKey && c.firebaseAppId && c.firebaseProjectId);
  }
  function state() {
    return Object.assign({ available: available(), current, count: spaces.size, invites: invites.size }, st, { user: st.user ? Object.assign({}, st.user) : null });
  }
  function set(patch) { Object.assign(st, patch); emit('state', state()); }

  // ---------- errores con texto para enseñar ----------
  function friendly(e) {
    if (!e) return MSG.save;
    if (e.wsMsg) return e.message;
    const c = String(e.code || '');
    if (/network|unavailable|offline/i.test(c) || e.network) return MSG.net;
    if (/popup-closed|cancelled-popup|user-cancelled/.test(c)) return MSG.popup;
    if (/popup-blocked/.test(c)) return MSG.blocked;
    if (/invalid-credential|invalid-idp-response|user-token-expired|credential/.test(c)) return MSG.cred;
    if (/permission-denied/.test(c)) return MSG.perm;
    if (/not-found/.test(c)) return MSG.link;
    return e.message || MSG.save;
  }
  function wsErr(msg) { const e = new Error(msg); e.wsMsg = true; return e; }

  // ---------- utilidades ----------
  const tsMs = v => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : v && typeof v.seconds === 'number' ? v.seconds * 1000 : 0);
  const clean = v => { // Firestore no acepta undefined
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object' && !(v.toMillis) && Object.getPrototypeOf(v) === Object.prototype) {
      const o = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = clean(v[k]); return o;
    }
    return v;
  };
  const cut = (s, n) => String(s == null ? '' : s).slice(0, n);
  function rndToken(n) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const b = new Uint8Array(n || 24);
    try { root.crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); }
    return [...b].map(x => A[x % A.length]).join('');
  }
  const isColor = c => /^#[0-9a-f]{6}$/i.test(String(c || ''));
  const normIcon = i => (ICONS.includes(i) ? i : ICON0);
  const isImg = v => typeof v === 'string' && /^data:image\/(webp|jpeg|png);base64,./.test(v);
  function normBg(bg) {
    bg = bg || {};
    const kind = ['none', 'color', 'image', 'anim'].includes(bg.kind) ? bg.kind : 'none';
    return { kind, value: cut(bg.value || '', 64) };
  }
  // «espera un poco»: si en ms no ha contestado (sin conexión), sigue; el error, si llega, se enseña después
  function settle(p, ms) {
    p.catch(e => { console.warn('[ZC] workspace', e); set({ error: friendly(e) }); });
    return Promise.race([p.then(() => true), new Promise(r => setTimeout(() => r(false), ms || 4000))]);
  }

  // ---------- SDK ----------
  function load() {
    if (K) return Promise.resolve(K);
    if (loadP) return loadP;
    if (!available()) return Promise.reject(wsErr(MSG.off));
    loadP = (async () => {
      const c = cfg();
      let mods;
      try { mods = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(SDK + f))); }
      catch (e) { const x = wsErr(MSG.net); x.network = true; throw x; }
      const [A, AU, F] = mods;
      const app = A.initializeApp({ apiKey: c.firebaseApiKey, appId: c.firebaseAppId, projectId: c.firebaseProjectId, messagingSenderId: c.firebaseSenderId || undefined, authDomain: c.firebaseProjectId + '.firebaseapp.com' }, 'zc-ws');
      let auth;
      try { auth = AU.initializeAuth(app, { persistence: [AU.indexedDBLocalPersistence, AU.browserLocalPersistence, AU.inMemoryPersistence], popupRedirectResolver: AU.browserPopupRedirectResolver }); }
      catch (e) { auth = AU.getAuth(app); }
      let db;
      try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
      catch (e) { console.warn('[ZC] Firestore sin caché persistente', e); db = F.initializeFirestore(app, { localCache: F.memoryLocalCache() }); }
      K = { auth, db, F, AU };
      return K;
    })();
    loadP.catch(() => { loadP = null; });
    return loadP;
  }
  // (web) bajar ya el SDK, por ejemplo al abrir el selector: así la ventanita de Google sale al momento
  function prepare() { if (available() && !K) load().then(watchAuth).catch(() => {}); }

  const F = () => K.F;
  const uid = () => (K && K.auth.currentUser ? K.auth.currentUser.uid : null);
  const wsRef = wid => F().doc(K.db, 'workspaces', wid);
  const subRef = (wid, sub, id) => F().doc(K.db, 'workspaces', wid, sub, id);
  const ts = () => F().serverTimestamp();

  // ---------- sesión ----------
  async function googleCredential(interactive) {
    const GP = K.AU.GoogleAuthProvider;
    if (MOCK) return GP.credential(null, MOCK.googleToken);
    const D = ZC.drive, kind = P().kind || 'web';
    if (D && D.available && D.available() && D._token) {
      if (!D.state().connected) {
        if (kind === 'web') return 'popup';
        if (!interactive) throw wsErr(MSG.google);
        await D.connect();
      }
      const tok = await D._token(interactive);
      return GP.credential(null, tok);
    }
    if (kind === 'web') return 'popup';
    throw wsErr(MSG.google);
  }

  async function connect(o) {
    o = o || {};
    if (!available()) throw wsErr(MSG.off);
    set({ connecting: true, error: null });
    try {
      await load();
      watchAuth();
      if (!K.auth.currentUser) {
        const cred = await googleCredential(o.interactive !== false);
        if (cred === 'popup') {
          const p = new K.AU.GoogleAuthProvider();
          p.addScope('email'); p.addScope('profile');
          if (p.setCustomParameters) p.setCustomParameters({ prompt: 'select_account' });
          await K.AU.signInWithPopup(K.auth, p);
        } else await K.AU.signInWithCredential(K.auth, cred);
      }
      await signedIn();
      return state();
    } catch (e) {
      set({ error: friendly(e) });
      throw wsErr(friendly(e));
    } finally { set({ connecting: false }); }
  }

  let authWatched = false;
  function watchAuth() {
    if (authWatched || !K) return;
    authWatched = true;
    K.AU.onAuthStateChanged(K.auth, u => {
      if (u && !listening) signedIn().catch(e => console.warn('[ZC] workspaces', e));
      if (!u && st.signedIn) stopAll(true);
    });
  }

  async function signedIn() {
    const u = K.auth.currentUser;
    if (!u) return;
    const user = { uid: u.uid, name: u.displayName || '', email: String(u.email || '').toLowerCase(), photo: u.photoURL || '' };
    local('signed', true);
    set({ signedIn: true, user, ready: true, error: null });
    startListening();
  }

  async function signOut() {
    stopAll(false);
    try { if (K) await K.AU.signOut(K.auth); } catch (e) {}
    local('signed', null); local('cache', null); local('current', null);
    set({ signedIn: false, user: null });
  }

  function stopAll(keepCache) {
    for (const f of unsubs) try { f(); } catch (e) {}
    for (const f of itemUnsub.values()) try { f(); } catch (e) {}
    unsubs = []; itemUnsub.clear(); itemDocs.clear(); loaded.clear(); listening = false;
    spaces.clear(); invites.clear(); bgCache.clear(); avCache.clear();
    current = null;
    try { S()._wsSet({ cur: null, calendars: [], reset: true }); } catch (e) {}
    if (!keepCache) { local('cache', null); }
    set({ signedIn: false, user: keepCache ? st.user : null });
    creds();
    emit('change');
  }

  // ---------- escuchar ----------
  function startListening() {
    if (listening) return;
    listening = true;
    const me = uid(), mail = st.user.email;
    const col = F().collection(K.db, 'workspaces');
    unsubs.push(F().onSnapshot(F().query(col, F().where('memberIds', 'array-contains', me)), snap => {
      const seenIds = new Set();
      for (const d of snap.docs) { seenIds.add(d.id); spaces.set(d.id, norm(d.id, d.data())); avNeed(d.id); }
      for (const wid of [...spaces.keys()]) if (!seenIds.has(wid)) dropSpace(wid, 'gone');
      // (uno recién creado se escucha cuando el servidor confirma que existe: antes, las reglas dicen que no)
      for (const wid of spaces.keys()) if (!creating.has(wid)) watchItems(wid);
      pushCalendars();
      saveCache();
      if (current && !spaces.has(current)) switchTo(null).catch(() => {});
      st.loadedList = true;
      emit('change');
      creds();
    }, e => { console.warn('[ZC] workspaces', e); set({ error: MSG.load }); }));
    if (mail) {
      unsubs.push(F().onSnapshot(F().query(col, F().where('invitedEmails', 'array-contains', mail)), snap => {
        const before = new Set(invites.keys());
        invites.clear();
        for (const d of snap.docs) if (!(d.data().memberIds || []).includes(me)) invites.set(d.id, norm(d.id, d.data()));
        for (const wid of invites.keys()) if (!before.has(wid) && st.loadedInv) emit('notice', { kind: 'invite', wid, ws: invites.get(wid), who: ownerName(invites.get(wid)), title: invites.get(wid).name });
        st.loadedInv = true;
        emit('change');
      }, e => console.warn('[ZC] invitaciones', e)));
    }
    // lo que se guardó antes de tener sesión
    const q = queued; queued = [];
    if (q.length) _write(q).catch(() => {});
  }

  function norm(id, d) {
    d = d || {};
    const members = Object.keys(d.members || {}).map(k => Object.assign({ uid: k }, d.members[k], { owner: k === d.owner }))
      .sort((a, b) => (b.owner - a.owner) || (tsMs(a.joined) - tsMs(b.joined)));
    return {
      id, name: d.name || '', color: isColor(d.color) ? d.color : COLORS[0], icon: normIcon(d.icon), avatar: cut(d.avatar || '', 32), _emoji: !!d.emoji, bg: normBg(d.bg),
      owner: d.owner || '', isOwner: !!(uid() && d.owner === uid()), members, memberIds: (d.memberIds || []).slice(),
      invitedEmails: (d.invitedEmails || []).slice(), inviteToken: d.inviteToken || '',
      createdAt: tsMs(d.createdAt), updatedAt: tsMs(d.updatedAt),
    };
  }
  const ownerName = w => { const m = w && w.members.find(x => x.owner); return (m && (m.name || m.email)) || ''; };
  const memberName = (wid, u) => { const w = spaces.get(wid); const m = w && w.members.find(x => x.uid === u); return (m && (m.name || (m.email || '').split('@')[0])) || ''; };

  function dropSpace(wid, why) {
    const was = spaces.get(wid);
    spaces.delete(wid);
    const f = itemUnsub.get(wid); if (f) try { f(); } catch (e) {}
    itemUnsub.delete(wid); itemDocs.delete(wid); loaded.delete(wid); bgCache.delete(wid); avCache.delete(wid);
    S()._wsSet({ clear: wid });
    if (was && why === 'gone' && st.loadedList) emit('notice', { kind: 'removed', wid, ws: was, title: was.name });
  }

  function watchItems(wid) {
    if (itemUnsub.has(wid)) return;
    const docsMap = new Map();
    itemDocs.set(wid, docsMap);
    const me = uid();
    const off = F().onSnapshot(F().collection(K.db, 'workspaces', wid, 'items'), snap => {
      const first = !loaded.has(wid);
      loaded.add(wid); retries.delete(wid);
      const items = [], notes = [];
      const seenAt = (local('seen') || {})[wid] || 0;
      let unreadAdd = 0;
      for (const ch of snap.docChanges()) {
        const id = ch.doc.id, prev = docsMap.get(id);
        if (ch.type === 'removed') { docsMap.delete(id); items.push({ id, deleted: true, calendarId: 'ws:' + wid }); continue; }
        const d = ch.doc.data({ serverTimestamps: 'estimate' }) || {};
        docsMap.set(id, d);
        items.push(toEvent(wid, id, d));
        const other = d.updatedBy && d.updatedBy !== me && !(ch.doc.metadata && ch.doc.metadata.hasPendingWrites);
        if (!other) continue;
        if (first) { if (tsMs(d.updated) > seenAt && !(d.deleted && !prev)) unreadAdd++; continue; }
        const kind = d.deleted ? (prev && !prev.deleted ? 'delete' : null)
          : (!prev || prev.deleted) ? (d.assignee === me ? 'assign' : 'add')
          : (d.assignee === me && prev.assignee !== me) ? 'assign'
          : (d.kind === 'task' && d.done && !prev.done) ? 'done' : 'edit';
        if (!kind) continue;
        notes.push({ kind, wid, id, who: memberName(wid, d.updatedBy), whoId: d.updatedBy, title: d.title || (prev && prev.title) || '', emoji: d.emoji || '', ws: spaces.get(wid), task: d.kind === 'task' });
      }
      if (items.length) S()._wsSet({ items });
      const visible = !(root.document && root.document.hidden);
      if (unreadAdd || notes.length) {
        const un = local('unread') || {};
        const add = unreadAdd + (current === wid && visible ? 0 : notes.length);
        if (add && !(first && current === wid)) { un[wid] = (un[wid] || 0) + add; local('unread', un); }
        if (first && current === wid) markSeen(wid);
      }
      for (const n of notes) emit('notice', Object.assign(n, { here: current === wid, hidden: !visible }));
      emit('items', { wid, first });
      if (notes.length || first) emit('change');
    }, e => {
      itemUnsub.delete(wid); itemDocs.delete(wid); loaded.delete(wid);
      // recién creado o recién entrado, el servidor puede no saber aún que eres miembro: se reintenta en silencio
      const n = retries.get(wid) || 0;
      if (e && e.code === 'permission-denied' && n < 3 && spaces.has(wid)) {
        retries.set(wid, n + 1);
        setTimeout(() => { if (spaces.has(wid) && listening) watchItems(wid); }, 700 * (n + 1));
        return;
      }
      // (te han echado o lo han borrado: la lista de workspaces lo quitará)
      if (spaces.has(wid)) console.warn('[ZC] workspace ' + wid, e && e.code);
    });
    itemUnsub.set(wid, off);
  }

  function toEvent(wid, id, d) {
    const cal = 'ws:' + wid;
    if (d.deleted) return { id, deleted: true, calendarId: cal };
    const e = {
      id, kind: d.kind === 'task' ? 'task' : 'event', title: d.title || '', notes: d.notes || '', location: d.location || '',
      calendarId: cal, color: isColor(d.color) ? d.color : null, emoji: d.emoji || null, allDay: !!d.allDay,
      start: d.start || '', end: d.end || d.start || '', rrule: d.rrule || null, exdates: d.exdates || [], recurrenceOf: d.recurrenceOf || null,
      reminders: Array.isArray(d.reminders) ? d.reminders : [], attachments: [], checklist: Array.isArray(d.checklist) ? d.checklist : [],
      done: !!d.done, doneAt: d.doneAt || null, alarm: !!d.alarm, alarmTime: d.alarmTime || null,
      created: d.created || tsMs(d.updated), updated: tsMs(d.updated) || Date.now(), deleted: false,
      createdBy: d.createdBy || '', updatedBy: d.updatedBy || '', assignee: d.assignee || null,
    };
    if (d.recurrenceDate) e.recurrenceDate = d.recurrenceDate;
    if (Array.isArray(d.doneDates)) e.doneDates = d.doneDates;
    return e;
  }

  function fromEvent(wid, e, prev) {
    const w = spaces.get(wid);
    const me = uid();
    // (la lápida lleva el título, para que el aviso diga qué se ha borrado)
    if (e.deleted) return { id: e.id, deleted: true, title: cut((prev && prev.title) || e.title || '', 500), createdBy: (prev && prev.createdBy) || e.createdBy || me, updatedBy: me, updated: ts() };
    const o = {};
    for (const k of ITEM_KEYS) if (e[k] !== undefined) o[k] = e[k];
    o.id = e.id;
    o.title = cut(o.title, 500); o.notes = cut(o.notes, 5000); o.location = cut(o.location, 500);
    o.start = cut(o.start, 16); o.end = cut(o.end, 16);
    if (Array.isArray(o.exdates)) o.exdates = o.exdates.slice(0, 1000);
    if (Array.isArray(o.reminders)) o.reminders = o.reminders.slice(0, 20);
    if (Array.isArray(o.checklist)) o.checklist = o.checklist.slice(0, 200);
    o.deleted = false;
    o.createdBy = (prev && prev.createdBy) || e.createdBy || me;
    o.updatedBy = me;
    // (para alguien que ya no está, nadie)
    o.assignee = e.assignee && w && w.memberIds.includes(e.assignee) ? e.assignee : null;
    o.updated = ts();
    return clean(o);
  }

  // ---------- ZC.store → Firestore ----------
  async function _write(list) {
    list = (list || []).filter(e => e && S().isWsId(e.calendarId));
    if (!list.length) return;
    if (!K || !uid() || !listening) { queued.push(...list); return; }
    const writes = [];
    for (const e of list) {
      const wid = e.calendarId.slice(3);
      if (!spaces.has(wid)) continue;
      const docs = itemDocs.get(wid) || new Map();
      writes.push([wid, e.id, fromEvent(wid, e, docs.get(e.id))]);
      // ¿estaba en otro workspace? (se ha movido): allí queda como lápida
      if (!e.deleted) for (const [w2, m2] of itemDocs) if (w2 !== wid && m2.has(e.id) && !m2.get(e.id).deleted) writes.push([w2, e.id, fromEvent(w2, { id: e.id, deleted: true }, m2.get(e.id))]);
    }
    const commits = [];
    for (let i = 0; i < writes.length; i += 400) {
      const b = F().writeBatch(K.db);
      for (const [wid, id, data] of writes.slice(i, i + 400)) b.set(subRef(wid, 'items', id), data);
      commits.push(b.commit());
    }
    const all = Promise.all(commits);
    all.catch(e => { console.warn('[ZC] workspace: no se pudo guardar', e); set({ error: e && e.code === 'permission-denied' ? MSG.perm : MSG.save }); emit('notice', { kind: 'error', title: friendly(e) }); });
    return settle(all, 3000);
  }

  async function _saveCalendar(partial) {
    const wid = String(partial.id).slice(3), w = spaces.get(wid);
    if (w && w.isOwner && ((partial.color && partial.color !== w.color) || (partial.name && partial.name !== w.name))) {
      await update(wid, { color: partial.color || w.color, name: partial.name || w.name });
    }
    return S().calendar(partial.id);
  }

  function pushCalendars() {
    const cals = list().map((w, i) => ({ id: 'ws:' + w.id, name: w.name, color: w.color, icon: w.icon, wsId: w.id, order: -100 + i, visible: true, source: 'ws' }));
    const patch = { calendars: cals };
    if (current && !spaces.has(current) && st.loadedList) patch.cur = null;
    S()._wsSet(patch);
  }

  // copia pequeñita para pintar al momento al abrir (nombre, color, fondo…), antes de que conteste Firebase
  function saveCache() {
    const sp = {};
    for (const w of spaces.values()) {
      const av = avCache.get(w.id);
      sp[w.id] = { name: w.name, color: w.color, icon: w.icon, avatar: w.avatar, bg: w.bg, owner: w.owner, members: w.members.slice(0, 8).map(m => ({ uid: m.uid, name: m.name, photo: m.photo, owner: m.owner })) };
      // (la foto de perfil también, para verla sin conexión y al abrir)
      if (w.avatar && av && av.v === w.avatar) sp[w.id].av = av.url;
    }
    local('cache', { uid: uid(), user: st.user, spaces: sp });
  }
  function fromCache() {
    const c = local('cache');
    if (!c || !c.spaces) return;
    for (const id of Object.keys(c.spaces)) {
      const x = c.spaces[id];
      if (x.av && x.avatar && isImg(x.av)) avCache.set(id, { v: x.avatar, url: x.av });
      spaces.set(id, { id, name: x.name, color: x.color, icon: normIcon(x.icon), avatar: x.avatar || '', bg: normBg(x.bg), owner: x.owner, isOwner: x.owner === c.uid, members: x.members || [], memberIds: (x.members || []).map(m => m.uid), invitedEmails: [], inviteToken: '', cached: true });
    }
    if (c.user) st.user = c.user;
  }

  // ---------- consultas ----------
  const pub = w => (w ? JSON.parse(JSON.stringify(w)) : null);
  function list() { return [...spaces.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.name.localeCompare(b.name)).map(pub); }
  const get = wid => pub(spaces.get(wid));
  const cur = () => (current ? pub(spaces.get(current)) : null);
  function pendingInvites() { return [...invites.values()].map(pub); }
  function unread(wid) { const u = local('unread') || {}; if (wid) return u[wid] || 0; return Object.keys(u).filter(k => spaces.has(k)).reduce((a, k) => a + (u[k] || 0), 0); }
  function markSeen(wid) {
    const seen = local('seen') || {}; seen[wid] = Date.now(); local('seen', seen);
    const u = local('unread') || {}; if (u[wid]) { delete u[wid]; local('unread', u); }
  }
  const members = wid => { const w = spaces.get(wid); return w ? pub(w.members) : []; };
  const user = () => (st.user ? Object.assign({}, st.user) : null);
  const isOwner = wid => { const w = spaces.get(wid); return !!(w && w.isOwner); };
  const dim = () => !!local('dim');

  // ---------- cambiar de calendario ----------
  async function switchTo(wid) {
    wid = wid || null;
    if (wid && !spaces.has(wid)) throw wsErr(MSG.link);
    current = wid;
    local('current', wid);
    S()._wsSet({ cur: wid, dim: dim() });
    if (wid) { markSeen(wid); bgData(wid).catch(() => {}); }
    emit('change');
    return cur();
  }
  function setDim(v) { local('dim', v ? true : null); S()._wsSet({ dim: !!v }); emit('change'); }

  // ---------- crear y cambiar ----------
  function meMember() {
    const u = st.user || {};
    return { name: cut(u.name || (u.email || '').split('@')[0], 80), email: cut(u.email, 200), photo: cut(u.photo, 1000), joined: Date.now() };
  }
  // (la foto de perfil va también aquí, pequeña: la ve quien abre el enlace antes de entrar)
  const preview = (d, av) => ({ name: d.name, color: d.color, icon: normIcon(d.icon), avatar: d.avatar && isImg(av) ? av : '', bg: { kind: d.bg.kind === 'image' ? 'image' : d.bg.kind, value: d.bg.kind === 'image' ? '' : d.bg.value }, ownerName: cut((d.members[d.owner] || {}).name || '', 80), count: (d.memberIds || []).length });
  async function avNow(wid) { try { return await avData(wid); } catch (e) { const c = avCache.get(wid); return c ? c.url : null; } }
  function rawOf(wid) { // el workspace con la forma de Firestore (para preview)
    const w = spaces.get(wid);
    const m = {}; for (const x of w.members) m[x.uid] = { name: x.name || '' };
    return { name: w.name, color: w.color, icon: w.icon, avatar: w.avatar, bg: w.bg, owner: w.owner, members: m, memberIds: w.memberIds };
  }
  async function needSession() { if (!K || !uid()) await connect({ interactive: true }); }

  async function create(o) {
    o = o || {};
    await needSession();
    const name = cut(String(o.name || '').trim(), 60);
    if (!name) throw wsErr(MSG.name);
    const me = uid();
    const ref = F().doc(F().collection(K.db, 'workspaces'));
    const wid = ref.id, token = rndToken(24);
    const data = {
      name, color: isColor(o.color) ? o.color : COLORS[spaces.size % COLORS.length], icon: normIcon(o.icon), avatar: '', bg: normBg(o.bg),
      owner: me, members: { [me]: meMember() }, memberIds: [me], invitedEmails: [], inviteToken: token, createdAt: ts(), updatedAt: ts(),
    };
    const b = F().writeBatch(K.db);
    b.set(ref, data);
    b.set(subRef(wid, 'invite', token), preview(data));
    creating.add(wid);
    const p = b.commit();
    // (sin conexión Firestore ya lo tiene en su caché: se ve al momento y se manda al volver internet;
    //  sus eventos se escuchan cuando el servidor lo confirma, que antes de eso las reglas no dejan leerlos)
    p.then(() => { creating.delete(wid); if (spaces.has(wid) && listening) watchItems(wid); }, () => { creating.delete(wid); });
    spaces.set(wid, norm(wid, Object.assign({}, data, { createdAt: Date.now(), updatedAt: Date.now() })));
    pushCalendars();
    emit('change');
    try { await settle(p, 4000); } catch (e) { throw wsErr(friendly(e)); }
    return get(wid);
  }

  async function update(wid, patch) {
    await needSession();
    const w = spaces.get(wid);
    if (!w) throw wsErr(MSG.link);
    if (!w.isOwner) throw wsErr(MSG.perm);
    const up = { updatedAt: ts() };
    if ('name' in patch) { const n = cut(String(patch.name || '').trim(), 60); if (!n) throw wsErr(MSG.name); up.name = n; }
    if ('color' in patch && isColor(patch.color)) up.color = patch.color;
    if ('icon' in patch) up.icon = normIcon(patch.icon);
    if ('bg' in patch) up.bg = normBg(patch.bg);
    const next = Object.assign(rawOf(wid), up);
    // (el emoji de antes se va: ahora es un icono)
    if (w._emoji) { up.emoji = F().deleteField(); w._emoji = false; }
    const av = w.avatar ? await avNow(wid) : null;
    const b = F().writeBatch(K.db);
    b.update(wsRef(wid), up);
    if (w.inviteToken) b.set(subRef(wid, 'invite', w.inviteToken), preview(next, av));
    const p = b.commit();
    Object.assign(w, { name: next.name, color: next.color, icon: next.icon, bg: normBg(next.bg) });
    pushCalendars(); emit('change');
    await settle(p);
    return get(wid);
  }

  // foto de fondo: se reduce a 1600 px y < 600 KB (webp) y va en workspaces/{wid}/assets/bg
  async function shrink(file) {
    if (typeof file === 'string' && /^data:image\//.test(file)) return file;
    const bmp = await createImageBitmap(file);
    let max = 1600, q = 0.82, url = '';
    for (let i = 0; i < 6; i++) {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      url = cv.toDataURL('image/webp', q);
      if (!/^data:image\/webp/.test(url)) url = cv.toDataURL('image/jpeg', q);
      if (url.length < 600000) break;
      max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.08);
    }
    if (bmp.close) bmp.close();
    if (url.length >= 880000) throw wsErr(MSG.big);
    return url;
  }
  async function setBackground(wid, file) {
    await needSession();
    const w = spaces.get(wid);
    if (!w || !w.isOwner) throw wsErr(MSG.perm);
    const b = F().writeBatch(K.db);
    let bg;
    if (file) {
      const data = await shrink(file);
      bg = { kind: 'image', value: String(Date.now()) };
      b.set(subRef(wid, 'assets', 'bg'), { data, updatedAt: ts() });
      bgCache.set(wid, { v: bg.value, url: data });
    } else {
      bg = { kind: 'none', value: '' };
      b.delete(subRef(wid, 'assets', 'bg'));
      bgCache.delete(wid);
    }
    b.update(wsRef(wid), { bg, updatedAt: ts() });
    if (w.inviteToken) b.set(subRef(wid, 'invite', w.inviteToken), preview(Object.assign(rawOf(wid), { bg }), w.avatar ? await avNow(wid) : null));
    const p = b.commit();
    w.bg = bg; emit('change');
    await settle(p, 8000);
    return get(wid);
  }
  /** la foto de fondo (dataURL) o null; si no está bajada, la baja y avisa con 'change' */
  function bgURL(wid) {
    const w = spaces.get(wid), c = bgCache.get(wid);
    if (!w || w.bg.kind !== 'image') return null;
    if (c && c.v === w.bg.value) return c.url;
    bgData(wid).catch(() => {});
    return c ? c.url : null;
  }
  const bgLoading = new Map();
  async function bgData(wid) {
    const w = spaces.get(wid);
    if (!w || w.bg.kind !== 'image' || !K || !uid()) return null;
    const c = bgCache.get(wid);
    if (c && c.v === w.bg.value) return c.url;
    if (bgLoading.has(wid)) return bgLoading.get(wid);
    const p = (async () => {
      const s = await F().getDoc(subRef(wid, 'assets', 'bg'));
      const d = s.exists() ? s.data() : null;
      if (!d || !d.data) return null;
      bgCache.set(wid, { v: w.bg.value, url: d.data });
      emit('change');
      return d.data;
    })();
    bgLoading.set(wid, p);
    try { return await p; } finally { bgLoading.delete(wid); }
  }

  // ---------- foto de perfil: cuadrada, 256 px, webp < 60 KB, en workspaces/{wid}/assets/avatar ----------
  /** File/Blob → dataURL cuadrado (recorte centrado; crop = { x, y, size } en píxeles de la foto para otro recorte) */
  async function squareAvatar(file, crop) {
    if (typeof file === 'string') return file;
    const bmp = await createImageBitmap(file);
    const side = Math.min(bmp.width, bmp.height);
    const c = crop && crop.size > 0 ? crop : { x: (bmp.width - side) / 2, y: (bmp.height - side) / 2, size: side };
    const cv = document.createElement('canvas');
    cv.width = cv.height = AV_PX;
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, c.x, c.y, c.size, c.size, 0, 0, AV_PX, AV_PX);
    if (bmp.close) bmp.close();
    return compressAvatar(cv);
  }
  /** un canvas cuadrado → dataURL webp (o jpeg si no hay webp) de menos de 60 KB */
  function compressAvatar(cv) {
    let q = 0.86, url = '';
    for (let i = 0; i < 7; i++) {
      url = cv.toDataURL('image/webp', q);
      if (!/^data:image\/webp/.test(url)) url = cv.toDataURL('image/jpeg', q);
      if (url.length < 80000) break;
      q = Math.max(0.3, q - 0.1);
    }
    return url;
  }
  /** setAvatar(wid, file | dataURL | null, crop?): la pone (o la quita, con null). Solo el dueño. */
  async function setAvatar(wid, src, crop) {
    await needSession();
    const w = spaces.get(wid);
    if (!w || !w.isOwner) throw wsErr(MSG.perm);
    const b = F().writeBatch(K.db);
    let v = '', data = null;
    if (src) {
      data = await squareAvatar(src, crop);
      if (!isImg(data) || data.length >= AV_MAX) throw wsErr(MSG.big);
      v = String(Date.now());
      b.set(subRef(wid, 'assets', 'avatar'), { data, updatedAt: ts() });
      avCache.set(wid, { v, url: data });
    } else {
      b.delete(subRef(wid, 'assets', 'avatar'));
      avCache.delete(wid);
    }
    b.update(wsRef(wid), { avatar: v, updatedAt: ts() });
    w.avatar = v;
    if (w.inviteToken) b.set(subRef(wid, 'invite', w.inviteToken), preview(rawOf(wid), data));
    const p = b.commit();
    pushCalendars(); saveCache(); emit('change');
    await settle(p, 6000);
    return get(wid);
  }
  /** la foto de perfil (dataURL) o null; si no está bajada, la baja y avisa con 'change' */
  function avatarURL(wid) {
    const w = spaces.get(wid), c = avCache.get(wid);
    if (!w || !w.avatar) return null;
    if (c && c.v === w.avatar) return c.url;
    avData(wid).catch(() => {});
    return c ? c.url : null;
  }
  function avNeed(wid) { const w = spaces.get(wid), c = avCache.get(wid); if (w && w.avatar && !(c && c.v === w.avatar)) avData(wid).catch(() => {}); }
  const avLoading = new Map();
  async function avData(wid) {
    const w = spaces.get(wid);
    if (!w || !w.avatar) return null;
    const c = avCache.get(wid);
    if (c && c.v === w.avatar) return c.url;
    if (!K || !uid()) return c ? c.url : null;
    if (avLoading.has(wid)) return avLoading.get(wid);
    const v = w.avatar;
    const p = (async () => {
      const s = await F().getDoc(subRef(wid, 'assets', 'avatar'));
      const d = s.exists() ? s.data() : null;
      if (!d || !isImg(d.data)) return null;
      avCache.set(wid, { v, url: d.data });
      saveCache();
      emit('change');
      return d.data;
    })();
    avLoading.set(wid, p);
    try { return await p; } finally { avLoading.delete(wid); }
  }

  // ---------- invitar ----------
  function inviteLink(wid) {
    const w = spaces.get(wid);
    if (!w || !w.inviteToken) return '';
    return (cfg().inviteBase || 'https://luckicla.github.io/ZenCalendar/w/') + '#' + wid + '.' + w.inviteToken;
  }
  async function regenerateLink(wid) {
    await needSession();
    const w = spaces.get(wid);
    if (!w || !w.isOwner) throw wsErr(MSG.perm);
    const old = w.inviteToken, token = rndToken(24);
    const b = F().writeBatch(K.db);
    b.update(wsRef(wid), { inviteToken: token, updatedAt: ts() });
    if (old) b.delete(subRef(wid, 'invite', old));
    b.set(subRef(wid, 'invite', token), preview(rawOf(wid), w.avatar ? await avNow(wid) : null));
    const p = b.commit();
    w.inviteToken = token; emit('change');
    await settle(p);
    return inviteLink(wid);
  }
  async function inviteEmail(wid, email) {
    await needSession();
    email = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw wsErr(MSG.mail);
    const w = spaces.get(wid);
    if (!w || !w.isOwner) throw wsErr(MSG.perm);
    if (w.members.some(m => (m.email || '').toLowerCase() === email)) return get(wid);
    const p = F().writeBatch(K.db).update(wsRef(wid), { invitedEmails: F().arrayUnion(email), updatedAt: ts() }).commit();
    if (!w.invitedEmails.includes(email)) w.invitedEmails.push(email);
    emit('change');
    await settle(p);
    return get(wid);
  }
  async function uninviteEmail(wid, email) {
    await needSession();
    const w = spaces.get(wid);
    if (!w || !w.isOwner) throw wsErr(MSG.perm);
    const p = F().writeBatch(K.db).update(wsRef(wid), { invitedEmails: F().arrayRemove(email), updatedAt: ts() }).commit();
    w.invitedEmails = w.invitedEmails.filter(x => x !== email);
    emit('change');
    await settle(p);
  }

  // ---------- entrar ----------
  /** 'wid.token', '#wid.token', el enlace entero, '?join=…' o 'zencalendar://join/#…' → { wid, token } | null */
  function parseCode(code) {
    let s = String(code || '').trim();
    const m = s.match(/(?:[#?&]join=|#|^)([A-Za-z0-9]{8,40})\.([A-Za-z0-9_-]{16,64})\s*$/) || s.match(/([A-Za-z0-9]{8,40})\.([A-Za-z0-9_-]{16,64})/);
    return m ? { wid: m[1], token: m[2] } : null;
  }
  /** lo que se ve antes de entrar: { wid, name, color, icon, avatarURL, bg, ownerName, count, member } */
  async function peek(code) {
    const c = parseCode(code);
    if (!c) throw wsErr(MSG.link);
    await needSession();
    if (spaces.has(c.wid)) { const w = spaces.get(c.wid); return { wid: c.wid, name: w.name, color: w.color, icon: w.icon, avatarURL: (w.avatar && await avNow(c.wid)) || '', bg: w.bg, ownerName: ownerName(w), count: w.members.length, member: true }; }
    let s;
    try { s = await F().getDoc(subRef(c.wid, 'invite', c.token)); } catch (e) { throw wsErr(e && /permission|not-found/.test(e.code || '') ? MSG.link : friendly(e)); }
    if (!s.exists()) throw wsErr(MSG.link);
    const d = s.data();
    return { wid: c.wid, name: d.name, color: d.color, icon: normIcon(d.icon), avatarURL: isImg(d.avatar) ? d.avatar : '', bg: normBg(d.bg), ownerName: d.ownerName || '', count: d.count || 1, member: false };
  }
  async function waitFor(wid, ms) {
    const t0 = Date.now();
    while (!spaces.has(wid) && Date.now() - t0 < (ms || 8000)) await new Promise(r => setTimeout(r, 60));
    return spaces.has(wid);
  }
  async function join(code) {
    const c = parseCode(code);
    if (!c) throw wsErr(MSG.link);
    await needSession();
    if (!spaces.has(c.wid)) {
      const me = uid(), m = meMember();
      const b = F().writeBatch(K.db);
      b.set(subRef(c.wid, 'joins', me), { token: c.token, name: m.name, email: m.email, photo: m.photo, at: ts() });
      b.update(wsRef(c.wid), { memberIds: F().arrayUnion(me), ['members.' + me]: m, updatedAt: ts() });
      try { await b.commit(); }
      catch (e) { throw wsErr(e && /permission|not-found/.test(e.code || '') ? MSG.link : friendly(e)); }
      await waitFor(c.wid, 10000);
    }
    if (spaces.has(c.wid)) await switchTo(c.wid);
    return get(c.wid);
  }
  async function acceptInvite(wid) {
    await needSession();
    const me = uid();
    const b = F().writeBatch(K.db);
    b.update(wsRef(wid), { memberIds: F().arrayUnion(me), ['members.' + me]: meMember(), invitedEmails: F().arrayRemove(st.user.email), updatedAt: ts() });
    try { await b.commit(); } catch (e) { throw wsErr(friendly(e)); }
    invites.delete(wid);
    await waitFor(wid, 10000);
    if (spaces.has(wid)) await switchTo(wid);
    return get(wid);
  }
  async function declineInvite(wid) {
    await needSession();
    const p = F().writeBatch(K.db).update(wsRef(wid), { invitedEmails: F().arrayRemove(st.user.email), updatedAt: ts() }).commit();
    invites.delete(wid); emit('change');
    await settle(p);
  }

  // ---------- salir, echar, borrar ----------
  async function leave(wid) {
    await needSession();
    const w = spaces.get(wid);
    if (!w) return;
    if (w.isOwner) throw wsErr(MSG.owner);
    const me = uid();
    const b = F().writeBatch(K.db);
    b.update(wsRef(wid), { memberIds: F().arrayRemove(me), ['members.' + me]: F().deleteField(), updatedAt: ts() });
    b.delete(subRef(wid, 'joins', me));
    try { await b.commit(); } catch (e) { throw wsErr(friendly(e)); }
    if (current === wid) await switchTo(null);
    dropSpace(wid, 'left');
    pushCalendars(); saveCache(); emit('change');
  }
  async function removeMember(wid, who) {
    await needSession();
    const w = spaces.get(wid);
    if (!w || !w.isOwner) throw wsErr(MSG.perm);
    if (who === uid()) throw wsErr(MSG.owner);
    // (y un enlace nuevo, para que no pueda volver a entrar con el de antes)
    const old = w.inviteToken, token = rndToken(24);
    const av = w.avatar ? await avNow(wid) : null;
    const b = F().writeBatch(K.db);
    b.update(wsRef(wid), { memberIds: F().arrayRemove(who), ['members.' + who]: F().deleteField(), inviteToken: token, updatedAt: ts() });
    if (old) b.delete(subRef(wid, 'invite', old));
    const raw = rawOf(wid); delete raw.members[who]; raw.memberIds = raw.memberIds.filter(x => x !== who);
    b.set(subRef(wid, 'invite', token), preview(raw, av));
    b.delete(subRef(wid, 'joins', who));
    const p = b.commit();
    w.members = w.members.filter(m => m.uid !== who); w.memberIds = w.memberIds.filter(x => x !== who); w.inviteToken = token;
    emit('change');
    await settle(p);
    return get(wid);
  }
  async function remove(wid) {
    await needSession();
    const w = spaces.get(wid);
    if (!w || !w.isOwner) throw wsErr(MSG.perm);
    const s = await F().getDocs(F().collection(K.db, 'workspaces', wid, 'items'));
    const refs = s.docs.map(d => subRef(wid, 'items', d.id));
    refs.push(subRef(wid, 'assets', 'bg'), subRef(wid, 'assets', 'avatar'));
    if (w.inviteToken) refs.push(subRef(wid, 'invite', w.inviteToken));
    for (const m of w.memberIds) refs.push(subRef(wid, 'joins', m));
    for (let i = 0; i < refs.length; i += 450) {
      const b = F().writeBatch(K.db);
      for (const r of refs.slice(i, i + 450)) b.delete(r);
      await b.commit();
    }
    await F().writeBatch(K.db).delete(wsRef(wid)).commit();
    if (current === wid) await switchTo(null);
    dropSpace(wid, 'deleted');
    pushCalendars(); saveCache(); emit('change');
  }

  // ---------- Android/Windows: avisos con la app cerrada ----------
  function creds() {
    const fn = P().wsCreds;
    if (typeof fn !== 'function') return;
    let c = null;
    if (st.signedIn && K && K.auth.currentUser && !MOCK) {
      const C = cfg();
      const tr = s => (ZC.t ? ZC.t(s) : s);
      c = { apiKey: C.firebaseApiKey, projectId: C.firebaseProjectId, uid: uid(), refreshToken: K.auth.currentUser.refreshToken || '',
        since: Date.now(), lang: (ZC.i18n && ZC.i18n.lang && ZC.i18n.lang()) || 'es',
        strings: { added: tr('{who}: {title}'), changed: tr('{who} ha cambiado «{title}»'), deleted: tr('{who} ha borrado «{title}»'),
          assigned: tr('{who} te ha asignado «{title}»'), done: tr('{who} ha completado «{title}»'), more: tr('y {n} más'),
          someone: tr('Alguien'), untitled: tr('(sin título)'), channel: 'Workspaces', channelDesc: tr('Lo que cambian los demás en tus workspaces') } };
    } else if (MOCK && st.signedIn) c = { mock: true, uid: uid() };
    const key = c ? JSON.stringify(Object.assign({}, c, { since: 0 })) : 'null';
    if (key === lastCreds) return;
    lastCreds = key;
    try { fn(c); } catch (e) { console.warn('[ZC] wsCreds', e); }
  }

  // ---------- arranque ----------
  let inited = false;
  function init() {
    if (inited) return;
    inited = true;
    if (!available()) return;
    // lo de la última vez, al momento (los datos llegan en cuanto contesta Firebase)
    if (local('signed')) {
      fromCache();
      const c = local('current');
      if (c && spaces.has(c)) { current = c; }
      pushCalendars();
      if (current) S()._wsSet({ cur: current, dim: dim() });
      // (el SDK se baja un poco después, para no frenar el arranque)
      setTimeout(() => { load().then(() => watchAuth()).catch(e => { console.warn('[ZC] workspaces', e && e.message); set({ error: friendly(e) }); }); }, 900);
    }
    if (root.addEventListener) root.addEventListener('online', () => { if (local('signed') && !K) load().then(watchAuth).catch(() => {}); });
  }

  // ---------- modo simulado ----------
  /**
   * await ZC.ws._mock({ users, me, signedIn: true, delay }) → el Firebase de mentira (ver ws-mock.js).
   * ZC.ws._mock(false) lo apaga.
   */
  async function _mock(o) {
    if (o === false) { stopAll(false); MOCK = null; K = null; loadP = null; authWatched = false; set({ signedIn: false, user: null }); return null; }
    o = o || {};
    if (!ZC.wsMock && root.document) {
      await new Promise((ok, ko) => {
        const curS = [...document.scripts].find(s => /core\/ws\.js/.test(s.src));
        const s = document.createElement('script');
        s.src = curS ? curS.src.replace(/ws\.js.*$/, 'ws-mock.js') : 'js/core/ws-mock.js';
        s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ws-mock.js'));
        document.head.appendChild(s);
      });
    }
    stopAll(false);
    MOCK = o.server || ZC.wsMock.create(o);
    K = MOCK.sdk(o.signedIn ? (o.me || MOCK.users()[0].uid) : null);
    loadP = Promise.resolve(K);
    authWatched = false;
    inited = true;
    watchAuth();
    if (K.auth.currentUser) await signedIn();
    emit('change');
    return MOCK;
  }

  ZC.ws = {
    available, state, list, current: cur, get, switchTo, setDim, dim, create, update, setBackground, bgURL, bgData,
    setAvatar, avatarURL, avatarData: avData, squareAvatar, compressAvatar, ICONS, ICON0, AV_MAX,
    inviteLink, regenerateLink, inviteEmail, uninviteEmail, parseCode, peek, join, acceptInvite, declineInvite,
    leave, removeMember, remove, on, pendingInvites, unread, markSeen, members, user, isOwner,
    connect, signOut, prepare, init, COLORS, MSG, refreshCreds: () => { lastCreds = ''; creds(); },
    // (los usa ZC.store)
    _write, _saveCalendar,
    _mock,
    get _mocked() { return MOCK; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
