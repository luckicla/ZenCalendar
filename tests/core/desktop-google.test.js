'use strict';
// desktop/google.js (Windows) sin Electron: el inicio de sesión de Google Calendar con varias cuentas,
// con un «electron» de mentira y un Google de mentira. node tests/core/desktop-google.test.js
const { t, report, assert } = require('./_load');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zc-desk-'));
const posts = [];
let nextEmail = 'ana@example.com';
let refreshOk = true;
const jwt = email => 'x.' + Buffer.from(JSON.stringify({ email })).toString('base64url') + '.y';
const electron = {
  app: { getPath: () => dir },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('enc:' + s), decryptString: b => b.toString().slice(4) },
  shell: {
    // «el navegador»: Google dice que sí y vuelve al servidor de la app con un código
    openExternal(url) {
      const u = new URL(url);
      electron._last = u;
      const back = u.searchParams.get('redirect_uri') + '/?code=c123&state=' + u.searchParams.get('state');
      setTimeout(() => http.get(back, r => r.resume()), 5);
    },
  },
  net: {
    async fetch(url, o) {
      const body = Object.fromEntries(new URLSearchParams(o.body || ''));
      posts.push({ url, body });
      let j;
      if (body.grant_type === 'authorization_code') j = { access_token: 'at-' + nextEmail, refresh_token: 'rt-' + nextEmail, expires_in: 3600, id_token: jwt(nextEmail), scope: 'calendar' };
      else if (body.grant_type === 'refresh_token') j = refreshOk ? { access_token: 'at2-' + body.refresh_token, expires_in: 3600 } : { error: 'invalid_grant' };
      else j = {};
      return { ok: !j.error, status: j.error ? 400 : 200, json: async () => j };
    },
  },
};
const load0 = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? electron : load0.call(this, req, ...a); };
const google = require('../../desktop/google.js');
const cfg = { clientId: 'cid', clientSecret: 'sec' };

(async () => {
  await t('añadir dos cuentas: selector de cuentas, un refresh token cifrado por cuenta', async () => {
    const a = await google.calAdd(cfg);
    assert.strictEqual(a.email, 'ana@example.com');
    assert.strictEqual(electron._last.searchParams.get('prompt'), 'select_account consent');
    assert.ok(/auth\/calendar/.test(electron._last.searchParams.get('scope')));
    assert.ok(electron._last.searchParams.get('code_challenge'));
    nextEmail = 'pepe@example.com';
    const b = await google.calAdd(Object.assign({ loginHint: 'pepe@example.com' }, cfg));
    assert.strictEqual(b.email, 'pepe@example.com');
    assert.strictEqual(electron._last.searchParams.get('login_hint'), 'pepe@example.com');
    assert.deepStrictEqual(google.calAccounts().sort(), ['ana@example.com', 'pepe@example.com']);
    const raw = fs.readFileSync(path.join(dir, 'google-calendar.bin')).toString();
    assert.ok(raw.startsWith('ZC1enc:'), 'cifrado');
    assert.ok(!fs.existsSync(path.join(dir, 'google.bin')), 'no toca el de Drive');
  });
  await t('token por cuenta (en caché y renovado con su refresh token)', async () => {
    const t1 = await google.token(Object.assign({ account: 'ana@example.com' }, cfg));
    assert.strictEqual(t1.access_token, 'at-ana@example.com');
    // otro proceso (sin caché): renueva con el refresh token de esa cuenta
    delete require.cache[require.resolve('../../desktop/google.js')];
    const g2 = require('../../desktop/google.js');
    const t2 = await g2.token(Object.assign({ account: 'pepe@example.com' }, cfg));
    assert.strictEqual(t2.access_token, 'at2-rt-pepe@example.com');
    assert.deepStrictEqual((await g2.token(Object.assign({ account: 'nadie@example.com' }, cfg))), { error: 'reauth' });
    refreshOk = false;
    delete require.cache[require.resolve('../../desktop/google.js')];
    const g3 = require('../../desktop/google.js');
    assert.deepStrictEqual(await g3.token(Object.assign({ account: 'ana@example.com' }, cfg)), { error: 'reauth' });
    assert.deepStrictEqual(g3.calAccounts(), ['pepe@example.com'], 'el permiso quitado se olvida');
  });
  await t('quitar cuenta: revoca solo si se pide', async () => {
    posts.length = 0;
    await google.calRemove({ account: 'pepe@example.com', revoke: false });
    assert.ok(!posts.some(p => /revoke/.test(p.url)));
    assert.deepStrictEqual(google.calAccounts(), []);
  });
  report(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(process.exitCode || 0);
})();
