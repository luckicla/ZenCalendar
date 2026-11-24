'use strict';
// ZenCalendar: lo que cambia según dónde va la app (Android, Windows o la web).
//
// En Android la página habla con Java a través de window.ZCAndroid; en
// Windows con el proceso principal de Electron a través de window.zcDesktop
// (desktop/preload.js). En la web casi todo esto no hace nada (o lo que pueda
// el navegador: notificaciones, compartir, favicon…).
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const A = () => root.ZCAndroid || null;
  const D = () => root.zcDesktop || null;

  const kind = A() ? 'android' : D() ? 'desktop' : 'web';
  const role = (D() && D().role) || (root.location && /widget\.html$/i.test(root.location.pathname || '') ? 'widget' : 'main');

  // ---------- iconos de la app (los genera tools/mkicons.py) ----------
  // design: el diseño con el que va (al elegir Dot, la interfaz puede sugerir el icono 'dot')
  const appIcons = [
    { id: 'pastel', name: 'Pastel', design: 'zen' },
    { id: 'sakura', name: 'Sakura', design: 'zen' },
    { id: 'menta', name: 'Menta', design: 'zen' },
    { id: 'noche', name: 'Noche', design: 'zen' },
    { id: 'cielo', name: 'Cielo', design: 'zen' },
    { id: 'melocoton', name: 'Melocotón', design: 'zen' },
    { id: 'dot', name: 'Dot', design: 'dot' },
  ].map(x => Object.assign(x, { src: 'img/icons/' + x.id + '.png' }));

  // ---------- avisos de «abrir» (widget, notificación, compartir, atajos) ----------
  let bus = null;
  const E = () => (bus = bus || ZC.util.emitter());
  const queue = [];
  function onOpen(fn) {
    const off = E().on('open', fn);
    // lo que llegó antes de que hubiera nadie escuchando (arranque en frío)
    while (queue.length) { const o = queue.shift(); try { fn(o); } catch (e) { console.error(e); } }
    return off;
  }
  function _open(o) {
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { return; } }
    if (!o || !o.action) return;
    if (o.image && typeof o.image === 'string') {
      // imagen compartida desde otra app (Android): base64 → Blob
      try { o.images = [new Blob([ZC.util.fromBase64(o.image)], { type: o.imageType || 'image/jpeg' })]; } catch (e) {}
      delete o.image;
    }
    if (E().count('open')) E().emit('open', o); else queue.push(o);
  }

  // ---------- botón atrás de Android ----------
  const backFns = [];
  function onBack(fn) { backFns.push(fn); return () => { const i = backFns.indexOf(fn); if (i >= 0) backFns.splice(i, 1); }; }
  function _back() {
    for (let i = backFns.length - 1; i >= 0; i--) {
      try { if (backFns[i]() === true) return true; } catch (e) { console.error(e); }
    }
    // (también como evento del DOM, por si el frontend prefiere escucharlo así)
    try {
      const ev = new CustomEvent('zc-back', { cancelable: true });
      if (!root.dispatchEvent(ev)) return true;
    } catch (e) {}
    return false;
  }

  // ---------- ventana (Windows) ----------
  const winBus = () => E();
  let winState = { max: false };
  const win = {
    minimize() { if (D()) D().win('min'); },
    maximize() { if (D()) D().win('max').then(s => { if (s) { winState = s; winBus().emit('win', s); } }).catch(() => {}); },
    close() { if (D()) D().win('close'); else if (kind === 'web') try { root.close(); } catch (e) {} },
    onState(fn) { const off = winBus().on('win', fn); try { fn(winState); } catch (e) {} return off; },
    get state() { return winState; },
  };

  // ---------- tema (barra de estado, widgets) ----------
  // { bg, surface, fg, muted, a1, a2, a3, light, alpha, radius, design: 'zen' | 'dot', accent? }
  // design se reenvía siempre a Android y a Windows (si no viene o no se entiende: 'zen').
  // En Dot, accent es el color de acento (si no viene, el rojo #D71921 en los widgets de Android).
  const normDesign = d => (String(d || '').trim().toLowerCase() === 'dot' ? 'dot' : 'zen');
  function setTheme(t) {
    if (!t || typeof t !== 'object') return;
    t = Object.assign({}, t, { design: normDesign(t.design) });
    if (t.accent != null && !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(t.accent))) delete t.accent;
    try { ZC.store.local('theme', t); } catch (e) {}
    try {
      if (A() && A().setTheme) A().setTheme(JSON.stringify(t));
      else if (D() && D().setTheme) D().setTheme(t);
    } catch (e) { console.warn('[ZC] setTheme', e); }
    // web/PWA: el color de la barra del navegador
    try {
      if (root.document) {
        let m = document.querySelector('meta[name="theme-color"]');
        if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
        m.content = t.bg || (t.design === 'dot' ? (t.light === false ? '#000000' : '#FFFFFF') : '#F7F3FF');
      }
    } catch (e) {}
    try { if (ZC.reminders && ZC.reminders.refreshWidgets) ZC.reminders.refreshWidgets(); } catch (e) {}
  }

  function openExternal(url) {
    if (!url) return;
    try {
      if (A() && A().openExternal) return A().openExternal(String(url));
      if (D() && D().openExternal) return D().openExternal(String(url));
    } catch (e) {}
    try { root.open(url, '_blank', 'noopener'); } catch (e) {}
  }

  // share({ title, text, url, app }) · app: 'whatsapp' abre WhatsApp directamente (Android: com.whatsapp; Windows y
  // web: wa.me), 'email' abre el correo (mailto:). Devuelve true, 'copied' (se ha copiado al portapapeles) o false.
  async function share(o) {
    o = o || {};
    const text = [o.text, o.url && !String(o.text || '').includes(o.url) ? o.url : ''].filter(Boolean).join('\n');
    try {
      if (A() && A().shareTo) { A().shareTo(JSON.stringify({ title: String(o.title || ''), text: String(o.text || ''), url: String(o.url || ''), app: o.app || '' })); return true; }
      if (D() && D().share) { const r = await D().share({ title: o.title || '', text: o.text || '', url: o.url || '', app: o.app || '' }); if (r) return r === 'copied' ? 'copied' : true; }
    } catch (e) { console.warn('[ZC] share', e); }
    if (o.app === 'whatsapp') { openExternal('https://wa.me/?text=' + encodeURIComponent(text)); return true; }
    if (o.app === 'email') { openExternal('mailto:?subject=' + encodeURIComponent(o.title || '') + '&body=' + encodeURIComponent(text)); return true; }
    try {
      if (A() && A().share) { A().share(String(o.title || ''), text || String(o.title || '')); return true; }
      if (root.navigator && navigator.share) { await navigator.share({ title: o.title, text: o.text, url: o.url }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    try { await navigator.clipboard.writeText(text || String(o.title || '')); return 'copied'; } catch (e) { return false; }
  }

  // ---------- workspaces ----------
  // wsCreds(creds | null): lo que necesita Android/Windows para avisar de los cambios de los workspaces con la
  // app cerrada ({ apiKey, projectId, uid, refreshToken, workspaces: [{ id, name, color, emoji }], since, lang });
  // null al cerrar sesión. Lo llama ZC.ws (docs/WORKSPACES.md → «Nativo»).
  function wsCreds(c) {
    try {
      const json = c ? JSON.stringify(c) : '';
      if (A() && A().wsCreds) A().wsCreds(json);
      else if (D() && D().wsCreds) D().wsCreds(c || null);
    } catch (e) { console.warn('[ZC] wsCreds', e); }
  }
  // notify({ title, body, tag, data }): una notificación suelta (los avisos de los workspaces con la app en segundo plano)
  // (solo en la web: en Android y Windows los avisos de los workspaces los saca el nativo, docs/CONTRATO.md)
  async function notify(o) {
    o = o || {};
    if (kind !== 'web') return false;
    try {
      if (!root.Notification || Notification.permission !== 'granted') return false;
      const opts = { body: o.body || '', tag: o.tag || undefined, icon: 'img/icon-192.png', badge: 'img/favicon.png', data: o.data || null };
      if (swReg && swReg.showNotification) { await swReg.showNotification(o.title || 'ZenCalendar', opts); return true; }
      const n = new Notification(o.title || 'ZenCalendar', opts);
      n.onclick = () => { try { root.focus(); } catch (e) {} if (o.data) _open(o.data); n.close(); };
      return true;
    } catch (e) { return false; }
  }

  function setAppIcon(id) {
    if (!appIcons.some(x => x.id === id)) id = 'pastel';
    try { ZC.store.local('appIcon', id); } catch (e) {}
    try {
      if (A() && A().setAppIcon) A().setAppIcon(id);
      else if (D() && D().setIcon) D().setIcon(id);
      else if (root.document) {
        let l = document.querySelector('link[rel="icon"]');
        if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
        l.href = 'img/icons/' + id + '.png';
      }
    } catch (e) {}
  }
  const appIcon = () => { try { return ZC.store.local('appIcon') || 'pastel'; } catch (e) { return 'pastel'; } };

  // ---------- widget de escritorio y arranque con Windows ----------
  let widgetOn = false, autoOn = false;
  async function desktopWidget(on) {
    if (!D() || !D().widget) return false;
    try { widgetOn = !!(await D().widget(on == null ? undefined : !!on)); } catch (e) {}
    E().emit('widget', widgetOn);
    return widgetOn;
  }
  const desktopWidgetOn = () => widgetOn;
  async function desktopWidgetPin(mode) { if (D() && D().widgetPin) return D().widgetPin(mode); return null; }
  async function setAutostart(on) {
    if (!D() || !D().autostart) return false;
    try { autoOn = !!(await D().autostart(!!on)); } catch (e) {}
    return autoOn;
  }
  const autostart = () => autoOn;

  // ---------- notificaciones ----------
  async function notifyPermission() {
    if (A()) {
      try { if (A().notificationsAllowed && A().notificationsAllowed()) return true; } catch (e) {}
      try { const r = await ZC.native.call('requestNotifications'); return !!(r && (r.granted || r === true)); } catch (e) { return false; }
    }
    if (D()) return true;
    if (!root.Notification) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try { return (await Notification.requestPermission()) === 'granted'; } catch (e) { return false; }
  }

  // ---------- widgets en la pantalla de inicio (Android 8+) ----------
  function canPinWidget() { try { return !!(A() && A().canPinWidget && A().canPinWidget()); } catch (e) { return false; } }
  function pinWidget(k) { try { if (A() && A().pinWidget) { A().pinWidget(k === 'today' ? 'today' : 'agenda'); return true; } } catch (e) {} return false; }

  // ---------- actualizaciones (Android, Windows y la web) ----------
  // Una sola forma para todas:
  //   ZC.platform.updates.available → true si esta app puede actualizarse sola
  //     (Android y Windows instalado/portable; en la web false, pero avisa igual
  //     con status 'ready' cuando el service worker trae una versión nueva)
  //   check() · install() · state() · on(fn)  (fn recibe el estado en cada cambio)
  //   estado: { status: 'idle'|'checking'|'none'|'available'|'downloading'|'ready'|'error',
  //             current, latest, progress (0-100), notes (texto de la release en GitHub),
  //             error (texto o null), build, currentBuild (Android: nº de compilación) }
  //   (+ los nombres de antes, por compatibilidad: state, version, pct, msg)
  // Android: Updater.java mira android-latest/version.txt (por número de
  // compilación), descarga la APK, comprueba el sha256 y abre el instalador.
  // Windows: electron-updater (instalado) o la descarga (portable), desde pc-latest.
  // Al abrir la app ya actualizada: evento 'updated' (ZC.platform.on('updated', v => …)).
  const UPD_EVERY = 6 * 3600e3;
  let upd = { status: 'idle', current: '', latest: '', progress: 0, notes: '', error: null };
  const updView = () => Object.assign({}, upd, { state: upd.status, version: upd.latest || upd.current, pct: upd.progress, msg: upd.error || '' });
  function setUpd(patch) {
    upd = Object.assign({}, upd, patch);
    if (!upd.current) upd.current = info.version || '';
    E().emit('update', updView());
    if (upd.latest && ['available', 'downloading', 'ready'].includes(upd.status)) loadNotes(upd.latest);
  }
  // las notas: de la release oficial v<versión> en GitHub (sin token); si no hay, de la de cada plataforma
  const notesDone = {};
  function loadNotes(v) {
    if (notesDone[v] || !ZC.net) return;
    notesDone[v] = true;
    const repo = (ZC.config && ZC.config.repo) || 'luckicla/zencalendar';
    const tags = ['v' + v, kind === 'android' ? 'android-latest' : kind === 'desktop' ? 'pc-latest' : null].filter(Boolean);
    (async () => {
      for (const tag of tags) {
        try {
          const r = await ZC.net.fetch('https://api.github.com/repos/' + repo + '/releases/tags/' + tag, { headers: { Accept: 'application/vnd.github+json' }, timeout: 10000 });
          if (!r.ok) continue;
          const j = await r.json();
          if (j && j.body && j.body.trim()) { if (upd.latest === v) setUpd({ notes: j.body.trim() }); return; }
        } catch (e) { /* sin internet o límite de la API: sin notas */ }
      }
    })();
  }
  function fromDesktop(d) {
    if (!d) return;
    const status = { checking: 'checking', available: 'available', downloading: 'downloading', ready: 'ready', none: 'none', error: 'error' }[d.state] || 'idle';
    setUpd({ status, latest: d.version || upd.latest, progress: d.pct != null ? d.pct : status === 'ready' ? 100 : status === 'downloading' ? upd.progress : 0, error: status === 'error' ? (d.msg || 'No se ha podido comprobar') : null });
  }
  // (lo llama Updater.java)
  function _update(o) {
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { return; } }
    if (!o) return;
    setUpd({ status: o.status || 'idle', current: o.current || upd.current, latest: o.latest || upd.latest, build: o.build || 0, currentBuild: o.currentBuild || 0,
      progress: o.progress || 0, error: o.status === 'error' ? (o.error || 'No se ha podido comprobar') : null });
  }
  let swReg = null;
  const updates = {
    get available() { return !!((A() && A().updateCheck) || (D() && D().update && info.packaged !== false)); },
    state: updView,
    async check() {
      try { ZC.store.local('updates.lastCheck', Date.now()); } catch (e) {}
      if (A() && A().updateCheck) { A().updateCheck(true); return updView(); }   // (comprueba y, si hay, la descarga)
      if (D() && D().update) { fromDesktop(await D().update('check')); return updView(); }
      if (swReg) { try { await swReg.update(); } catch (e) {} }
      return updView();
    },
    async install() {
      if (A() && A().updateInstall) { A().updateInstall(); return true; }   // (si no está descargada, la descarga antes)
      if (D() && D().update) return D().update('install');                   // (la portable abre la descarga)
      if (upd.status === 'ready' && root.location) { location.reload(); return true; }
      return false;
    },
    on: fn => E().on('update', fn),
  };

  // (extra) desde el widget de escritorio: abrir algo en la ventana principal
  function openApp(o) {
    o = o || { action: 'open' };
    if (D() && D().openMain && role === 'widget') { D().openMain(o); return; }
    _open(o);
  }
  // (extra, Windows 11) fondo de la ventana: 'mica' | 'acrylic' | 'none'. Con mica la página tiene que ser transparente
  async function setWindowMaterial(m) { if (D() && D().material) return D().material(m); return false; }

  // (extra, Android) true = la página se dibuja también detrás de la barra de estado y la de navegación
  // (usa var(--zc-safe-top, env(safe-area-inset-top)) y compañía); false = Android le deja el hueco
  function setEdgeToEdge(on) { try { if (A() && A().setEdge) A().setEdge(!!on); } catch (e) {} }

  // ---------- vibración de la interfaz ----------
  // haptic('tap' | 'select' | 'success' | 'warning' | 'glyph'): Android vibra a su manera,
  // la web con navigator.vibrate (si el navegador sabe) y Windows nada.
  // 'glyph' es el del diseño Dot: dos golpecitos secos.
  // Respeta el ajuste look.haptics (por defecto, sí).
  const VIBRATE = { tap: 8, select: 12, success: [10, 50, 10, 50, 20], warning: [25, 50, 25], glyph: [5, 35, 4] };
  function haptic(k) {
    try {
      const look = (ZC.store && ZC.store.getPrefs && ZC.store.getPrefs().look) || {};
      if (look.haptics === false) return;
    } catch (e) {}
    if (!VIBRATE[k]) k = 'tap';
    try {
      if (A()) { if (A().haptic) A().haptic(k); return; }
      if (D()) return;
      // (sin un toque previo Chrome lo bloquea y avisa en la consola)
      const ua = root.navigator && navigator.userActivation;
      if (ua && !ua.hasBeenActive) return;
      if (root.navigator && typeof navigator.vibrate === 'function') navigator.vibrate(VIBRATE[k]);
    } catch (e) {}
  }

  let info = { version: (ZC.config && ZC.config.version) || '', portable: false };
  let justUpdated = '';

  // ---------- arranque ----------
  let inited = false;
  async function init() {
    if (inited) return;
    inited = true;
    if (D()) {
      try { if (D().onWin) D().onWin(s => { winState = s || winState; E().emit('win', winState); }); } catch (e) {}
      try { if (D().onOpen) D().onOpen(o => _open(o)); } catch (e) {}
      try { if (D().onUpdate) D().onUpdate(fromDesktop); } catch (e) {}
      try { if (D().onWidget) D().onWidget(on => { widgetOn = !!on; E().emit('widget', widgetOn); }); } catch (e) {}
      try { winState = (await D().win('')) || winState; } catch (e) {}
      try { widgetOn = !!(await D().widget()); } catch (e) {}
      try { autoOn = !!(await D().autostart()); } catch (e) {}
      try { info = Object.assign(info, await D().info()); } catch (e) {}
      try { upd.current = info.version || upd.current; if (D().update) fromDesktop(await D().update('state')); } catch (e) {}
      // (Windows: si la versión cambió desde la última vez, se acaba de actualizar)
      try {
        const prev = ZC.store.local('lastVersion');
        if (role === 'main' && info.version) {
          if (prev && prev !== info.version) { justUpdated = info.version; E().emit('updated', info.version); }
          ZC.store.local('lastVersion', info.version);
        }
      } catch (e) {}
    }
    if (A()) {
      try { if (A().version) info.version = A().version(); } catch (e) {}
      // lo que abrió la app (notificación, widget, compartir) antes de cargar la página
      try { const o = A().takeOpen && A().takeOpen(); if (o) _open(o); } catch (e) {}
      try { const s = A().takeShared && A().takeShared(); if (s) _open(s); } catch (e) {}
      // actualizaciones: el estado que haya, «Actualizado a la versión X» si se acaba
      // de instalar, y una comprobación al abrir (como mucho cada 6 h)
      try { upd.current = info.version || upd.current; if (A().updateState) _update(A().updateState()); } catch (e) {}
      try {
        const v = A().takeUpdated && A().takeUpdated();
        if (v) { justUpdated = v; E().emit('updated', v); }
      } catch (e) {}
      try {
        const last = +(ZC.store.local('updates.lastCheck') || 0);
        if (role === 'main' && A().updateCheck && Date.now() - last > UPD_EVERY) setTimeout(() => updates.check(), 8000);
      } catch (e) {}
    }
    if (kind === 'web' && role === 'main' && root.location) {
      // atajos del manifest: index.html?action=new
      try {
        const q = new URLSearchParams(location.search);
        let action = q.get('action');
        // «compartir con ZenCalendar» de la PWA (share_target): a la IA
        if (!action && (q.get('text') || q.get('title') || q.get('url'))) {
          action = 'ai';
          q.set('text', [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n'));
        }
        if (action) {
          _open({ action, id: q.get('id') || undefined, date: q.get('date') || undefined, text: q.get('text') || undefined });
          history.replaceState(null, '', location.pathname + location.hash);
        }
        // enlace de invitación a un workspace: app/?join=<wid>.<token> (o #join=…)
        const j = q.get('join') || ((location.hash || '').match(/join=([^&]+)/) || [])[1];
        if (j) {
          _open({ action: 'join', code: decodeURIComponent(j) });
          history.replaceState(null, '', location.pathname);
        }
      } catch (e) {}
      // el service worker: la app sin conexión y los toques en las notificaciones
      try {
        // (solo en la versión web: en Android y en Windows la app ya va dentro y un service worker
        // no aporta nada; en Android además se quedaba con la carga de la página y salía «sin
        // conexión». El que dejaron las versiones de antes se da de baja aquí, con su caché)
        if (root.navigator && navigator.serviceWorker && (A() || D())) {
          navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
          try { if (root.caches) caches.keys().then(ks => ks.filter(k => k.startsWith('zencalendar-')).forEach(k => caches.delete(k))).catch(() => {}); } catch (e) {}
        } else if (root.navigator && navigator.serviceWorker && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
          // (una versión nueva publicada cambia sw.js: el nuevo se activa solo y aquí se avisa
          // con status 'ready'; updates.install() recarga la página)
          const hadController = !!navigator.serviceWorker.controller;
          navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) setUpd({ status: 'ready', progress: 100 }); });
          navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(e => console.warn('[ZC] service worker', e));
          navigator.serviceWorker.addEventListener('message', ev => {
            const m = ev.data || {};
            if (m.type === 'zc-open') _open(m.data);
            if (m.type === 'zc-action' && ZC.reminders) ZC.reminders._action(m.data);
          });
        }
      } catch (e) {}
    }
    // icono elegido: que la ventana/bandeja lo use desde el principio
    try { const ic = ZC.store.local('appIcon'); if (ic && ic !== 'pastel' && kind !== 'android') setAppIcon(ic); } catch (e) {}
  }

  ZC.platform = {
    kind, role, hasTitlebar: kind === 'desktop',
    isWidget: role === 'widget',
    win, setTheme, openExternal, share, appIcons, setAppIcon, appIcon,
    desktopWidget, desktopWidgetOn, desktopWidgetPin, setAutostart, autostart,
    onOpen, notifyPermission, canPinWidget, pinWidget, wsCreds, notify,
    onBack, updates, init, openApp, setWindowMaterial, setEdgeToEdge, haptic,
    // el diseño del último setTheme: 'zen' | 'dot'
    get design() { try { const t = ZC.store.local('theme'); return normDesign(t && t.design); } catch (e) { return 'zen'; } },
    // la versión a la que se acaba de actualizar (Android), o '' (también llega el evento 'updated')
    get justUpdated() { return justUpdated; },
    get info() { return info; },
    on: (type, fn) => E().on(type, fn),
    // los llama el lado nativo
    _open, _back, _update,
  };
})(typeof window !== 'undefined' ? window : globalThis);
