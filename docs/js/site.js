'use strict';
// La web: enlaces al repo, sistema detectado, el QR del APK, la versión y las novedades desde GitHub Releases,
// las capturas reales, los dos ejemplos interactivos y los dos diseños de la página («Zen» y «Dot»).
// Sin animaciones de scroll: lo que se mueve solo es la portada y el cambio de diseño, que lo pide el visitante.
(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const root = document.documentElement;

  // ───── Diseño: «zen» (el de siempre) o «dot» ─────
  // Orden: ?design= en la URL, lo que eligió el visitante (localStorage) y, si no, zen.
  // El script en línea del <head> ya ha puesto html[data-design] antes del primer pintado; esto lo confirma.
  const DESIGNS = ['zen', 'dot'];
  const KEY = 'zc.site.design';
  const valid = d => DESIGNS.includes(d) ? d : null;
  const fromURL = () => { try { return valid(new URLSearchParams(location.search).get('design')); } catch (e) { return null; } };
  const stored = () => { try { return valid(localStorage.getItem(KEY)); } catch (e) { return null; } };
  let design = valid(root.dataset.design) || fromURL() || stored() || 'zen';
  root.dataset.design = design;

  // Lo que cambia con el diseño fuera del CSS: el color de la barra del navegador y la imagen para compartir
  const THEME = { zen: { light: '#FCFBFE', dark: '#16131D' }, dot: { light: '#FFFFFF', dark: '#000000' } };
  const OG = { zen: 'img/og.png', dot: 'img/og-dot.png' };
  const metaTheme = $$('meta[name="theme-color"]');
  const ogMetas = $$('meta[property="og:image"], meta[name="twitter:image"]');
  const ogAlt = $('meta[property="og:image:alt"]');
  const ogAltZen = ogAlt ? ogAlt.content : '';
  function headFor(d) {
    metaTheme.forEach(m => { m.content = THEME[d][/dark/.test(m.media) ? 'dark' : 'light']; });
    ogMetas.forEach(m => { m.content = m.content.replace(/img\/og(-dot)?\.png$/, OG[d]); });
    if (ogAlt) ogAlt.content = d === 'dot' ? 'La página de un mes de ZenCalendar en el diseño Dot: negro, puntos y un acento rojo.' : ogAltZen;
  }

  // El selector de la barra lo maqueta web-diseño (#designToggle). Puede ser un botón que alterna o un grupo
  // con hijos [data-design-option="zen|dot"]. Si no está, se crea uno sencillo para que la función no falte.
  let toggle = null;
  function syncToggle() {
    if (!toggle) return;
    const opts = toggle.querySelectorAll('[data-design-option]');
    if (opts.length) {
      opts.forEach(o => {
        const on = o.dataset.designOption === design;
        if (o.getAttribute('role') === 'radio') o.setAttribute('aria-checked', on); else o.setAttribute('aria-pressed', on);
        o.classList.toggle('is-on', on);
      });
    } else if (toggle.getAttribute('role') === 'switch') toggle.setAttribute('aria-checked', design === 'dot');
    else toggle.setAttribute('aria-pressed', design === 'dot');
    toggle.dataset.current = design;
  }
  function makeFallbackToggle() {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'designToggle'; b.className = 'design-toggle design-toggle--fallback';
    b.innerHTML = '<span class="design-toggle-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Diseño Dot</span>';
    b.title = 'Cambiar entre el diseño Zen y el diseño Dot';
    const nav = $('.top-links'), dl = $('.top-links .top-dl');
    if (nav) nav.insertBefore(b, dl || null); else document.body.prepend(b);
    return b;
  }
  function bindToggle(el) {
    if (!el || el === toggle) return;
    toggle = el;
    toggle.addEventListener('click', e => {
      const opt = e.target.closest('[data-design-option]');
      const to = opt ? opt.dataset.designOption : (design === 'dot' ? 'zen' : 'dot');
      setDesign(to, { from: opt || toggle });
    });
    // en un grupo de opciones, las flechas cambian de opción (como un radiogroup)
    toggle.addEventListener('keydown', e => {
      const opts = [...toggle.querySelectorAll('[data-design-option]')];
      if (!opts.length) return;
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!k) return;
      e.preventDefault();
      const i = Math.max(0, opts.findIndex(o => o.dataset.designOption === design));
      const next = opts[(i + k + opts.length) % opts.length];
      next.focus(); setDesign(next.dataset.designOption, { from: next });
    });
    syncToggle();
  }
  const found = $('#designToggle');
  if (found) bindToggle(found);
  else {
    // web-diseño puede meterlo desde su JS un poco después: se espera un momento antes de crear el de repuesto
    const mo = new MutationObserver(() => { const t = $('#designToggle'); if (t) { mo.disconnect(); bindToggle(t); } });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { if (!toggle) { mo.disconnect(); bindToggle(makeFallbackToggle()); } }, 400);
  }

  // Mantiene en su sitio lo que estabas leyendo aunque el otro diseño tenga otras alturas
  function anchor() {
    const y = Math.min(innerHeight * 0.35, 160);
    let el = document.elementFromPoint(innerWidth / 2, y);
    el = el && el.closest('section, footer');
    return el ? { el, top: el.getBoundingClientRect().top } : null;
  }
  function restore(a) { if (a && scrollY > 0) { const d = a.el.getBoundingClientRect().top - a.top; if (Math.abs(d) > 1) scrollBy(0, d); } }

  function apply(to, from, source) {
    const a = anchor();
    design = to;
    root.dataset.design = to;
    headFor(to);
    syncToggle();
    document.dispatchEvent(new CustomEvent('zc:design', { detail: { design: to, previous: from, source } }));
    restore(a);
  }

  // ───── La transición: la página nueva se enciende en matriz de puntos desde el selector ─────
  // Con View Transitions la página nueva se ve a través de una rejilla de puntos que crece desde el botón y se cierra
  // en un círculo; hacia Dot va a pasos secos, hacia Zen suave. Si web-diseño deja ZCDot.transition(from, to, apply),
  // se usa esa. Sin View Transitions o con «reducir movimiento», el cambio es instantáneo.
  let css = null;
  function injectCSS() {
    if (css) return;
    try {
      CSS.registerProperty({ name: '--zc-r', syntax: '<length>', inherits: true, initialValue: '0px' });
      CSS.registerProperty({ name: '--zc-d', syntax: '<length>', inherits: true, initialValue: '0px' });
    } catch (e) { /* ya registradas */ }
    css = document.createElement('style');
    css.id = 'zc-switch-css';
    css.textContent = `
html.zc-switching::view-transition-old(root) { animation: none; mix-blend-mode: normal; }
html.zc-switching::view-transition-new(root) {
  mix-blend-mode: normal;
  animation: zc-dots var(--zc-dur) var(--zc-ease) both;
  -webkit-mask-image: radial-gradient(circle at var(--zc-x) var(--zc-y), #000 var(--zc-r), transparent calc(var(--zc-r) + 1px)),
    radial-gradient(circle closest-side, #000 var(--zc-d), transparent calc(var(--zc-d) + 0.75px)),
    radial-gradient(circle at var(--zc-x) var(--zc-y), #000 var(--zc-r), rgb(0 0 0 / 0.55) calc(var(--zc-r) + var(--zc-halo) * 0.5), transparent calc(var(--zc-r) + var(--zc-halo)));
          mask-image: radial-gradient(circle at var(--zc-x) var(--zc-y), #000 var(--zc-r), transparent calc(var(--zc-r) + 1px)),
    radial-gradient(circle closest-side, #000 var(--zc-d), transparent calc(var(--zc-d) + 0.75px)),
    radial-gradient(circle at var(--zc-x) var(--zc-y), #000 var(--zc-r), rgb(0 0 0 / 0.55) calc(var(--zc-r) + var(--zc-halo) * 0.5), transparent calc(var(--zc-r) + var(--zc-halo)));
  -webkit-mask-size: 100% 100%, var(--zc-p) var(--zc-p), 100% 100%; mask-size: 100% 100%, var(--zc-p) var(--zc-p), 100% 100%;
  -webkit-mask-repeat: no-repeat, repeat, no-repeat; mask-repeat: no-repeat, repeat, no-repeat;
  -webkit-mask-position: 0 0, var(--zc-ox) var(--zc-oy), 0 0; mask-position: 0 0, var(--zc-ox) var(--zc-oy), 0 0;
  -webkit-mask-composite: source-over, source-in; mask-composite: add, intersect;
}
@keyframes zc-dots {
  from { --zc-r: 0px; --zc-d: 1px; }
  40% { --zc-d: calc(var(--zc-p) * 0.3); }
  to { --zc-r: var(--zc-end); --zc-d: calc(var(--zc-p) * 0.42); }
}`;
    document.head.appendChild(css);
  }

  let busy = null;
  function transition(to, from, origin, source) {
    const ext = window.ZCDot && typeof window.ZCDot.transition === 'function' ? window.ZCDot.transition : null;
    if (ext) {
      let done = false;
      const go = () => { if (!done) { done = true; apply(to, from, source); } };
      try { return Promise.resolve(ext(from, to, go)).catch(() => {}).then(go); } catch (e) { go(); return Promise.resolve(); }
    }
    if (!document.startViewTransition) { apply(to, from, source); return Promise.resolve(); }
    injectCSS();
    const r = origin && origin.getBoundingClientRect ? origin.getBoundingClientRect() : { left: innerWidth - 80, top: 10, width: 60, height: 40 };
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const end = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))) + 4;
    const p = to === 'dot' ? 14 : 16;
    const halo = Math.round(Math.min(360, Math.max(180, end * 0.38)));
    const s = root.style;
    s.setProperty('--zc-x', x + 'px'); s.setProperty('--zc-y', y + 'px');
    s.setProperty('--zc-ox', ((x - p / 2) % p) + 'px'); s.setProperty('--zc-oy', ((y - p / 2) % p) + 'px');
    s.setProperty('--zc-p', p + 'px'); s.setProperty('--zc-end', end + halo + 'px'); s.setProperty('--zc-halo', halo + 'px');
    // hacia Dot: mecánico, a pasos (como una matriz que se enciende fila a fila); hacia Zen: una tinta que se extiende
    s.setProperty('--zc-dur', to === 'dot' ? '880ms' : '980ms');
    s.setProperty('--zc-ease', to === 'dot' ? 'steps(22, end)' : 'cubic-bezier(0.55, 0, 0.25, 1)');
    root.classList.add('zc-switching');
    root.dataset.switching = `${from}-${to}`;
    let vt;
    try { vt = document.startViewTransition(() => apply(to, from, source)); }
    catch (e) { root.classList.remove('zc-switching'); apply(to, from, source); return Promise.resolve(); }
    vt.ready.catch(() => {});
    vt.updateCallbackDone.catch(() => {});
    const clean = () => { root.classList.remove('zc-switching'); delete root.dataset.switching; ['--zc-x', '--zc-y', '--zc-ox', '--zc-oy', '--zc-p', '--zc-end', '--zc-halo', '--zc-dur', '--zc-ease'].forEach(k => s.removeProperty(k)); };
    return vt.finished.catch(() => {}).then(clean);
  }

  function setDesign(to, { from: origin = null, persist = true, animate = true, source = 'user' } = {}) {
    to = valid(to); if (!to || to === design || busy) return Promise.resolve(design);
    const prev = design;
    if (persist) {
      try { localStorage.setItem(KEY, to); } catch (e) { /* sin almacenamiento: vale para esta visita */ }
      // la URL solo cambia cuando el visitante elige: ?design=dot para compartirla; en zen se quita el parámetro
      try {
        const u = new URL(location.href);
        if (to === 'zen') u.searchParams.delete('design'); else u.searchParams.set('design', to);
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      } catch (e) { /* file:// o similar */ }
    }
    if (!animate || reduce.matches || document.hidden) { apply(to, prev, source); return Promise.resolve(to); }
    busy = transition(to, prev, origin, source).finally(() => { busy = null; });
    return busy.then(() => to);
  }

  headFor(design);
  window.ZCSite = Object.assign(window.ZCSite || {}, { get design() { return design; }, setDesign, designs: DESIGNS.slice() });

  // ───── Repo, descargas y sistema ─────
  // Repo: en github.io se deduce de la URL (usuario.github.io/repo); si no, el de luckicla.
  let REPO = 'luckicla/zencalendar';
  const host = location.hostname, seg = location.pathname.split('/').filter(Boolean)[0];
  if (host.endsWith('.github.io') && seg) REPO = `${host.split('.')[0]}/${seg}`;
  const GH = `https://github.com/${REPO}`;
  const DL = name => `${GH}/releases/latest/download/${name}`;
  const FILES = { apk: DL('ZenCalendar.apk'), exe: DL('ZenCalendar-Instalador.exe'), portable: DL('ZenCalendar-Portable.exe') };
  $$('.repo-link').forEach(a => a.href = GH);
  $$('.repo-rel').forEach(a => a.href = `${GH}/releases`);
  $$('.dl-android, #dl-apk').forEach(a => a.href = FILES.apk);
  $$('.dl-windows, #dl-exe').forEach(a => a.href = FILES.exe);
  const port = $('#dl-portable'); if (port) port.href = FILES.portable;

  // Sistema: destaca la descarga que toca
  const ua = navigator.userAgent || '';
  const os = /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : /iPhone|iPad|iPod|Macintosh|Mac OS|Linux|CrOS/i.test(ua) ? 'web' : 'android';
  const heroA = $('.dl-android'), heroW = $('.dl-windows'), actions = $('#hero-actions');
  if (heroA && heroW && actions) {
    if (os === 'windows') { heroW.classList.add('btn--primary'); heroA.classList.remove('btn--primary'); actions.prepend(heroW); }
    else if (os === 'web') {
      // en Mac, Linux o iPhone no hay app nativa: la web va delante
      heroA.classList.remove('btn--primary');
      const t = document.createElement('a');
      t.className = 'btn btn--primary'; t.href = 'app/';
      t.textContent = 'Probar en el navegador';
      actions.prepend(t);
      const tryLink = $('.try'); if (tryLink) tryLink.hidden = true;
    }
  }
  const mine = $(`.file[data-os="${os}"]`); if (mine) mine.classList.add('is-mine');

  // QR para bajar el APK en el móvil. En Dot, con módulos redondos y más corrección de errores (nivel Q); los tres
  // cuadros de las esquinas se quedan cuadrados. Comprobado con los dos lectores de OpenCV a varios tamaños (design.js).
  function dotQR(text) {
    const q = QR.encode(text, 'Q'), b = 2, n = q.size + b * 2, s = q.size;
    const finder = (x, y) => (x < 7 && y < 7) || (x >= s - 7 && y < 7) || (x < 7 && y >= s - 7);
    let dots = '';
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if (q.get(x, y) && !finder(x, y)) dots += `<circle cx="${x + b + 0.5}" cy="${y + b + 0.5}" r="0.44"/>`;
    // las esquinas, cuadradas (con esquinas redondeadas muchos lectores ya no las encuentran) y el centro en rojo
    const eye = (x, y) => `<rect x="${x + b + 0.5}" y="${y + b + 0.5}" width="6" height="6" fill="none" stroke="#000" stroke-width="1"/><rect x="${x + b + 2}" y="${y + b + 2}" width="3" height="3" fill="#D71921"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><rect width="${n}" height="${n}" fill="#fff"/><g fill="#000">${dots}</g>${eye(0, 0)}${eye(s - 7, 0)}${eye(0, s - 7)}</svg>`;
  }
  const qrBox = $('#qr');
  function drawQR() {
    if (!qrBox) return;
    try { qrBox.innerHTML = design === 'dot' ? dotQR(FILES.apk) : QR.svg(FILES.apk, { ecl: 'M', border: 2, light: '#ffffff', dark: '#2E2640' }); }
    catch (e) { const r = $('.qr-row'); if (r) r.remove(); }
  }
  drawQR();
  if (os === 'android') { const r = $('.qr-row'); if (r) r.remove(); }   // ya estás en el móvil

  // Novedades desde GitHub Releases (con alternativa si no hay red, hay límite o aún no hay versiones)
  function md(t) {
    const out = []; let list = false;
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<i>$2</i>').replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
    for (const raw of String(t || '').replace(/\r/g, '').split('\n')) {
      const l = raw.trimEnd(); let m;
      if ((m = /^\s*[-*]\s+(.*)/.exec(l))) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      if (list) { out.push('</ul>'); list = false; }
      if ((m = /^(#{1,4})\s+(.*)/.exec(l))) out.push(`<h5>${inline(m[2])}</h5>`);
      else if (l.trim()) out.push('<p>' + inline(l) + '</p>');
    }
    if (list) out.push('</ul>');
    return out.join('');
  }
  const fecha = d => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const relBox = $('#releases');
  const fallback = msg => { relBox.innerHTML = `<p class="empty">${msg} Míralas en <a href="${GH}/releases">GitHub</a>.</p>`; };
  if (relBox) fetch(`https://api.github.com/repos/${REPO}/releases?per_page=8`, { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(list => {
      const rel = (Array.isArray(list) ? list : []).filter(r => !r.draft && !r.prerelease);
      if (!rel.length) return fallback('Todavía no hay versiones publicadas.');
      // la versión solo sale si GitHub devuelve una de verdad
      const v = rel[0].tag_name.replace(/^v/, ''), dv = $('#dl-version');
      if (dv) { dv.textContent = `Versión ${v}, del ${new Date(rel[0].published_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}.`; dv.hidden = false; }
      relBox.innerHTML = rel.slice(0, 4).map(r => {
        // las notas sin la parte repetida de «¿Es seguro?», que ya está en la web
        const body = (r.body || '').split(/\n#{1,4}\s*¿Es seguro\?/i)[0];
        return `<article class="rel"><header><h4>${esc(r.name || r.tag_name)}</h4><time datetime="${esc(r.published_at)}">${fecha(r.published_at)}</time></header>
          <div class="rel-body">${md(body) || '<p>Sin notas.</p>'}</div></article>`;
      }).join('');
    })
    .catch(() => fallback('No se han podido cargar las novedades ahora mismo.'));

  // Capturas reales: capturas/capturas.json dice qué hay (así no se piden imágenes que no existen).
  // Cada hueco puede tener la suya de Dot («pc-semana-dot»…); si falta, en Dot se queda la maqueta en Dot.
  let shotMap = {};
  function showShots() {
    $$('.shot[data-shot]').forEach(fig => {
      const frame = fig.querySelector('.shot-frame'); if (!frame) return;
      const key = fig.dataset.shot + (design === 'dot' ? '-dot' : '');
      const file = typeof shotMap[key] === 'string' && shotMap[key] ? shotMap[key] : '';
      let img = frame.querySelector(':scope > img');
      if (!file) { if (img) img.remove(); frame.classList.remove('has-shot'); return; }
      if (!img) { img = new Image(); img.loading = 'lazy'; img.decoding = 'async'; }
      const cap = fig.querySelector('figcaption');
      img.alt = 'Captura de ZenCalendar: ' + (cap ? cap.textContent.replace(/\.$/, '').toLowerCase() : fig.dataset.shot);
      img.onload = () => { if (!img.isConnected) frame.appendChild(img); frame.classList.add('has-shot'); };
      img.onerror = () => { img.remove(); frame.classList.remove('has-shot'); };
      if (!img.src.endsWith('capturas/' + file)) img.src = 'capturas/' + file;
    });
  }
  fetch('capturas/capturas.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).then(map => { shotMap = map || {}; showShots(); }).catch(() => {});

  document.addEventListener('zc:design', () => { drawQR(); showShots(); });

  // IA: aplicar la propuesta
  const chat = $('#chat'), applyBtn = $('#chat-apply'), undo = $('#chat-undo');
  const done = $('#chat-done');
  if (applyBtn && undo) {
    applyBtn.addEventListener('click', () => { chat.classList.add('applied'); applyBtn.hidden = true; undo.hidden = false; done.textContent = 'Añadidos a tu calendario.'; undo.focus(); });
    undo.addEventListener('click', () => { chat.classList.remove('applied'); undo.hidden = true; applyBtn.hidden = false; done.textContent = ''; applyBtn.focus(); });
  }

  // Google Drive: el botón de ejemplo
  const gBtn = $('#g-btn'), sync = $('#sync');
  if (gBtn) {
    let t = null;
    gBtn.addEventListener('click', () => {
      clearTimeout(t);
      const on = gBtn.getAttribute('aria-pressed') !== 'true';
      gBtn.setAttribute('aria-pressed', on);
      const sub = $('#g-sub');
      if (on) {
        gBtn.textContent = 'Desconectar'; sub.className = ''; sub.textContent = 'Conectando…';
        t = setTimeout(() => { sub.className = 'ok'; sub.textContent = 'Conectado. Sincronizado hace un momento.'; sync.classList.add('on'); }, reduce.matches ? 0 : 900);
      } else {
        gBtn.textContent = 'Conectar con Google'; sub.className = ''; sub.textContent = 'Sin conectar'; sync.classList.remove('on');
      }
    });
  }

  // Avisa una vez al cargar, para quien llegue tarde (dot.js, la demo…): mismo evento, con initial: true
  document.dispatchEvent(new CustomEvent('zc:design', { detail: { design, previous: null, source: 'load', initial: true } }));
})();
