// Pruebas de los dos diseños de la web (Zen y Dot): el selector, ?design=, localStorage, que se recuerde, que no
// parpadee al cargar, la transición, teclado y foco, «reducir movimiento», y que la demo, el personalizador, el QR y
// la descarga funcionen en los dos. También deja capturas en tests/web/out/design-*.png.
// Uso: node tests/web/design.js            (sirve docs/ en el puerto 8832; si ya hay algo sirviéndolo, lo usa)
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const PORT = 8832, BASE = `http://127.0.0.1:${PORT}`;
const DOCS = path.resolve(__dirname, '../../docs');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const results = [], errors = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'ok  ' : 'MAL '} ${name}${info && !ok ? ' · ' + info : ''}`); };
const up = () => new Promise(res => http.get(BASE + '/', r => { r.resume(); res(r.statusCode === 200); }).on('error', () => res(false)));

const UA = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  mobile: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
};
const RELEASES = JSON.stringify([{ tag_name: 'v1.0.0', name: 'ZenCalendar 1.0.0', published_at: '2026-11-23T10:00:00Z', draft: false, prerelease: false, body: '## Primera versión\n\n- Mes, semana, día, agenda y año.' }]);

let browser;
async function open({ size = 'desktop', scheme = 'light', motion = 'no-preference', storage = null, url = '/', tag = '', delayScripts = 0, dpr = 1 } = {}) {
  const [w, h] = size === 'mobile' ? [390, 844] : [1440, 900];
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: dpr, colorScheme: scheme, reducedMotion: motion, userAgent: UA[size],
    hasTouch: size === 'mobile', isMobile: size === 'mobile',
    storageState: storage ? { cookies: [], origins: [{ origin: BASE, localStorage: Object.entries(storage).map(([name, value]) => ({ name, value })) }] } : undefined,
  });
  const page = await ctx.newPage();
  const t = tag || `${size}-${scheme}`;
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${t}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${t}] pageerror: ${e.message}`));
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)|api\.github\.com|github\.com/.test(r.url())) errors.push(`[${t}] requestfailed: ${r.url()}`); });
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) errors.push(`[${t}] ${r.status()}: ${r.url()}`); });
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: RELEASES }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://github.com/**', r => r.fulfill({ status: 200, contentType: 'text/plain', body: 'descarga de prueba' }));
  if (delayScripts) await page.route(/\/js\/[a-z]+\.js$/, async r => { await new Promise(res => setTimeout(res, delayScripts)); r.continue(); });
  // lo que pasa con el diseño desde el primer momento: cambios de html[data-design], eventos y la clase de la transición
  await page.addInitScript(() => {
    window.__designLog = []; window.__events = []; window.__switching = 0;
    new MutationObserver(recs => recs.forEach(r => {
      const h = document.documentElement; if (!h) return;
      if (r.attributeName === 'data-design') window.__designLog.push({ v: h.dataset.design, t: performance.now() });
      if (r.attributeName === 'class' && h.classList.contains('zc-switching')) window.__switching++;
    })).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-design', 'class'] });
    document.addEventListener('zc:design', e => window.__events.push(e.detail));
  });
  if (url) await page.goto(BASE + url, { waitUntil: 'networkidle' });
  return { ctx, page };
}
const design = page => page.evaluate(() => document.documentElement.dataset.design);
// las capturas de una sección: sin la barra fija, que si no sale en medio
const shoot = async (page, sel, file) => { await page.addStyleTag({ content: '.top { visibility: hidden !important; }' }).then(h => page.locator(sel).screenshot({ path: file }).finally(() => h.evaluate(n => n.remove()))); };
const settle = page => page.waitForFunction(() => !document.documentElement.classList.contains('zc-switching'), null, { timeout: 5000 });
const state = page => page.evaluate(() => ({
  design: document.documentElement.dataset.design,
  search: location.search,
  stored: (() => { try { return localStorage.getItem('zc.site.design'); } catch (e) { return 'x'; } })(),
  pressed: document.getElementById('designToggle') && document.getElementById('designToggle').getAttribute('aria-pressed'),
  theme: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content),
  og: document.querySelector('meta[property="og:image"]').content,
  tw: document.querySelector('meta[name="twitter:image"]').content,
}));

