'use strict';
// Pruebas de los workspaces (ZC.ws) contra un Firebase simulado en memoria (web/js/core/ws-mock.js),
// que comprueba cada lectura y escritura con las mismas reglas que firestore.rules.
//   node tests/core/ws.test.js
const fs = require('fs');
const path = require('path');
const { load, t, report, assert } = require('./_load');

const FILES = ['config', 'util', 'store', 'recur', 'holidays', 'nlp', 'ics', 'net', 'platform', 'reminders', 'drive', 'gcal', 'ws', 'ws-mock', 'ai', 'core'];
const quiet = { log: console.log, error: console.error, warn() {}, info() {} };

function device(extra) {
  const ls = new Map();
  return load(FILES, Object.assign({
    console: quiet, Response, AbortController,
    setInterval: () => 0,
    location: { protocol: 'https:', hostname: 'luckicla.github.io', pathname: '/zencalendar/app/index.html', search: '', hash: '' },
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
  }, extra || {}));
}
const wait = ms => new Promise(r => setTimeout(r, ms || 30));
const pad = n => String(n).padStart(2, '0');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const denied = async (p, msg) => { let e = null; try { await p; } catch (x) { e = x; } assert.ok(e && /permission-denied/.test(e.code || ''), msg || 'tenía que negarse'); };

const USERS = [
  { uid: 'u-ana', name: 'Ana', email: 'ana@example.com' },
  { uid: 'u-bea', name: 'Bea', email: 'bea@example.com' },
  { uid: 'u-carl', name: 'Carl', email: 'carl@example.com' },
];

async function pair() {
  const A = device(), B = device();
  await A.core.init(); await B.core.init();
  const fb = await A.ws._mock({ users: USERS, me: 'u-ana', signedIn: true });
  await B.ws._mock({ server: fb, me: 'u-bea', signedIn: true });
  await wait();
  return { A, B, fb };
}

