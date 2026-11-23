// Genera docs/img/og.png (1200×630) a partir de tests/web/og.html
const path = require('path');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'light' });
  await p.goto('file://' + path.join(__dirname, 'og.html'));
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.resolve(__dirname, '../../docs/img/og.png') });
  await b.close();
})();
