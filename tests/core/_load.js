'use strict';
// Carga los scripts de web/js/core en un contexto de node (como si fuera el
// navegador, pero sin DOM). Devuelve el objeto ZC.
// las pruebas cuentan con la hora de España (horario de verano incluido)
process.env.TZ = process.env.ZC_TZ || 'Europe/Madrid';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CORE = path.join(__dirname, '..', '..', 'web', 'js', 'core');

function load(files, extra) {
  const ctx = Object.assign({
    console, setTimeout, clearTimeout, setInterval, clearInterval, Intl, Date, Math, JSON, Promise,
    TextEncoder, TextDecoder, Buffer, URL, Blob: typeof Blob !== 'undefined' ? Blob : undefined,
    crypto: require('crypto').webcrypto,
  }, extra || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    const src = fs.readFileSync(path.join(CORE, f + '.js'), 'utf8');
    vm.runInContext(src, ctx, { filename: f + '.js' });
  }
  return ctx.ZC;
}

// mini «test runner»: t(nombre, fn) y al final report()
let pass = 0, fail = 0;
const fails = [];
async function t(name, fn) {
  try { await fn(); pass++; }
  catch (e) { fail++; fails.push(name); console.log('  ✗ ' + name + '\n     ' + (e && e.message)); }
}
function report(file) {
  console.log((fail ? '✗ ' : '✓ ') + path.basename(file) + ': ' + pass + ' bien, ' + fail + ' mal');
  if (fail) process.exitCode = 1;
}
// (los objetos vienen de otro «realm» de vm: se comparan como JSON)
const nodeAssert = require('assert');
const assert = Object.assign(function (v, m) { nodeAssert.ok(v, m); }, nodeAssert, {
  deepStrictEqual(a, b, m) { nodeAssert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); },
});
module.exports = { load, t, report, assert };
