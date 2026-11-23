'use strict';
// Pruebas de la fusión y de la sincronización con Drive (ZC.store.merge + ZC.drive)
// con un Google Drive de mentira y dos «dispositivos». node tests/core/sync.test.js
const { load, t, report, assert } = require('./_load');

// ---------- un Google Drive de mentira ----------
function fakeDrive() {
  const files = new Map(); // id → { id, name, version, modifiedTime, data: Buffer, mime }
  let n = 0;
  const D = { files, uploads: 0, hooks: {}, requests: [] };
  const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  function parseMultipart(buf, ctype) {
    const b = /boundary=(.+)$/.exec(ctype)[1];
    const s = buf.toString('latin1');
    const parts = s.split('--' + b).slice(1, -1);
    const meta = JSON.parse(Buffer.from(parts[0].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1').toString('utf8'));
    const p1 = parts[1];
    const i = p1.indexOf('\r\n\r\n');
    const head = p1.slice(0, i);
    const body = Buffer.from(p1.slice(i + 4).replace(/\r\n$/, ''), 'latin1');
    return { meta, body, mime: /Content-Type: ([^\r\n]+)/.exec(head)[1] };
  }
  D.fetch = async (url, opts) => {
    opts = opts || {};
    const u = new URL(url);
    const method = (opts.method || 'GET').toUpperCase();
    D.requests.push(method + ' ' + u.pathname);
    if (!/^Bearer tok/.test((opts.headers || {}).Authorization || '')) return json({ error: { message: 'no auth' } }, 401);
    if (u.hostname === 'www.googleapis.com' && u.pathname === '/oauth2/v3/userinfo') return json({ email: 'lluc@example.com', name: 'Lluc', picture: 'https://x/y.png' });
    let m;
    if (method === 'GET' && u.pathname === '/drive/v3/files') {
      const q = u.searchParams.get('q');
      let list = [...files.values()];
      if ((m = /name='([^']+)'/.exec(q))) list = list.filter(f => f.name === m[1]);
      if ((m = /name contains '([^']+)'/.exec(q))) list = list.filter(f => f.name.includes(m[1]));
      return json({ files: list.map(f => ({ id: f.id, name: f.name, version: String(f.version), modifiedTime: f.modifiedTime, size: String(f.data.length) })) });
    }
    if ((m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname))) {
      const f = files.get(m[1]);
      if (method === 'DELETE') { files.delete(m[1]); return new Response(null, { status: 204 }); }
      if (!f) return json({ error: { message: 'not found' } }, 404);
      if (u.searchParams.get('alt') === 'media') {
        const r = new Response(f.data, { status: 200, headers: { 'Content-Type': f.mime } });
        if (D.hooks.afterDownload) { const h = D.hooks.afterDownload; D.hooks.afterDownload = null; await h(f); }
        return r;
      }
      return json({ id: f.id, version: String(f.version), modifiedTime: f.modifiedTime });
    }
    if ((m = /^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/.exec(u.pathname))) {
      const body = Buffer.from(opts.body);
      const p = parseMultipart(body, opts.headers['Content-Type']);
      D.uploads++;
      let f;
      if (m[1]) { f = files.get(m[1]); if (!f) return json({}, 404); f.data = p.body; f.version++; }
      else { f = { id: 'f' + (++n), name: p.meta.name, version: 1, data: p.body, mime: p.mime }; files.set(f.id, f); }
      f.modifiedTime = new Date(Date.now() + n).toISOString();
      return json({ id: f.id, version: String(f.version), modifiedTime: f.modifiedTime });
    }
    return json({ error: { message: 'no implementado ' + method + ' ' + u.pathname } }, 400);
  };
  D.mainJSON = () => { const f = [...files.values()].find(f => f.name === 'zencalendar.json'); return f ? JSON.parse(f.data.toString('utf8')) : null; };
  return D;
}

// ---------- un dispositivo: un contexto con todo core cargado ----------
function device(drive, extra) {
  const quiet = { log: console.log, error: console.error, warn() {}, info() {} };
  const ls = new Map();
  const ZC = load(['config', 'util', 'store', 'recur', 'holidays', 'nlp', 'net', 'platform', 'reminders', 'drive', 'ai', 'core'], Object.assign({
    console: quiet,
    fetch: (u, o) => drive.fetch(u, o),
    Response, AbortController,
    setInterval: () => 0, // (sin la sync cada 2 minutos en las pruebas)
    location: { protocol: 'https:', hostname: 'luckicla.github.io', pathname: '/zencalendar/app/index.html', search: '' },
    localStorage: { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
  }, extra || {}));
  ZC.config.googleWebClientId = 'test.apps.googleusercontent.com';
  return ZC;
}

async function connected(ZC) {
  // como si ya hubiera iniciado sesión antes (el token de la web se guarda en local)
  ZC.store.local('drive', { connected: true, email: 'lluc@example.com', name: 'Lluc' });
  ZC.store.local('drive.webtoken', { token: 'tok-' + Math.random(), exp: Date.now() + 3600e3 });
  await ZC.core.init();
  return ZC;
}

const titles = ZC => ZC.store.events().map(e => e.title).sort();

(async () => {
  // ---------- la fusión, sin red ----------
  const Z = load(['config', 'util', 'store', 'recur'], { console: { warn() {}, log: console.log, error: console.error } });
  const merge = Z.store.merge;
  await t('fusión: gana el más nuevo por elemento', () => {
    const a = { events: [{ id: '1', title: 'A', updated: 10 }, { id: '2', title: 'x', updated: 5 }], calendars: [], prefs: {} };
    const b = { events: [{ id: '1', title: 'B', updated: 20 }, { id: '3', title: 'nuevo', updated: 7 }], calendars: [], prefs: {} };
    const m = merge(a, b);
    const by = Object.fromEntries(m.data.events.map(e => [e.id, e.title]));
    assert.deepStrictEqual(by, { 1: 'B', 2: 'x', 3: 'nuevo' });
    assert.ok(m.localChanged); assert.ok(m.remoteChanged);
  });
  await t('fusión: la lápida más nueva gana; la más vieja no', () => {
    const now = Date.now();
    const a = { events: [{ id: '1', deleted: true, updated: now }, { id: '2', deleted: true, updated: now - 1000 }] };
    const b = { events: [{ id: '1', title: 'viejo', updated: now - 5 }, { id: '2', title: 'editado después', updated: now }] };
    const m = merge(a, b);
    assert.strictEqual(m.data.events.find(e => e.id === '1').deleted, true);
    assert.strictEqual(m.data.events.find(e => e.id === '2').title, 'editado después');
  });
  await t('fusión: iguales → nada que subir ni guardar', () => {
    const a = { events: [{ id: '1', title: 'A', updated: 10 }], calendars: [{ id: 'c', name: 'C', updated: 1 }], prefs: { look: { t: 1 }, _stamps: { look: 5 } }, blobs: { b1: { name: 'x', updated: 3 } } };
    const m = merge(a, JSON.parse(JSON.stringify(a)));
    assert.strictEqual(m.localChanged, false); assert.strictEqual(m.remoteChanged, false);
  });
  await t('fusión: empate con contenido distinto → el mismo ganador en los dos lados', () => {
    const x = { id: '1', title: 'X', updated: 10 }, y = { id: '1', title: 'Y', updated: 10 };
    const m1 = merge({ events: [x] }, { events: [y] }), m2 = merge({ events: [y] }, { events: [x] });
    assert.strictEqual(m1.data.events[0].title, m2.data.events[0].title);
  });
  await t('fusión: ajustes por sección', () => {
    const a = { prefs: { look: { theme: 'nube' }, ai: { provider: 'rules' }, _stamps: { look: 100, ai: 1 } } };
    const b = { prefs: { look: { theme: 'noche' }, ai: { provider: 'gemini' }, _stamps: { look: 50, ai: 200 } } };
    const p = merge(a, b).data.prefs;
    assert.strictEqual(p.look.theme, 'nube'); assert.strictEqual(p.ai.provider, 'gemini');
  });
  await t('fusión: lápidas de hace más de un año se olvidan', () => {
    const old = Date.now() - 400 * 86400e3;
    const m = merge({ events: [{ id: '1', deleted: true, updated: old }] }, { events: [] });
    assert.strictEqual(m.data.events.length, 0);
  });

  await t('fusión: da igual el orden (A con B = B con A) y repetir no cambia nada', () => {
    const now = Date.now();
    const a = { events: [{ id: '1', title: 'A1', updated: now - 50 }, { id: '2', deleted: true, updated: now - 10 }, { id: '3', title: 'tie-a', updated: now - 5 }], calendars: [], blobs: {} };
    const b = { events: [{ id: '1', deleted: true, updated: now - 20 }, { id: '2', title: 'B2 viejo', updated: now - 30 }, { id: '3', deleted: true, updated: now - 5 }, { id: '4', title: 'B4', updated: now - 1 }], calendars: [], blobs: {} };
    const ab = merge(a, b).data, ba = merge(b, a).data;
    const key = d => JSON.stringify(d.events.slice().sort((x, y) => x.id < y.id ? -1 : 1));
    assert.strictEqual(key(ab), key(ba));
    assert.strictEqual(ab.events.find(e => e.id === '1').deleted, true);   // la lápida es más nueva que «A1»
    assert.strictEqual(ab.events.find(e => e.id === '2').deleted, true);   // y aquí la edición es más vieja
    const again = merge(ab, b);
    assert.strictEqual(again.localChanged, false);
  });
  // ---------- el store (en memoria) ----------
  await Z.store.init();
  await t('store: calendarios por defecto', () => assert.deepStrictEqual(Z.store.calendars().map(c => c.id), ['personal', 'work', 'birthdays']));
  await t('store: guardar rellena lo que falta', async () => {
    const e = await Z.store.saveEvent({ title: 'Dentista', start: '2026-11-24T17:00' });
    assert.ok(e.id && e.created && e.updated);
    assert.strictEqual(e.end, '2026-11-24T18:00');
    assert.deepStrictEqual(e.reminders, [10]);
    assert.strictEqual(Z.store.get(e.id).title, 'Dentista');
  });
  await t('store: serie — solo esta / esta y siguientes / todas', async () => {
    const s = await Z.store.saveEvent({ title: 'Yoga', start: '2026-11-02T19:00', end: '2026-11-02T20:00', rrule: { freq: 'weekly', byDay: ['MO'] } });
    const D = (m, d) => new Date(2026, m - 1, d);
    const occ = () => Z.store.occurrences(D(11, 1), D(12, 1)).filter(o => o.ev.title.startsWith('Yoga')).map(o => o.date + ':' + o.ev.title);
    assert.strictEqual(occ().length, 5);
    const copy = await Z.store.saveEventOccurrence(s.id, '2026-11-09', { title: 'Yoga (cambiado)' });
    assert.ok(occ().includes('2026-11-09:Yoga (cambiado)'));
    assert.strictEqual(copy.recurrenceOf, s.id);
    await Z.store.deleteEvent(s.id, { mode: 'one', date: '2026-11-16' });
    assert.ok(!occ().some(x => x.startsWith('2026-11-16')));
    await Z.store.deleteEvent(s.id, { mode: 'future', date: '2026-11-23' });
    assert.deepStrictEqual(occ(), ['2026-11-02:Yoga', '2026-11-09:Yoga (cambiado)']);
    await Z.store.deleteEvent(s.id, { mode: 'all' });
    assert.deepStrictEqual(occ(), []);
    assert.strictEqual(Z.store.get(copy.id), null, 'la copia suelta también se borra');
  });
  await t('store: tareas y tareas que se repiten', async () => {
    const tk = await Z.store.saveEvent({ kind: 'task', title: 'Pan', start: '2026-11-24', allDay: true });
    assert.strictEqual(tk.end, tk.start);
    assert.strictEqual((await Z.store.toggleDone(tk.id)).done, true);
    const r = await Z.store.saveEvent({ kind: 'task', title: 'Pastilla', start: '2026-11-24T22:00', rrule: { freq: 'daily' } });
    await Z.store.toggleDone(r.id, '2026-11-25');
    const o = Z.store.occurrences(new Date(2026, 10, 24), new Date(2026, 10, 27)).filter(x => x.id === r.id);
    assert.deepStrictEqual(o.map(x => x.done), [false, true, false]);
  });
  await t('store: ajustes y local', async () => {
    await Z.store.setPrefs({ look: { theme: 'sakura' } });
    const p = Z.store.getPrefs();
    assert.strictEqual(p.look.theme, 'sakura');
    assert.strictEqual(p.cal.defaultDuration, 60);
    assert.ok(p._updated > 0);
    Z.store.local('x', { a: 1 }); assert.deepStrictEqual(Z.store.local('x'), { a: 1 });
    Z.store.local('x', null); assert.strictEqual(Z.store.local('x'), null);
  });
  await t('store: borrar calendario borra sus eventos', async () => {
    const c = await Z.store.saveCalendar({ name: 'Clases', color: '#BFF0E4' });
    await Z.store.saveEvent({ title: 'Mates', start: '2026-11-25T10:00', calendarId: c.id });
    await Z.store.deleteCalendar(c.id);
    assert.ok(!Z.store.events().some(e => e.title === 'Mates'));
    assert.ok(!Z.store.calendars().some(x => x.id === c.id));
  });
  await t('store: volver a guardar algo borrado (deshacer) gana a su lápida al sincronizar', async () => {
    const e = await Z.store.saveEvent({ title: 'Deshacer', start: '2026-12-02T10:00' });
    const before = JSON.parse(JSON.stringify(e));
    await Z.store.deleteEvent(e.id);
    const tombU = Z.store.snapshot().events.find(x => x.id === e.id).updated;
    const back = await Z.store.saveEvent({ ...before, deleted: false });
    assert.ok(back.updated > tombU);
    // otro dispositivo que solo tiene la lápida recibe el evento de vuelta
    const m = merge({ events: [{ id: e.id, deleted: true, updated: tombU }] }, { events: [back] });
    assert.strictEqual(m.data.events[0].deleted, false);
  });
  await t('store: colores raros (de una copia o de la IA) no se guardan', async () => {
    const e = await Z.store.saveEvent({ title: 'Color', start: '2026-12-03T10:00', color: '#fff" onmouseover="x' });
    assert.strictEqual(e.color, null);
    assert.strictEqual((await Z.store.saveEvent({ id: e.id, color: '#A9D8FF' })).color, '#A9D8FF');
  });
  await t('store: buscar sin tildes', () => assert.ok(Z.store.search('dentísta').length === 1));
  await t('store: copia JSON y volver a importar', async () => {
    const j = Z.store.exportJSON();
    assert.ok(j.events.length >= 2);
    const r = await Z.store.importJSON(j, { merge: true });
    assert.ok(r.events >= 2);
  });
  await t('store: avisos (ZC.reminders.compute)', async () => {
    const Y = load(['config', 'util', 'store', 'recur', 'reminders'], { console: { warn() {}, log: console.log, error: console.error } });
    await Y.store.init();
    const now = new Date(2026, 10, 23, 10, 0).getTime();
    await Y.store.saveEvent({ title: 'Cena', start: '2026-11-23T21:00', reminders: [0, 60] });
    await Y.store.saveEvent({ title: 'Viaje', start: '2026-11-24', allDay: true, reminders: [0] });
    const list = Y.reminders.compute(now);
    const fmt = r => new Date(r.at).getHours() + ':' + r.title;
    assert.deepStrictEqual(list.map(fmt), ['20:Cena', '21:Cena', '9:Viaje']);
    assert.ok(/21:00/.test(list[0].body));
  });

  // ---------- la sincronización completa, dos dispositivos ----------
  const drive = fakeDrive();
  const A = await connected(device(drive));
  const B = await connected(device(drive));
  await t('A sube lo suyo (crea el archivo)', async () => {
    await A.store.saveEvent({ title: 'Cena', start: '2026-11-27T21:30' });
    await A.store.saveEvent({ title: 'Gimnasio', start: '2026-11-25T19:00' });
    await A.drive.sync();
    assert.strictEqual(A.drive.state().error, null);
    assert.ok(A.drive.state().lastSync);
    assert.deepStrictEqual(drive.mainJSON().events.filter(e => !e.deleted).map(e => e.title).sort(), ['Cena', 'Gimnasio']);
  });
  await t('B lo recibe', async () => {
    await B.drive.sync();
    assert.deepStrictEqual(titles(B), ['Cena', 'Gimnasio']);
  });
  await t('sin cambios no se sube nada', async () => {
    const before = drive.uploads;
    await A.drive.sync(); await B.drive.sync();
    assert.strictEqual(drive.uploads, before);
  });
  await t('cambios a la vez en los dos: no se pierde nada', async () => {
    const cena = B.store.events().find(e => e.title === 'Cena');
    const gym = B.store.events().find(e => e.title === 'Gimnasio');
    await B.store.saveEvent({ id: cena.id, title: 'Cena (B)' });
    await B.store.deleteEvent(gym.id);
    await B.store.saveEvent({ title: 'Cine', start: '2026-11-28T20:00' });
    await new Promise(r => setTimeout(r, 5));
    await A.store.saveEvent({ id: cena.id, title: 'Cena con Marta' }); // más nuevo que el de B
    await A.store.saveEvent({ title: 'Dentista', start: '2026-11-30T10:00' });
    await B.drive.sync(); await A.drive.sync(); await B.drive.sync();
    assert.deepStrictEqual(titles(A), ['Cena con Marta', 'Cine', 'Dentista']);
    assert.deepStrictEqual(titles(B), ['Cena con Marta', 'Cine', 'Dentista']);
  });
  await t('alguien sube justo mientras: se repite la vuelta', async () => {
    await A.store.saveEvent({ title: 'De A', start: '2026-12-01T10:00' });
    await B.store.saveEvent({ title: 'De B', start: '2026-12-02T10:00' });
    // en cuanto A baje el archivo, B sincroniza (y sube) antes de que A suba
    drive.hooks.afterDownload = () => B.drive.sync();
    await A.drive.sync();
    await B.drive.sync();
    assert.ok(titles(A).includes('De A') && titles(A).includes('De B'), titles(A).join());
    assert.ok(titles(B).includes('De A') && titles(B).includes('De B'), titles(B).join());
  });
  await t('ajustes: cada uno su sección', async () => {
    await A.store.setPrefs({ look: { theme: 'noche' } });
    await new Promise(r => setTimeout(r, 5));
    await B.store.setPrefs({ ai: { provider: 'gemini', model: '', baseUrl: '', autoApply: false } });
    await A.drive.sync(); await B.drive.sync(); await A.drive.sync();
    assert.strictEqual(B.store.getPrefs().look.theme, 'noche');
    assert.strictEqual(A.store.getPrefs().ai.provider, 'gemini');
  });
  await t('las claves de IA no van a Drive', async () => {
    A.ai.setKey('gemini', 'SECRETO-123');
    await A.store.saveEvent({ title: 'x', start: '2026-12-05' });
    await A.drive.sync();
    const all = [...drive.files.values()].map(f => f.data.toString('utf8')).join('');
    assert.ok(!all.includes('SECRETO-123'));
  });
  await t('imágenes: se suben aparte y el otro las baja al pedirlas', async () => {
    const id = await A.store.putBlob(new Blob([Buffer.from('PNGDATA')], { type: 'image/png' }), { name: 'cartel.png' });
    await A.store.saveEvent({ title: 'Concierto', start: '2026-12-12T21:00', attachments: [{ id, name: 'cartel.png', type: 'image/png', w: 1, h: 1 }] });
    await A.drive.sync();
    assert.ok([...drive.files.values()].some(f => f.name === 'blob-' + id));
    await B.drive.sync();
    const b = await B.store.getBlob(id);
    assert.ok(b, 'B no tiene la imagen');
    assert.strictEqual(Buffer.from(await b.arrayBuffer()).toString(), 'PNGDATA');
    assert.strictEqual(B.store.blobInfo(id).name, 'cartel.png');
  });
  await t('imágenes borradas: se borran también en Drive', async () => {
    const ev = A.store.events().find(e => e.title === 'Concierto');
    const id = ev.attachments[0].id;
    await A.store.deleteEvent(ev.id);
    await A.drive.sync();
    assert.ok(![...drive.files.values()].some(f => f.name === 'blob-' + id));
    await B.drive.sync();
    assert.strictEqual(await B.store.getBlob(id), null);
  });
  await t('token caducado (401) → se pide otro sin molestar (Windows)', async () => {
    // un dispositivo «de escritorio»: el token nuevo lo da el proceso principal
    let asked = 0;
    const W = device(drive, { zcDesktop: { google: async cmd => (cmd === 'token' ? (asked++, { access_token: 'tok-w' + asked, expires_at: Date.now() + 3600e3 }) : null) } });
    W.config.googleDesktopClientId = 'desk.apps.googleusercontent.com';
    W.store.local('drive', { connected: true, email: 'lluc@example.com' });
    await W.core.init();
    await W.drive.sync();
    assert.strictEqual(W.drive.state().error, null, W.drive.state().error);
    let n = 0;
    const real = drive.fetch;
    drive.fetch = async (u, o) => { if (n++ === 0) return new Response('{}', { status: 401 }); return real(u, o); };
    await W.store.saveEvent({ title: 'Tras 401', start: '2026-12-06T10:00' });
    await W.drive.sync();
    drive.fetch = real;
    assert.strictEqual(W.drive.state().error, null, W.drive.state().error);
    assert.strictEqual(asked, 2);
    assert.strictEqual(W.platform.kind, 'desktop');
  });
  await t('sin conexión: error claro y no rompe', async () => {
    const real = drive.fetch;
    drive.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await A.store.saveEvent({ title: 'Offline', start: '2026-12-07T10:00' });
    await A.drive.sync();
    drive.fetch = real;
    assert.ok(/Sin conexión/.test(A.drive.state().error), A.drive.state().error);
    await A.drive.sync();
    assert.strictEqual(A.drive.state().error, null);
    await B.drive.sync();
    assert.ok(titles(B).includes('Offline'));
  });
  await t('desconectar deja los datos', async () => {
    await B.drive.disconnect();
    assert.strictEqual(B.drive.state().connected, false);
    assert.ok(titles(B).length > 3);
  });
  report(__filename);
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
