// Capturas de la web de presentación (docs/) en móvil y escritorio, claro y oscuro.
// Uso: node tests/web/shots.js [puerto]   → tests/web/out/*.png  (sirve docs/ él solo con python3)
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const PORT = +(process.argv[2] || 8791);
const DOCS = path.resolve(__dirname, '../../docs');
const OUT = path.join(__dirname, 'out');

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: DOCS, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errors = [];
  const sizes = [['desktop', 1440, 900], ['mobile', 390, 844]];
  const only = process.env.ONLY;
  for (const scheme of ['light', 'dark']) {
    for (const [name, w, h] of sizes) {
      const tag = `${name}-${scheme}`;
      if (only && !tag.includes(only)) continue;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: scheme,
        userAgent: name === 'mobile' ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        hasTouch: name === 'mobile', isMobile: name === 'mobile' });
      const page = await ctx.newPage();
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${tag}] ${m.type()}: ${m.text()}`); });
      page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
      page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)|api\.github\.com/.test(r.url())) errors.push(`[${tag}] requestfailed: ${r.url()}`); });
      // sin red aquí: la API de GitHub y las fuentes fallan; se simula una respuesta de releases para ver las novedades
      await page.route('https://api.github.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { tag_name: 'v1.0.1', name: 'ZenCalendar 1.0.1', published_at: '2026-11-30T10:00:00Z', draft: false, prerelease: false, body: '## Novedades\n\n- Los widgets cogen el color del tema.\n- Arreglado el aviso de los eventos de todo el día.' },
        { tag_name: 'v1.0.0', name: 'ZenCalendar 1.0.0', published_at: '2026-11-25T10:00:00Z', draft: false, prerelease: false, body: '## Primera versión\n\n- Mes, semana, día, agenda y año.\n- Sincronización con **Google Drive**.\n- Asistente de IA.\n\n### ¿Es seguro?\nNo sale.' } ]) }));
      await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `${tag}-fold.png`) });
      // la demo: espera a que la frase automática entre en el calendario
      await page.waitForTimeout(4600);
      await page.locator('#demo').screenshot({ path: path.join(OUT, `${tag}-demo.png`) });
      // baja poco a poco para que aparezca todo
      const H = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < H; y += Math.round(h * 0.6)) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(140); }
      await page.waitForTimeout(800);
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${tag}-full.png`), fullPage: true });
      const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.app-bg'); }).slice(0, 8).map(e => e.className || e.tagName));
      if (overflow.length) errors.push(`[${tag}] se sale por la derecha: ${overflow.join(', ')}`);
      await ctx.close();
    }
  }
  await browser.close(); srv.kill();
  console.log(errors.length ? errors.join('\n') : 'Sin errores en consola.');
})();
