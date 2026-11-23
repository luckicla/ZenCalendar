// Genera las imágenes para compartir (1200×630): docs/img/og.png (Zen, desde og.html) y docs/img/og-dot.png (Dot,
// desde og-dot.html). Uso: node tests/web/og.js [zen|dot]   (sin argumento, las dos)
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const which = process.argv[2];
const JOBS = [['zen', 'og.html', 'og.png'], ['dot', 'og-dot.html', 'og-dot.png']].filter(j => !which || j[0] === which);
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--allow-file-access-from-files'] });
  for (const [, src, out] of JOBS) {
    const p = await b.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'light' });
    await p.goto('file://' + path.join(__dirname, src));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.resolve(__dirname, '../../docs/img', out) });
    await p.close();
    console.log('docs/img/' + out);
  }
  await b.close();
})();
