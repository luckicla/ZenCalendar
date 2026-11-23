'use strict';
// ZenCalendar · arranque y navegación: estado (vista y fecha), barra de arriba, barra inferior,
// transiciones entre vistas y periodos, gestos, atajos de teclado y avisos del backend.
// Es el último script: arranca la app.
(function () {
  const ZC = window.ZC, UI = ZC.ui, t = (...a) => ZC.t(...a);
  const $ = UI.$, $$ = UI.$$;
  const VIEWS = ['month', 'week', 'day', 'agenda', 'year'];
  const NAV = ['month', 'week', 'day', 'agenda', 'tasks'];
  const state = { view: 'month', date: new Date(), sel: new Date() };
  let C;

  // ---------- segmentados con pastilla deslizante ----------
  function paintSeg(seg) {
    if (!seg) return;
    let th = seg.querySelector(':scope > .thumb');
    if (!th) { th = document.createElement('i'); th.className = 'thumb'; seg.prepend(th); }
    const on = seg.querySelector(':scope > button.on');
    if (!on || !on.offsetWidth) { th.style.width = '0'; return; }
    th.style.width = on.offsetWidth + 'px';
    th.style.transform = `translateX(${on.offsetLeft}px)`;
  }
  UI.paintSeg = paintSeg;
  const paintAllSegs = (root = document) => root.querySelectorAll('.seg').forEach(paintSeg);

  // ---------- textos fijos del HTML ----------
  function translateStatic(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-label]').forEach(el => { const s = t(el.dataset.i18nLabel); el.setAttribute('aria-label', s); el.title = s + (el.dataset.kbd ? ` (${el.dataset.kbd})` : ''); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  }

  // ---------- render ----------
  function render(trans) {
    const V = UI.views[state.view] || UI.views.month;
    const host = $('#viewHost');
    const old = [...host.children];
    // guarda el desplazamiento de la agenda para no perder el sitio al refrescar
    const oldScroll = !trans && old.length ? (old[old.length - 1].querySelector('.ag-scroll, .tk-scroll, .yr-scroll') || {}).scrollTop : null;
    let el;
    try { el = V.build(state.date); } catch (e) { console.error(e); el = UI.h(`<div class="view"><div class="empty">${UI.ART.calm}<b>${t('Algo ha fallado al dibujar esta vista')}</b><p>${UI.esc(e.message)}</p></div></div>`); }
    el.dataset.view = state.view;
    host.appendChild(el);
    try { V.mount && V.mount(el); } catch (e) { console.error(e); }
    if (oldScroll) { const sc = el.querySelector('.ag-scroll, .tk-scroll, .yr-scroll'); if (sc) sc.scrollTop = oldScroll; }
    const animOk = UI.anim() && trans;
    old.forEach(o => {
      if (o._io) o._io.disconnect();
      if (animOk) { o.classList.add(trans === 'next' ? 'out-next' : trans === 'prev' ? 'out-prev' : 'out-fade'); setTimeout(() => o.remove(), 340); }
      else o.remove();
    });
    if (animOk) el.classList.add(trans === 'next' ? 'in-next' : trans === 'prev' ? 'in-prev' : 'in-fade');
    paintChrome();
  }
  function paintChrome() {
    const V = UI.views[state.view] || UI.views.month;
    const title = $('#periodTitle h1');
    if (title) title.innerHTML = V.title(state.date);
    document.title = (title ? title.textContent : '') + ' - ZenCalendar';
    $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
    $$('#bnav .nav-b').forEach(b => { b.classList.toggle('on', b.dataset.view === state.view); b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'); });
    paintSeg($('#viewSeg'));
    $$('.nav-arrow').forEach(b => { b.disabled = !!V.noNav; });
    const today = C.today();
    $('#btnToday').classList.toggle('is-today', isShowingToday(today));
    document.documentElement.dataset.view = state.view;
    UI.side.render();
    if (UI.dot) UI.dot.chrome(state);
  }
  function isShowingToday(td) {
    const d = state.date, v = state.view;
    if (v === 'month' || v === 'agenda') return d.getMonth() === td.getMonth() && d.getFullYear() === td.getFullYear();
    if (v === 'week') return C.sameDay(C.sow(d), C.sow(td));
    if (v === 'day') return C.sameDay(d, td);
    if (v === 'year') return d.getFullYear() === td.getFullYear();
    return true;
  }

  // ir a otra vista o fecha (dir: 1 siguiente, -1 anterior; si no, se deduce)
  function go(patch = {}, dir) {
    const prevView = state.view, prevDate = state.date;
    if (patch.view && UI.views[patch.view]) state.view = patch.view;
    if (patch.date) state.date = C.sod(patch.date);
    if (patch.sel) state.sel = C.sod(patch.sel);
    else if (patch.date) state.sel = C.sod(patch.date);
    UI.side.resetMini();
    ZC.store.local('lastView', state.view);
    if (state.view !== prevView) {
      const doIt = () => render(null);
      // (si se cambia de vista muy deprisa la transición anterior se salta y sus promesas fallan: sin errores en la consola)
      if (document.startViewTransition && UI.anim()) { try { const vt = document.startViewTransition(doIt); ['ready', 'finished', 'updateCallbackDone'].forEach(k => vt[k] && vt[k].catch(() => {})); return; } catch {} }
      render('fade');
      return;
    }
    if (dir === undefined) dir = state.date > prevDate ? 1 : state.date < prevDate ? -1 : 0;
    render(dir > 0 ? 'next' : dir < 0 ? 'prev' : null);
  }
  function step(dir) {
    const V = UI.views[state.view]; if (!V || V.noNav) return;
    const nd = V.step(state.date, dir);
    const patch = { date: nd };
    if (state.view === 'month') patch.sel = C.sameDay(new Date(nd.getFullYear(), nd.getMonth(), 1), new Date(C.today().getFullYear(), C.today().getMonth(), 1)) ? C.today() : nd;
    go(patch, dir);
    UI.haptic('tick');
  }
  function goToday() { go({ date: C.today(), sel: C.today() }); UI.haptic('tick'); }

  // ---------- barra de arriba y barra inferior ----------
  function buildChrome() {
    const top = $('#top');
    const segHTML = VIEWS.map(v => `<button data-view="${v}" title="${t(UI.views[v].label)} (${UI.views[v].key.toUpperCase()})">${t(UI.views[v].label)}</button>`).join('');
    top.innerHTML = `
      <button class="ibtn" id="btnSide" data-i18n-label="Menú">${UI.icon('menu', 22)}</button>
      <a class="brand" href="#" id="brand" aria-label="ZenCalendar"><img class="brand-logo" src="img/ui/logo.svg" alt="" width="30" height="30"><span class="brand-text">ZenCalendar</span></a>
      <div class="tb-nav">
        <button class="btn sm soft" id="btnToday" data-kbd="T" title="${t('Hoy')} (T)">${UI.icon('today', 18)}<span class="txt">${t('Hoy')}</span></button>
        <button class="ibtn sm nav-arrow" id="btnPrev" data-i18n-label="Anterior" data-kbd="←">${UI.icon('chevL', 20)}</button>
        <button class="ibtn sm nav-arrow" id="btnNext" data-i18n-label="Siguiente" data-kbd="→">${UI.icon('chevR', 20)}</button>
        <button id="periodTitle" aria-haspopup="menu"><h1></h1>${UI.icon('chevD', 18)}</button>
      </div>
      <div class="tb-spacer"></div>
      <div class="seg" id="viewSeg" role="tablist" aria-label="${t('Vista')}">${segHTML}</div>
      <button class="searchpill" id="btnSearch" aria-label="${t('Buscar')}">${UI.icon('search', 18)}<span>${t('Buscar')}</span><kbd>/</kbd></button>
      <button class="ibtn ai-btn" id="btnAI" data-i18n-label="Asistente" data-kbd="Ctrl+K">${UI.icon('sparkles', 22)}</button>
      <button class="ibtn" id="btnSettings" data-i18n-label="Ajustes">${UI.icon('settings', 22)}</button>
      <div class="win" id="winBtns" hidden>
        <button id="wMin" data-i18n-label="Minimizar">${UI.icon('minus', 16)}</button>
        <button id="wMax" data-i18n-label="Maximizar">${UI.icon('square', 16)}</button>
        <button id="wClose" class="close" data-i18n-label="Cerrar">${UI.icon('x', 16)}</button>
      </div>`;
    $('#bnav').innerHTML = NAV.map(v => `<button class="nav-b" data-view="${v}">${UI.icon(UI.views[v].icon, 23)}<span>${t(UI.views[v].label)}</span></button>`).join('');
    translateStatic(top);
    $('#btnSide').onclick = toggleSide;
    $('#brand').onclick = e => { e.preventDefault(); goToday(); };
    $('#btnToday').onclick = goToday;
    $('#btnPrev').onclick = () => step(-1);
    $('#btnNext').onclick = () => step(1);
    $('#periodTitle').onclick = e => titleMenu(e.currentTarget);
    $('#viewSeg').onclick = e => { const b = e.target.closest('button[data-view]'); if (b) go({ view: b.dataset.view }); };
    $('#bnav').onclick = e => { const b = e.target.closest('[data-view]'); if (b) { UI.haptic('tick'); if (b.dataset.view === state.view && state.view !== 'tasks') goToday(); else go({ view: b.dataset.view }); } };
    $('#btnSearch').onclick = () => UI.quick.search();
    $('#btnAI').onclick = () => UI.aipanel.open();
    $('#btnSettings').onclick = () => UI.settings.open();
    const fab = $('#fab');
    fab.setAttribute('aria-label', t('Nuevo evento'));
    fab.innerHTML = UI.icon('plus', 28);
    fab.onclick = () => { const r = fab.getBoundingClientRect(); UI.haptic('tap'); UI.editor.open({ date: state.view === 'month' ? state.sel : state.date, from: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }); };
    // ventana sin marco (Windows)
    const P = ZC.platform || {};
    if (P.hasTitlebar) {
      document.documentElement.classList.add('has-titlebar');
      $('#winBtns').hidden = false;
      $('#wMin').onclick = () => P.win.minimize();
      $('#wMax').onclick = () => P.win.maximize();
      $('#wClose').onclick = () => P.win.close();
      // (buildChrome se repite al cambiar de idioma: estos dos solo se enganchan una vez)
      if (!buildChrome.winWired) {
        buildChrome.winWired = true;
        try { P.win.onState(s => { $('#wMax').innerHTML = UI.icon(s && s.max ? 'restore' : 'square', 16); $('#wMax').setAttribute('aria-label', t(s && s.max ? 'Restaurar' : 'Maximizar')); }); } catch {}
        $('#top').addEventListener('dblclick', e => { if (!e.target.closest('button, input, a, .seg')) P.win.maximize(); });
      }
    }
    document.documentElement.classList.add('plat-' + (P.kind || 'web'));
    if (UI.touchy()) document.documentElement.classList.add('touch');
    if (ZC.store.local('sideOff')) $('#app').classList.add('side-off');
  }
  function titleMenu(anchor) {
    const items = [
      { label: t('Ir a hoy'), icon: 'today', kbd: 'T', act: goToday },
      { label: t('Ir a una fecha…'), icon: 'goto', kbd: 'G', act: goToDate },
      '-',
      ...VIEWS.map(v => ({ label: t(UI.views[v].label), icon: UI.views[v].icon, on: state.view === v, kbd: UI.touchy() ? '' : UI.views[v].key.toUpperCase(), act: () => go({ view: v }) })),
    ];
    UI.menu(anchor, items);
  }
  function goToDate() {
    const L = UI.openLayer({ kind: 'modal', panelCls: 'dlg', html: `<form class="dlg-in"><h2>${t('Ir a una fecha')}</h2>
      <input class="in" type="date" name="d" value="${C.ymd(state.date)}" autofocus>
      <div class="chips-row">${[[t('Hoy'), 0], [t('Mañana'), 1], [t('En una semana'), 7], [t('En un mes'), 30]].map(([l, n]) => `<button type="button" class="chip" data-n="${n}">${l}</button>`).join('')}</div>
      <div class="dlg-acts"><button type="button" class="btn ghost" data-x>${t('Cancelar')}</button><button class="btn pri">${t('Ir')}</button></div></form>` });
    const f = L.panel.querySelector('form');
    f.onsubmit = e => { e.preventDefault(); const v = f.d.value; if (v) { L.close(); go({ date: C.parse(v), sel: C.parse(v) }); } };
    f.addEventListener('click', e => { const c = e.target.closest('[data-n]'); if (c) { L.close(); const d = C.addDays(C.today(), +c.dataset.n); go({ date: d, sel: d }); } if (e.target.closest('[data-x]')) L.close(); });
  }

  // ---------- panel lateral ----------
  const wideDesk = () => matchMedia('(min-width: 1100px)').matches;
  function toggleSide() {
    const app = $('#app');
    if (wideDesk()) { app.classList.toggle('side-off'); ZC.store.local('sideOff', app.classList.contains('side-off')); setTimeout(() => { const V = UI.views[state.view]; const el = $('#viewHost').lastElementChild; V.resize && el && V.resize(el); }, 480); return; }
    if (app.classList.contains('side-on')) closeSide();
    else { app.classList.add('side-on'); const s = UI.h('<div class="side-scrim"></div>'); s.onclick = closeSide; app.appendChild(s); }
  }
  function closeSide() { const app = $('#app'); app.classList.remove('side-on'); $$('.side-scrim', app).forEach(s => s.remove()); }

  // ---------- gestos: deslizar para cambiar de periodo ----------
  function swipe() {
    const host = $('#viewHost');
    let S = null;
    host.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || UI.views[state.view].noNav) return;
      if (e.target.closest('.ag-card, input, textarea')) { /* se puede deslizar igual */ }
      S = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, on: false, el: host.lastElementChild };
    }, { passive: true });
    host.addEventListener('pointermove', e => {
      if (!S || e.pointerId !== S.id) return;
      if (document.documentElement.classList.contains('dragging-ev')) { S = null; return; }
      const dx = e.clientX - S.x, dy = e.clientY - S.y;
      if (!S.on) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { S = null; return; }
        if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.3) { S.on = true; S.el.style.transition = 'none'; }
        else return;
      }
      S.dx = dx;
      S.el.style.transform = `translateX(${dx * .55}px)`;
      S.el.style.opacity = String(1 - Math.min(.5, Math.abs(dx) / 900));
    }, { passive: true });
    const end = () => {
      if (!S) return;
      const s = S; S = null;
      if (!s.on) return;
      const v = s.dx / Math.max(1, performance.now() - s.t);
      s.el.style.transition = ''; s.el.style.transform = ''; s.el.style.opacity = '';
      if (Math.abs(s.dx) > 70 || Math.abs(v) > .5) step(s.dx < 0 ? 1 : -1);
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
    // rueda con Mayús o desplazamiento horizontal del panel táctil en Mes/Año
    let wheelT = 0;
    host.addEventListener('wheel', e => {
      if (!['month', 'year'].includes(state.view)) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
      if (Math.abs(d) < 25 || performance.now() - wheelT < 450) return;
      wheelT = performance.now(); step(d > 0 ? 1 : -1);
    }, { passive: true });
  }

  // ---------- atajos ----------
  function keys() {
    document.addEventListener('keydown', e => {
      const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
      if (e.key === 'Escape') { if (UI.back()) { e.preventDefault(); return; } if (typing) e.target.blur(); closeSide(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); UI.aipanel.open(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); UI.settings.open(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); UI.quick.search(); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || UI.layers.length) return;
      const k = e.key.toLowerCase();
      const map = { t: goToday, m: () => go({ view: 'month' }), w: () => go({ view: 'week' }), s: () => go({ view: 'week' }), d: () => go({ view: 'day' }), a: () => go({ view: 'agenda' }), l: () => go({ view: 'agenda' }), y: () => go({ view: 'year' }), k: () => go({ view: 'tasks' }), n: () => UI.editor.open({ date: state.view === 'month' ? state.sel : state.date }), c: () => UI.editor.open({ date: state.view === 'month' ? state.sel : state.date }), '/': () => UI.quick.search(), g: goToDate, arrowleft: () => step(-1), arrowright: () => step(1), j: () => step(1), '?': shortcutsHelp, q: () => UI.quick.focus() };
      const fn = map[k] || (e.key === '?' && map['?']);
      if (fn) { e.preventDefault(); fn(); }
    });
  }
  function shortcutsHelp() {
    const rows = [['T', 'Ir a hoy'], ['M', 'Mes'], ['W', 'Semana'], ['D', 'Día'], ['A', 'Agenda'], ['Y', 'Año'], ['K', 'Tareas'], ['N', 'Nuevo evento'], ['Q', 'Añadir rápido'], ['/', 'Buscar'], ['G', 'Ir a una fecha'], ['← →', 'Anterior / siguiente'], ['Ctrl + K', 'Asistente'], ['Ctrl + ,', 'Ajustes'], ['Esc', 'Cerrar']];
    UI.openLayer({ kind: 'modal', panelCls: 'dlg', html: `<div class="dlg-in"><h2>${t('Atajos de teclado')}</h2><div class="kbd-list">${rows.map(([k, v]) => `<div><span>${t(v)}</span><kbd>${k}</kbd></div>`).join('')}</div></div>` });
  }

  // ---------- archivos arrastrados a la ventana ----------
  function dropFiles() {
    let n = 0, box = null;
    const show = on => { if (on && !box) { box = UI.h(`<div id="drop"><div>${UI.icon('upload', 46)}<span>${t('Suelta aquí tu archivo .ics o copia .json')}</span></div></div>`); document.body.appendChild(box); } if (!on && box) { box.remove(); box = null; } };
    addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { n++; show(true); e.preventDefault(); } });
    addEventListener('dragover', e => { if (box) e.preventDefault(); });
    addEventListener('dragleave', () => { if (--n <= 0) { n = 0; show(false); } });
    addEventListener('drop', e => { if (!box) return; e.preventDefault(); n = 0; show(false); [...e.dataTransfer.files].forEach(f => UI.data.importFile(f)); });
  }

  // ---------- refrescos ----------
  let rT = 0;
  function scheduleRender() { clearTimeout(rT); rT = setTimeout(() => render(null), 40); }
  function onStoreChange(ev) {
    if (!ev) return scheduleRender();
    C.clearCache();
    if (ev.type === 'prefs') {
      const p = ZC.store.getPrefs() || {};
      if (ev.source !== 'local' && !UI.look.previewing()) UI.look.load(p.look);
      const lang = (p.cal || {}).lang || 'auto';
      if (ZC.i18n.setLang(lang) !== curLang) { curLang = ZC.i18n.lang(); rebuild(); return; }
      scheduleRender();
      return;
    }
    if (ev.type === 'blobs' && ev.source !== 'local') { UI.look.load((ZC.store.getPrefs() || {}).look); }
    scheduleRender();
  }
  let curLang = 'es';
  function rebuild() {
    $('#side').dataset.built = ''; buildChrome(); UI.quick.mount(); render(null);
    if (UI.settings.isOpen && UI.settings.isOpen()) UI.settings.refresh();
  }

  // ---------- arranque ----------
  async function boot() {
    C = UI.cal;
    try {
      if (!ZC.core || !ZC.store) throw new Error('Falta el núcleo (js/core)');
      await ZC.core.init();
    } catch (e) {
      console.error(e);
      const sp = $('#splash'); if (sp) sp.innerHTML = `<div class="boot-err"><img src="img/ui/logo.svg" alt="" width="64" height="64"><b>No se ha podido abrir ZenCalendar</b><p>${UI.esc(e.message || e)}</p><button class="btn pri" onclick="location.reload()">Reintentar</button></div>`;
      return;
    }
    try { if (ZC.platform.setEdgeToEdge && ZC.platform.kind === 'android') ZC.platform.setEdgeToEdge(true); } catch (e) { console.warn(e); }
    const prefs = ZC.store.getPrefs() || {};
    curLang = ZC.i18n.setLang((prefs.cal || {}).lang || 'auto');
    await UI.look.load(prefs.look);
    buildChrome();
    const cal = C.prefsCal();
    const qs = new URLSearchParams(location.search);
    state.view = UI.views[qs.get('view')] ? qs.get('view') : (cal.defaultView && UI.views[cal.defaultView] ? cal.defaultView : 'month');
    state.date = qs.get('date') ? C.parse(qs.get('date')) : C.today();
    state.sel = state.date;
    UI.quick.mount();
    if (UI.anim()) { document.documentElement.classList.add('boot'); setTimeout(() => document.documentElement.classList.remove('boot'), 1300); }
    render(null);
    if (!(UI.gestures && UI.gestures.swipe)) swipe();   // gestures.js trae su propio deslizar (y la rueda)
    keys(); dropFiles();
    ZC.store.on('change', onStoreChange);
    try { ZC.drive && ZC.drive.on('state', () => { UI.side.sync(); UI.settings.onDrive && UI.settings.onDrive(); }); } catch {}
    try {
      const onOpen = o => {
        if (!o) return;
        if (o.action === 'new') UI.editor.open({ date: o.date ? C.parse(o.date) : C.today() });
        else if (o.action === 'open' && o.id) { const ev = ZC.store.get(o.id); if (ev) UI.editor.detail(C.occOf(ev, o.date)); }
        else if (o.action === 'day' && o.date) go({ view: 'day', date: C.parse(o.date) });
        else if (o.action === 'ai') UI.aipanel.open(o.text || '', o.images || []);
      };
      if (ZC.core.on) ZC.core.on('open', onOpen); else if (ZC.platform.onOpen) ZC.platform.onOpen(onOpen);
    } catch (e) { console.warn(e); }
    try { if (ZC.platform.onBack) ZC.platform.onBack(() => { if (UI.back()) return true; if ($('#app').classList.contains('side-on')) { closeSide(); return true; } return false; }); } catch (e) { console.warn(e); }
    let lastW = innerWidth, lastMob = UI.isMobile();
    addEventListener('resize', ZC.util && ZC.util.debounce ? ZC.util.debounce(() => {
      const mob = UI.isMobile();
      if (mob !== lastMob) { lastMob = mob; render(null); return; }
      const V = UI.views[state.view], el = $('#viewHost').lastElementChild;
      if (V.resize && el && Math.abs(innerWidth - lastW) + 1) V.resize(el);
      lastW = innerWidth; paintAllSegs();
    }, 120) : () => render(null));
    // al volver de otro día (por ejemplo, la app abierta toda la noche)
    let lastDay = C.ymd(new Date());
    setInterval(() => { const d = C.ymd(new Date()); if (d !== lastDay) { lastDay = d; C.clearCache(); render(null); } }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && C.ymd(new Date()) !== lastDay) { lastDay = C.ymd(new Date()); render(null); } });
    // fuera la pantalla de carga
    const sp = $('#splash');
    if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 600); }
    document.documentElement.classList.add('ready');
    setTimeout(paintAllSegs, 300);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => paintAllSegs());
    if (!ZC.store.local('welcomed') && !qs.has('nowelcome')) setTimeout(() => UI.welcome.open(), 450);
  }

  UI.app = { state, go, step, render, goToday, closeSide, toggleSide, paintChrome, translateStatic, goToDate, rebuild };
  UI.back = UI.back || (() => false);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
