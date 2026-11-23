'use strict';
// Todas las pruebas de web/js/core: node tests/core/run.js
// (y antes, node --check de todos los .js del backend)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');

const js = [];
for (const dir of ['web/js/core', 'desktop', 'tests/core']) {
  const d = path.join(root, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) if (f.endsWith('.js')) js.push(path.join(d, f));
}
for (const f of ['web/sw.js']) if (fs.existsSync(path.join(root, f))) js.push(path.join(root, f));
let bad = 0;
for (const f of js) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { bad++; console.log('✗ node --check ' + path.relative(root, f) + '\n' + e.stderr); }
}
console.log((bad ? '✗' : '✓') + ' node --check: ' + js.length + ' archivos' + (bad ? ', ' + bad + ' mal' : ''));

let fail = bad;
for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort()) {
  try { process.stdout.write(execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' })); }
  catch (e) { fail++; process.stdout.write((e.stdout || '') + (e.stderr || '')); }
}
process.exitCode = fail ? 1 : 0;
