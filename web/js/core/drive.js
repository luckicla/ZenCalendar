'use strict';
// ZenCalendar: sincronización con Google Drive.
//
// Todo va a la carpeta oculta de la app en el Drive del usuario
// (appDataFolder: la app no ve el resto de sus archivos y el usuario no ve
// estos en drive.google.com, aunque ocupan su espacio):
//   zencalendar.json  → eventos, calendarios y ajustes (con lápidas)
//   blob-<id>         → cada imagen, aparte
//
// La sync: se baja el archivo, se junta elemento a elemento con lo de aquí
// (gana el que tenga `updated` más nuevo; lo borrado gana si es más nuevo) y
// se sube SOLO si lo junto es distinto de lo que había en Drive. Justo antes
// de subir se mira que nadie lo haya cambiado mientras tanto (si sí, se vuelve
// a juntar). Y como cada dispositivo guarda todo lo suyo y lo vuelve a juntar
// en la siguiente sync, aunque dos cambien a la vez no se pierde nada.
//
// Inicio de sesión según dónde va la app:
//   web     → Google Identity Services (token client), se carga al pulsar
//   Windows → el proceso principal de Electron (OAuth con PKCE en el navegador)
//   Android → AuthorizationClient de Google Play Services (sin client secret)
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';
  const EVERY = 2 * 60000;     // sync cada 2 min
  const AFTER_CHANGE = 3000;   // y 3 s después de cada cambio

  const st = { connected: false, email: '', name: '', photo: '', lastSync: null, syncing: false, error: null };
  let token = null, tokenExp = 0;
  let bus = null;
  const E = () => (bus = bus || ZC.util.emitter());
  let running = null, again = false, timer = null, backoff = 0, started = false;
  let blobFiles = new Map(); // nombre → { id, size }
  let lastBlobPass = 0, blobsDirty = true;

  const cfg = () => ZC.config || {};
  const kind = () => (ZC.platform && ZC.platform.kind) || 'web';
  const fileName = () => cfg().driveFile || 'zencalendar.json';

  // ---------- estado ----------
  function state() { return Object.assign({}, st); }
  function set(patch) {
    Object.assign(st, patch);
    try { ZC.store.local('drive', { connected: st.connected, email: st.email, name: st.name, photo: st.photo, lastSync: st.lastSync }); } catch (e) {}
    E().emit('state', state());
  }
  const on = (type, fn) => E().on(type, fn);

  function available() {
    const C = cfg();
    // (en Android no hace falta client ID, pero sin registrar la app en Google Cloud Google la rechaza)
    if (kind() === 'android') return !!(root.ZCAndroid && root.ZCAndroid.googleAuth && (C.googleAndroid === '1' || C.googleWebClientId));
    // (el cliente de escritorio necesita su secreto: lo mete el workflow desde los secretos del repo)
    if (kind() === 'desktop') return !!(C.googleDesktopClientId && C.googleDesktopClientSecret && root.zcDesktop && root.zcDesktop.google);
    if (!C.googleWebClientId) return false;
    try { return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'; } catch (e) { return false; }
  }

  // ---------- errores con mensaje para el usuario ----------
  function authError(msg, soft) {
    const e = new Error(msg || 'Hay que volver a conectar con Google');
    e.auth = true; e.soft = !!soft;
    return e;
  }
  function friendly(e) {
    if (!e) return 'Algo ha fallado';
    if (e.network) return 'Sin conexión: se sincroniza sola cuando vuelva internet';
    if (e.quota) return 'No queda espacio en tu Google Drive';
    if (e.auth) return e.message;
    if (e.status >= 500 || e.status === 429) return 'Google Drive no responde ahora; se vuelve a intentar en un rato';
    return 'No se pudo sincronizar: ' + (e.message || e);
  }

  // ---------- tokens ----------
  function clearToken() {
    token = null; tokenExp = 0;
    if (kind() === 'web') ZC.store.local('drive.webtoken', null);
  }

  async function getToken(interactive) {
    if (token && Date.now() < tokenExp - 60000) return token;
    const k = kind();
    if (k === 'desktop') {
      const r = await root.zcDesktop.google('token', desktopCfg());
      if (!r || !r.access_token) throw authError(r && r.error === 'offline' ? null : 'Hay que volver a conectar con Google');
      token = r.access_token; tokenExp = r.expires_at || (Date.now() + 50 * 60000);
      return token;
    }
    if (k === 'android') {
      const r = await ZC.native.call('googleAuth', !!interactive, cfg().googleScopes);
      if (!r || !r.token) {
        if (r && r.network) { const e = new Error('Sin conexión'); e.network = true; throw e; }
        let msg = r && r.cancelled ? 'Se canceló el inicio de sesión' : r && r.needsConsent ? 'Hay que volver a conectar con Google' : (r && r.error) || null;
        // DEVELOPER_ERROR (10) / app sin registrar: no es culpa del usuario, que lo diga claro
        if (msg && /\b10\b|DEVELOPER_ERROR|developer|not registered|unregistered|API_NOT_CONNECTED|\b17\b/i.test(msg)) msg = 'Google aún no reconoce esta versión de la app (falta registrarla en Google Cloud). Tus datos se siguen guardando en el móvil.';
        throw authError(msg);
      }
      token = r.token; tokenExp = Date.now() + 50 * 60000; // (Google no dice cuánto dura: menos de 1 h)
      return token;
    }
    return webToken(interactive);
  }

  const desktopCfg = () => ({ clientId: cfg().googleDesktopClientId, clientSecret: cfg().googleDesktopClientSecret, scopes: cfg().googleScopes });

  // --- web: Google Identity Services ---
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

  function webToken(interactive) {
    const c = ZC.store.local('drive.webtoken');
    if (c && c.token && c.exp > Date.now() + 60000) { token = c.token; tokenExp = c.exp; return Promise.resolve(token); }
    // sin un toque del usuario el navegador no deja abrir la ventanita de Google
    const activated = root.navigator && navigator.userActivation ? navigator.userActivation.isActive : false;
    if (!interactive && !activated) {
      armGesture();
      return Promise.reject(authError('La sesión de Google ha caducado: toca la app para seguir sincronizando', true));
    }
    return loadGIS().then(() => new Promise((ok, ko) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: cfg().googleWebClientId,
        scope: cfg().googleScopes,
        login_hint: st.email || undefined,
        callback: r => {
          if (!r || r.error) { ko(authError(r && (r.error_description || r.error) === 'access_denied' ? 'No diste permiso a ZenCalendar' : 'No se pudo conectar con Google')); return; }
          token = r.access_token;
          tokenExp = Date.now() + (+r.expires_in || 3600) * 1000;
          ZC.store.local('drive.webtoken', { token, exp: tokenExp });
          ok(token);
        },
        error_callback: e => ko(authError(e && e.type === 'popup_closed' ? 'Se cerró la ventana de Google' : e && e.type === 'popup_failed_to_open' ? 'El navegador bloqueó la ventana de Google' : 'No se pudo conectar con Google')),
      });
      tc.requestAccessToken({ prompt: st.connected ? '' : 'select_account' });
    }));
  }

  // el siguiente toque en la página renueva la sesión (y sigue la sync)
  function armGesture() {
    if (gestureArmed || !root.document) return;
    gestureArmed = true;
    loadGIS().catch(() => {});
    const go = () => {
      document.removeEventListener('pointerdown', go, true);
      gestureArmed = false;
      if (!st.connected) return;
      webToken(true).then(() => sync()).catch(() => {});
    };
    document.addEventListener('pointerdown', go, true);
  }

  // ---------- peticiones a Google ----------
  async function api(url, opts, attempt) {
    opts = opts || {}; attempt = attempt || 0;
    const t = await getToken(false);
    const headers = Object.assign({ Authorization: 'Bearer ' + t }, opts.headers || {});
    const r = await ZC.net.fetch(url, Object.assign({}, opts, { headers, timeout: opts.timeout || 60000 }));
    if (r.status === 401 && attempt < 1) { clearToken(); return api(url, opts, attempt + 1); }
    let reason = '';
    if (r.status === 403 || r.status === 429) {
      try { const j = await r.clone().json(); reason = ((j.error && j.error.errors && j.error.errors[0]) || {}).reason || ''; } catch (e) {}
      if (reason === 'storageQuotaExceeded') { const e = new Error('Sin espacio'); e.quota = true; throw e; }
    }
    if ((r.status === 429 || r.status >= 500 || /rateLimit/i.test(reason)) && attempt < 4) {
      await ZC.util.sleep(800 * Math.pow(2, attempt) + Math.random() * 400);
      return api(url, opts, attempt + 1);
    }
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try { const j = await r.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch (e) {}
      const e = new Error(msg); e.status = r.status;
      if (r.status === 401 || r.status === 403 && /insufficient|scope|auth/i.test(msg)) { e.auth = true; e.message = 'Hay que volver a conectar con Google'; }
      throw e;
    }
    return r;
  }

  const q = s => encodeURIComponent(s);

  async function listFiles(query) {
    const out = [];
    let page = '';
    do {
      const r = await api(API + '/files?spaces=appDataFolder&pageSize=1000&q=' + q(query) + '&fields=' + q('nextPageToken,files(id,name,version,modifiedTime,size)') + (page ? '&pageToken=' + q(page) : ''));
      const j = await r.json();
      out.push(...(j.files || []));
      page = j.nextPageToken || '';
    } while (page);
    return out;
  }

  async function download(id) {
    const r = await api(API + '/files/' + id + '?alt=media');
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { console.warn('[ZC] el archivo de Drive no se entiende; se rehará', e); return null; }
  }

  async function meta(id) {
    const r = await api(API + '/files/' + id + '?fields=' + q('id,version,modifiedTime'));
    return r.json();
  }

  // subida «multipart»: los datos del archivo + el contenido, en una sola petición
  function multipart(metadata, content, type) {
    const b = 'zc' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const enc = new TextEncoder();
    const head = enc.encode('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n--' + b + '\r\nContent-Type: ' + type + '\r\n\r\n');
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const tail = enc.encode('\r\n--' + b + '--');
    const body = new Uint8Array(head.length + data.length + tail.length);
    body.set(head, 0); body.set(data, head.length); body.set(tail, head.length + data.length);
    return { body, type: 'multipart/related; boundary=' + b };
  }

  async function upload(id, name, content, type) {
    const m = multipart(id ? {} : { name, parents: ['appDataFolder'], mimeType: type }, content, type);
    const url = (id ? UPLOAD + '/files/' + id : UPLOAD + '/files') + '?uploadType=multipart&fields=' + q('id,version,modifiedTime');
    const r = await api(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': m.type }, body: m.body, timeout: 120000 });
    return r.json();
  }

  async function remove(id) {
    try { await api(API + '/files/' + id, { method: 'DELETE' }); }
    catch (e) { if (e.status !== 404) throw e; }
  }

  async function userinfo() {
    const r = await api(USERINFO);
    return r.json();
  }

  // ---------- la sincronización ----------
  function fileBody(data) {
    return JSON.stringify({
      app: 'ZenCalendar', format: 1, updated: Date.now(), device: kind(),
      events: data.events, calendars: data.calendars, prefs: data.prefs, blobs: data.blobs,
    });
  }

  async function syncOnce() {
    const S = ZC.store;
    for (let attempt = 0; attempt < 3; attempt++) {
      // 1) lo que hay en Drive (si por lo que sea hay más de un archivo, se juntan todos)
      const files = (await listFiles("name='" + fileName() + "' and trashed=false"))
        .sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
      let main = files[0] || null;
      let remote = main ? S.driveOnly(await download(main.id)) : null;
      for (const extra of files.slice(1)) {
        const other = S.driveOnly(await download(extra.id));
        if (other) remote = S.merge(remote || {}, other).data;
      }
      // 2) junto con lo de aquí (lo de Google Calendar no va a Drive: cada dispositivo lo baja de Google)
      const m = S.merge(S.snapshot({ drive: true }), remote || {});
      if (m.localChanged) await S.applyRemote(m.data, 'sync');
      // 3) subir solo si hace falta
      if (m.remoteChanged || !main || files.length > 1) {
        if (main) {
          const now = await meta(main.id);
          if (String(now.version) !== String(main.version)) continue; // alguien subió mientras: otra vuelta
        }
        // (lo de aquí puede haber cambiado mientras: se sube lo último)
        const data = S.merge(S.snapshot({ drive: true }), m.data).data;
        const res = await upload(main && main.id, fileName(), fileBody(data), 'application/json');
        for (const extra of files.slice(1)) await remove(extra.id).catch(() => {});
        if (!main) main = res;
      }
      return m;
    }
    throw new Error('Drive cambia todo el rato; se vuelve a intentar luego');
  }

  // las imágenes: se suben las que faltan, se borran las borradas y se bajan unas pocas que falten aquí
  async function syncBlobs() {
    const S = ZC.store;
    const files = await listFiles("name contains 'blob-' and trashed=false");
    blobFiles = new Map(files.map(f => [f.name, f]));
    const snap = S.snapshot();
    const used = new Set();
    for (const e of snap.events) if (!e.deleted) for (const a of (e.attachments || [])) used.add(a.id);
    let pulled = 0;
    for (const id of Object.keys(snap.blobs || {})) {
      const m = snap.blobs[id];
      const name = 'blob-' + id;
      const f = blobFiles.get(name);
      if (m.deleted) {
        if (f) { await remove(f.id); blobFiles.delete(name); }
        continue;
      }
      const have = await S.hasBlobData(id);
      if (have && !f) {
        const b = await S.getBlob(id);
        if (b) {
          const res = await upload(null, name, new Uint8Array(await b.arrayBuffer()), m.type || 'application/octet-stream');
          blobFiles.set(name, { id: res.id, name });
        }
      } else if (!have && f && used.has(id) && pulled < 8) {
        // para tenerla también sin conexión
        try { await S.getBlob(id); pulled++; } catch (e) {}
      }
    }
    lastBlobPass = Date.now();
    blobsDirty = false;
  }

  async function _fetchBlob(id, m) {
    if (!st.connected) return null;
    const name = 'blob-' + id;
    let f = blobFiles.get(name);
    if (!f) {
      const list = await listFiles("name='" + name + "' and trashed=false");
      f = list[0];
      if (!f) return null;
      blobFiles.set(name, f);
    }
    const r = await api(API + '/files/' + f.id + '?alt=media', { timeout: 120000 });
    const buf = await r.arrayBuffer();
    return new Blob([buf], { type: (m && m.type) || r.headers.get('content-type') || 'application/octet-stream' });
  }

  /** Sincroniza ya. Si ya estaba sincronizando, repite al acabar. */
  function sync() {
    if (!st.connected) return Promise.resolve(state());
    if (running) { again = true; return running; }
    if (!ZC.net.online()) { set({ error: friendly({ network: true }) }); return Promise.resolve(state()); }
    clearTimeout(timer);
    set({ syncing: true });
    running = (async () => {
      try {
        const m = await syncOnce();
        if (blobsDirty || (m && m.parts && m.parts.blobs.changedIds.length) || Date.now() - lastBlobPass > 10 * 60000) await syncBlobs();
        backoff = 0;
        set({ syncing: false, error: null, lastSync: Date.now() });
      } catch (e) {
        console.warn('[ZC] sync', e);
        set({ syncing: false, error: friendly(e) });
        if (!e.auth) {
          // reintento: 30 s, 1 min, 2 min, 5 min…
          backoff = Math.min(backoff ? backoff * 2 : 30000, 5 * 60000);
          clearTimeout(timer);
          timer = setTimeout(() => sync(), backoff);
        }
      } finally {
        running = null;
        if (again) { again = false; setTimeout(() => sync(), 500); }
      }
      return state();
    })();
    return running;
  }

  const syncSoon = ZC.util ? ZC.util.debounce(() => sync(), AFTER_CHANGE) : () => {};

  // ---------- conectar / desconectar ----------
  async function connect() {
    if (!available()) throw new Error('Falta configurar Google en esta versión (mira docs/GOOGLE-SETUP.md)');
    set({ error: null, syncing: true });
    try {
      if (kind() === 'desktop') {
        const r = await root.zcDesktop.google('connect', desktopCfg());
        if (!r || !r.access_token) throw authError(r && r.error ? r.error : 'No se pudo conectar con Google');
        token = r.access_token; tokenExp = r.expires_at || (Date.now() + 50 * 60000);
      } else {
        clearToken();
        await getToken(true);
      }
      let info = {};
      try { info = await userinfo(); } catch (e) { console.warn('[ZC] userinfo', e); }
      set({ connected: true, syncing: false, email: info.email || '', name: info.name || info.given_name || '', photo: info.picture || '', error: null });
      blobsDirty = true;
      start();
      await sync();
      return state();
    } catch (e) {
      set({ syncing: false, error: friendly(e) });
      throw e;
    }
  }

  async function disconnect() {
    const t = token;
    clearTimeout(timer);
    try {
      if (kind() === 'desktop') await root.zcDesktop.google('disconnect');
      else if (t && kind() === 'web' && root.google && google.accounts && google.accounts.oauth2 && google.accounts.oauth2.revoke) {
        google.accounts.oauth2.revoke(t, () => {});
      } else if (t) {
        await ZC.net.fetch('https://oauth2.googleapis.com/revoke?token=' + q(t), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }).catch(() => {});
        if (kind() === 'android' && root.ZCAndroid.googleClear) root.ZCAndroid.googleClear(t);
      }
    } catch (e) {}
    clearToken();
    blobFiles = new Map();
    set({ connected: false, email: '', name: '', photo: '', lastSync: null, syncing: false, error: null });
    return state();
  }

  // ---------- arranque ----------
  function start() {
    if (started) return;
    started = true;
    ZC.store.on('change', e => {
      if (!st.connected || e.source === 'sync') return;
      if (e.type === 'blobs') blobsDirty = true;
      // (lo que cambia otra ventana lo sincroniza esa ventana; aquí solo lo de esta)
      if (e.source === 'local') syncSoon();
    });
    setInterval(() => { if (st.connected && !running) sync(); }, EVERY);
    if (root.document) document.addEventListener('visibilitychange', () => {
      if (!document.hidden && st.connected && (!st.lastSync || Date.now() - st.lastSync > 30000)) sync();
    });
    if (root.addEventListener) root.addEventListener('online', () => { if (st.connected) { backoff = 0; sync(); } });
  }

  function init() {
    const saved = ZC.store.local('drive');
    if (saved && saved.connected) Object.assign(st, saved, { syncing: false, error: null });
    // el widget de escritorio no sincroniza: lo hace la ventana principal
    if (ZC.platform && ZC.platform.isWidget) return;
    if (st.connected) {
      if (!available()) { st.error = 'Falta configurar Google en esta versión'; return; }
      // (web: Google Identity Services solo se carga si de verdad hace falta,
      // al pulsar «Conectar» o cuando caduca la sesión: armGesture)
      start();
      setTimeout(() => sync(), 1500);
    }
  }

  // (opcional) en la web, cargar ya Google Identity Services, p. ej. al abrir la
  // pantalla de Google Drive: así el «Conectar» abre la ventanita al instante y
  // el navegador no la bloquea por tardar. En Android y Windows no hace nada.
  function prepare() {
    if (kind() === 'web' && available() && root.document) return loadGIS().catch(() => {});
    return Promise.resolve();
  }

  ZC.drive = { available, state, connect, disconnect, sync, on, init, prepare, _fetchBlob };
})(typeof window !== 'undefined' ? window : globalThis);
