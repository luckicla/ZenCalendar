'use strict';
// Escribe en web/js/core/config.js los client IDs de Google y la versión.
// Lo usan los workflows de GitHub con las variables del repositorio:
//   GOOGLE_WEB_CLIENT_ID, GOOGLE_DESKTOP_CLIENT_ID, GOOGLE_DESKTOP_CLIENT_SECRET (y ZC_VERSION)
//   node tools/setconfig.js [ruta/a/config.js]
// Lo que no esté definido se queda como estaba (vacío = la app funciona sin Drive).
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'web', 'js', 'core', 'config.js');
let s = fs.readFileSync(file, 'utf8');
const quote = v => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '') + "'";
function set(key, value) {
  if (value == null || String(value).trim() === '') return false;
  const re = new RegExp('(\\b' + key + ':\\s*)\'[^\'\\n]*\'');
  if (!re.test(s)) throw new Error('No encuentro «' + key + '» en ' + file);
  s = s.replace(re, (m, a) => a + quote(String(value).trim()));
  return true;
}
const done = [];
if (set('googleWebClientId', process.env.GOOGLE_WEB_CLIENT_ID)) done.push('web');
if (set('googleDesktopClientId', process.env.GOOGLE_DESKTOP_CLIENT_ID)) done.push('escritorio');
if (set('googleDesktopClientSecret', process.env.GOOGLE_DESKTOP_CLIENT_SECRET)) done.push('secreto de escritorio');
if (set('version', process.env.ZC_VERSION)) done.push('versión ' + process.env.ZC_VERSION);
fs.writeFileSync(file, s);
console.log('config.js: ' + (done.length ? done.join(', ') : 'sin cambios (sin Google Drive)'));
