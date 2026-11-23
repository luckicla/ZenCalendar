'use strict';
// ZenCalendar para Windows: inicio de sesión con Google (para Drive).
//
// OAuth de «app instalada» con PKCE: se abre el navegador del sistema en la
// página de Google y la respuesta vuelve a un servidor pequeñito en
// http://127.0.0.1:<puerto> (solo dura lo que tarda el inicio de sesión).
// El refresh token se guarda cifrado con safeStorage (la cuenta de Windows) y
// la página solo recibe tokens de acceso de 1 hora (IPC 'zc:google').
const { app, shell, safeStorage, net } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const file = () => path.join(app.getPath('userData'), 'google.bin');

let cached = null; // { access_token, expires_at }
let connecting = null;

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function save(data) {
  const json = JSON.stringify(data);
  const out = safeStorage.isEncryptionAvailable() ? Buffer.concat([Buffer.from('ZC1'), safeStorage.encryptString(json)]) : Buffer.from('ZC0' + json);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), out);
}

function load() {
  try {
    const b = fs.readFileSync(file());
    const tag = b.slice(0, 3).toString();
    if (tag === 'ZC1') return JSON.parse(safeStorage.decryptString(b.slice(3)));
    if (tag === 'ZC0') return JSON.parse(b.slice(3).toString());
  } catch (e) {}
  return null;
}

async function post(url, params) {
  const r = await net.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, json: j };
}

const PAGE = (title, text) => `<!doctype html><html lang="es"><meta charset="utf-8"><title>ZenCalendar</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;font-family:system-ui,Segoe UI,sans-serif;
background:linear-gradient(135deg,#EDE6FF,#FFE3F1,#E3FAF3);color:#3D3355}
div{background:#ffffffcc;padding:36px 44px;border-radius:28px;box-shadow:0 18px 50px #9C6FD633;text-align:center;max-width:420px}
h1{font-size:22px;margin:0 0 8px}p{margin:0;opacity:.8}</style>
<div><h1>${title}</h1><p>${text}</p></div></html>`;

/** Abre el navegador, espera a que el usuario diga que sí y guarda el permiso. */
function connect(cfg, onDone) {
  if (connecting) return connecting;
  connecting = new Promise(resolve => {
    if (!cfg || !cfg.clientId) { resolve({ error: 'Falta el client ID de escritorio (docs/GOOGLE-SETUP.md)' }); return; }
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    let finished = false;
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/' || (!u.searchParams.get('code') && !u.searchParams.get('error'))) { res.writeHead(404); res.end(); return; }
      const fail = (msg) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(PAGE('No se ha podido conectar', msg + ' Puedes cerrar esta pestaña y volver a intentarlo desde ZenCalendar.'));
        end({ error: msg });
      };
      if (u.searchParams.get('state') !== state) return fail('La respuesta de Google no era para esta ventana.');
      if (u.searchParams.get('error')) return fail(u.searchParams.get('error') === 'access_denied' ? 'No diste permiso a ZenCalendar.' : 'Google dijo: ' + u.searchParams.get('error'));
      try {
        const port = server.address().port;
        const r = await post(TOKEN, {
          code: u.searchParams.get('code'), client_id: cfg.clientId, client_secret: cfg.clientSecret || '',
          redirect_uri: 'http://127.0.0.1:' + port, grant_type: 'authorization_code', code_verifier: verifier,
        });
        if (!r.ok || !r.json.access_token) return fail('Google no dio el permiso (' + (r.json.error_description || r.json.error || r.status) + ').');
        const prev = load() || {};
        save({ clientId: cfg.clientId, refresh_token: r.json.refresh_token || prev.refresh_token, scope: r.json.scope });
        cached = { access_token: r.json.access_token, expires_at: Date.now() + (r.json.expires_in || 3600) * 1000 };
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(PAGE('¡Conectado! ✿', 'Ya puedes cerrar esta pestaña y volver a ZenCalendar.'));
        end(Object.assign({ ok: true }, cached));
      } catch (e) {
        fail('Sin conexión con Google.');
      }
    });
    function end(result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      setTimeout(() => { try { server.close(); } catch (e) {} }, 500);
      connecting = null;
      if (onDone) try { onDone(result); } catch (e) {}
      resolve(result);
    }
    // si no contesta en 5 minutos, se deja
    const timer = setTimeout(() => end({ error: 'Se tardó demasiado en iniciar sesión.' }), 5 * 60000);
    server.on('error', e => end({ error: 'No se pudo preparar el inicio de sesión: ' + e.message }));
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const q = new URLSearchParams({
        client_id: cfg.clientId, redirect_uri: 'http://127.0.0.1:' + port, response_type: 'code',
        scope: cfg.scopes || 'https://www.googleapis.com/auth/drive.appdata openid email profile',
        code_challenge: challenge, code_challenge_method: 'S256', state,
        access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
      });
      shell.openExternal(AUTH + '?' + q.toString());
    });
  });
  return connecting;
}

/** Un token de acceso válido (lo renueva con el refresh token sin molestar). */
async function token(cfg) {
  if (cached && cached.expires_at > Date.now() + 60000) return cached;
  const saved = load();
  if (!saved || !saved.refresh_token) return { error: 'reauth' };
  try {
    const r = await post(TOKEN, {
      client_id: (cfg && cfg.clientId) || saved.clientId, client_secret: (cfg && cfg.clientSecret) || '',
      refresh_token: saved.refresh_token, grant_type: 'refresh_token',
    });
    if (!r.ok || !r.json.access_token) {
      // el usuario quitó el permiso, o caducó: hay que volver a conectar
      if (r.json.error === 'invalid_grant') { try { fs.unlinkSync(file()); } catch (e) {} }
      return { error: r.json.error === 'invalid_grant' ? 'reauth' : (r.json.error || 'HTTP ' + r.status) };
    }
    cached = { access_token: r.json.access_token, expires_at: Date.now() + (r.json.expires_in || 3600) * 1000 };
    return cached;
  } catch (e) {
    return { error: 'offline' };
  }
}

async function disconnect() {
  const saved = load();
  cached = null;
  try { fs.unlinkSync(file()); } catch (e) {}
  if (saved && saved.refresh_token) { try { await post(REVOKE, { token: saved.refresh_token }); } catch (e) {} }
  return { ok: true };
}

const connected = () => !!(load() || {}).refresh_token;

module.exports = { connect, token, disconnect, connected };
