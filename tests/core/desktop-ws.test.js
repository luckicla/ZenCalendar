'use strict';
// desktop/workspaces.js (Windows) sin Electron: enlaces zencalendar://join y los avisos de workspaces con la
// ventana cerrada, contra el Firebase de mentira de _fake-firestore.js. node tests/core/desktop-ws.test.js
const { t, report, assert } = require('./_load');
const W = require('../../desktop/workspaces.js');
const { createFakeFirestore, scenario, scenario2, EXPECT_1, EXPECT_2, T0 } = require('./_fake-firestore');

const linesBy = groups => Object.fromEntries(groups.map(g => [g.wid, g.lines]));

(async () => {
  await t('enlaces: el código de zencalendar://join y de la web', () => {
    assert.strictEqual(W.parseJoin('zencalendar://join/#Ab3dE.tok-EN_1'), 'Ab3dE.tok-EN_1');
    assert.strictEqual(W.parseJoin('zencalendar://join#Ab3dE.tok'), 'Ab3dE.tok');
    assert.strictEqual(W.parseJoin('zencalendar://join/?code=Ab3dE.tok'), 'Ab3dE.tok');
    assert.strictEqual(W.parseJoin('zencalendar://join?join=Ab3dE.tok'), 'Ab3dE.tok');
    assert.strictEqual(W.parseJoin('https://luckicla.github.io/zencalendar/w/#Ab3dE.tok'), 'Ab3dE.tok');
    assert.strictEqual(W.parseJoin('https://luckicla.github.io/zencalendar/app/?join=Ab3dE.tok'), 'Ab3dE.tok');
    for (const bad of ['', 'zencalendar://join/', 'zencalendar://join/#sinpunto', 'zencalendar://open/#a.b', 'zencalendar://join/#a.b<script>',
      'https://otra.web/w/#a.b', 'zencalendar://join/#' + 'a'.repeat(65) + '.b', null]) assert.strictEqual(W.parseJoin(bad), null, String(bad));
  });

  await t('enlaces: de la línea de órdenes de Windows (second-instance / arranque)', () => {
    assert.strictEqual(W.joinFromArgv(['C:\\ZenCalendar\\ZenCalendar.exe', '--hidden', 'zencalendar://join/#w1.t1']), 'w1.t1');
    assert.strictEqual(W.joinFromArgv(['electron.exe', 'C:\\app', '--allow-file-access', 'zencalendar://join/#w1.t1']), 'w1.t1');
    assert.strictEqual(W.joinFromArgv(['ZenCalendar.exe', '--new']), null);
    assert.strictEqual(W.joinFromArgv(['ZenCalendar.exe', 'https://luckicla.github.io/zencalendar/w/#w1.t1']), null, 'solo el protocolo propio');
  });

  await t('marcas de Firestore: se comparan con los decimales que traigan', () => {
    assert.ok(W.tsKey('2026-11-24T10:00:01.5Z') > W.tsKey('2026-11-24T10:00:01.123456Z'));
    assert.ok(W.tsKey('2026-11-24T10:00:03.0000011Z') > W.tsKey('2026-11-24T10:00:03.000001Z'));
    assert.strictEqual(W.tsKey('2026-11-24T10:00:01Z'), '2026-11-24T10:00:01.000000000');
    assert.strictEqual(W.tsKey('ayer'), '');
  });

  const F = createFakeFirestore();
  scenario(F);
  let saved = null, now = T0 + 3600e3, fg = false;
  const notes = [];
  const mk = () => W.createChecker({
    fetch: F.handle, now: () => now, isForeground: () => fg,
    load: () => (saved ? JSON.parse(saved) : null), save: s => { saved = s ? JSON.stringify(s) : null; },
    notify: (g, S) => notes.push({ g, body: W.groupBody(g, S) }),
  });
  let C = mk();

  await t('sin credenciales no hace nada', async () => {
    const r = await C.check();
    assert.strictEqual(r.skipped, 'sin credenciales');
    assert.strictEqual(F.calls.length, 0);
  });

  await t('credenciales: se validan y se guardan', async () => {
    assert.strictEqual(C.setCreds({ apiKey: 'x' }), false);
    assert.strictEqual(C.setCreds({ apiKey: F.apiKey, projectId: F.projectId, uid: 'yo', refreshToken: 'rt-yo', since: T0, strings: { more: 'i {n} més', raro: 'x' } }), true);
    const st = JSON.parse(saved);
    assert.strictEqual(st.creds.uid, 'yo');
    assert.deepStrictEqual(st.creds.strings, { more: 'i {n} més' });
    assert.strictEqual(st.since, '2026-11-24T10:00:00.000Z');
  });

  await t('primera vuelta: los cambios de otros, agrupados por workspace, sin los míos ni los de antes', async () => {
    C = mk(); // (como al volver a abrir la app: lee lo guardado)
    const r = await C.check();
    assert.ok(!r.error, r.error);
    assert.deepStrictEqual(linesBy(r.groups), EXPECT_1);
    assert.strictEqual(notes.length, 2);
    assert.strictEqual(notes[0].g.name, 'Piso Gràcia');
    assert.strictEqual(notes[0].g.emoji, '🏠');
    assert.ok(notes[1].g.name.endsWith('…') && notes[1].g.name.length === 60, 'nombre largo recortado');
    assert.strictEqual(notes[1].body, EXPECT_1.wB.join('\n'));
    assert.ok(!F.calls.some(c => c.includes('/workspaces/wC')), 'el workspace ajeno ni se mira');
    const st = JSON.parse(saved);
    assert.deepStrictEqual(Object.keys(st.seen).sort(), ['wA', 'wB']);
    assert.strictEqual(st.seen.wA, '2026-11-24T10:00:03.000001Z');
  });

  await t('segunda vuelta: nada repetido; lo nuevo con más decimales sí sale', async () => {
    notes.length = 0;
    let r = await C.check();
    assert.deepStrictEqual(r.groups, []);
    scenario2(F);
    r = await C.check();
    assert.deepStrictEqual(linesBy(r.groups), EXPECT_2);
    assert.strictEqual(notes.length, 1);
    assert.strictEqual(JSON.parse(saved).seen.wB, '2026-11-24T10:09:00Z', 'lo mío también avanza lo visto');
  });

  await t('«y N más» con muchas líneas', () => {
    const g = { lines: ['1', '2', '3', '4', '5', '6'], total: 6 };
    assert.strictEqual(W.groupBody(g, { more: 'i {n} més' }), '3\n4\n5\n6\ni 2 més');
  });

  await t('ID token caducado: se pide otro y sigue', async () => {
    F.expireTokens();
    F.put('wA', 'nuevo', { title: 'Nuevo', kind: 'event', updated: '2026-11-24T11:00:00Z', updatedBy: 'ana', createdBy: 'ana' });
    const before = F.calls.filter(c => c === '/v1/token').length;
    const r = await C.check();
    assert.ok(!r.error, r.error);
    assert.deepStrictEqual(linesBy(r.groups), { wA: ['Ana: Nuevo'] });
    assert.strictEqual(F.calls.filter(c => c === '/v1/token').length, before + 1);
  });

  await t('con la ventana delante: no avisa, pero apunta lo visto', async () => {
    fg = true; notes.length = 0;
    F.put('wA', 'otro', { title: 'Otro', kind: 'event', updated: '2026-11-24T11:01:00Z', updatedBy: 'ana', createdBy: 'ana' });
    const r = await C.check();
    assert.strictEqual(r.groups.length, 1);
    assert.strictEqual(notes.length, 0);
    fg = false;
    assert.deepStrictEqual((await C.check()).groups, []);
  });

  await t('me echan de un workspace: se olvida', async () => {
    F.workspaces.wB.memberIds = ['pepe'];
    await C.check();
    assert.deepStrictEqual(Object.keys(JSON.parse(saved).seen), ['wA']);
  });

  await t('dos vueltas a la vez: una sola consulta', async () => {
    const n = F.calls.length;
    const [a, b] = await Promise.all([C.check(), C.check()]);
    assert.strictEqual(a, b);
    assert.strictEqual(F.calls.length - n, 2); // workspaces + wA
  });

  await t('sesión revocada: se olvidan las credenciales', async () => {
    F.revoke('rt-yo'); F.expireTokens();
    const r = await C.check();
    assert.ok(r.auth, JSON.stringify(r));
    assert.strictEqual(saved, null);
    assert.strictEqual(C.has(), false);
    assert.strictEqual((await C.check()).skipped, 'sin credenciales');
  });

  await t('otra cuenta: empieza de cero; setCreds(null) borra', async () => {
    F.addUser('ana', 'rt-ana');
    C.setCreds({ apiKey: F.apiKey, projectId: F.projectId, uid: 'ana', refreshToken: 'rt-ana' });
    let st = JSON.parse(saved);
    assert.deepStrictEqual(st.seen, {});
    assert.strictEqual(st.since, new Date(now).toISOString(), 'sin since: desde ahora');
    const r = await C.check();
    assert.deepStrictEqual(r.groups, [], 'lo de antes de conectarse no sale');
    C.setCreds(null);
    assert.strictEqual(saved, null);
  });

  report(__filename);
})();
