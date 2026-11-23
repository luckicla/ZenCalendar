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
  const appIcons = [
    { id: 'pastel', name: 'Pastel' },
    { id: 'sakura', name: 'Sakura' },
    { id: 'menta', name: 'Menta' },
    { id: 'noche', name: 'Noche' },
    { id: 'cielo', name: 'Cielo' },
    { id: 'melocoton', name: 'Melocotón' },
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
  function setTheme(t) {
    if (!t) return;
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
        m.content = t.bg || '#F7F3FF';
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

  async function share(o) {
    o = o || {};
    try {
      if (A() && A().share) { A().share(String(o.title || ''), String(o.text || o.url || '')); return true; }
      if (root.navigator && navigator.share) { await navigator.share({ title: o.title, text: o.text, url: o.url }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    try { await navigator.clipboard.writeText([o.title, o.text, o.url].filter(Boolean).join('\n')); return 'copied'; } catch (e) { return false; }
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

  // ---------- actualizaciones (Windows) ----------
  let updState = null;
  const updates = {
    get available() { return !!(D() && D().update); },
    state: () => updState,
    check: () => D() && D().update ? D().update('check') : Promise.resolve(null),
    install: () => D() && D().update ? D().update('install') : Promise.resolve(null),
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

  let info = { version: (ZC.config && ZC.config.version) || '', portable: false };

  // ---------- arranque ----------
  let inited = false;
  async function init() {
    if (inited) return;
    inited = true;
    if (D()) {
      try { if (D().onWin) D().onWin(s => { winState = s || winState; E().emit('win', winState); }); } catch (e) {}
      try { if (D().onOpen) D().onOpen(o => _open(o)); } catch (e) {}
      try { if (D().onUpdate) D().onUpdate(s => { updState = s; E().emit('update', s); }); } catch (e) {}
      try { if (D().onWidget) D().onWidget(on => { widgetOn = !!on; E().emit('widget', widgetOn); }); } catch (e) {}
      try { winState = (await D().win('')) || winState; } catch (e) {}
      try { widgetOn = !!(await D().widget()); } catch (e) {}
      try { autoOn = !!(await D().autostart()); } catch (e) {}
      try { info = Object.assign(info, await D().info()); } catch (e) {}
      try { updState = D().update ? await D().update('state') : null; } catch (e) {}
    }
    if (A()) {
      try { if (A().version) info.version = A().version(); } catch (e) {}
      // lo que abrió la app (notificación, widget, compartir) antes de cargar la página
      try { const o = A().takeOpen && A().takeOpen(); if (o) _open(o); } catch (e) {}
      try { const s = A().takeShared && A().takeShared(); if (s) _open(s); } catch (e) {}
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
      } catch (e) {}
      // el service worker: la app sin conexión y los toques en las notificaciones
      try {
        if (root.navigator && navigator.serviceWorker && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
          navigator.serviceWorker.register('sw.js').catch(e => console.warn('[ZC] service worker', e));
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
    onOpen, notifyPermission, canPinWidget, pinWidget,
    onBack, updates, init, openApp, setWindowMaterial, setEdgeToEdge,
    get info() { return info; },
    on: (type, fn) => E().on(type, fn),
    // los llama el lado nativo
    _open, _back,
  };
})(typeof window !== 'undefined' ? window : globalThis);