(async () => {
  // ---------- sin configurar ----------
  await t('sin Firebase configurado: no hay workspaces y todo lo demás va igual', async () => {
    const Z = device();
    await Z.core.init();
    assert.equal(Z.ws.available(), false);
    assert.equal(Z.ws.list().length, 0);
    let err = null; try { await Z.ws.connect(); } catch (e) { err = e; }
    assert.ok(err && /aún no tiene configurados/.test(err.message));
    const ev = await Z.store.saveEvent({ title: 'Normal', start: day(1) + 'T10:00' });
    assert.equal(Z.store.get(ev.id).title, 'Normal');
    assert.equal(Z.store.calendars().length, 3);
  });

  await t('config.js trae los cuatro campos de Firebase vacíos y setconfig.js los rellena', async () => {
    const src = fs.readFileSync(path.join(__dirname, '../../web/js/core/config.js'), 'utf8');
    for (const k of ['firebaseApiKey', 'firebaseAppId', 'firebaseProjectId', 'firebaseSenderId']) assert.ok(new RegExp(k + ": ''").test(src), k + ' vacío en el repo');
    const tmp = path.join(require('os').tmpdir(), 'zc-config-' + process.pid + '.js');
    fs.writeFileSync(tmp, src);
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, '../../tools/setconfig.js'), tmp], { env: Object.assign({}, process.env, { FIREBASE_API_KEY: 'k1', FIREBASE_APP_ID: 'a1', FIREBASE_PROJECT_ID: 'p1', FIREBASE_SENDER_ID: 's1' }) });
    const out = fs.readFileSync(tmp, 'utf8'); fs.unlinkSync(tmp);
    assert.ok(/firebaseApiKey: 'k1'/.test(out) && /firebaseProjectId: 'p1'/.test(out) && /firebaseSenderId: 's1'/.test(out));
  });

  // ---------- sesión ----------
  await t('token de Google bueno: entra; malo: no entra y lo dice claro', async () => {
    const Z = device(); await Z.core.init();
    const fb = await Z.ws._mock({ users: USERS, me: 'u-ana' });
    assert.equal(Z.ws.state().signedIn, false);
    fb.googleToken = 'token-falso';
    let err = null; try { await Z.ws.connect(); } catch (e) { err = e; }
    assert.ok(err && /Google no ha aceptado/.test(err.message), err && err.message);
    assert.equal(Z.ws.state().signedIn, false);
    fb.googleToken = 'tok-u-ana';
    await Z.ws.connect();
    assert.equal(Z.ws.state().signedIn, true);
    assert.equal(Z.ws.user().email, 'ana@example.com');
  });

  // ---------- crear y modo workspace ----------
  await t('crear un workspace: calendario virtual ws:<wid>, documento y vista previa del enlace', async () => {
    const { A, fb } = await pair();
    const w = await A.ws.create({ name: 'Cenas de los viernes', color: '#FF9CCB', icon: 'comida', bg: { kind: 'anim', value: 'sakura' } });
    await wait();
    assert.ok(w.id && w.isOwner);
    const raw = fb.raw('workspaces/' + w.id);
    assert.equal(raw.name, 'Cenas de los viernes');
    assert.deepEqual(raw.memberIds, ['u-ana']);
    assert.ok(raw.inviteToken.length >= 16);
    assert.ok(fb.raw('workspaces/' + w.id + '/invite/' + raw.inviteToken).name === 'Cenas de los viernes');
    assert.ok(A.store.calendar('ws:' + w.id), 'el calendario del workspace está en el store');
    assert.ok(A.ws.inviteLink(w.id).startsWith('https://luckicla.github.io/ZenCalendar/w/#' + w.id + '.'));
    assert.equal(A.ws.parseCode(A.ws.inviteLink(w.id)).wid, w.id);
    assert.equal(A.ws.parseCode('zencalendar://join/#' + w.id + '.' + raw.inviteToken).token, raw.inviteToken);
    assert.equal(A.ws.parseCode('https://x/app/?join=' + w.id + '.' + raw.inviteToken).wid, w.id);
    assert.equal(A.ws.parseCode('hola'), null);
  });

  await t('en un workspace solo se ve lo suyo (lo tuyo vuelve al salir) y lo nuevo va al workspace', async () => {
    const { A, fb } = await pair();
    const mine = await A.store.saveEvent({ title: 'Dentista', start: day(1) + 'T10:00' });
    const w = await A.ws.create({ name: 'Piso', color: '#7CC8F2' });
    await A.ws.switchTo(w.id);
    assert.equal(A.store.inWorkspace(), w.id);
    assert.deepEqual(A.store.calendars().map(c => c.id), ['ws:' + w.id]);
    assert.equal(A.store.defaultCalendarId(), 'ws:' + w.id);
    assert.ok(!A.store.events().some(e => e.id === mine.id), 'lo tuyo no se ve en el workspace');
    const ev = await A.store.saveEvent({ title: 'Limpiar la cocina', kind: 'task', calendarId: 'ws:' + w.id, start: day(2) });
    await wait();
    const d = fb.raw('workspaces/' + w.id + '/items/' + ev.id);
    assert.equal(d.title, 'Limpiar la cocina');
    assert.equal(d.createdBy, 'u-ana'); assert.equal(d.updatedBy, 'u-ana');
    assert.ok(d.updated && d.updated.__ts, 'updated es la hora del servidor');
    assert.ok(!('calendarId' in d) && !('attachments' in d));
    assert.ok(A.store.events().some(e => e.id === ev.id));
    // los avisos siguen viendo lo tuyo y lo del workspace estés donde estés
    const occ = A.store.occurrences(new Date(day(0)), new Date(day(4)), { scope: 'all', includeHidden: true });
    assert.ok(occ.some(o => o.id === mine.id) && occ.some(o => o.id === ev.id));
    // lo del workspace no va a Drive ni a la copia
    assert.ok(!A.store.snapshot({ drive: true }).events.some(e => e.id === ev.id));
    assert.ok(!A.store.exportJSON().events.some(e => e.id === ev.id));
    assert.ok(A.store.exportJSON().events.some(e => e.id === mine.id), 'la copia lleva lo tuyo aunque estés en un workspace');
    // con lo tuyo a la vista (atenuado)
    A.ws.setDim(true);
    const o2 = A.store.occurrences(new Date(day(0)), new Date(day(4)));
    assert.ok(o2.find(o => o.id === mine.id).dim === true && o2.find(o => o.id === ev.id).dim === false);
    A.ws.setDim(false);
    await A.ws.switchTo(null);
    assert.equal(A.store.inWorkspace(), null);
    assert.ok(A.store.events().some(e => e.id === mine.id) && !A.store.events().some(e => e.id === ev.id));
  });

  // ---------- invitar y entrar ----------
  await t('entrar con el enlace: clave buena entra, clave mala no; quien no es miembro no lee nada', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Viaje a Menorca', color: '#7ED6C3', emoji: '🏖️' });
    await A.store.saveEvent({ title: 'Ferry', calendarId: 'ws:' + w.id, start: day(10) + 'T08:00' });
    await wait();
    const carl = fb.client('u-carl');
    await denied(carl.get('workspaces/' + w.id), 'no miembro no lee el workspace');
    await denied(carl.items(w.id), 'no miembro no lee los eventos');
    await denied(carl.join(w.id + '.' + 'claveequivocada1234567'), 'clave mala');
    await denied(carl.get('workspaces/' + w.id + '/invite/claveequivocada1234567'), 'con la clave mala no ve ni el nombre');
    // Bea con el enlace bueno, desde la app
    const link = A.ws.inviteLink(w.id);
    const pk = await B.ws.peek(link);
    assert.equal(pk.name, 'Viaje a Menorca'); assert.equal(pk.ownerName, 'Ana'); assert.equal(pk.member, false);
    await B.ws.join(link);
    await wait(60);
    assert.ok(B.ws.list().some(x => x.id === w.id));
    assert.equal(B.ws.current().id, w.id, 'al entrar se abre el workspace');
    assert.ok(B.store.events().some(e => e.title === 'Ferry'), 'Bea ve los eventos');
    assert.deepEqual(fb.raw('workspaces/' + w.id).memberIds.sort(), ['u-ana', 'u-bea']);
    assert.equal(A.ws.get(w.id).members.length, 2, 'Ana ve a Bea en los miembros');
    // y Bea no se puede «colar» a otro con su clave vieja una vez cambiada
    const old = link;
    await A.ws.regenerateLink(w.id);
    await wait();
    await denied(carl.join(A.ws.parseCode(old).wid + '.' + A.ws.parseCode(old).token), 'el enlace viejo ya no vale');
    let err = null; try { await device().ws.parseCode('x'); } catch (e) { err = e; }
    assert.equal(err, null);
    await carl.join(w.id + '.' + A.ws.parseCode(A.ws.inviteLink(w.id)).token);
    await wait();
    assert.ok(fb.raw('workspaces/' + w.id).memberIds.includes('u-carl'), 'con el enlace nuevo sí');
  });

  await t('nadie se añade a otro ni se pone de dueño; un miembro no cambia el nombre, el dueño sí', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Club de lectura', color: '#C38BEB' });
    await B.ws.join(A.ws.inviteLink(w.id)); await wait();
    const bea = fb.client('u-bea');
    await denied(bea.update('workspaces/' + w.id, { name: 'Club de Bea', updatedAt: bea.F.serverTimestamp() }), 'solo el dueño cambia el nombre');
    await denied(bea.update('workspaces/' + w.id, { color: '#000000', updatedAt: bea.F.serverTimestamp() }), 'ni el color');
    await denied(bea.update('workspaces/' + w.id, { owner: 'u-bea', updatedAt: bea.F.serverTimestamp() }), 'ni quedarse el workspace');
    await denied(bea.update('workspaces/' + w.id, { memberIds: bea.F.arrayUnion('u-carl'), 'members.u-carl': { name: 'Carl' }, updatedAt: bea.F.serverTimestamp() }), 'ni meter a otro');
    let err = null; try { await B.ws.update(w.id, { name: 'X' }); } catch (e) { err = e; }
    assert.ok(err && /permiso/.test(err.message));
    await A.ws.update(w.id, { name: 'Club de lectura 📚', color: '#86B862' });
    await wait();
    assert.equal(fb.raw('workspaces/' + w.id).name, 'Club de lectura 📚');
    assert.equal(B.ws.get(w.id).name, 'Club de lectura 📚', 'a Bea le llega el nombre nuevo');
    assert.equal(B.store.calendar('ws:' + w.id).color, '#86B862');
    // sin sesión, nada
    const anon = fb.sdk(null);
    await denied(anon.F.getDoc(anon.F.doc(null, 'workspaces', w.id)), 'sin sesión no se lee');
  });

  await t('todos editan: lo que cambia uno le llega al otro con aviso; createdBy no se puede falsear', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Familia', color: '#FFB38A' });
    await B.ws.join(A.ws.inviteLink(w.id)); await wait();
    await A.ws.switchTo(null);
    const notes = [];
    A.ws.on('notice', n => notes.push(n));
    await B.ws.switchTo(w.id);
    const ev = await B.store.saveEvent({ title: 'Cena el viernes', calendarId: 'ws:' + w.id, start: day(3) + 'T21:00' });
    await wait(60);
    const n = notes.find(x => x.kind === 'add');
    assert.ok(n, 'Ana recibe el aviso');
    assert.equal(n.who, 'Bea'); assert.equal(n.title, 'Cena el viernes'); assert.equal(n.here, false);
    assert.equal(A.ws.unread(w.id), 1, 'novedad sin ver');
    await A.ws.switchTo(w.id);
    assert.equal(A.ws.unread(w.id), 0);
    assert.ok(A.store.get(ev.id));
    // Ana lo cambia: sigue siendo de Bea
    await A.store.saveEvent({ id: ev.id, title: 'Cena el viernes (en casa)' });
    await wait(60);
    const d = fb.raw('workspaces/' + w.id + '/items/' + ev.id);
    assert.equal(d.createdBy, 'u-bea'); assert.equal(d.updatedBy, 'u-ana');
    assert.equal(B.store.get(ev.id).title, 'Cena el viernes (en casa)');
    const bea = fb.client('u-bea');
    const forged = Object.assign({}, d, { createdBy: 'u-ana', updatedBy: 'u-bea', updated: bea.F.serverTimestamp() });
    await denied(bea.set('workspaces/' + w.id + '/items/' + ev.id, forged), 'no se puede cambiar quién lo creó');
    await denied(bea.set('workspaces/' + w.id + '/items/x1', { id: 'x1', title: 'a', createdBy: 'u-bea', updatedBy: 'u-ana', updated: bea.F.serverTimestamp() }), 'ni firmar como otro');
    await denied(bea.set('workspaces/' + w.id + '/items/x2', { id: 'x2', title: 'a'.repeat(501), createdBy: 'u-bea', updatedBy: 'u-bea', updated: bea.F.serverTimestamp() }), 'título demasiado largo');
    await denied(bea.set('workspaces/' + w.id + '/items/x3', { id: 'x3', title: 'a', raro: 1, createdBy: 'u-bea', updatedBy: 'u-bea', updated: bea.F.serverTimestamp() }), 'campos desconocidos');
    await denied(bea.set('workspaces/' + w.id + '/items/x4', { id: 'x4', title: 'a', assignee: 'u-carl', createdBy: 'u-bea', updatedBy: 'u-bea', updated: bea.F.serverTimestamp() }), 'asignar a quien no es miembro');
  });

  await t('tareas para alguien: asignar avisa a esa persona; borrar deja lápida y desaparece en los dos', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Piso compartido', color: '#7CC8F2' });
    await B.ws.join(A.ws.inviteLink(w.id)); await wait();
    const notes = [];
    B.ws.on('notice', n => notes.push(n));
    await A.ws.switchTo(w.id);
    const tk = await A.store.saveEvent({ kind: 'task', title: 'Bajar la basura', calendarId: 'ws:' + w.id, start: day(0), assignee: 'u-bea' });
    await wait(60);
    assert.equal(fb.raw('workspaces/' + w.id + '/items/' + tk.id).assignee, 'u-bea');
    assert.ok(notes.some(n => n.kind === 'assign' && n.title === 'Bajar la basura'), 'a Bea le llega «te ha asignado»');
    await B.store.toggleDone(tk.id);
    await wait(60);
    assert.equal(A.store.get(tk.id).done, true);
    await A.store.deleteEvent(tk.id);
    await wait(60);
    const d = fb.raw('workspaces/' + w.id + '/items/' + tk.id);
    assert.equal(d.deleted, true); assert.equal(d.createdBy, 'u-ana');
    assert.equal(d.title, 'Bajar la basura', 'la lápida lleva el título (para el aviso)'); assert.ok(!('start' in d), 'pero nada más');
    assert.equal(A.store.get(tk.id), null); assert.equal(B.store.get(tk.id), null);
    assert.ok(notes.some(n => n.kind === 'delete'));
  });

  await t('salir y echar: cada uno se va cuando quiere; el dueño echa y el enlace viejo deja de valer', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Equipo', color: '#F2C14E' });
    await B.ws.join(A.ws.inviteLink(w.id)); await wait();
    const carl = fb.client('u-carl');
    await carl.join(w.id + '.' + A.ws.parseCode(A.ws.inviteLink(w.id)).token); await wait();
    // Bea no puede echar a Carl
    const bea = fb.client('u-bea');
    await denied(bea.update('workspaces/' + w.id, { memberIds: bea.F.arrayRemove('u-carl'), 'members.u-carl': bea.F.deleteField(), updatedAt: bea.F.serverTimestamp() }), 'un miembro no echa a otro');
    // el dueño no se puede ir (borra)
    let err = null; try { await A.ws.leave(w.id); } catch (e) { err = e; }
    assert.ok(err && /dueño/.test(err.message));
    // Bea se va
    await B.ws.switchTo(w.id);
    await B.ws.leave(w.id); await wait(60);
    assert.equal(B.ws.list().length, 0); assert.equal(B.ws.current(), null);
    assert.ok(!fb.raw('workspaces/' + w.id).memberIds.includes('u-bea'));
    await denied(bea.items(w.id), 'después de irse ya no lee');
    // Ana echa a Carl: enlace nuevo
    const tokOld = fb.raw('workspaces/' + w.id).inviteToken;
    await A.ws.removeMember(w.id, 'u-carl'); await wait(60);
    const raw = fb.raw('workspaces/' + w.id);
    assert.deepEqual(raw.memberIds, ['u-ana']);
    assert.notEqual(raw.inviteToken, tokOld);
    await denied(carl.items(w.id), 'Carl ya no lee');
    await denied(carl.join(w.id + '.' + tokOld), 'ni vuelve a entrar con el enlace viejo');
  });

  await t('invitar por correo de Google: lo ve en su app, acepta o dice que no', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Boda de Marta', color: '#FF8A8A', emoji: '💍' });
    let err = null; try { await A.ws.inviteEmail(w.id, 'esto no es un correo'); } catch (e) { err = e; }
    assert.ok(err && /correo/.test(err.message));
    await A.ws.inviteEmail(w.id, 'Bea@Example.com');
    await wait(60);
    assert.deepEqual(fb.raw('workspaces/' + w.id).invitedEmails, ['bea@example.com']);
    assert.equal(B.ws.pendingInvites().length, 1, 'a Bea le sale la invitación');
    assert.equal(B.ws.pendingInvites()[0].name, 'Boda de Marta');
    const carl = fb.client('u-carl');
    await denied(carl.get('workspaces/' + w.id), 'Carl (no invitado) no lo ve');
    await B.ws.acceptInvite(w.id); await wait(60);
    assert.ok(B.ws.list().some(x => x.id === w.id));
    assert.deepEqual(fb.raw('workspaces/' + w.id).invitedEmails, []);
    // y decir que no
    await A.ws.inviteEmail(w.id, 'carl@example.com'); await wait();
    const C = device(); await C.core.init();
    await C.ws._mock({ server: fb, me: 'u-carl', signedIn: true }); await wait(60);
    assert.equal(C.ws.pendingInvites().length, 1);
    await C.ws.declineInvite(w.id); await wait(60);
    assert.equal(C.ws.pendingInvites().length, 0);
    assert.ok(!fb.raw('workspaces/' + w.id).memberIds.includes('u-carl'));
  });

  await t('borrar el workspace (solo el dueño): se va todo y a los demás les desaparece', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Temporal', color: '#9AA0B5' });
    await B.ws.join(A.ws.inviteLink(w.id)); await wait();
    await A.store.saveEvent({ title: 'Algo', calendarId: 'ws:' + w.id, start: day(1) + 'T10:00' }); await wait();
    let err = null; try { await B.ws.remove(w.id); } catch (e) { err = e; }
    assert.ok(err, 'Bea no puede borrarlo');
    const notes = []; B.ws.on('notice', n => notes.push(n));
    await A.ws.remove(w.id); await wait(80);
    assert.equal(fb.paths().filter(p => p.startsWith('workspaces/' + w.id)).length, 0, 'no queda nada en Firestore');
    assert.equal(B.ws.list().length, 0);
    assert.ok(!B.store.events('all').some(e => e.calendarId === 'ws:' + w.id));
    assert.ok(notes.some(n => n.kind === 'removed'));
  });

  await t('fondo con foto: solo el dueño; los miembros la ven', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Con foto', color: '#6AAEF5' });
    await B.ws.join(A.ws.inviteLink(w.id)); await wait();
    const img = 'data:image/webp;base64,UklGRhYAAABXRUJQVlA4IAoAAAAwAQCdASoBAAEAAkA0JaQAA3AA/vuUAAA=';
    await A.ws.setBackground(w.id, img); await wait(60);
    assert.equal(fb.raw('workspaces/' + w.id).bg.kind, 'image');
    assert.equal(await B.ws.bgData(w.id), img);
    const bea = fb.client('u-bea');
    await denied(bea.set('workspaces/' + w.id + '/assets/bg', { data: img, updatedAt: bea.F.serverTimestamp() }), 'Bea no cambia el fondo');
    await A.ws.setBackground(w.id, null); await wait();
    assert.equal(fb.raw('workspaces/' + w.id + '/assets/bg'), null);
  });

  await t('icono propio: se guarda el id; uno raro o el emoji de antes pasan a «estrella»; las reglas solo dejan los de la lista', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Con icono', color: '#7ED6C3', icon: 'casa' });
    await wait();
    assert.equal(fb.raw('workspaces/' + w.id).icon, 'casa');
    assert.ok(!('emoji' in fb.raw('workspaces/' + w.id)), 'ya no se guarda emoji');
    assert.equal(fb.raw('workspaces/' + w.id + '/invite/' + fb.raw('workspaces/' + w.id).inviteToken).icon, 'casa');
    assert.equal(A.ws.ICONS.length, 40);
    await A.ws.update(w.id, { icon: 'no-existe' }); await wait();
    assert.equal(A.ws.get(w.id).icon, 'estrella');
    const ana = fb.client('u-ana');
    await denied(ana.update('workspaces/' + w.id, { icon: '<svg>', updatedAt: ana.F.serverTimestamp() }), 'un icono que no está en la lista no vale');
    // un workspace de la 1.4.0 con emoji: sale con la estrella y, al guardarlo, el emoji se va
    await ana.update('workspaces/' + w.id, { emoji: '🍕', updatedAt: ana.F.serverTimestamp() });
    await ana.batch([['update', 'workspaces/' + w.id, { icon: ana.F.deleteField(), updatedAt: ana.F.serverTimestamp() }]]);
    await wait(60);
    assert.equal(A.ws.get(w.id).icon, 'estrella');
    await A.ws.update(w.id, { icon: 'pata' }); await wait();
    const raw = fb.raw('workspaces/' + w.id);
    assert.equal(raw.icon, 'pata'); assert.ok(!('emoji' in raw), 'el emoji viejo se quita al guardar');
    void B;
  });

  await t('foto de perfil: solo el dueño la pone y la quita; tamaño máximo; los miembros la ven al momento; los de fuera no', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Con cara', color: '#FF9CCB', icon: 'grupo' });
    await B.ws.join(A.ws.inviteLink(w.id)); await wait();
    const img = 'data:image/webp;base64,UklGRhYAAABXRUJQVlA4IAoAAAAwAQCdASoBAAEAAkA0JaQAA3AA/vuUAAA=';
    let changes = 0; B.ws.on('change', () => changes++);
    await A.ws.setAvatar(w.id, img); await wait(80);
    const raw = fb.raw('workspaces/' + w.id);
    assert.ok(raw.avatar, 'el workspace apunta a la versión de la foto');
    assert.equal(fb.raw('workspaces/' + w.id + '/assets/avatar').data, img);
    assert.equal(fb.raw('workspaces/' + w.id + '/invite/' + raw.inviteToken).avatar, img, 'la ve quien abre el enlace');
    assert.equal(A.ws.avatarURL(w.id), img);
    assert.equal(await B.ws.avatarData(w.id), img, 'Bea la ve');
    assert.equal(B.ws.avatarURL(w.id), img);
    assert.ok(changes > 0, 'y se le repinta');
    // queda en la copia sin conexión
    assert.equal(JSON.parse(B.store.local('ws.cache') ? JSON.stringify(B.store.local('ws.cache')) : '{}').spaces[w.id].av, img);
    // Bea (miembro) no la cambia ni la quita
    let e = null; try { await B.ws.setAvatar(w.id, img); } catch (x) { e = x; }
    assert.ok(e && /permiso/.test(e.message));
    const bea = fb.client('u-bea');
    await denied(bea.set('workspaces/' + w.id + '/assets/avatar', { data: img, updatedAt: bea.F.serverTimestamp() }), 'Bea no pone foto');
    await denied(bea.del('workspaces/' + w.id + '/assets/avatar'), 'Bea no la borra');
    await denied(bea.update('workspaces/' + w.id, { avatar: '123', updatedAt: bea.F.serverTimestamp() }), 'Bea no toca la versión');
    // tamaño máximo (también el dueño) y solo imágenes
    const ana = fb.client('u-ana');
    const big = 'data:image/webp;base64,' + 'A'.repeat(95000);
    await denied(ana.set('workspaces/' + w.id + '/assets/avatar', { data: big, updatedAt: ana.F.serverTimestamp() }), 'demasiado grande');
    await denied(ana.set('workspaces/' + w.id + '/assets/avatar', { data: 'hola', updatedAt: ana.F.serverTimestamp() }), 'solo imágenes');
    await denied(ana.set('workspaces/' + w.id + '/assets/otra', { data: img, updatedAt: ana.F.serverTimestamp() }), 'solo bg y avatar');
    e = null; try { await A.ws.setAvatar(w.id, big); } catch (x) { e = x; }
    assert.ok(e && /demasiado grande/.test(e.message), 'el núcleo lo dice antes de mandarlo');
    // los de fuera no la leen
    const carl = fb.client('u-carl');
    await denied(carl.get('workspaces/' + w.id + '/assets/avatar'), 'Carl no la lee');
    // quitarla
    await A.ws.setAvatar(w.id, null); await wait(60);
    assert.equal(fb.raw('workspaces/' + w.id + '/assets/avatar'), null);
    assert.equal(fb.raw('workspaces/' + w.id).avatar, '');
    assert.equal(B.ws.avatarURL(w.id), null, 'a Bea también se le quita');
    // al borrar el workspace se va con él
    await A.ws.setAvatar(w.id, img); await wait();
    await A.ws.remove(w.id); await wait();
    assert.ok(!fb.paths().some(p => p.startsWith('workspaces/' + w.id)), 'no queda nada');
  });

  await t('crear: los eventos del workspace se escuchan cuando el servidor lo confirma (antes, las reglas dirían que no)', async () => {
    const { A, B, fb } = await pair();
    const warns = [];
    const orig = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };
    try {
      fb.offline = true;
      const pw = A.ws.create({ name: 'Recién hecho', icon: 'fiesta' });
      await wait(60);
      const w = A.ws.list().find(x => x.name === 'Recién hecho');
      assert.ok(w, 'se ve al momento');
      assert.ok(!fb.listening().includes('workspaces/' + w.id + '/items'), 'sin confirmar, sus eventos aún no se escuchan');
      fb.offline = false;
      await pw; await wait(80);
      assert.ok(fb.listening().includes('workspaces/' + w.id + '/items'), 'confirmado, sí');
      await B.ws.join(A.ws.inviteLink(w.id)); await wait(60);
      const bea = fb.client('u-bea');
      await bea.set('workspaces/' + w.id + '/items/x1', { id: 'x1', kind: 'event', title: 'Pizza', start: day(1) + 'T21:00', end: day(1) + 'T22:00', createdBy: 'u-bea', updatedBy: 'u-bea', updated: bea.F.serverTimestamp() });
      await wait(80);
      assert.ok(A.store.get('x1'), 'y llega lo de los demás');
    } finally { console.warn = orig; }
    assert.ok(!warns.some(x => /permission-denied/.test(x)), 'sin «permission-denied» en la consola: ' + warns.join(' | '));
  });

  await t('la vista previa del enlace se lee sin sesión solo con la clave buena (página docs/w/)', async () => {
    const { A, fb } = await pair();
    const w = await A.ws.create({ name: 'Viaje', icon: 'avion', color: '#7CC8F2' });
    await wait();
    const tok = fb.raw('workspaces/' + w.id).inviteToken;
    const anon = fb.client(null);
    const d = await anon.get('workspaces/' + w.id + '/invite/' + tok);
    assert.equal(d.name, 'Viaje'); assert.equal(d.icon, 'avion');
    await denied(anon.get('workspaces/' + w.id + '/invite/OTRACLAVEQUENOVALE00'), 'con otra clave no');
    await denied(anon.get('workspaces/' + w.id), 'el workspace en sí, no');
    await denied(anon.items(w.id), 'ni sus eventos');
    await A.ws.regenerateLink(w.id); await wait();
    await denied(anon.get('workspaces/' + w.id + '/invite/' + tok), 'la clave vieja deja de valer');
  });

  await t('sin conexión: se ve al momento y se manda al volver internet', async () => {
    const { A, B, fb } = await pair();
    const w = await A.ws.create({ name: 'Offline', color: '#86B862' });
    await B.ws.join(A.ws.inviteLink(w.id)); await wait();
    await A.ws.switchTo(w.id);
    fb.offline = true;
    const ev = await A.store.saveEvent({ title: 'Sin red', calendarId: 'ws:' + w.id, start: day(1) + 'T09:00' });
    assert.ok(A.store.get(ev.id), 'en la app ya está');
    await wait();
    assert.equal(fb.raw('workspaces/' + w.id + '/items/' + ev.id), null, 'en el servidor todavía no');
    fb.offline = false;
    await wait(60);
    assert.equal(fb.raw('workspaces/' + w.id + '/items/' + ev.id).title, 'Sin red');
    assert.ok(B.store.get(ev.id), 'y le llega a Bea');
  });

  await t('mover de lo tuyo a un workspace (y al revés): otro id, y lápida donde estaba', async () => {
    const { A, fb } = await pair();
    const w = await A.ws.create({ name: 'Mover', color: '#FFB38A' });
    const mine = await A.store.saveEvent({ title: 'Concierto', start: day(5) + 'T20:00' });
    const moved = await A.store.saveEvent({ id: mine.id, calendarId: 'ws:' + w.id });
    await wait();
    assert.notEqual(moved.id, mine.id);
    assert.equal(A.store._rawEvent(mine.id).deleted, true, 'lápida en lo tuyo (para Drive)');
    assert.equal(fb.raw('workspaces/' + w.id + '/items/' + moved.id).title, 'Concierto');
    const back = await A.store.saveEvent({ id: moved.id, calendarId: 'personal' });
    await wait();
    assert.equal(fb.raw('workspaces/' + w.id + '/items/' + moved.id).deleted, true);
    assert.equal(A.store.get(back.id).calendarId, 'personal');
  });

  await t('la IA crea en el workspace abierto y el calendario del workspace no se borra desde el store', async () => {
    const { A } = await pair();
    const w = await A.ws.create({ name: 'IA', color: '#B9A2FF' });
    await A.ws.switchTo(w.id);
    const r = await A.ai.run('mañana a las 9 desayuno con todos');
    const cr = r.actions.find(a => a.type === 'create');
    assert.ok(cr, 'crea algo');
    const done = await A.ai.apply(r.actions);
    assert.equal(done[0].calendarId, 'ws:' + w.id);
    await A.store.deleteCalendar('ws:' + w.id);
    assert.ok(A.store.calendar('ws:' + w.id));
  });

  await t('Android/Windows reciben las credenciales al entrar y null al salir', async () => {
    const got = [];
    const Z = device({ ZCAndroid: { wsCreds: j => got.push(j), setTheme() {}, version: () => '1.4.0' } });
    await Z.core.init();
    await Z.ws._mock({ users: USERS, me: 'u-ana', signedIn: true });
    await wait();
    assert.ok(got.length && JSON.parse(got[got.length - 1]).uid === 'u-ana');
    await Z.ws.signOut();
    assert.equal(got[got.length - 1], '');
  });

  await t('las reglas de firestore.rules y las del simulador hablan de lo mismo', async () => {
    const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
    for (const s of ['ownerEdit', 'leaving', 'joining', 'declining', 'validItem', 'inviteToken', 'match /items/{id}', 'match /assets/{name}', 'match /invite/{tok}', 'match /joins/{uid}', "request.resource.data.updated == request.time".replace('request.resource.data.updated', 'd.updated')])
      assert.ok(rules.includes(s), 'falta ' + s + ' en firestore.rules');
    assert.ok(!/allow (read|write): if true/.test(rules), 'nada abierto a todos');
    const mock = fs.readFileSync(path.join(__dirname, '../../web/js/core/ws-mock.js'), 'utf8');
    for (const s of ['ownerEdit', 'leaving', 'joining', 'declining', 'validItem', 'validIcon', 'isImage']) assert.ok(mock.includes(s));
    // la misma lista de iconos en el núcleo, las reglas y el simulador
    const core = fs.readFileSync(path.join(__dirname, '../../web/js/core/ws.js'), 'utf8');
    const ids = core.split('const ICONS = [')[1].split('];')[0].match(/'[a-z]+'/g);
    assert.equal(ids.length, 40);
    for (const id of ids) { assert.ok(rules.includes(id), id + ' en firestore.rules'); assert.ok(mock.includes(id), id + ' en ws-mock.js'); }
    assert.ok(rules.includes("name in ['bg', 'avatar']") && rules.includes('90000'), 'la foto de perfil en las reglas');
  });

  report(__filename);
  // (los simuladores dejan temporizadores de «sincroniza en un rato» de los otros dispositivos: se sale aquí)
  setTimeout(() => process.exit(process.exitCode || 0), 20);
})();
