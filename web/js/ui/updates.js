'use strict';
// ZenCalendar · actualizaciones: aviso discreto cuando hay versión nueva (con progreso mientras descarga),
// Ajustes → Actualizaciones y «Actualizado a la versión X» la primera vez que se abre.
// Usa ZC.platform.updates (la misma API en Android, Windows y la web) y prefs.look.autoUpdate.
(function () {
  const ZC = window.ZC, UI = ZC.ui, t = (...a) => ZC.t(...a);
  const esc = s => UI.esc(s);
  let API = null, off = null, banner = null, started = false;
  const api = () => API || (ZC.platform && ZC.platform.updates) || null;
  const st = () => { try { return (api() && api().state()) || {}; } catch { return {}; } };
  const kind = () => (ZC.platform && ZC.platform.kind) || 'web';
  const auto = () => ((ZC.store.getPrefs() || {}).look || {}).autoUpdate !== false;
  const local = (k, v) => { try { return v === undefined ? ZC.store.local(k) : ZC.store.local(k, v); } catch { return null; } };
  const installLabel = () => ({ android: t('Instalar'), desktop: t('Reiniciar y actualizar'), web: t('Recargar') }[kind()] || t('Actualizar'));
  const releaseURL = v => `https://github.com/${(ZC.config && ZC.config.repo) || 'luckicla/zencalendar'}/releases${v ? '/tag/v' + v : ''}`;

  // notas de la versión: markdown muy sencillo (títulos, listas, negrita, enlaces)
  function md(s) {
    const lines = esc(s || '').split(/\r?\n/);
    let out = '', list = false;
    for (let l of lines) {
      l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      const li = l.match(/^\s*[-*]\s+(.*)/);
      if (li) { if (!list) { out += '<ul>'; list = true; } out += `<li>${li[1]}</li>`; continue; }
      if (list) { out += '</ul>'; list = false; }
      const h = l.match(/^#{1,4}\s+(.*)/);
      if (h) out += `<h4>${h[1]}</h4>`; else if (l.trim()) out += `<p>${l}</p>`;
    }
    if (list) out += '</ul>';
    return out;
  }
  function showNotes() {
    const s = st();
    UI.openLayer({ kind: 'modal', panelCls: 'dlg upd-notes', html: `<div class="dlg-in"><h2>${t('Novedades de la {v}', { v: esc(s.latest || s.current || '') })}</h2>
      <div class="upd-md">${s.notes ? md(s.notes) : `<p class="mut">${t('Las notas de esta versión aún no han llegado.')}</p>`}</div>
      <div class="dlg-acts"><button class="btn ghost" data-ext="${esc(releaseURL(s.latest))}">${t('Abrir en GitHub')}</button>${['available', 'ready'].includes(s.status) ? `<button class="btn pri" data-inst>${s.status === 'ready' ? installLabel() : t('Actualizar')}</button>` : ''}</div></div>` })
      .body.addEventListener('click', e => {
        const x = e.target.closest('[data-ext]'); if (x) { e.preventDefault(); openExt(x.dataset.ext); }
        if (e.target.closest('[data-inst]')) { UI.back(); install(); }
      });
  }
  function openExt(u) { try { if (ZC.platform.openExternal) { ZC.platform.openExternal(u); return; } } catch {} window.open(u, '_blank', 'noopener'); }
  async function install() { try { await api().install(); } catch (e) { UI.toast(t('No se ha podido actualizar: {x}', { x: e.message || e })); } }
  async function check(manual) {
    if (!api()) return;
    try { await api().check(); } catch (e) { if (manual) UI.toast(t('No se ha podido comprobar')); }
    const s = st();
    if (manual && s.status === 'none') UI.toast(t('Tienes la última versión'), { icon: 'check' });
  }

  // ---------- aviso ----------
  function paintBanner() {
    const s = st();
    const show = ['available', 'downloading', 'ready'].includes(s.status) && s.latest && local('updates.dismissed') !== s.latest + '|' + s.status;
    if (!show) { if (banner) { const b = banner; banner = null; b.classList.add('out'); setTimeout(() => b.remove(), 300); } return; }
    if (!banner) {
      banner = UI.h('<div class="upd-banner" role="status" aria-live="polite"></div>');
      document.body.appendChild(banner);
      banner.addEventListener('click', e => {
        if (e.target.closest('[data-u=inst]')) install();
        if (e.target.closest('[data-u=notes]')) showNotes();
        if (e.target.closest('[data-u=x]')) { local('updates.dismissed', st().latest + '|' + st().status); paintBanner(); }
      });
    }
    const pct = Math.round(s.progress || 0);
    const title = s.status === 'downloading' ? t('Descargando ZenCalendar {v}', { v: esc(s.latest) }) : s.status === 'ready' ? t('ZenCalendar {v} está lista', { v: esc(s.latest) }) : t('Hay una versión nueva: {v}', { v: esc(s.latest) });
    banner.dataset.status = s.status;
    banner.innerHTML = `<img src="img/ui/logo.svg" alt="" width="36" height="36"><div class="ub-tx"><b>${title}</b>${s.status === 'downloading' ? `<div class="prog"><i style="width:${pct}%"></i></div><small>${pct} %</small>` : `<small>${s.status === 'ready' ? (kind() === 'web' ? t('Recarga para usarla.') : t('Se instala en un momento.')) : t('Puedes actualizar cuando quieras.')}</small>`}</div>
      <div class="ub-acts">${s.status !== 'downloading' ? `<button class="btn sm ghost" data-u="notes">${t('Ver novedades')}</button><button class="btn sm pri" data-u="inst">${s.status === 'ready' ? installLabel() : t('Actualizar')}</button>` : ''}</div>
      <button class="ibtn sm" data-u="x" aria-label="${t('Cerrar')}">${UI.icon('x', 16)}</button>`;
  }

  // ---------- Ajustes → Actualizaciones ----------
  function section() {
    const s = st(), a = api(), cur = s.current || (ZC.core && ZC.core.version) || '';
    const msg = { checking: t('Buscando…'), none: t('Tienes la última versión'), available: t('Hay una versión nueva: {v}', { v: esc(s.latest) }), downloading: t('Descargando… {n} %', { n: Math.round(s.progress || 0) }), ready: t('Lista para instalar ({v})', { v: esc(s.latest) }), error: esc(s.error || t('No se ha podido comprobar')) }[s.status] || '';
    const last = +local('updates.lastCheck') || 0;
    return `<section class="scard upd-sec">
      <div class="upd-top"><img src="img/ui/logo.svg" alt="" width="56" height="56"><div><b>ZenCalendar ${esc(cur)}</b><small class="mut upd-msg ${s.status === 'error' ? 'bad' : ''}">${msg || (last ? t('Última comprobación: {x}', { x: ZC.i18n.D.rel(last) }) : t('Aún no se ha comprobado'))}</small></div></div>
      <div class="prog upd-prog" ${s.status === 'downloading' ? '' : 'hidden'}><i style="width:${Math.round(s.progress || 0)}%"></i></div>
      <div class="wid-btns">${s.status === 'ready' || (s.status === 'available' && kind() === 'android') ? `<button type="button" class="btn pri" data-upd="install">${UI.icon('download', 18)}${s.status === 'ready' ? installLabel() : t('Instalar')}</button>` : `<button type="button" class="btn soft" data-upd="check" ${s.status === 'checking' || s.status === 'downloading' || !a ? 'disabled' : ''}>${UI.icon('refresh', 18)}${t('Buscar actualizaciones')}</button>`}
        ${s.notes || s.latest ? `<button type="button" class="btn ghost" data-upd="notes">${t('Ver novedades')}</button>` : ''}</div>
      ${!a || (!a.available && kind() !== 'web') ? `<p class="note">${UI.icon('info', 15)}${t('Esta versión no puede actualizarse sola. Descarga la nueva desde GitHub.')}</p>` : ''}
      ${kind() === 'web' ? `<p class="note">${UI.icon('info', 15)}${t('En la web, la versión nueva llega sola: te avisaremos para recargar.')}</p>` : ''}
      </section>
      <section class="scard"><div class="srow"><div class="sl"><b>${t('Actualizar sola')}</b><small>${t('Busca y descarga las versiones nuevas por su cuenta; te avisa antes de instalar.')}</small></div><div class="sc"><button type="button" class="sw" role="switch" data-upd="auto" aria-checked="${auto()}"></button></div></div></section>
      ${s.notes ? `<section class="scard"><div class="s-h"><h3>${t('Novedades de la {v}', { v: esc(s.latest || cur) })}</h3></div><div class="upd-md">${md(s.notes)}</div></section>` : ''}`;
  }
  function refreshSection() {
    const sec = document.querySelector('.set-sec[data-sec=updates]');
    if (!sec) return;
    const s = st();
    // mientras descarga, solo se mueve la barra (sin repintar todo)
    if (s.status === 'downloading' && sec.querySelector('.upd-prog:not([hidden])')) {
      sec.querySelector('.upd-prog i').style.width = Math.round(s.progress || 0) + '%';
      sec.querySelector('.upd-msg').textContent = t('Descargando… {n} %', { n: Math.round(s.progress || 0) });
      return;
    }
    UI.settings.open('updates');
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-upd]'); if (!b) return;
    const a = b.dataset.upd;
    if (a === 'check') { b.disabled = true; await check(true); refreshSection(); }
    if (a === 'install') install();
    if (a === 'notes') showNotes();
    if (a === 'auto') { const v = !auto(); b.setAttribute('aria-checked', String(v)); UI.look.set({ autoUpdate: v }); }
  });
  if (UI.settings && UI.settings.addSection) UI.settings.addSection('updates', 'Actualizaciones', 'refresh', 'Versión, novedades y actualizar sola', section, 'about');

  // ---------- arranque ----------
  function onState() { paintBanner(); refreshSection(); }
  function use(a) {   // (también para las pruebas: otra API con la misma forma)
    if (off) try { off(); } catch {}
    API = a || null; off = null;
    const x = api();
    if (x && x.on) { try { off = x.on(onState); } catch (e) { console.warn(e); } }
    onState();
  }
  function justUpdated(v) {
    if (!v || local('updates.shownFor') === v) return;
    local('updates.shownFor', v);
    setTimeout(() => UI.toast(t('Actualizado a la versión {v}', { v }), { icon: 'sparkles', ms: 7000, action: { label: t('Ver novedades'), fn: () => (st().notes ? showNotes() : openExt(releaseURL(v))) } }), 900);
  }
  function start() {
    if (started) return; started = true;
    use(null);
    try { justUpdated(ZC.platform.justUpdated); ZC.platform.on && ZC.platform.on('updated', justUpdated); } catch {}
    // «Actualizar sola»: comprobar al abrir si hace más de 6 h (Android ya lo hace por su cuenta)
    const a = api();
    if (a && a.available && auto() && kind() !== 'android' && Date.now() - (+local('updates.lastCheck') || 0) > 6 * 3600e3) setTimeout(() => check(false), 12000);
  }
  new MutationObserver((m, o) => { if (document.documentElement.classList.contains('ready')) { o.disconnect(); start(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // ---------- textos ----------
  const D = ZC.i18n.DICT;
  const TR = {
    'Instalar': ['Install', 'Instal·lar'], 'Recargar': ['Reload', 'Recarregar'], 'Actualizar': ['Update', 'Actualitzar'],
    'Novedades de la {v}': ['What\'s new in {v}', 'Novetats de la {v}'], 'Las notas de esta versión aún no han llegado.': ['The notes for this version haven\'t arrived yet.', 'Les notes d\'aquesta versió encara no han arribat.'],
    'Abrir en GitHub': ['Open on GitHub', 'Obrir a GitHub'], 'No se ha podido actualizar: {x}': ['Couldn\'t update: {x}', 'No s\'ha pogut actualitzar: {x}'],
    'Descargando ZenCalendar {v}': ['Downloading ZenCalendar {v}', 'Baixant ZenCalendar {v}'], 'ZenCalendar {v} está lista': ['ZenCalendar {v} is ready', 'ZenCalendar {v} està a punt'],
    'Recarga para usarla.': ['Reload to use it.', 'Recarrega per fer-la servir.'], 'Se instala en un momento.': ['It installs in a moment.', 'S\'instal·la en un moment.'],
    'Puedes actualizar cuando quieras.': ['Update whenever you like.', 'Pots actualitzar quan vulguis.'], 'Ver novedades': ['See what\'s new', 'Veure novetats'],
    'Última comprobación: {x}': ['Last checked: {x}', 'Última comprovació: {x}'], 'Aún no se ha comprobado': ['Not checked yet', 'Encara no s\'ha comprovat'],
    'Esta versión no puede actualizarse sola. Descarga la nueva desde GitHub.': ['This version can\'t update itself. Download the new one from GitHub.', 'Aquesta versió no es pot actualitzar sola. Baixa la nova des de GitHub.'],
    'En la web, la versión nueva llega sola: te avisaremos para recargar.': ['On the web, new versions arrive on their own: you\'ll be asked to reload.', 'A la web, la versió nova arriba sola: t\'avisarem per recarregar.'],
    'Actualizar sola': ['Update automatically', 'Actualitzar sola'], 'Busca y descarga las versiones nuevas por su cuenta; te avisa antes de instalar.': ['Checks for and downloads new versions on its own; asks before installing.', 'Cerca i baixa les versions noves pel seu compte; t\'avisa abans d\'instal·lar.'],
    'Versión, novedades y actualizar sola': ['Version, what\'s new and auto-update', 'Versió, novetats i actualitzar sola'], 'Actualizado a la versión {v}': ['Updated to version {v}', 'Actualitzat a la versió {v}'],
  };
  for (const [k, [en, ca]] of Object.entries(TR)) { D.en[k] = D.en[k] || en; D.ca[k] = D.ca[k] || ca; }

  UI.updates = { use, check, install, showNotes, paintBanner, justUpdated, md };
})();
