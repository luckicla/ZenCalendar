'use strict';
// ZenCalendar · utilidades de la interfaz: crear nodos, capas (hojas, ventanitas, cajones),
// avisos con deshacer, ondas al pulsar, confeti, menús y diálogos.
(function () {
  const ZC = window.ZC, UI = ZC.ui = ZC.ui || {};
  const t = (...a) => ZC.t(...a);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function h(html) { const tp = document.createElement('template'); tp.innerHTML = html.trim(); return tp.content.firstElementChild; }
  const mqMobile = matchMedia('(max-width: 759px)');
  const isMobile = () => mqMobile.matches;
  const touchy = () => matchMedia('(pointer: coarse)').matches;
  const animLevel = () => document.documentElement.dataset.anim || 'normal';   // none | soft | normal | lots
  const anim = () => animLevel() !== 'none';

  function haptic(kind = 'tap') {
    if (!navigator.vibrate || !touchy()) return;
    try { navigator.vibrate({ tap: 8, tick: 4, ok: [10, 40, 14], warn: 25 }[kind] || 8); } catch {}
  }

  // ---------- onda al pulsar ----------
  const RIP = '.btn, .ibtn, .chip, .nav-b, .seg button, .fab, .tcard, .preset, .mc-day, .row-btn, .cal-row, .menu button';
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest(RIP);
    if (!el || el.disabled || !anim()) return;
    const r = el.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2;
    const w = document.createElement('span');
    w.className = 'ripple';
    w.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(w);
    setTimeout(() => w.remove(), 650);
  }, { passive: true });

  // ---------- confeti pequeñito ----------
  function confetti(x, y, n) {
    if (!anim()) return;
    const lots = animLevel() === 'lots';
    n = n || (lots ? 26 : 14);
    const cs = getComputedStyle(document.documentElement);
    const cols = ['--a1', '--a2', '--a3', '--b4'].map(v => cs.getPropertyValue(v).trim() || '#c9b8ff');
    const box = h('<div class="confetti" aria-hidden="true"></div>');
    box.style.left = x + 'px'; box.style.top = y + 'px';
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const a = Math.random() * Math.PI * 2, d = (lots ? 60 : 38) + Math.random() * (lots ? 70 : 40);
      p.style.setProperty('--dx', Math.cos(a) * d + 'px');
      p.style.setProperty('--dy', Math.sin(a) * d - 20 + 'px');
      p.style.setProperty('--r', (Math.random() * 540 - 270) + 'deg');
      p.style.background = cols[i % cols.length];
      if (i % 3 === 0) p.style.borderRadius = '50%';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 1000);
  }

  // ---------- avisos ----------
  let toastBox;
  function toast(msg, { undo, icon, ms = 3800, action } = {}) {
    if (!toastBox) { toastBox = h('<div id="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(toastBox); }
    const el = h(`<div class="toast">${icon ? UI.icon(icon, 18) : ''}<span>${esc(msg)}</span></div>`);
    const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
    const act = (label, fn) => { const b = h(`<button class="toast-act">${esc(label)}</button>`); b.onclick = () => { kill(); fn(); }; el.appendChild(b); };
    if (undo) act(t('Deshacer'), undo);
    if (action) act(action.label, action.fn);
    toastBox.appendChild(el);
    setTimeout(kill, undo ? Math.max(ms, 6000) : ms);
    return { close: kill };
  }

  // ---------- capas: ventanita (modal), hoja inferior (sheet), cajón (drawer) ----------
  const layers = [];
  let scrim = null;
  function paintScrim() {
    const need = layers.some(l => l.scrim);
    if (need && !scrim) { scrim = h('<div class="scrim"></div>'); document.body.appendChild(scrim); scrim.onclick = () => { const top = layers[layers.length - 1]; if (top && top.dismissable) top.close(); }; requestAnimationFrame(() => scrim && scrim.classList.add('on')); }
    if (!need && scrim) { const s = scrim; scrim = null; s.classList.remove('on'); setTimeout(() => s.remove(), 280); }
    if (scrim) scrim.style.zIndex = 60 + layers.length * 2 - 1;
  }
  /**
   * openLayer({ kind:'modal'|'sheet'|'drawer'|'full', html|el, cls, title, from:{x,y}, dismissable, onClose, scrim })
   * En el móvil, 'modal' y 'drawer' pasan a ser una hoja inferior arrastrable.
   */
  function openLayer(o) {
    let kind = o.kind || 'modal';
    if (isMobile() && (kind === 'modal' || kind === 'drawer')) kind = 'sheet';
    const wrap = h(`<div class="layer layer-${kind} ${o.cls || ''}" role="dialog" aria-modal="true"></div>`);
    const panel = h(`<div class="panel ${o.panelCls || ''}"></div>`);
    if (o.label) wrap.setAttribute('aria-label', o.label);
    if (kind === 'sheet') panel.appendChild(h('<div class="grabber" aria-hidden="true"><i></i></div>'));
    const body = o.el || (o.html != null ? h(`<div class="layer-body">${o.html}</div>`) : h('<div class="layer-body"></div>'));
    panel.appendChild(body);
    wrap.appendChild(panel);
    const L = { el: wrap, panel, body, kind, dismissable: o.dismissable !== false, scrim: o.scrim !== false, closed: false };
    L.close = (why) => {
      if (L.closed) return; L.closed = true;
      const i = layers.indexOf(L); if (i >= 0) layers.splice(i, 1);
      wrap.classList.add('closing'); wrap.classList.remove('open');
      paintScrim();
      setTimeout(() => wrap.remove(), anim() ? 320 : 0);
      if (o.onClose) try { o.onClose(why); } catch (e) { console.error(e); }
      if (L.prevFocus && L.prevFocus.focus) try { L.prevFocus.focus({ preventScroll: true }); } catch {}
    };
    L.prevFocus = document.activeElement;
    wrap.style.zIndex = 60 + (layers.length + 1) * 2;
    layers.push(L);
    document.body.appendChild(wrap);
    // (el círculo que se abre desde el botón, solo con ratón: en el WebView de Android, recortar con
    // clip-path un panel de vidrio desenfocado mientras se anima parpadea; en táctil, la entrada normal)
    if (o.from && anim() && !touchy()) {
      const r = panel.getBoundingClientRect();
      panel.style.setProperty('--ox', (o.from.x - r.left) + 'px');
      panel.style.setProperty('--oy', (o.from.y - r.top) + 'px');
      wrap.classList.add('morph');
    }
    paintScrim();
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
    setTimeout(() => wrap.classList.add('settled'), anim() ? 420 : 0);
    if (kind === 'sheet') sheetDrag(L);
    wrap.addEventListener('click', e => { if (e.target === wrap && L.dismissable) L.close('scrim'); });
    setTimeout(() => { const f = body.querySelector('[autofocus]'); if (f && !touchy()) f.focus(); }, 60);
    return L;
  }
  function sheetDrag(L) {
    const p = L.panel;
    let y0 = null, dy = 0, t0 = 0, scroller = null;
    const start = e => {
      const onGrab = e.target.closest('.grabber, .sheet-head');
      scroller = e.target.closest('.layer-scroll, .layer-body');
      if (!onGrab && (!scroller || scroller.scrollTop > 0)) return;
      if (e.target.closest('input, textarea, select, button:not(.grabber), [contenteditable]') && !onGrab) return;
      y0 = e.clientY; dy = 0; t0 = performance.now(); L.grab = !!onGrab;
    };
    const move = e => {
      if (y0 == null) return;
      dy = e.clientY - y0;
      if (!L.grab && dy < 6) { if (dy < -4) y0 = null; return; }
      if (dy < 0) dy = dy * 0.25;
      p.style.transition = 'none';
      p.style.transform = `translateY(${dy}px)`;
      if (e.cancelable) e.preventDefault();
    };
    const end = () => {
      if (y0 == null) return;
      const v = dy / Math.max(1, performance.now() - t0);
      p.style.transition = ''; p.style.transform = '';
      if ((dy > 130 || v > 0.7) && L.dismissable) L.close('drag');
      y0 = null;
    };
    p.addEventListener('pointerdown', start);
    p.addEventListener('pointermove', move);
    p.addEventListener('pointerup', end);
    p.addEventListener('pointercancel', end);
    p.addEventListener('touchmove', e => { if (y0 != null && dy > 6 && e.cancelable) e.preventDefault(); }, { passive: false });
  }
  // cierra la capa de arriba (Esc, o el botón atrás de Android). Devuelve true si cerró algo.
  function back() {
    const pop = $('.menu.open'); if (pop) { pop._close(); return true; }
    const top = layers[layers.length - 1];
    if (top && top.dismissable !== false) { top.close('back'); return true; }
    return false;
  }
  const topLayer = () => layers[layers.length - 1] || null;

  // ---------- menú contextual / desplegable ----------
  function menu(anchor, items, { align = 'start', x, y } = {}) {
    $$('.menu.open').forEach(m => m._close());
    const m = h('<div class="menu" role="menu"></div>');
    for (const it of items) {
      if (it === '-') { m.appendChild(h('<hr>')); continue; }
      if (it.title) { m.appendChild(h(`<div class="menu-t">${esc(it.title)}</div>`)); continue; }
      const b = h(`<button role="menuitem" class="${it.danger ? 'danger' : ''} ${it.on ? 'on' : ''}">${it.icon ? UI.icon(it.icon, 18) : (it.dot ? `<i class="dot" style="background:${esc(it.dot)}"></i>` : '')}<span>${esc(it.label)}</span>${it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : ''}${it.on ? UI.icon('check', 16, 'menu-on') : ''}</button>`);
      b.onclick = () => { close(); it.act && it.act(); };
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = anchor ? anchor.getBoundingClientRect() : { left: x, right: x, top: y, bottom: y, width: 0 };
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let left = align === 'end' ? r.right - mw : r.left, top = r.bottom + 6;
    if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    left = Math.max(8, Math.min(innerWidth - mw - 8, left));
    m.style.left = left + 'px'; m.style.top = top + 'px';
    requestAnimationFrame(() => m.classList.add('open'));
    const off = e => { if (!m.contains(e.target)) close(); };
    function close() { m.classList.remove('open'); m._closed = true; setTimeout(() => m.remove(), 180); document.removeEventListener('pointerdown', off, true); }
    m._close = close;
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    const first = m.querySelector('button'); if (first && !touchy()) first.focus();
    m.addEventListener('keydown', e => {
      const bs = $$('button', m), i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    return m;
  }

  // ---------- diálogos ----------
  function confirm(title, text, { ok = t('Aceptar'), cancel = t('Cancelar'), danger = false, icon } = {}) {
    return new Promise(res => {
      let done = false;
      const L = openLayer({ kind: 'modal', panelCls: 'dlg', html: `
        <div class="dlg-in">${icon ? `<div class="dlg-ic ${danger ? 'danger' : ''}">${UI.icon(icon, 26)}</div>` : ''}
        <h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}
        <div class="dlg-acts"><button class="btn ghost" data-a="no">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'pri'}" data-a="ok" autofocus>${esc(ok)}</button></div></div>`,
        onClose: () => { if (!done) res(false); } });
      L.body.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; done = true; res(b.dataset.a === 'ok'); L.close(); });
    });
  }
  function choose(title, options, { text } = {}) {
    return new Promise(res => {
      let done = false;
      const L = openLayer({ kind: 'modal', panelCls: 'dlg', html: `
        <div class="dlg-in"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}
        <div class="dlg-choices">${options.map(o => `<button class="row-btn ${o.danger ? 'danger' : ''}" data-v="${esc(o.v)}">${o.icon ? UI.icon(o.icon, 20) : ''}<span><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span></button>`).join('')}</div>
        <div class="dlg-acts"><button class="btn ghost" data-v="">${t('Cancelar')}</button></div></div>`,
        onClose: () => { if (!done) res(null); } });
      L.body.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; done = true; res(b.dataset.v || null); L.close(); });
    });
  }
  function prompt(title, value = '', { ok = t('Guardar'), placeholder = '', label } = {}) {
    return new Promise(res => {
      let done = false;
      const L = openLayer({ kind: 'modal', panelCls: 'dlg', html: `
        <form class="dlg-in"><h2>${esc(title)}</h2>
        <label class="fld">${label ? `<span>${esc(label)}</span>` : ''}<input class="in" name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus autocomplete="off"></label>
        <div class="dlg-acts"><button type="button" class="btn ghost" data-a="no">${t('Cancelar')}</button><button class="btn pri">${esc(ok)}</button></div></form>`,
        onClose: () => { if (!done) res(null); } });
      const f = L.body.querySelector('form') || L.body;
      const inp = L.panel.querySelector('input');
      setTimeout(() => { inp.focus(); inp.select(); }, 80);
      L.panel.querySelector('[data-a=no]').onclick = () => L.close();
      L.panel.querySelector('form').onsubmit = e => { e.preventDefault(); done = true; res(inp.value.trim()); L.close(); };
    });
  }

  // ---------- archivos ----------
  function pickFile({ accept = '*/*', multiple = false, capture } = {}) {
    return new Promise(res => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = accept; i.multiple = multiple;
      if (capture) i.setAttribute('capture', capture);
      i.style.display = 'none';
      i.onchange = () => { res([...i.files]); i.remove(); };
      document.body.appendChild(i);
      i.click();
    });
  }
  function download(name, data, type = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  // reduce una imagen grande antes de guardarla (fotos de cámara de 12 MP → 2000 px)
  async function shrinkImage(file, max = 2000, q = 0.86) {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (k >= 1 && file.size < 1.5e6) return { blob: file, w: bmp.width, h: bmp.height };
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', q));
      return { blob: blob || file, w: cv.width, h: cv.height };
    } catch { return { blob: file, w: 0, h: 0 }; }
  }

  // ---------- visor de imágenes ----------
  async function lightbox(ids, index = 0) {
    const urls = await Promise.all(ids.map(id => ZC.store.blobURL(id).catch(() => null)));
    let i = index;
    const L = openLayer({ kind: 'full', cls: 'lightbox', html: `
      <img alt="">
      <button class="ibtn lb-x" aria-label="${t('Cerrar')}">${UI.icon('x', 22)}</button>
      ${ids.length > 1 ? `<button class="ibtn lb-p" aria-label="${t('Anterior')}">${UI.icon('chevL', 24)}</button><button class="ibtn lb-n" aria-label="${t('Siguiente')}">${UI.icon('chevR', 24)}</button>` : ''}` });
    const img = L.body.querySelector('img');
    const show = () => { img.src = urls[i] || ''; };
    show();
    L.body.querySelector('.lb-x').onclick = () => L.close();
    const p = L.body.querySelector('.lb-p'), n = L.body.querySelector('.lb-n');
    if (p) p.onclick = () => { i = (i - 1 + ids.length) % ids.length; show(); };
    if (n) n.onclick = () => { i = (i + 1) % ids.length; show(); };
    L.body.addEventListener('click', e => { if (e.target === L.body) L.close(); });
  }

  // ---------- ilustraciones de estados vacíos (sobrias) ----------
  const ART = {
    calm: `<svg viewBox="0 0 160 120" class="art" aria-hidden="true"><circle cx="80" cy="64" r="44" fill="var(--a1)" opacity=".16"/><circle cx="106" cy="38" r="12" fill="var(--b4)" opacity=".8"/>
      <path d="M40 82c10-14 24-14 34 0s24 14 34 0 18-10 22-4" fill="none" stroke="var(--a1)" stroke-width="4" stroke-linecap="round" opacity=".55"/>
      <path d="M48 96c8-8 18-8 26 0s18 8 26 0" fill="none" stroke="var(--a2)" stroke-width="4" stroke-linecap="round" opacity=".45"/></svg>`,
    tasks: `<svg viewBox="0 0 160 120" class="art" aria-hidden="true"><rect x="44" y="22" width="72" height="80" rx="18" fill="var(--a1)" opacity=".16"/>
      <rect x="56" y="40" width="14" height="14" rx="5" fill="none" stroke="var(--a1)" stroke-width="3.5"/><path d="M59 47l3 3 6-6" fill="none" stroke="var(--a1)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="78" y="44" width="26" height="6" rx="3" fill="var(--a1)" opacity=".45"/>
      <rect x="56" y="64" width="14" height="14" rx="5" fill="none" stroke="var(--a2)" stroke-width="3.5"/><rect x="78" y="68" width="20" height="6" rx="3" fill="var(--a2)" opacity=".45"/>
      <circle cx="122" cy="30" r="5" fill="var(--a3)"/><circle cx="36" cy="88" r="4" fill="var(--b4)"/></svg>`,
    search: `<svg viewBox="0 0 160 120" class="art" aria-hidden="true"><circle cx="72" cy="56" r="28" fill="var(--a1)" opacity=".14" stroke="var(--a1)" stroke-width="4"/>
      <path d="M93 77l18 18" stroke="var(--a2)" stroke-width="8" stroke-linecap="round"/><circle cx="64" cy="48" r="7" fill="#fff" opacity=".6"/></svg>`,
    ai: `<svg viewBox="0 0 160 120" class="art" aria-hidden="true"><path d="M80 18l7 20 20 7-20 7-7 20-7-20-20-7 20-7z" fill="var(--a1)"/><path d="M114 64l3.5 10 10 3.5-10 3.5-3.5 10-3.5-10-10-3.5 10-3.5z" fill="var(--a3)"/><path d="M48 70l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="var(--b4)"/></svg>`,
  };

  // tras un «mantener pulsado» que abre algo, el clic que llega al soltar no debe cerrarlo
  function swallowClick(ms = 700) {
    const until = performance.now() + ms;
    const f = e => { if (performance.now() < until) { e.stopPropagation(); e.preventDefault(); } document.removeEventListener('click', f, true); };
    document.addEventListener('click', f, true);
    setTimeout(() => document.removeEventListener('click', f, true), ms + 50);
  }

  Object.assign(UI, { swallowClick, $, $$, h, esc, isMobile, touchy, anim, animLevel, haptic, confetti, toast, openLayer, back, topLayer, layers, menu, confirm, choose, prompt, pickFile, download, shrinkImage, lightbox, ART, mqMobile });
})();