function decodeQR(file) {
  const py = `
import cv2, sys
img = cv2.imread(sys.argv[1]); ok = []
for det in (cv2.QRCodeDetector(), cv2.QRCodeDetectorAruco()):
    for sc in (0.35, 0.5, 0.75, 1.0):
        im = cv2.resize(img, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
        im = cv2.copyMakeBorder(im, 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=(255, 255, 255))
        ok.append(det.detectAndDecode(im)[0])
print('|'.join(ok))`;
  const r = spawnSync('python3', ['-I', '-c', py, file], { encoding: 'utf8' });
  return (r.stdout || '').trim().split('|');
}

(async () => {
  let srv = null;
  if (!(await up())) { srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: DOCS, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); }
  browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  try {
    // ── 1. Por defecto, Zen ──
    {
      const { ctx, page } = await open({ tag: 'defecto' });
      const s = await state(page);
      check('por defecto: zen', s.design === 'zen' && s.pressed === 'false' && !s.stored && s.search === '', JSON.stringify(s));
      check('por defecto: theme-color e imagen de Zen', s.theme.join() === '#FCFBFE,#16131D' && /img\/og\.png$/.test(s.og) && /img\/og\.png$/.test(s.tw), JSON.stringify(s));

      // ── 2. Con el selector (con transición) ──
      await page.waitForTimeout(1800);   // que acabe la entrada de la portada
      await page.click('#designToggle');
      const during = await page.evaluate(() => document.documentElement.classList.contains('zc-switching'));
      await page.waitForTimeout(260);
      await page.screenshot({ path: path.join(OUT, 'design-transicion.png') });
      await settle(page);
      let t = await state(page);
      check('selector: pasa a dot con transición', t.design === 'dot' && during, JSON.stringify(t));
      check('selector: aria-pressed, localStorage y ?design=dot', t.pressed === 'true' && t.stored === 'dot' && t.search === '?design=dot', JSON.stringify(t));
      check('selector: theme-color y og:image de Dot', t.theme.join() === '#FFFFFF,#000000' && /og-dot\.png$/.test(t.og) && /og-dot\.png$/.test(t.tw), JSON.stringify(t));
      const ev = await page.evaluate(() => window.__events.filter(e => !e.initial));
      check('selector: evento zc:design con { design }', ev.length === 1 && ev[0].design === 'dot' && ev[0].previous === 'zen', JSON.stringify(ev));
      check('la transición se limpia al acabar', await page.evaluate(() => !document.documentElement.dataset.switching && !document.documentElement.style.getPropertyValue('--zc-x')));

      // ── 3. Se recuerda al recargar ──
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      t = await state(page);
      check('recargar sin parámetro: sigue en dot (localStorage)', t.design === 'dot' && t.pressed === 'true', JSON.stringify(t));
      const log = await page.evaluate(() => window.__designLog.map(x => x.v));
      check('recargar: no pasa por zen', !log.includes('zen'), log.join());

      // ── 4. Volver a Zen ──
      await page.click('#designToggle'); await settle(page);
      t = await state(page);
      check('volver a zen: quita ?design y guarda zen', t.design === 'zen' && t.search === '' && t.stored === 'zen' && t.pressed === 'false', JSON.stringify(t));
      await ctx.close();
    }

    // ── 5. ?design=dot en un enlace: se ve en Dot, pero no cambia lo que eligió el visitante ──
    {
      const { ctx, page } = await open({ url: '/?design=dot#descargar', tag: 'url' });
      const s = await state(page);
      check('?design=dot: dot sin tocar localStorage ni la URL', s.design === 'dot' && s.stored === null && s.search === '?design=dot', JSON.stringify(s));
      check('?design=dot: conserva el ancla', await page.evaluate(() => location.hash === '#descargar'));
      await page.goto(BASE + '/?design=zen', { waitUntil: 'networkidle' });
      check('?design=zen manda sobre lo guardado', (await design(page)) === 'zen');
      await ctx.close();
    }
    {
      const { ctx, page } = await open({ storage: { 'zc.site.design': 'dot' }, url: '/?design=zen', tag: 'url2' });
      check('?design=zen con dot guardado: zen', (await design(page)) === 'zen');
      await page.goto(BASE + '/?design=xyz', { waitUntil: 'networkidle' });
      check('?design= no válido: se ignora y vale lo guardado', (await design(page)) === 'dot');
      await ctx.close();
    }

    // ── 6. Desde localStorage, sin parpadeo: los scripts de la página tardan 1,5 s y aun así el primer pintado es Dot ──
    for (const scheme of ['dark', 'light']) {
      const { ctx, page } = await open({ storage: { 'zc.site.design': 'dot' }, scheme, url: null, delayScripts: 1500, tag: 'parpadeo-' + scheme });
      await page.goto(BASE + '/', { waitUntil: 'commit' });
      await page.waitForFunction(() => performance.getEntriesByType('paint').length > 0, null, { timeout: 5000 });
      if (scheme === 'dark') await page.screenshot({ path: path.join(OUT, 'design-primer-pintado.png') });
      const first = await page.evaluate(() => ({
        design: document.documentElement.dataset.design,
        bg: getComputedStyle(document.body).backgroundColor,
        site: !!window.ZCSite,
        paint: performance.getEntriesByType('paint')[0].startTime,
        log: window.__designLog,
      }));
      const want = scheme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
      check(`primer pintado en Dot (${scheme}), antes de que cargue site.js`, first.design === 'dot' && !first.site && first.bg === want, JSON.stringify(first));
      check(`sin cambios de diseño después del primer pintado (${scheme})`, first.log.every(x => x.v === 'dot' && x.t <= first.paint), JSON.stringify(first.log));
      await page.waitForLoadState('networkidle');
      const after = await page.evaluate(() => window.__designLog.map(x => x.v));
      check(`al cargar todo, sigue en dot sin pasar por zen (${scheme})`, (await design(page)) === 'dot' && !after.includes('zen'), after.join());
      await ctx.close();
    }

    // ── 7. Teclado y foco ──
    {
      const { ctx, page } = await open({ tag: 'teclado' });
      let found = false;
      for (let i = 0; i < 20 && !found; i++) { await page.keyboard.press('Tab'); found = await page.evaluate(() => document.activeElement && document.activeElement.id === 'designToggle'); }
      check('teclado: se llega al selector con Tab', found);
      const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none'; });
      check('teclado: el selector enseña el foco', ring);
      await page.keyboard.press('Enter'); await settle(page);
      check('teclado: Intro cambia a dot y el foco se queda en el selector', (await design(page)) === 'dot' && await page.evaluate(() => document.activeElement.id === 'designToggle'));
      const ringDot = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none'; });
      check('teclado: en Dot también se ve el foco', ringDot);
      await page.keyboard.press('Space'); await settle(page);
      check('teclado: Espacio vuelve a zen', (await design(page)) === 'zen');
      const name = await page.evaluate(() => { const b = document.getElementById('designToggle'); return b.tagName === 'BUTTON' && (b.textContent.trim() || b.getAttribute('aria-label')); });
      check('el selector es un botón con nombre', !!name, String(name));
      await ctx.close();
    }

    // ── 8. Reducir movimiento: cambio instantáneo, sin transición ──
    {
      const { ctx, page } = await open({ motion: 'reduce', tag: 'reduce' });
      await page.click('#designToggle');
      const now = await page.evaluate(() => ({ d: document.documentElement.dataset.design, sw: window.__switching, vt: document.documentElement.classList.contains('zc-switching') }));
      check('reducir movimiento: cambia al momento y sin transición', now.d === 'dot' && now.sw === 0 && !now.vt, JSON.stringify(now));
      await ctx.close();
    }

    // ── 9. Todo funciona en los dos diseños (escritorio claro y móvil oscuro) ──
    for (const [size, scheme] of [['desktop', 'light'], ['mobile', 'dark']]) {
      for (const d of ['zen', 'dot']) {
        const tag = `${size}-${scheme}-${d}`;
        const { ctx, page } = await open({ size, scheme, url: `/?design=${d}`, tag });
        check(`[${tag}] diseño`, (await design(page)) === d);

        // la demo: espera a que acabe la frase que se escribe sola y apunta algo
        await page.waitForFunction(() => /Cena con Marta/.test(document.getElementById('demo-status').textContent), null, { timeout: 8000 }).catch(() => {});
        await page.fill('#demo-input', 'dentista mañana a las 5');
        await page.press('#demo-input', 'Enter');
        await page.waitForFunction(() => /Apuntado: Dentista/.test(document.getElementById('demo-status').textContent), null, { timeout: 5000 }).catch(() => {});
        const demo = await page.evaluate(() => {
          const sel = document.querySelector('#demo-grid .mo-day[aria-pressed="true"]');
          const t = new Date(); t.setDate(t.getDate() + 1);
          const ymd = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
          return { status: document.getElementById('demo-status').textContent, sel: sel && sel.dataset.date, ymd, label: sel && sel.getAttribute('aria-label') };
        });
        check(`[${tag}] demo: apunta el evento en su día`, /Apuntado: dentista/i.test(demo.status) && demo.sel === demo.ymd && /evento/.test(demo.label), JSON.stringify(demo));

        // las maquetas van con el diseño de la página
        const mocks = await page.evaluate(() => ({
          app: document.getElementById('app').dataset.design,
          shots: [...document.querySelectorAll('.shot-mock > .app')].map(e => e.dataset.design),
          widgets: [...document.querySelectorAll('.widget')].map(e => e.dataset.design),
          ctl: [...document.querySelectorAll('#controls [data-only]')].filter(c => !c.hidden).map(c => c.dataset.only),
        }));
        check(`[${tag}] maquetas en ${d}`, mocks.app === d && mocks.shots.length === 3 && mocks.shots.every(x => x === d) && mocks.widgets.length === 3 && mocks.widgets.every(x => x === d), JSON.stringify(mocks));
        check(`[${tag}] personalizador: solo los controles de ${d}`, mocks.ctl.length > 0 && mocks.ctl.every(x => x === d), JSON.stringify(mocks.ctl));

        // personalizador: modo, vidrio y diseño de la maqueta
        await page.locator('#app').scrollIntoViewIfNeeded();
        await page.check('#controls input[name="mode"][value="dark"]');
        await page.evaluate(() => { const r = document.getElementById('r-glass'); r.value = 40; r.dispatchEvent(new Event('input', { bubbles: true })); });
        const c1 = await page.evaluate(() => ({ mode: document.getElementById('app').dataset.mode, ga: document.getElementById('app').style.getPropertyValue('--ga') }));
        check(`[${tag}] personalizador: modo y vidrio`, c1.mode === 'dark' && c1.ga === '40%', JSON.stringify(c1));
        if (d === 'dot') {
          await page.check('#controls input[name="accent"][value="custom"]');
          const vis = await page.isVisible('#accent-color');
          await page.fill('#accent-color', '#00aaff');
          await page.check('#controls input[name="dbg"][value="glyph"]');
          const c2 = await page.evaluate(() => { const a = document.getElementById('app'); return { acc: a.style.getPropertyValue('--acc'), bg: a.dataset.bg, gl: a.querySelectorAll('.app-bg .gl').length }; });
          check(`[${tag}] personalizador Dot: acento propio y fondo glyph`, vis && c2.acc === '#00aaff' && c2.bg === 'glyph' && c2.gl > 10, JSON.stringify(c2));
          await page.check('#controls input[name="accent"][value="red"]');
          if (size === 'desktop') await shoot(page, '#aspecto', path.join(OUT, `design-personalizador-dot-${scheme}.png`));
          // la maqueta en Zen aunque la página esté en Dot
          await page.check('#controls input[name="design"][value="zen"]');
          const c3 = await page.evaluate(() => ({ app: document.getElementById('app').dataset.design, page: document.documentElement.dataset.design, themes: !document.getElementById('themes').closest('.ctl').hidden }));
          check(`[${tag}] personalizador: la maqueta pasa a Zen sin cambiar la página`, c3.app === 'zen' && c3.page === 'dot' && c3.themes, JSON.stringify(c3));
        } else {
          await page.check('#controls input[name="design"][value="dot"]');
          const c3 = await page.evaluate(() => ({ app: document.getElementById('app').dataset.design, page: document.documentElement.dataset.design, icon: document.querySelector('#icons [aria-checked="true"]').dataset.id, logo: !!document.querySelector('#app-logo circle') }));
          check(`[${tag}] personalizador: la maqueta pasa a Dot (y sugiere su icono) sin cambiar la página`, c3.app === 'dot' && c3.page === 'zen' && c3.icon === 'dot' && c3.logo, JSON.stringify(c3));
          // si cambia la página, el personalizador se va con ella
          await page.click('#designToggle'); await settle(page);
          await page.click('#designToggle'); await settle(page);
          check(`[${tag}] al cambiar la página, la maqueta del personalizador la sigue`, await page.evaluate(() => document.getElementById('app').dataset.design === 'zen'));
        }

        // QR (en el móvil no se enseña: ya estás en él). Se lee a 3× (como lo vería la cámara de un móvil)
        if (size === 'desktop') {
          const file = path.join(OUT, `design-qr-${d}.png`);
          const q = await open({ url: `/?design=${d}#descargar`, tag: tag + '-qr', dpr: 3 });
          await q.page.locator('#qr svg').scrollIntoViewIfNeeded();
          await q.page.locator('#qr svg').screenshot({ path: file });
          await q.ctx.close();
          const reads = decodeQR(file);
          const okReads = reads.filter(x => /ZenCalendar\.apk$/.test(x)).length;
          check(`[${tag}] QR: se lee (${okReads}/8 lecturas: 2 lectores × 4 tamaños)`, okReads >= 6, reads.join(' | '));
        } else check(`[${tag}] QR: escondido en el móvil Android`, !(await page.isVisible('#qr')));

        // la descarga
        const dl = await page.evaluate(() => ({ apk: document.getElementById('dl-apk').href, mine: (document.querySelector('.file.is-mine') || {}).dataset }));
        check(`[${tag}] descarga: enlaces y el de este dispositivo`, /releases\/latest\/download\/ZenCalendar\.apk$/.test(dl.apk) && dl.mine && dl.mine.os === (size === 'mobile' ? 'android' : 'windows'), JSON.stringify(dl));
        await page.locator('#dl-apk').scrollIntoViewIfNeeded();
        const [req] = await Promise.all([page.waitForRequest(r => /ZenCalendar\.apk$/.test(r.url()), { timeout: 4000 }).catch(() => null), page.click('#dl-apk')]);
        check(`[${tag}] descarga: el botón pide el APK`, !!req);
        await page.goto(BASE + `/?design=${d}`, { waitUntil: 'networkidle' });

        // nada se sale por la derecha
        const H = await page.evaluate(() => document.body.scrollHeight);
        for (let y = 0; y < H; y += 600) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(60); }
        const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.app-bg, .shot-mock'); }).slice(0, 6).map(e => e.className || e.tagName));
        check(`[${tag}] nada se sale por la derecha`, !overflow.length, overflow.join(', '));

        // capturas de las maquetas en Dot
        if (d === 'dot') {
          await page.evaluate(() => scrollTo(0, 0));
          for (const [sel, name] of [['#capturas', 'maquetas'], ['#widgets', 'widgets']]) {
            const el = page.locator(sel); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
            await shoot(page, sel, path.join(OUT, `design-${name}-dot-${size}-${scheme}.png`));
          }
        }
        await ctx.close();
      }
    }
  } catch (e) {
    check('las pruebas acaban sin excepción', false, e.stack);
  } finally {
    await browser.close();
    if (srv) srv.kill();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} bien.`);
  console.log(errors.length ? 'Errores en consola:\n' + [...new Set(errors)].join('\n') : 'Sin errores en consola.');
  process.exitCode = bad.length || errors.length ? 1 : 0;
})();
