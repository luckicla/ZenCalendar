// Capturas del diseño Dot de la web (docs/) en móvil y escritorio, claro y oscuro; y de Zen, para ver que sigue igual.
// Uso: node tests/web/shots-dot.js [puerto]   → tests/web/out/dot-*.png y zen-*.png  (sirve docs/ él solo con python3)
// ONLY=dot-desktop-dark (o cualquier trozo del nombre) para sacar solo unas; ZEN=0 para no sacar las de Zen.
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const PORT = +(process.argv[2] || 8831);
const DOCS = path.resolve(__dirname, '../../docs');
const OUT = path.join(__dirname, 'out');
const RELEASES = [
  { tag_name: 'v1.0.1', name: 'ZenCalendar 1.0.1', published_at: '2026-11-30T10:00:00Z', draft: false, prerelease: false, body: '## Novedades\n\n- Los widgets cogen el color del tema.\n- Arreglado el aviso de los eventos de todo el día.' },
  { tag_name: 'v1.0.0', name: 'ZenCalendar 1.0.0', published_at: '2026-11-25T10:00:00Z', draft: false, prerelease: false, body: '## Primera versión\n\n- Mes, semana, día, agenda y año.\n- Sincronización con **Google Drive**.\n- Asistente de IA.\n\n### ¿Es seguro?\nNo sale.' } ];

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: DOCS, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const errors = [];
  const sizes = [['desktop', 1440, 900], ['mobile', 390, 844]];
  const designs = process.env.ZEN === '0' ? ['dot'] : ['dot', 'zen'];
  const only = process.env.ONLY;
  for (const design of designs) for (const scheme of ['light', 'dark']) for (const [name, w, h] of sizes) {
    const tag = `${design}-${name}-${scheme}`;
    if (only && !tag.includes(only)) continue;
    const mobile = name === 'mobile';
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: scheme,
      userAgent: mobile ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${tag}] ${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
    page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)|api\.github\.com/.test(r.url())) errors.push(`[${tag}] requestfailed: ${r.url()}`); });
    // sin red aquí: se simula la API de GitHub y las fuentes de Google van vacías (se ven las alternativas del sistema)
    await page.route('https://api.github.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RELEASES) }));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto(`http://127.0.0.1:${PORT}/${design === 'dot' ? '?design=dot' : ''}`, { waitUntil: 'networkidle' });
    const got = await page.evaluate(() => document.documentElement.dataset.design);
    if (got !== design) errors.push(`[${tag}] html[data-design] es «${got}»`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${tag}-load.png`) });     // a mitad de la carga
    // la frase automática entra en el calendario y la pantalla contesta
    await page.waitForTimeout(5800);
    await page.screenshot({ path: path.join(OUT, `${tag}-fold.png`) });
    const H = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < H; y += Math.round(h * 0.6)) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(120); }
    await page.waitForTimeout(600);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${tag}-full.png`), fullPage: true });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.app-bg, .visually-hidden'); }).slice(0, 8).map(e => e.className || e.tagName));
    if (overflow.length) errors.push(`[${tag}] se sale por la derecha: ${overflow.join(', ')}`);
    await ctx.close();
  }
  await browser.close(); srv.kill();
  console.log(errors.length ? errors.join('\n') : 'Sin errores en consola.');
})();
