'use strict';
// android/…/WsSync.java (los avisos de workspaces con la app cerrada) ejecutado de verdad en la JVM de este
// ordenador, con un org.json mínimo (tests/core/java/org/json) y contra el mismo Firebase de mentira y el
// mismo guion que Windows (_fake-firestore.js). Sin javac/java, se salta. node tests/core/android-ws.test.js
const { t, report, assert } = require('./_load');
const { execFileSync, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFakeFirestore, scenario, scenario2, EXPECT_1, EXPECT_2, T0 } = require('./_fake-firestore');

const root = path.join(__dirname, '..', '..');
const src = path.join(root, 'android/app/src/main/java/com/luckicla/zencalendar/WsSync.java');
const has = cmd => { try { execFileSync(cmd, ['-version'], { stdio: 'pipe' }); return true; } catch (e) { return false; } };

(async () => {
  if (!has('javac') || !has('java')) {
    console.log('- android-ws.test.js: sin javac/java, se salta');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zc-wsjava-'));
  const cls = path.join(dir, 'cls');
  const state = path.join(dir, 'estado.json');
  const jdir = path.join(__dirname, 'java');
  execFileSync('javac', ['-encoding', 'UTF-8', '-Xlint:all,-deprecation', '-Werror', '-d', cls,
    path.join(jdir, 'org/json/JSONObject.java'), path.join(jdir, 'org/json/JSONArray.java'), path.join(jdir, 'org/json/JSONException.java'),
    path.join(jdir, 'com/luckicla/zencalendar/WsHarness.java'), src], { stdio: 'pipe' });

  const F = createFakeFirestore();
  scenario(F);
  const { srv, base } = await F.listen();
  const now = T0 + 3600e3;
  const java = (...args) => new Promise((resolve, reject) => {
    execFile('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', cls, 'com.luckicla.zencalendar.WsHarness', base, state, ...args.map(String)],
      { encoding: 'utf8', env: Object.assign({}, process.env, { LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' }) }, (e, out, err) => {
        if (e) return reject(new Error(err || e.message));
        const line = out.trim().split('\n').pop();
        try { resolve(JSON.parse(line)); } catch (x) { reject(new Error('salida rara: ' + out + err)); }
      });
  });
  const linesBy = r => Object.fromEntries((r.groups || []).map(g => [g.wid, g.lines]));

  await t('Java: códigos de invitación', async () => {
    assert.strictEqual((await java('code', 'Ab3dE.tok-EN_1')).code, 'Ab3dE.tok-EN_1');
    assert.strictEqual((await java('code', '#Ab3dE.tok')).code, 'Ab3dE.tok');
    assert.strictEqual((await java('code', 'sinpunto')).code, null);
    assert.strictEqual((await java('code', 'a.b<x>')).code, null);
    assert.strictEqual((await java('tskey', '2026-11-24T10:00:01.5Z')).key, '2026-11-24T10:00:01.500000000');
  });

  await t('Java: credenciales', async () => {
    assert.strictEqual((await java('creds', JSON.stringify({ apiKey: 'x' }), now)).ok, false);
    const r = await java('creds', JSON.stringify({ apiKey: F.apiKey, projectId: F.projectId, uid: 'yo', refreshToken: 'rt-yo', since: T0, strings: { more: 'i {n} més' } }), now);
    assert.strictEqual(r.ok, true);
    const st = JSON.parse(fs.readFileSync(state, 'utf8'));
    assert.strictEqual(st.since, '2026-11-24T10:00:00.000Z');
    assert.strictEqual(st.creds.strings.more, 'i {n} més');
  });

  await t('Java: primera vuelta igual que Windows', async () => {
    const r = await java('run', now);
    assert.ok(!r.error, r.error);
    assert.deepStrictEqual(linesBy(r), EXPECT_1);
    assert.strictEqual(r.groups[0].emoji, '🏠');
    assert.strictEqual(r.groups[1].name.length, 60);
    assert.strictEqual(r.groups[1].body, EXPECT_1.wB.join('\n'));
    assert.strictEqual(JSON.parse(fs.readFileSync(state, 'utf8')).seen.wA, '2026-11-24T10:00:03.000001Z');
  });

  await t('Java: segunda vuelta sin repetir; los decimales de más cuentan', async () => {
    assert.deepStrictEqual((await java('run', now)).groups, []);
    scenario2(F);
    const r = await java('run', now);
    assert.deepStrictEqual(linesBy(r), EXPECT_2);
  });

  await t('Java: ID token caducado → otro; el guardado vale mientras no caduque', async () => {
    let n = F.calls.filter(c => c === '/v1/token').length;
    await java('run', now);
    assert.strictEqual(F.calls.filter(c => c === '/v1/token').length, n, 'reutiliza el ID token guardado');
    F.expireTokens();
    F.put('wA', 'nuevo', { title: 'Nuevo', kind: 'event', updated: '2026-11-24T11:00:00Z', updatedBy: 'ana', createdBy: 'ana' });
    const r = await java('run', now);
    assert.deepStrictEqual(linesBy(r), { wA: ['Ana: Nuevo'] });
    assert.strictEqual(F.calls.filter(c => c === '/v1/token').length, n + 1);
  });

  await t('Java: me echan de un workspace → se olvida', async () => {
    F.workspaces.wB.memberIds = ['pepe'];
    await java('run', now);
    assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(state, 'utf8')).seen), ['wA']);
  });

  await t('Java: sesión revocada → AuthException y se borra el estado', async () => {
    F.revoke('rt-yo'); F.expireTokens();
    const r = await java('run', now);
    assert.strictEqual(r.auth, true, JSON.stringify(r));
    assert.ok(!fs.existsSync(state));
  });

  srv.close();
  fs.rmSync(dir, { recursive: true, force: true });
  report(__filename);
})().catch(e => { console.log('✗ android-ws.test.js: ' + e.message); process.exitCode = 1; });
