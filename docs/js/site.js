'use strict';
// La web: enlaces al repo, sistema detectado, el QR del APK, la versión y las novedades desde GitHub Releases,
// las capturas reales y los dos ejemplos interactivos. Sin animaciones de scroll: lo único que se mueve solo es la portada.
(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

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
  const mine = $(`.file[data-os="${os}"]`); if (mine) mine.classList.add('is-mine');

  // QR para bajar el APK en el móvil
  try { $('#qr').innerHTML = QR.svg(FILES.apk, { ecl: 'M', border: 2, light: '#ffffff', dark: '#2E2640' }); }
  catch (e) { const r = $('.qr-row'); if (r) r.remove(); }
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
  fetch(`https://api.github.com/repos/${REPO}/releases?per_page=8`, { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(list => {
      const rel = (Array.isArray(list) ? list : []).filter(r => !r.draft && !r.prerelease);
      if (!rel.length) return fallback('Todavía no hay versiones publicadas.');
      // la versión solo sale si GitHub devuelve una de verdad
      const v = rel[0].tag_name.replace(/^v/, ''), dv = $('#dl-version');
      dv.textContent = `Versión ${v}, del ${new Date(rel[0].published_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}.`;
      dv.hidden = false;
      relBox.innerHTML = rel.slice(0, 4).map((r, i) => {
        // las notas sin la parte repetida de «¿Es seguro?», que ya está en la web
        const body = (r.body || '').split(/\n#{1,4}\s*¿Es seguro\?/i)[0];
        return `<article class="rel"><header><h4>${esc(r.name || r.tag_name)}</h4><time datetime="${esc(r.published_at)}">${fecha(r.published_at)}</time></header>
          <div class="rel-body">${md(body) || '<p>Sin notas.</p>'}</div></article>`;
      }).join('');
    })
    .catch(() => fallback('No se han podido cargar las novedades ahora mismo.'));

  // Capturas reales: capturas/capturas.json dice qué hay (así no se piden imágenes que no existen)
  fetch('capturas/capturas.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : {}).then(map => {
    $$('.shot[data-shot]').forEach(fig => {
      const file = map[fig.dataset.shot]; if (!file || typeof file !== 'string') return;
      const img = new Image();
      img.alt = 'Captura de ZenCalendar: ' + fig.querySelector('figcaption').textContent.replace(/\.$/, '').toLowerCase();
      img.loading = 'lazy'; img.decoding = 'async';
      img.onload = () => { const f = fig.querySelector('.shot-frame'); f.innerHTML = ''; f.appendChild(img); };
      img.src = 'capturas/' + file;
    });
  }).catch(() => {});

  // IA: aplicar la propuesta
  const chat = $('#chat'), apply = $('#chat-apply'), undo = $('#chat-undo');
  const done = $('#chat-done');
  if (apply) {
    apply.addEventListener('click', () => { chat.classList.add('applied'); apply.hidden = true; undo.hidden = false; done.textContent = 'Añadidos a tu calendario.'; undo.focus(); });
    undo.addEventListener('click', () => { chat.classList.remove('applied'); undo.hidden = true; apply.hidden = false; done.textContent = ''; apply.focus(); });
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
})();
