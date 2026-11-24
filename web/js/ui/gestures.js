'use strict';
// ZenCalendar · gestos táctiles y de ratón.
//  - deslizar a los lados para cambiar de periodo (sigue al dedo, con el periodo de al lado asomando y muelle)
//  - pellizcar: alto de las horas en Semana/Día, y Mes ⇄ Año; Ctrl+rueda en el PC hace lo mismo
//  - arrastrar la cabecera: Semana → Mes hacia abajo, Mes → Semana hacia arriba
//  - filas de Agenda y Tareas: derecha = completar, izquierda = posponer o borrar (con deshacer)
//  - tirar hacia abajo en Agenda y Tareas = sincronizar con Drive
//  - doble toque en un día o en un hueco = crear; doble toque en la cabecera = ir a hoy
//  - borde izquierdo = abrir el panel lateral; deslizarlo a la izquierda = cerrarlo
//  - hoja inferior: arrastrar hacia arriba la expande
//  - visor de imágenes: pellizcar, doble toque para ampliar, deslizar para cambiar o cerrar
//  - la foto del selector de calendario (workspaces): deslizarla pasa al siguiente (está en ws.js; aquí, su interruptor)
//  - PC: Mayús+rueda o trackpad horizontal = cambiar de periodo; clic derecho = menú; clic central = editar
// Todo se puede apagar por grupos en Ajustes → Gestos (prefs.cal.gestures).
(function () {
  const ZC = window.ZC, UI = ZC.ui, t = (...a) => ZC.t(...a);
  const C = () => UI.cal;
  const $ = s => document.querySelector(s);
  const root = document.documentElement;

  // ---------- ajustes ----------
  const GROUPS = [
    ['swipe', 'Deslizar para cambiar de periodo', 'Mes, semana o día siguiente siguiendo el dedo. En el PC, Mayús + rueda o el trackpad.'],
    ['pinch', 'Pellizcar para ampliar', 'El alto de las horas en Semana y Día, y pasar de Mes a Año. En el PC, Ctrl + rueda.'],
    ['fold', 'Plegar y desplegar', 'Arrastra la cabecera de Semana hacia abajo para ver el mes, y el mes hacia arriba para volver.'],
    ['rows', 'Deslizar filas', 'En Agenda y Tareas: a la derecha completa, a la izquierda pospone o borra.'],
    ['pull', 'Tirar para sincronizar', 'Tira hacia abajo en Agenda o Tareas para sincronizar con Google Drive.'],
    ['doubletap', 'Doble toque', 'En un día o en un hueco crea un evento; en la cabecera vuelve a hoy.'],
    ['edge', 'Borde para el panel lateral', 'Desliza desde el borde izquierdo para abrir el panel.'],
    ['viewer', 'Visor de imágenes', 'Pellizcar, doble toque para ampliar y deslizar para cerrar.'],
    ['context', 'Menú con clic derecho', 'Editar, duplicar, cambiar el color o borrar. El clic central abre el editor.'],
    ['wsswipe', 'Cambiar de calendario deslizando la foto', 'Desliza la foto o el icono del selector de arriba para pasar al siguiente workspace. En el PC, con la rueda encima.'],
    ['haptics', 'Vibración', 'Un toque suave al soltar, completar o mover.'],
  ];
  const gp = () => { try { return (C().prefsCal().gestures) || {}; } catch { return {}; } };
  const on = k => gp()[k] !== false;
  async function setG(k, v) { const cal = C().prefsCal(); await ZC.store.setPrefs({ cal: { ...cal, gestures: { ...(cal.gestures || {}), [k]: v } } }); }
  const anim = () => UI.anim();
  const isTouch = e => e.pointerType === 'touch' || e.pointerType === 'pen';

  // ---------- vibración: la del sistema si existe ----------
  const oldHaptic = UI.haptic;
  const HMAP = { tap: 'tap', tick: 'select', select: 'select', ok: 'success', success: 'success', warn: 'warning', warning: 'warning' };
  UI.haptic = kind => {
    if (!on('haptics')) return;
    const P = ZC.platform;
    if (P && typeof P.haptic === 'function') { try { P.haptic(HMAP[kind] || 'tap'); return; } catch {} }
    oldHaptic && oldHaptic(kind);
  };

  // ---------- alto de las horas ----------
  const HZ_MIN = .55, HZ_MAX = 2.6;
  let hz = +(ZC.store.local && ZC.store.local('hourZoom')) || 1;
  function baseH() { const d = parseFloat(getComputedStyle(root).getPropertyValue('--d')) || 1; return (UI.isMobile() ? 58 : 52) * d; }
  function applyHZ() { root.style.setProperty('--hh', (baseH() * hz).toFixed(2) + 'px'); }
  function setHourZoom(nz, anchorY) {
    nz = Math.max(HZ_MIN, Math.min(HZ_MAX, nz));
    const sc = $('#viewHost .view:last-child .tg-scroll');
    const oldH = baseH() * hz, newH = baseH() * nz;
    if (sc) { const r = sc.getBoundingClientRect(), ay = (anchorY == null ? r.top + r.height / 2 : anchorY) - r.top; UI.views._timeScroll = Math.max(0, (sc.scrollTop + ay) / oldH * newH - ay); }
    hz = nz; ZC.store.local && ZC.store.local('hourZoom', hz);
    applyHZ();
    UI.app.render(null);
  }
  addEventListener('resize', () => applyHZ());
  UI.look.onChange(() => applyHZ());
  applyHZ();

  // ---------- utilidades ----------
  function occFromEl(el) {
    if (!el) return null;
    if (el._o) return el._o;
    let id = el.dataset.task || null, date = null;
    if (el.dataset.key) { const k = el.dataset.key.split('@'); id = k[0]; date = k[1]; }
    const ev = id && ZC.store.get(id);
    return ev ? C().occOf(ev, date) : null;
  }
  const curView = () => (UI.app && UI.app.state.view) || 'month';
  const viewEl = () => { const h = $('#viewHost'); return h && h.lastElementChild; };
  const spring = 'transform calc(420ms * var(--spd)) cubic-bezier(.2,.9,.25,1.08), opacity calc(300ms * var(--spd)) ease';
  // cancela las pulsaciones largas de las vistas (la vista escucha pointercancel)
  function cancelViewPress() { const v = viewEl(); if (v) try { v.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })); } catch {} }

  // ---------- doble toque táctil (detección propia) ----------
  let lastTap = null, lastPT = 'mouse';
  document.addEventListener('pointerdown', e => { lastPT = e.pointerType; }, true);
  // el doble clic que el navegador genera tras un doble toque ya lo tratamos aquí
  document.addEventListener('dblclick', e => { if (lastPT !== 'mouse' && e.target.closest('#viewHost, #top')) { e.stopPropagation(); } }, true);
  function onTap(e) {
    if (!on('doubletap')) return;
    const now = performance.now(), x = e.clientX, y = e.clientY;
    const prev = lastTap; lastTap = { t: now, x, y, target: e.target };
    if (!prev || now - prev.t > 330 || Math.hypot(x - prev.x, y - prev.y) > 30) return;
    lastTap = null;
    const tg = e.target;
    if (tg.closest('[data-key], button, input, textarea, .tick, a')) return;
    const cell = tg.closest('.mc-day');
    if (cell) { UI.swallowClick(400); UI.haptic('tap'); UI.editor.open({ date: C().parse(cell.dataset.d), from: { x, y } }); return; }
    const col = tg.closest('.tg-col');
    if (col) {
      const r = col.getBoundingClientRect(), H = parseFloat(getComputedStyle(root).getPropertyValue('--hh')) || 52;
      const m = Math.max(0, Math.min(1410, Math.floor((y - r.top) / H * 2) * 30));
      const s = C().parse(col.dataset.d); s.setMinutes(m);
      UI.swallowClick(400); UI.haptic('tap');
      UI.editor.open({ start: s, end: new Date(s.getTime() + (C().prefsCal().defaultDuration || 60) * 60000), from: { x, y } });
      return;
    }
    if (tg.closest('.mv-head, .tg-head .tg-gutter, .ag-month, #top')) {
      UI.swallowClick(400); UI.app.goToday(); return;
    }
  }

  // ---------- periodo: deslizar con el de al lado asomando ----------
  const S = {};
  // (un deslizamiento que aún se está animando: se termina ya, antes de empezar otro; si no, el
  // nuevo cogía la vista que salía y se mezclaban las dos, se perdían pasos y la pantalla saltaba)
  function flushSwipe() { if (S.pending) { clearTimeout(S.pendingT); const f = S.pending; S.pending = null; f(); } }
  function swipeStart(e) {
    if (!on('swipe') || !isTouch(e)) return false;
    flushSwipe();
    const V = UI.views[curView()]; if (!V || V.noNav) return false;
    if (e.clientX < 24 && UI.isMobile()) return false;   // eso es el borde (panel lateral)
    if (e.target.closest('input, textarea, .mv-daylist .ag-card, .ag-card, .task-row, .layer')) return false;
    Object.assign(S, { on: false, x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, el: viewEl(), peek: null, dir: 0, dx: 0 });
    return true;
  }
  function makePeek(dir) {
    const V = UI.views[curView()], st = UI.app.state;
    const d = V.step(st.date, dir);
    let el;
    try { el = V.build(d); } catch (e) { console.error(e); return null; }
    el.classList.add('peek'); el.style.transform = `translateX(${dir * 100}%)`;
    $('#viewHost').appendChild(el);
    try { V.mount && V.mount(el); } catch (e) { console.error(e); }
    $('#viewHost').appendChild(S.el);   // la actual sigue encima
    el._date = d;
    return el;
  }
  function swipeMove(e) {
    const dx = e.clientX - S.x, dy = e.clientY - S.y;
    if (!S.on) {
      if (root.classList.contains('dragging-ev')) return 'cancel';
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return 'cancel';
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      S.on = true; cancelViewPress();
      S.el.style.transition = 'none';
    }
    const dir = dx < 0 ? 1 : -1;
    if (dir !== S.dir) { if (S.peek) S.peek.remove(); S.dir = dir; S.peek = makePeek(dir); }
    S.dx = dx; S.lastX = e.clientX; S.lastT = performance.now();
    const w = S.el.clientWidth || innerWidth;
    S.el.style.transform = `translateX(${dx}px)`;
    if (S.peek) { S.peek.style.transition = 'none'; S.peek.style.transform = `translateX(${dir * w + dx}px)`; }
    return 'move';
  }
  function swipeEnd(cancelled) {
    if (!S.on) return;
    S.on = false;
    const w = S.el.clientWidth || innerWidth, dt = Math.max(1, performance.now() - S.t);
    const v = S.dx / dt;
    const commit = !cancelled && S.peek && (Math.abs(S.dx) > w * .25 || (Math.abs(v) > .45 && Math.sign(v) === -S.dir));
    const el = S.el, peek = S.peek, dir = S.dir;
    const fin = () => {
      if (S.pending === fin) { clearTimeout(S.pendingT); S.pending = null; }
      if (fin.done) return; fin.done = true;
      if (commit) {
        const st = UI.app.state, nd = peek._date;
        st.date = C().sod(nd);
        if (curView() === 'month') { const td = C().today(); st.sel = nd.getMonth() === td.getMonth() && nd.getFullYear() === td.getFullYear() ? td : C().sod(nd); }
        else st.sel = C().sod(nd);
        UI.side.resetMini();
        UI.app.render(null);   // misma vista ya dibujada: sin parpadeo
        UI.haptic('tick');
      } else if (peek) { peek.remove(); el.style.transform = ''; el.style.transition = ''; }
    };
    if (!anim()) { fin(); return; }
    el.style.transition = spring; if (peek) peek.style.transition = spring;
    if (commit) { el.style.transform = `translateX(${-dir * w}px)`; peek.style.transform = 'translateX(0)'; }
    else { el.style.transform = 'translateX(0)'; if (peek) peek.style.transform = `translateX(${dir * w}px)`; }
    S.pending = fin; S.pendingT = setTimeout(fin, 300);
  }

  // ---------- plegar: Semana ⇄ Mes arrastrando ----------
  const F = {};
  function foldStart(e) {
    if (!on('fold') || !isTouch(e) || !UI.isMobile()) return false;
    const v = curView();
    // (solo desde la cabecera de los días: desde «Todo el día» saltaba sin querer al desplazarse)
    if (v === 'week' && e.target.closest('.tg-head')) Object.assign(F, { kind: 'down' });
    else if (v === 'month' && e.target.closest('.mv-grid, .mv-head')) Object.assign(F, { kind: 'up' });
    else return false;
    Object.assign(F, { on: false, x: e.clientX, y: e.clientY, el: viewEl() });
    return true;
  }
  function foldMove(e) {
    const dx = e.clientX - F.x, dy = e.clientY - F.y;
    if (!F.on) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) return 'cancel';
      if (Math.abs(dy) < 14 || (F.kind === 'down' ? dy < 0 : dy > 0)) return Math.abs(dy) > 14 ? 'cancel' : undefined;
      F.on = true; cancelViewPress(); F.el.style.transition = 'none'; F.el.style.transformOrigin = F.kind === 'down' ? 'top center' : 'center 30%';
    }
    F.dy = dy;
    const k = Math.min(1, Math.abs(dy) / 220);
    F.el.style.transform = `translateY(${dy * .35}px) scale(${1 - k * .04})`;
    F.el.style.opacity = String(1 - k * .25);
    return 'move';
  }
  function foldEnd() {
    if (!F.on) return;
    F.on = false;
    const el = F.el, go = Math.abs(F.dy) > 80;
    el.style.transition = anim() ? spring : ''; el.style.transform = ''; el.style.opacity = '';
    if (go) {
      const st = UI.app.state;
      UI.haptic('select');
      if (F.kind === 'down') UI.app.go({ view: 'month', date: st.date, sel: st.date });
      else UI.app.go({ view: 'week', date: st.sel || st.date, sel: st.sel || st.date });
    }
  }

  // ---------- pellizcar en la vista ----------
  const pts = new Map();
  let PZ = null;
  function pinchStart() {
    const [a, b] = [...pts.values()];
    const v = curView();
    PZ = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: v, scale: 1 };
    cancelViewPress(); setTimeout(cancelViewPress, 0); swipeEnd(true); S.on = false; F.on = false;
    root.classList.add('pinching');
    if (v === 'week' || v === 'day') {
      const body = $('#viewHost .view:last-child .tg-body'), sc = $('#viewHost .view:last-child .tg-scroll');
      if (body && sc) { const r = body.getBoundingClientRect(); PZ.body = body; body.style.transformOrigin = `0 ${PZ.my - r.top}px`; body.style.transition = 'none'; }
    } else PZ.el = viewEl();
  }
  function pinchMove() {
    const [a, b] = [...pts.values()];
    const s = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / PZ.d0;
    PZ.scale = s;
    if (PZ.body) { const nz = Math.max(HZ_MIN, Math.min(HZ_MAX, hz * s)); PZ.body.style.transform = `scaleY(${nz / hz})`; }
    else if (PZ.el && (PZ.view === 'month' || PZ.view === 'year')) { PZ.el.style.transition = 'none'; PZ.el.style.transformOrigin = `${PZ.mx}px ${PZ.my - 60}px`; PZ.el.style.transform = `scale(${Math.max(.8, Math.min(1.2, s))})`; PZ.el.style.opacity = String(1 - Math.min(.35, Math.abs(1 - s))); }
  }
  function pinchEnd() {
    if (!PZ) return;
    const p = PZ; PZ = null;
    root.classList.remove('pinching');
    if (p.body) { p.body.style.transform = ''; if (Math.abs(p.scale - 1) > .04) { setHourZoom(hz * p.scale, p.my); UI.haptic('select'); } return; }
    if (p.el) { p.el.style.transition = anim() ? spring : ''; p.el.style.transform = ''; p.el.style.opacity = ''; }
    if (p.view === 'month' && p.scale < .78) { UI.haptic('select'); UI.app.go({ view: 'year' }); }
    else if (p.view === 'year' && p.scale > 1.3) {
      const n = document.elementFromPoint(p.mx, p.my), m = n && n.closest('.yr-m');
      const ms = m ? [...m.parentElement.children].indexOf(m) : UI.app.state.date.getMonth();
      UI.haptic('select'); UI.app.go({ view: 'month', date: new Date(UI.app.state.date.getFullYear(), ms, 1) });
    } else if ((p.view === 'month' && p.scale > 1.35)) { UI.haptic('select'); UI.app.go({ view: 'week', date: UI.app.state.sel || UI.app.state.date }); }
  }

  // ---------- borde izquierdo: panel lateral ----------
  const E = {};
  const sideEl = () => $('#side');
  const sideFloating = () => !matchMedia('(min-width: 1100px)').matches;
  function edgeStart(e) {
    if (!on('edge') || !isTouch(e) || !sideFloating()) return false;
    const open = $('#app').classList.contains('side-on');
    if (!open && e.clientX > 22) return false;
    if (open && !e.target.closest('#side, .side-scrim')) return false;
    Object.assign(E, { on: false, x: e.clientX, y: e.clientY, open, t: performance.now() });
    return true;
  }
  function edgeMove(e) {
    const dx = e.clientX - E.x, dy = e.clientY - E.y;
    if (!E.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return 'cancel';
      if (Math.abs(dx) < 10 || (E.open ? dx > 0 : dx < 0)) return Math.abs(dx) > 10 ? 'cancel' : undefined;
      E.on = true; cancelViewPress();
      sideEl().style.transition = 'none';
    }
    const w = sideEl().offsetWidth || 300;
    const off = E.open ? Math.min(0, dx) : Math.min(0, -w - 16 + dx);
    E.dx = dx;
    sideEl().style.transform = `translateX(${off}px)`;
    return 'move';
  }
  function edgeEnd() {
    if (!E.on) return;
    E.on = false;
    const s = sideEl(), w = s.offsetWidth || 300, v = E.dx / Math.max(1, performance.now() - E.t);
    s.style.transition = ''; s.style.transform = '';
    if (!E.open && (E.dx > w * .35 || v > .4)) { UI.app.toggleSide(); UI.haptic('tap'); }
    else if (E.open && (-E.dx > w * .3 || v < -.4)) UI.app.closeSide();
  }

  // ---------- filas: completar, posponer, borrar ----------
  const R = {};
  let openRow = null;
  function closeOpenRow() { if (openRow) { const r = openRow; openRow = null; r.style.transition = anim() ? spring : ''; r.style.transform = ''; setTimeout(() => { const w = r.parentElement; if (w && w.classList.contains('sw-row')) unwrap(w); }, 320); } }
  function wrap(row) {
    if (row.parentElement && row.parentElement.classList.contains('sw-row')) return row.parentElement;
    const w = document.createElement('div'); w.className = 'sw-row';
    const o = occFromEl(row), task = o && o.isTask;
    w.innerHTML = `<div class="sw-bg sw-left">${task ? `<span>${UI.icon('check', 20)}${o.done ? t('Pendiente') : t('Hecha')}</span>` : ''}</div><div class="sw-bg sw-right"><button class="sw-act post">${UI.icon('clock', 18)}<span>${t('Mañana')}</span></button><button class="sw-act del">${UI.icon('trash', 18)}<span>${t('Borrar')}</span></button></div>`;
    row.parentElement.insertBefore(w, row); w.appendChild(row);
    w.querySelector('.post').onclick = ev => { ev.stopPropagation(); act(row, 'post'); };
    w.querySelector('.del').onclick = ev => { ev.stopPropagation(); act(row, 'del'); };
    return w;
  }
  function unwrap(w) { const row = w.querySelector('.ag-card, .task-row'); if (row && w.parentElement) { w.parentElement.insertBefore(row, w); } w.remove(); }
  async function act(row, what) {
    const o = occFromEl(row); if (!o) return;
    const w = row.parentElement && row.parentElement.classList.contains('sw-row') ? row.parentElement : null;
    openRow = null;
    if (what === 'done') {
      const tk = row.querySelector('.tick');
      row.style.transition = anim() ? spring : ''; row.style.transform = '';
      setTimeout(() => w && unwrap(w), 300);
      await C().toggleTask(o, tk);
      UI.toast(o.done ? t('Marcada como pendiente') : t('Tarea hecha'), { icon: 'check', undo: () => C().toggleTask({ ...o, done: !o.done }) });
    } else if (what === 'post') {
      row.style.transform = ''; if (w) unwrap(w);
      const s = C().addDays(o.start, 1), e = C().addDays(o.allDay ? C().lastDay(o) : o.end, 1);
      await C().moveOccurrence(o, s, o.isTask ? s : e);
    } else if (what === 'del') {
      if (w) { w.style.height = w.offsetHeight + 'px'; requestAnimationFrame(() => { w.classList.add('gone'); }); }
      const ok = await C().deleteOccurrence(o);
      if (!ok && w) { w.classList.remove('gone'); w.style.height = ''; row.style.transform = ''; unwrap(w); }
    }
  }
  function rowStart(e) {
    if (!on('rows') || !isTouch(e)) return false;
    const row = e.target.closest('.ag-card, .v-tasks .task-row, #sideTasks .task-row');
    if (!row || e.target.closest('.sw-act')) return false;
    // (los de solo lectura no se deslizan: no se pueden completar, mover ni borrar)
    if (UI.gacc) { const o = occFromEl(row); if (o && UI.gacc.readOnly(o.ev)) return false; }
    if (openRow && openRow !== row) closeOpenRow();
    Object.assign(R, { on: false, x: e.clientX, y: e.clientY, row, t: performance.now(), base: row === openRow ? parseFloat(row.dataset.swx || 0) : 0 });
    return true;
  }
  function rowMove(e) {
    const dx = e.clientX - R.x, dy = e.clientY - R.y;
    if (!R.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return 'cancel';
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      R.on = true; R.w = wrap(R.row); R.row.style.transition = 'none';
    }
    const o = occFromEl(R.row), W = R.row.offsetWidth;
    let x = R.base + dx;
    if (x > 0 && !(o && o.isTask)) x = x * .2;                // los eventos no se completan: solo un poco de goma
    if (x < -W * .9) x = -W * .9;
    R.x2 = x;
    R.row.style.transform = `translateX(${x}px)`;
    const armDone = x > W * .3, armDel = x < -W * .6;
    if (armDone !== R.armDone || armDel !== R.armDel) { if (armDone || armDel) UI.haptic('select'); }
    R.armDone = armDone; R.armDel = armDel;
    R.w.classList.toggle('arm-done', armDone); R.w.classList.toggle('arm-del', armDel);
    R.w.classList.toggle('to-right', x > 0); R.w.classList.toggle('to-left', x < 0);
    return 'move';
  }
  function rowEnd() {
    if (!R.on) return;
    R.on = false;
    const row = R.row, x = R.x2 || 0, W = row.offsetWidth;
    UI.swallowClick(350);
    row.style.transition = anim() ? spring : '';
    if (R.armDone) { row.style.transform = `translateX(${W}px)`; UI.haptic('success'); setTimeout(() => act(row, 'done'), anim() ? 180 : 0); return; }
    if (R.armDel) { row.style.transform = `translateX(${-W}px)`; UI.haptic('warning'); act(row, 'del'); return; }
    if (x < -60) { const open = -Math.min(140, W * .5); row.style.transform = `translateX(${open}px)`; row.dataset.swx = open; openRow = row; return; }
    row.style.transform = ''; row.dataset.swx = 0;
    setTimeout(() => { if (openRow !== row && R.w) unwrap(R.w); }, 320);
  }
  document.addEventListener('pointerdown', e => { if (openRow && !e.target.closest('.sw-row')) closeOpenRow(); }, true);

  // ---------- tirar para sincronizar (Agenda y Tareas) ----------
  let PL = null;
  function pullTarget(t0) { return t0.closest && t0.closest('.ag-scroll, .tk-scroll'); }
  document.addEventListener('touchstart', e => {
    if (!on('pull') || e.touches.length !== 1) { PL = null; return; }
    const sc = pullTarget(e.target);
    if (!sc || sc.scrollTop > 0 || e.target.closest('.ag-card, .task-row') && R.on) { PL = null; return; }
    PL = { sc, y: e.touches[0].clientY, x: e.touches[0].clientX, dy: 0, on: false, ind: null };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!PL || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - PL.y, dx = e.touches[0].clientX - PL.x;
    if (!PL.on) {
      if (PL.sc.scrollTop > 0 || dy < 0 || Math.abs(dx) > Math.abs(dy)) { if (Math.abs(dy) > 8 || Math.abs(dx) > 8) PL = null; return; }
      if (dy < 10) return;
      PL.on = true;
      PL.ind = UI.h(`<div class="pull-ind" aria-hidden="true">${UI.icon('refresh', 20)}</div>`);
      PL.sc.parentElement.appendChild(PL.ind);
    }
    if (e.cancelable) e.preventDefault();
    PL.dy = dy;
    const d = Math.min(110, dy * .5), k = Math.min(1, d / 70);
    PL.ind.style.transform = `translate(-50%, ${d}px) rotate(${k * 270}deg)`;
    PL.ind.style.opacity = String(k);
    PL.ind.classList.toggle('armed', k >= 1);
    PL.sc.style.transform = `translateY(${d * .5}px)`; PL.sc.style.transition = 'none';
  }, { passive: false });
  document.addEventListener('touchend', async () => {
    if (!PL) return;
    const p = PL; PL = null;
    if (!p.on) return;
    p.sc.style.transition = anim() ? spring : ''; p.sc.style.transform = '';
    if (p.dy * .5 < 70) { p.ind.remove(); return; }
    UI.haptic('select');
    p.ind.classList.add('busy'); p.ind.style.transform = 'translate(-50%, 46px)';
    let msg = t('Al día');
    try {
      const st = ZC.drive && ZC.drive.state ? ZC.drive.state() : {};
      if (st && st.connected) { await ZC.drive.sync(); msg = t('Sincronizado con Google Drive'); }
      else { C().clearCache(); UI.app.render(null); }
    } catch (err) { msg = t('No se ha podido sincronizar'); }
    setTimeout(() => { p.ind.classList.add('out'); setTimeout(() => p.ind.remove(), 300); UI.toast(msg, { icon: 'cloudSync', ms: 1800 }); }, 350);
  });

  // ---------- reparto de los punteros en #app ----------
  let owner = null;   // 'swipe' | 'fold' | 'edge' | 'row'
  let downInfo = null;
  function onDown(e) {
    if (e.target.closest('.layer, .menu')) return;
    // (el selector de calendario tiene su propio deslizar: el gesto se queda con él)
    if (e.target.closest('#wsChip')) return;
    if (isTouch(e)) {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && on('pinch') && e.target.closest('#viewHost')) { owner = 'pinch'; pinchStart(); return; }
      if (pts.size > 1) return;
    }
    downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    owner = null;
    const cands = [];
    if (edgeStart(e)) cands.push('edge');
    if (rowStart(e)) cands.push('row');
    if (!cands.includes('edge') && e.target.closest('#viewHost')) { if (foldStart(e)) cands.push('fold'); if (swipeStart(e)) cands.push('swipe'); }
    downInfo.cands = cands;
  }
  function onMove(e) {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (owner === 'pinch') { if (pts.size >= 2) pinchMove(); return; }
    if (!downInfo || e.pointerId !== downInfo.id) return;
    if (owner) { ({ edge: edgeMove, row: rowMove, fold: foldMove, swipe: swipeMove })[owner](e); return; }
    for (const c of downInfo.cands) {
      const r = ({ edge: edgeMove, row: rowMove, fold: foldMove, swipe: swipeMove })[c](e);
      if (r === 'move') { owner = c; downInfo.cands = [c]; break; }
      if (r === 'cancel') downInfo.cands = downInfo.cands.filter(x => x !== c);
    }
  }
  function onUp(e) {
    if (isTouch(e)) pts.delete(e.pointerId);
    if (owner === 'pinch') { if (pts.size < 2) { pinchEnd(); owner = 'done'; } if (!pts.size) owner = null; return; }
    if (owner === 'done') { if (!pts.size) owner = null; return; }
    if (!downInfo || e.pointerId !== downInfo.id) return;
    const cancelled = e.type === 'pointercancel';
    const was = owner;
    if (was) ({ edge: edgeEnd, row: rowEnd, fold: foldEnd, swipe: () => swipeEnd(cancelled) })[was]();
    else if (!cancelled && isTouch(e) && performance.now() - downInfo.t < 300 && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) < 10) onTap(e);
    owner = null; downInfo = null;
  }
  function wireApp() {
    const app = $('#app'); if (!app || app._gest) return; app._gest = true;
    app.addEventListener('pointerdown', onDown, true);
    addEventListener('pointermove', onMove, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', onUp, true);
    // mientras un gesto nuestro está en marcha, que la página no se desplace
    addEventListener('touchmove', e => { if ((owner && owner !== 'done') && e.cancelable) e.preventDefault(); }, { passive: false });
    // ratón y trackpad
    let wheelT = 0, zoomAcc = 0, zoomT = 0;
    $('#viewHost').addEventListener('wheel', e => {
      const v = curView();
      if (e.ctrlKey && on('pinch')) {
        e.preventDefault();
        if (v === 'week' || v === 'day') { const f = Math.exp(-e.deltaY * .0025); setHourZoom(hz * f, e.clientY); return; }
        zoomAcc += e.deltaY; clearTimeout(zoomT); zoomT = setTimeout(() => { zoomAcc = 0; }, 300);
        if (v === 'month' && zoomAcc > 60) { zoomAcc = 0; UI.app.go({ view: 'year' }); }
        else if (v === 'year' && zoomAcc < -60) { zoomAcc = 0; const n = e.target.closest('.yr-m'); UI.app.go({ view: 'month', date: n ? new Date(UI.app.state.date.getFullYear(), [...n.parentElement.children].indexOf(n), 1) : UI.app.state.date }); }
        return;
      }
      if (!on('swipe')) return;
      const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5 ? e.deltaX : (e.shiftKey ? (e.deltaY || e.deltaX) : 0);
      if (Math.abs(horiz) < 20 || performance.now() - wheelT < 480) return;
      if (UI.views[v] && UI.views[v].noNav) return;
      wheelT = performance.now();
      e.preventDefault();
      UI.app.step(horiz > 0 ? 1 : -1);
    }, { passive: false });
    // clic derecho y central
    app.addEventListener('contextmenu', e => {
      if (!on('context') || lastPT !== 'mouse') return;
      if (e.target.closest('input, textarea, .layer')) return;
      const evEl = e.target.closest('.mv-ev, .tg-ev, .ag-card, .task-row');
      if (evEl) { const o = occFromEl(evEl); if (o) { e.preventDefault(); eventMenu(o, e.clientX, e.clientY, evEl); } return; }
      const cell = e.target.closest('.mc-day, .tg-col, .yd');
      if (cell) { e.preventDefault(); slotMenu(cell, e.clientX, e.clientY); }
    });
    app.addEventListener('auxclick', e => {
      if (e.button !== 1 || !on('context')) return;
      const evEl = e.target.closest('.mv-ev, .tg-ev, .ag-card, .task-row');
      if (evEl) { const o = occFromEl(evEl); if (o) { e.preventDefault(); UI.editor.open({ ev: o.ev, occ: o }); } }
    });
    app.addEventListener('mousedown', e => { if (e.button === 1 && e.target.closest('#viewHost')) e.preventDefault(); });
  }
  const COLORS = ['#B9A2FF', '#FF9CCB', '#7CC8F2', '#7ED6C3', '#FFB38A', '#F2C14E', '#C38BEB', '#FF8A8A', '#86B862', '#9AA0B5'];
  function eventMenu(o, x, y) {
    const ev = o.ev;
    if (UI.gacc && UI.gacc.readOnly(ev)) {
      UI.menu(null, [{ title: C().titleOf(ev) }, { label: t('Ver detalles'), icon: 'eye', act: () => UI.editor.detail(o) }, { label: t('Abrir en Google Calendar'), icon: 'external', act: () => UI.gacc.openURL(UI.gacc.googleURL(ev)) }], { x, y }).classList.add('ctx-menu');
      return;
    }
    const items = [
      { title: C().titleOf(ev) },
      { label: t('Ver detalles'), icon: 'eye', act: () => UI.editor.detail(o) },
      { label: t('Editar'), icon: 'edit', act: () => UI.editor.open({ ev, occ: o }) },
    ];
    if (o.isTask) items.push({ label: o.done ? t('Marcar como pendiente') : t('Marcar como hecha'), icon: 'check', act: () => C().toggleTask(o) });
    items.push({ label: t('Duplicar'), icon: 'copy', act: async () => { const c = JSON.parse(JSON.stringify(ev)); delete c.id; delete c.created; delete c.updated; c.done = false; const s = await ZC.store.saveEvent(c); UI.toast(t('Duplicado'), { icon: 'copy', undo: () => ZC.store.deleteEvent(s.id, { mode: 'all' }) }); } });
    items.push({ label: t('Pasar a mañana'), icon: 'clock', act: () => { const s = C().addDays(o.start, 1); C().moveOccurrence(o, s, o.isTask ? s : C().addDays(o.allDay ? C().lastDay(o) : o.end, 1)); } });
    if (ev.location) items.push({ label: t('Abrir en Google Maps'), icon: 'pin', act: () => UI.editor.openMaps(ev.location) });
    items.push('-', { label: t('Borrar'), icon: 'trash', danger: true, act: () => C().deleteOccurrence(o) });
    const m = UI.menu(null, items, { x, y });
    m.classList.add('ctx-menu');
    // fila de colores (cambia el color del evento o de toda la serie)
    const cur = (ev.color || '').toUpperCase();
    const row = UI.h(`<div class="ctx-colors" role="group" aria-label="${UI.esc(t('Color'))}"><button class="cdot sm ${!cur ? 'on' : ''}" data-c="" style="--c:${UI.esc((o.calendar && o.calendar.color) || '#B9A2FF')}" title="${UI.esc(t('El del calendario'))}"><span>A</span></button>${COLORS.map(c => `<button class="cdot sm ${cur === c ? 'on' : ''}" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>`);
    const hr = m.querySelectorAll('hr'); m.insertBefore(row, hr[hr.length - 1]);
    row.addEventListener('click', async e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      m._close();
      const before = ev.color || null, c = b.dataset.c || null;
      await ZC.store.saveEvent({ id: ev.id, color: c });
      UI.toast(t('Color cambiado'), { icon: 'palette', undo: () => ZC.store.saveEvent({ id: ev.id, color: before }) });
    });
    const r = m.getBoundingClientRect(); if (r.bottom > innerHeight - 8) m.style.top = Math.max(8, innerHeight - r.height - 8) + 'px';
  }
  function slotMenu(cell, x, y) {
    let start, allDay = false;
    if (cell.classList.contains('tg-col')) {
      const r = cell.getBoundingClientRect(), H = parseFloat(getComputedStyle(root).getPropertyValue('--hh')) || 52;
      start = C().parse(cell.dataset.d); start.setMinutes(Math.max(0, Math.min(1410, Math.floor((y - r.top) / H * 2) * 30)));
    } else { start = C().parse(cell.dataset.d); allDay = true; }
    const dur = (C().prefsCal().defaultDuration || 60) * 60000;
    UI.menu(null, [
      { title: allDay ? ZC.i18n.D.day(start) : ZC.i18n.D.short(start) + ', ' + C().fmtT(start) },
      { label: allDay ? t('Nuevo evento este día') : t('Nuevo evento a esta hora'), icon: 'plus', act: () => allDay ? UI.editor.open({ date: start }) : UI.editor.open({ start, end: new Date(+start + dur) }) },
      { label: t('Nueva tarea'), icon: 'tasks', act: () => UI.editor.open({ kind: 'task', date: start }) },
      { label: t('Ver el día'), icon: 'day', act: () => UI.app.go({ view: 'day', date: start }) },
    ], { x, y });
  }

  // ---------- hoja inferior: arrastrar hacia arriba la expande ----------
  let SH = null;
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest('.layer-sheet .grabber, .layer-sheet .sheet-head');
    if (!g || e.target.closest('button:not(.grabber), input')) return;
    SH = { y: e.clientY, t: performance.now(), panel: g.closest('.panel') };
  }, true);
  document.addEventListener('pointerup', e => {
    if (!SH) return;
    const dy = e.clientY - SH.y, v = dy / Math.max(1, performance.now() - SH.t), p = SH.panel; SH = null;
    if (dy < -40 || v < -.5) { if (!p.classList.contains('expanded')) { p.classList.add('expanded'); UI.haptic('select'); } }
    else if ((dy > 40 || v > .5) && p.classList.contains('expanded')) { p.classList.remove('expanded'); }
  }, true);

  // ---------- visor de imágenes ----------
  const LB = { pts: new Map(), s: 1, tx: 0, ty: 0 };
  function lbImg() { return document.querySelector('.lightbox img'); }
  function lbApply(img, animate) { img.style.transition = animate && anim() ? 'transform .3s cubic-bezier(.2,.9,.25,1)' : 'none'; img.style.transform = `translate(${LB.tx}px, ${LB.ty}px) scale(${LB.s})`; }
  function lbReset(img) { LB.s = 1; LB.tx = 0; LB.ty = 0; if (img) lbApply(img, true); }
  document.addEventListener('pointerdown', e => {
    const body = e.target.closest('.lightbox .layer-body'); if (!body || !on('viewer') || e.target.closest('button')) return;
    const img = lbImg(); if (!img) return;
    if (img !== LB.img) { LB.img = img; lbReset(null); }
    LB.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (LB.pts.size === 2) { const [a, b] = [...LB.pts.values()]; LB.d0 = Math.hypot(a.x - b.x, a.y - b.y); LB.s0 = LB.s; LB.mode = 'pinch'; }
    else { LB.mode = 'one'; LB.x0 = e.clientX; LB.y0 = e.clientY; LB.tx0 = LB.tx; LB.ty0 = LB.ty; LB.t0 = performance.now(); LB.moved = false; }
  }, true);
  document.addEventListener('pointermove', e => {
    if (!LB.pts.has(e.pointerId)) return;
    LB.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const img = lbImg(); if (!img) return;
    if (LB.mode === 'pinch' && LB.pts.size >= 2) { const [a, b] = [...LB.pts.values()]; LB.s = Math.max(1, Math.min(5, LB.s0 * Math.hypot(a.x - b.x, a.y - b.y) / (LB.d0 || 1))); lbApply(img); return; }
    if (LB.mode !== 'one') return;
    const dx = e.clientX - LB.x0, dy = e.clientY - LB.y0;
    if (Math.hypot(dx, dy) > 8) LB.moved = true;
    if (LB.s > 1.02) { LB.tx = LB.tx0 + dx; LB.ty = LB.ty0 + dy; lbApply(img); return; }
    LB.dx = dx; LB.dy = dy;
    if (Math.abs(dy) > Math.abs(dx)) { img.style.transition = 'none'; img.style.transform = `translateY(${dy}px) scale(${1 - Math.min(.2, Math.abs(dy) / 1500)})`; img.closest('.panel').style.background = `rgb(10 8 20 / ${.86 * (1 - Math.min(.8, Math.abs(dy) / 400))})`; }
    else { img.style.transition = 'none'; img.style.transform = `translateX(${dx}px)`; }
  }, true);
  const lbUp = e => {
    if (!LB.pts.has(e.pointerId)) return;
    LB.pts.delete(e.pointerId);
    const img = lbImg(); if (!img) { LB.pts.clear(); return; }
    if (LB.mode === 'pinch') { if (LB.pts.size === 0) { LB.mode = null; if (LB.s < 1.05) lbReset(img); } return; }
    if (LB.mode !== 'one') return;
    LB.mode = null;
    const panel = img.closest('.panel');
    if (!LB.moved) {
      const now = performance.now();
      if (LB.lastTap && now - LB.lastTap < 300) {
        LB.lastTap = 0;
        if (LB.s > 1.02) lbReset(img);
        else { const r = img.getBoundingClientRect(), cx = e.clientX - (r.left + r.width / 2), cy = e.clientY - (r.top + r.height / 2); LB.s = 2.5; LB.tx = -cx * 1.5; LB.ty = -cy * 1.5; lbApply(img, true); }
        UI.haptic('tap');
      } else LB.lastTap = now;
      return;
    }
    LB.movedAt = performance.now();
    if (LB.s > 1.02) return;
    const dx = LB.dx || 0, dy = LB.dy || 0; LB.dx = LB.dy = 0;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 110) { img.style.transition = 'transform .25s, opacity .25s'; img.style.transform = `translateY(${dy > 0 ? 400 : -400}px)`; img.style.opacity = '0'; UI.back(); return; }
    panel.style.background = '';
    if (Math.abs(dx) > 80) { const b = document.querySelector(dx < 0 ? '.lightbox .lb-n' : '.lightbox .lb-p'); if (b) { b.click(); UI.haptic('tick'); } }
    img.style.transition = anim() ? 'transform .3s cubic-bezier(.2,.9,.25,1)' : 'none'; img.style.transform = '';
  };
  document.addEventListener('pointerup', lbUp, true);
  document.addEventListener('pointercancel', lbUp, true);
  document.addEventListener('click', e => { if (e.target.matches('.lightbox .layer-body') && (LB.s > 1.02 || performance.now() - (LB.movedAt || 0) < 400)) { e.stopPropagation(); } }, true);

  // ---------- Ajustes → Gestos ----------
  function section() {
    const g = gp();
    return `<section class="scard"><div class="s-h"><h3>${t('Gestos')}</h3><p>${t('Apaga los que no uses. Todos respetan el ajuste de animaciones.')}</p></div>
      ${GROUPS.filter(g => g[0] !== 'wsswipe' || (UI.wsui && UI.wsui.available())).map(([k, name, sub]) => `<div class="srow"><div class="sl"><b>${t(name)}</b><small>${t(sub)}</small></div><div class="sc"><button type="button" class="sw" role="switch" data-gest="${k}" aria-checked="${g[k] !== false}" aria-label="${UI.esc(t(name))}"></button></div></div>`).join('')}
      <div class="srow"><div class="sl"><b>${t('Alto de las horas')}</b><small>${t('También se cambia pellizcando la rejilla.')}</small></div><div class="sc"><button type="button" class="btn sm ghost" data-hz="-1">−</button><b class="hz-v">${Math.round(hz * 100)} %</b><button type="button" class="btn sm ghost" data-hz="1">+</button><button type="button" class="btn sm ghost" data-hz="0">${t('Restablecer')}</button></div></div></section>`;
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-gest]');
    if (b) { const k = b.dataset.gest, v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); await setG(k, v); return; }
    const z = e.target.closest('[data-hz]');
    if (z) { const d = +z.dataset.hz; hz = d === 0 ? 1 : Math.max(HZ_MIN, Math.min(HZ_MAX, hz * (d > 0 ? 1.15 : 1 / 1.15))); ZC.store.local('hourZoom', hz); applyHZ(); const out = z.parentElement.querySelector('.hz-v'); if (out) out.textContent = Math.round(hz * 100) + ' %'; UI.views._timeScroll = null; UI.app.render(null); }
  });
  if (UI.settings && UI.settings.addSection) UI.settings.addSection('gestures', 'Gestos', 'grip', 'Deslizar, pellizcar, doble toque…', section, 'cal');

  // ---------- textos ----------
  const D = ZC.i18n.DICT;
  const TR = {
    'Gestos': ['Gestures', 'Gestos'], 'Deslizar, pellizcar, doble toque…': ['Swipe, pinch, double tap…', 'Lliscar, pessigar, doble toc…'],
    'Apaga los que no uses. Todos respetan el ajuste de animaciones.': ['Turn off the ones you don\'t use. All of them follow the animation setting.', 'Apaga els que no facis servir. Tots respecten l\'ajust d\'animacions.'],
    'Deslizar para cambiar de periodo': ['Swipe to change period', 'Lliscar per canviar de període'],
    'Mes, semana o día siguiente siguiendo el dedo. En el PC, Mayús + rueda o el trackpad.': ['Next month, week or day following your finger. On PC, Shift + wheel or the trackpad.', 'Mes, setmana o dia següent seguint el dit. Al PC, Maj + roda o el trackpad.'],
    'Pellizcar para ampliar': ['Pinch to zoom', 'Pessigar per ampliar'],
    'El alto de las horas en Semana y Día, y pasar de Mes a Año. En el PC, Ctrl + rueda.': ['Hour height in Week and Day, and Month to Year. On PC, Ctrl + wheel.', 'L\'alçada de les hores a Setmana i Dia, i passar de Mes a Any. Al PC, Ctrl + roda.'],
    'Plegar y desplegar': ['Fold and unfold', 'Plegar i desplegar'],
    'Arrastra la cabecera de Semana hacia abajo para ver el mes, y el mes hacia arriba para volver.': ['Drag the Week header down to see the month, and the month up to go back.', 'Arrossega la capçalera de Setmana cap avall per veure el mes, i el mes cap amunt per tornar.'],
    'Deslizar filas': ['Swipe rows', 'Lliscar files'],
    'En Agenda y Tareas: a la derecha completa, a la izquierda pospone o borra.': ['In Agenda and Tasks: right completes, left postpones or deletes.', 'A Agenda i Tasques: a la dreta completa, a l\'esquerra ajorna o esborra.'],
    'Tirar para sincronizar': ['Pull to sync', 'Estirar per sincronitzar'],
    'Tira hacia abajo en Agenda o Tareas para sincronizar con Google Drive.': ['Pull down in Agenda or Tasks to sync with Google Drive.', 'Estira cap avall a Agenda o Tasques per sincronitzar amb Google Drive.'],
    'Doble toque': ['Double tap', 'Doble toc'],
    'En un día o en un hueco crea un evento; en la cabecera vuelve a hoy.': ['On a day or a free slot it creates an event; on the header it goes to today.', 'En un dia o en un buit crea un esdeveniment; a la capçalera torna a avui.'],
    'Borde para el panel lateral': ['Edge for the side panel', 'Vora per al panell lateral'],
    'Desliza desde el borde izquierdo para abrir el panel.': ['Swipe from the left edge to open the panel.', 'Llisca des de la vora esquerra per obrir el panell.'],
    'Visor de imágenes': ['Image viewer', 'Visor d\'imatges'],
    'Pellizcar, doble toque para ampliar y deslizar para cerrar.': ['Pinch, double tap to zoom and swipe to close.', 'Pessigar, doble toc per ampliar i lliscar per tancar.'],
    'Menú con clic derecho': ['Right-click menu', 'Menú amb clic dret'],
    'Editar, duplicar, cambiar el color o borrar. El clic central abre el editor.': ['Edit, duplicate, change color or delete. Middle click opens the editor.', 'Editar, duplicar, canviar el color o esborrar. El clic central obre l\'editor.'],
    'Vibración': ['Vibration', 'Vibració'], 'Un toque suave al soltar, completar o mover.': ['A soft tap when dropping, completing or moving.', 'Un toc suau en deixar anar, completar o moure.'],
    'Alto de las horas': ['Hour height', 'Alçada de les hores'], 'También se cambia pellizcando la rejilla.': ['You can also pinch the grid.', 'També es canvia pessigant la graella.'],
    'Pendiente': ['Not done', 'Pendent'], 'Marcada como pendiente': ['Marked as not done', 'Marcada com a pendent'], 'Tarea hecha': ['Task done', 'Tasca feta'],
    'Al día': ['Up to date', 'Al dia'], 'Sincronizado con Google Drive': ['Synced with Google Drive', 'Sincronitzat amb Google Drive'], 'No se ha podido sincronizar': ['Couldn\'t sync', 'No s\'ha pogut sincronitzar'],
    'Ver detalles': ['View details', 'Veure detalls'], 'Pasar a mañana': ['Move to tomorrow', 'Passar a demà'], 'Este color': ['This color', 'Aquest color'], 'Color cambiado': ['Color changed', 'Color canviat'],
    'El del calendario': ['Calendar color', 'El del calendari'], 'Nuevo evento este día': ['New event on this day', 'Esdeveniment nou aquest dia'], 'Nuevo evento a esta hora': ['New event at this time', 'Esdeveniment nou a aquesta hora'],
    'Ver el día': ['View the day', 'Veure el dia'], 'Color': ['Color', 'Color'],
    'Cambiar de calendario deslizando la foto': ['Switch calendar by swiping the picture', 'Canviar de calendari lliscant la foto'],
    'Desliza la foto o el icono del selector de arriba para pasar al siguiente workspace. En el PC, con la rueda encima.': ['Swipe the picture or icon of the switcher at the top to go to the next workspace. On PC, use the wheel over it.', 'Llisca la foto o la icona del selector de dalt per passar al workspace següent. Al PC, amb la roda a sobre.'],
  };
  for (const [k, [en, ca]] of Object.entries(TR)) { D.en[k] = D.en[k] || en; D.ca[k] = D.ca[k] || ca; }

  UI.gestures = { swipe: true, on, setHourZoom, hourZoom: () => hz, groups: GROUPS.map(g => g[0]), wire: wireApp };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireApp); else wireApp();
})();
