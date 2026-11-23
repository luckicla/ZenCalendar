'use strict';
// ZenCalendar: service worker de la versión web (GitHub Pages).
//
//  - La app funciona sin conexión: los archivos de la propia app se guardan
//    en caché al usarlos (primero la red, para tener siempre la última
//    versión entera; la caché si no hay red).
//  - NUNCA guarda nada de fuera (Google Drive, las APIs de IA, WebLLM…): solo
//    lo de este mismo sitio.
//  - Los toques en las notificaciones (y sus botones) vuelven a la app.
// (el workflow de Pages pone aquí el número de cada publicación: si sw.js
// cambia, el navegador instala el nuevo y la página sabe que hay versión nueva)
const BUILD = 'dev';
const CACHE = 'zencalendar-' + BUILD;
const CORE = ['./', './index.html', './manifest.webmanifest', './img/icon-192.png', './img/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('zencalendar-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // lo de fuera (APIs, Google, CDN) va directo a la red, sin tocarlo
  if (url.origin !== self.location.origin) return;
  // (lo que no es de la app: p. ej. la web de presentación de la carpeta de arriba)
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;

  // Todo lo de la app (páginas, js, css, imágenes): primero la red y, sin red,
  // lo guardado. Así, después de publicar una versión nueva nunca se mezcla un
  // index.html nuevo con scripts viejos de la caché (GitHub Pages ya cachea
  // 10 min por su cuenta, así que no es más lento).
  const navigate = req.mode === 'navigate';
  e.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {})); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: navigate }).then(r => r
    || (navigate ? caches.match('./index.html') : null)
    || new Response('', { status: 504, statusText: 'Sin conexión' }))));
});

// notificaciones: tocar = abrir el evento; botones «Posponer» y «Hecho»
self.addEventListener('notificationclick', e => {
  const n = e.notification;
  const data = n.data || {};
  n.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const msg = e.action === 'snooze' || e.action === 'done'
      ? { type: 'zc-action', data: { type: e.action, minutes: 10, reminder: data.reminder, eventId: data.id, date: data.date } }
      : { type: 'zc-open', data: { action: 'open', id: data.id, date: data.date } };
    if (list.length) {
      const c = list[0];
      if (msg.type === 'zc-open') { try { await c.focus(); } catch (err) {} }
      c.postMessage(msg);
    } else if (msg.type === 'zc-open') {
      await self.clients.openWindow('./index.html?action=open&id=' + encodeURIComponent(data.id || '') + '&date=' + encodeURIComponent(data.date || ''));
    }
  })());
});
