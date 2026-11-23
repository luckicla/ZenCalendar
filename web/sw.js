'use strict';
// ZenCalendar: service worker de la versión web (GitHub Pages).
//
//  - La app funciona sin conexión: los archivos de la propia app se guardan
//    en caché al usarlos (primero la red para las páginas, para tener siempre
//    la última versión; la caché si no hay red).
//  - NUNCA guarda nada de fuera (Google Drive, las APIs de IA, WebLLM…): solo
//    lo de este mismo sitio.
//  - Los toques en las notificaciones (y sus botones) vuelven a la app.
const CACHE = 'zencalendar-v1';
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

  if (req.mode === 'navigate') {
    // páginas: primero la red (la última versión) y, sin red, la guardada
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
    return;
  }
  // el resto (js, css, imágenes): la guardada al momento y, por detrás, se actualiza
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(res => { if (res.ok && res.type === 'basic') c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || new Response('', { status: 504, statusText: 'Sin conexión' });
  }));
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
