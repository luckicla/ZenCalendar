'use strict';
// ZenCalendar · workspaces en la interfaz: el selector «Mi calendario ▾» de la barra de arriba, el título con el
// nombre del workspace, su color y su fondo, crear y editar, invitar (enlace, WhatsApp, correo), entrar con un
// enlace, miembros, tareas para alguien, avisos dentro de la app y la sección de Ajustes.
// Si ZC.ws no está configurado (sin Firebase) no se pinta nada y la app va como siempre.
(function () {
  const ZC = window.ZC, UI = ZC.ui, t = (...a) => ZC.t(...a);
  const esc = s => UI.esc(s);
  const W = () => ZC.ws;
  const on = () => { try { return !!(W() && W().available()); } catch { return false; } };
  const st = () => { try { return W().state(); } catch { return {}; } };

  // ---------- iconos que faltan ----------
  Object.assign(UI.ICONS, {
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M15.5 14.2c2.6-.3 4.5 1.3 5 4.3"/>',
    share: '<circle cx="17.5" cy="6" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/><path d="M8.7 10.8l6.6-3.6M8.7 13.2l6.6 3.6"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M4.5 7.5l7.5 5.5 7.5-5.5"/>',
    whatsapp: '<path d="M5 19l1.1-3.4A7.5 7.5 0 1 1 9 18.3z"/><path d="M9.3 9.2c.2 2.4 2.6 4.8 5 5l1-1.2-1.6-1-.8.7c-.9-.4-1.8-1.3-2.2-2.2l.7-.8-1-1.6z"/>',
    door: '<path d="M13.5 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
    crown: '<path d="M4.5 17.5h15M5 15l-1-8 4.5 3.5L12 5l3.5 5.5L20 7l-1 8z"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5l1.4 2.1 2.4-.7.7 2.4 2.4.7-.7 2.4 2.1 1.4-2.1 1.4.7 2.4-2.4.7-.7 2.4-2.4-.7L12 20.5l-1.4-2.1-2.4.7-.7-2.4-2.4-.7.7-2.4L3.5 12l2.1-1.4-.7-2.4 2.4-.7.7-2.4 2.4.7z"/>',
  });

  // ---------- piezas ----------
  const hue = s => { let h = 0; for (const c of String(s || '?')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  function face(m, size = 26, cls = '') {
    m = m || {};
    const name = m.name || (m.email || '').split('@')[0] || '?';
    const ini = esc(name.trim().charAt(0).toUpperCase() || '?');
    const title = esc(name + (m.owner ? ' · ' + t('Dueño') : ''));
    if (m.photo) return `<img class="ws-face ${cls}" src="${esc(m.photo)}" alt="" title="${title}" width="${size}" height="${size}" referrerpolicy="no-referrer" style="--fs:${size}px">`;
    return `<span class="ws-face ${cls}" title="${title}" style="--fs:${size}px;--fh:${hue(m.uid || name)}">${ini}</span>`;
  }
  const faces = (ms, n = 3, size = 22) => `<span class="ws-faces">${(ms || []).slice(0, n).map(m => face(m, size)).join('')}${(ms || []).length > n ? `<span class="ws-face more" style="--fs:${size}px">+${ms.length - n}</span>` : ''}</span>`;
  // el distintivo del workspace: su foto de perfil o, si no tiene, su icono sobre su color
  function avatarOf(w) {
    if (!w) return null;
    if (w.avatarURL !== undefined) return w.avatarURL || null;
    try { return w.id && W() ? W().avatarURL(w.id) : null; } catch { return null; }
  }
  const badge = (w, size = 28, cls = '') => {
    const av = avatarOf(w);
    return `<span class="ws-badge${av ? ' has-av' : ''}${size >= 30 ? ' big' : ''}${cls ? ' ' + cls : ''}" style="--wc:${esc(w.color)};--bs:${size}px" aria-hidden="true">${av ? `<img src="${esc(av)}" alt="" draggable="false">` : UI.wsIcons.svg(w.icon, Math.round(size * 0.6))}</span>`;
  };
  const people = n => ZC.i18n.tn(n, '{n} persona', '{n} personas');
  const meUid = () => (W().user() || {}).uid;
  const nameOf = (w, uid) => { const m = w && (w.members || []).find(x => x.uid === uid); return m ? (m.name || (m.email || '').split('@')[0]) : ''; };
  const curWs = () => { try { return on() ? W().current() : null; } catch { return null; } };
  const COLORS = ['#B9A2FF', '#FF9CCB', '#7CC8F2', '#7ED6C3', '#FFB38A', '#F2C14E', '#C38BEB', '#FF8A8A', '#86B862', '#6AAEF5', '#F7A8D0', '#9AA0B5'];
  const ANIMS = ['aurora', 'sakura', 'nubes', 'burbujas', 'estrellas', 'olas', 'degradado'];
  const errText = e => t((e && e.message) || 'Algo ha fallado');

  // ---------- el selector de la barra de arriba ----------
  function ensureChip() {
    const top = document.getElementById('top');
    let chip = document.getElementById('wsChip');
    if (!on()) { if (chip) chip.remove(); document.documentElement.classList.remove('has-ws'); return null; }
    document.documentElement.classList.add('has-ws');
    if (!chip && top) {
      chip = UI.h(`<button type="button" class="ws-chip" id="wsChip" aria-haspopup="menu"></button>`);
      const nav = top.querySelector('.tb-nav');
      top.insertBefore(chip, nav || null);
      chip.addEventListener('click', e => { if (chip._swiped) { chip._swiped = false; return; } openSwitcher(chip); e.stopPropagation(); });
      swipeChip(chip);
      // el engranaje: los ajustes del workspace en el que estás (solo se ve dentro de uno)
      const gear = UI.h(`<button type="button" class="ibtn sm ws-gear" id="wsGear" data-wsact="settings"></button>`);
      chip.after(gear);
    }
    const gear = document.getElementById('wsGear');
    if (gear) { const l = t('Ajustes del workspace'); gear.setAttribute('aria-label', l); gear.title = l; if (!gear.firstChild) gear.innerHTML = UI.icon('gear', 20); }
    // tocar el nombre o la foto del workspace en el título = sus ajustes (el mes sigue abriendo su menú)
    const pt = document.getElementById('periodTitle');
    if (pt && !pt._ws) {
      pt._ws = true;
      pt.addEventListener('click', e => {
        const w = curWs();
        if (!w || !e.target.closest('.ws-name, .ws-dname')) return;
        e.stopImmediatePropagation(); e.preventDefault();
        editDialog(w.id);
      }, true);
    }
    return chip;
  }
  function paintChip() {
    const chip = ensureChip(); if (!chip) return;
    const w = curWs();
    const un = (() => { try { return W().unread() + W().pendingInvites().length; } catch { return 0; } })();
    const label = w ? w.name : t('Mi calendario');
    chip.classList.toggle('is-ws', !!w);
    chip.style.setProperty('--wc', w ? w.color : 'var(--a1)');
    chip.setAttribute('aria-label', t('Calendario: {x}. Toca para cambiar', { x: label }));
    chip.title = t('Cambiar de calendario');
    const html = `<span class="wsc-ic">${w ? badge(w, 24) : `<span class="wsc-me">${UI.icon('user', 16)}</span>`}</span><span class="wsc-tx">${esc(label)}</span>${UI.icon('chevD', 15, 'wsc-chev')}${un ? `<i class="wsc-dot" aria-label="${esc(t('Novedades'))}"></i>` : ''}`;
    if (chip._html === html) return;
    chip._html = html;
    const ghost = chip._ghost && chip._ghost.isConnected ? chip._ghost : null;
    chip.innerHTML = html;
    if (ghost) chip.appendChild(ghost);
    swapIn(chip);
  }
  // deslizar la foto del selector (como en Gmail): a la izquierda o hacia arriba, el siguiente; a la derecha o hacia
  // abajo, el anterior (Mi calendario → workspace 1 → workspace 2…). En el PC, la rueda o el trackpad encima.
  // El gesto se queda con el dedo si empieza en el selector (no lo coge la vista), con vibración y la foto que sale
  // y entra en el sentido del gesto. Se apaga en Ajustes → Gestos («Cambiar de calendario deslizando la foto»).
  const swipeOn = () => !UI.gestures || !UI.gestures.on || UI.gestures.on('wsswipe');
  function neighbour(step) {
    const ids = [null, ...W().list().map(w => w.id)];
    if (ids.length < 2) return undefined;
    const cur = W().current(), i = ids.indexOf(cur ? cur.id : null);
    return ids[(i + step + ids.length) % ids.length];
  }
  // la animación: la foto de antes sale en el sentido del gesto y la nueva entra desde el otro lado
  function swapAnim(chip, dx, dy) {
    const old = chip.querySelector('.wsc-ic');
    chip._swapDir = [dx, dy];
    if (!old || !UI.anim()) return;
    const r = old.getBoundingClientRect(), cr = chip.getBoundingClientRect();
    const g = old.cloneNode(true);
    g.classList.add('wsc-ghost');
    g.style.left = (r.left - cr.left) + 'px'; g.style.top = (r.top - cr.top) + 'px';
    const cur = old.style.transform || 'none';
    chip._ghost = g;
    requestAnimationFrame(() => {
      chip.appendChild(g);
      g.animate([{ transform: cur, opacity: 1 }, { transform: `translate(${dx * 30}px, ${dy * 30}px) scale(.7)`, opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' }).onfinish = () => g.remove();
    });
  }
  function swapIn(chip) {
    const d = chip._swapDir; chip._swapDir = null;
    if (!d || !UI.anim()) return;
    const ic = chip.querySelector('.wsc-ic:not(.wsc-ghost)'); if (!ic) return;
    ic.animate([{ transform: `translate(${-d[0] * 30}px, ${-d[1] * 30}px) scale(.7)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  }
  function swipeTo(chip, step, dx, dy) {
    const next = neighbour(step);
    if (next === undefined) return false;
    swapAnim(chip, dx, dy);
    UI.haptic('tick');
    go(next, true);
    return true;
  }
  function swipeChip(chip) {
    let S = null;
    const ic = () => chip.querySelector('.wsc-ic:not(.wsc-ghost)');
    chip.addEventListener('pointerdown', e => {
      if (!swipeOn() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      S = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null };
      try { chip.setPointerCapture(e.pointerId); } catch {}
      // (que no lo coja la vista: el gesto es del selector)
      e.stopPropagation();
    });
    chip.addEventListener('pointermove', e => {
      if (!S || e.pointerId !== S.id) return;
      const dx = e.clientX - S.x, dy = e.clientY - S.y;
      if (!S.axis && Math.hypot(dx, dy) > 8) S.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      if (!S.axis) return;
      const d = S.axis === 'x' ? dx : dy, k = Math.max(-26, Math.min(26, d * 0.6));
      const el = ic();
      if (el && UI.anim()) { el.style.transition = 'none'; el.style.transform = S.axis === 'x' ? `translateX(${k}px)` : `translateY(${k}px)`; el.style.opacity = String(1 - Math.min(.5, Math.abs(k) / 60)); }
      e.preventDefault(); e.stopPropagation();
    });
    const end = e => {
      if (!S || e.pointerId !== S.id) return;
      const s0 = S; S = null;
      const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
      const d = s0.axis === 'x' ? dx : s0.axis === 'y' ? dy : 0;
      const el = ic();
      const back = () => { if (el) { el.style.transition = 'transform .2s, opacity .2s'; el.style.transform = ''; el.style.opacity = ''; } };
      if (e.type === 'pointercancel' || Math.abs(d) < 28) { back(); return; }
      chip._swiped = true; setTimeout(() => { chip._swiped = false; }, 400);
      const dir = d < 0 ? -1 : 1;
      if (!swipeTo(chip, d < 0 ? 1 : -1, s0.axis === 'x' ? dir : 0, s0.axis === 'y' ? dir : 0)) back();
    };
    chip.addEventListener('pointerup', end);
    chip.addEventListener('pointercancel', end);
    chip.addEventListener('touchmove', e => { if (S && S.axis && e.cancelable) e.preventDefault(); }, { passive: false });
    // PC: la rueda o el trackpad encima del selector
    let acc = 0, last = 0, accT = 0;
    chip.addEventListener('wheel', e => {
      if (!swipeOn() || e.ctrlKey) return;
      e.preventDefault();
      const now = performance.now();
      if (now - accT > 250) acc = 0;
      accT = now;
      const v = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX, vert = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
      acc += e.deltaMode === 1 ? v * 30 : v;
      if (Math.abs(acc) < 40 || now - last < 380) return;
      last = now;
      const dir = acc > 0 ? -1 : 1; acc = 0;
      swipeTo(chip, dir < 0 ? 1 : -1, vert ? 0 : dir, vert ? dir : 0);
    }, { passive: false });
  }

  async function go(wid, quiet) {
    try { await W().switchTo(wid); if (!quiet) UI.haptic('tick'); }
    catch (e) { UI.toast(errText(e), { icon: 'info' }); }
  }

  function switcherHTML() {
    const s = st(), w = curWs();
    const rows = [];
    rows.push(`<button type="button" class="wsm-row ${w ? '' : 'on'}" data-wsgo="">${`<span class="wsm-me">${UI.icon('user', 18)}</span>`}<span class="wsm-tx"><b>${t('Mi calendario')}</b><small>${t('Lo tuyo, solo para ti')}</small></span>${w ? '' : UI.icon('check', 18, 'wsm-ok')}</button>`);
    if (s.signedIn) {
      for (const x of W().list()) {
        const un = W().unread(x.id);
        rows.push(`<button type="button" class="wsm-row ${w && w.id === x.id ? 'on' : ''}" data-wsgo="${esc(x.id)}" style="--wc:${esc(x.color)}">${badge(x, 34)}<span class="wsm-tx"><b>${esc(x.name)}</b><small>${faces(x.members, 4, 18)}<span>${esc(people(x.members.length))}</span></small></span>${un ? `<i class="wsm-un" title="${esc(t('Novedades'))}">${un > 9 ? '9+' : un}</i>` : ''}${w && w.id === x.id ? UI.icon('check', 18, 'wsm-ok') : ''}</button>`);
      }
      const inv = W().pendingInvites();
      if (inv.length) {
        rows.push(`<div class="wsm-t">${t('Te han invitado')}</div>`);
        for (const x of inv) rows.push(`<div class="wsm-inv" style="--wc:${esc(x.color)}">${badge(x, 30)}<span class="wsm-tx"><b>${esc(x.name)}</b><small>${esc(t('De {x}', { x: nameOf(x, x.owner) || '…' }))}</small></span><button type="button" class="btn sm pri" data-wsact="accept" data-wid="${esc(x.id)}">${t('Entrar')}</button><button type="button" class="ibtn sm" data-wsact="decline" data-wid="${esc(x.id)}" aria-label="${esc(t('No, gracias'))}" title="${esc(t('No, gracias'))}">${UI.icon('x', 16)}</button></div>`);
      }
      rows.push('<hr>');
      rows.push(`<button type="button" class="wsm-act" data-wsact="create">${UI.icon('plus', 19)}<span>${t('Crear workspace')}</span></button>`);
      rows.push(`<button type="button" class="wsm-act" data-wsact="joinask">${UI.icon('link', 19)}<span>${t('Unirme con un enlace')}</span></button>`);
      if (w) {
        rows.push(`<button type="button" class="wsm-act" data-wsact="settings" data-wid="${esc(w.id)}">${UI.icon('gear', 19)}<span>${t('Ajustes del workspace')}</span></button>`);
        if (w.isOwner) rows.push(`<button type="button" class="wsm-act" data-wsact="invite" data-wid="${esc(w.id)}">${UI.icon('share', 19)}<span>${t('Invitar a «{x}»', { x: esc(w.name) })}</span></button>`);
      }
    } else {
      rows.push(`<div class="wsm-hello"><span class="wsm-art">${UI.icon('users', 26)}</span><b>${t('Calendarios compartidos')}</b><p>${t('Crea un workspace, invita a tus amigos con un enlace y apuntad juntos planes y tareas. Se guarda para todos.')}</p>
        <button type="button" class="btn pri" data-wsact="connect" ${s.connecting ? 'disabled' : ''}>${s.connecting ? '<span class="spin"></span>' : (UI.gacc ? UI.gacc.LOGO : '')}${s.connecting ? t('Conectando…') : t('Conectar con Google')}</button>
        ${s.error ? `<small class="wsm-err">${esc(t(s.error))}</small>` : ''}</div>`);
      rows.push('<hr>');
      rows.push(`<button type="button" class="wsm-act" data-wsact="joinask">${UI.icon('link', 19)}<span>${t('Unirme con un enlace')}</span></button>`);
    }
    return rows.join('');
  }

  // repintar sin que la pantalla vuelva arriba: guarda el desplazamiento de esas cajas y lo deja igual
  function keepScroll(els, fn) {
    const pos = els.filter(Boolean).map(el => [el, el.scrollTop]);
    fn();
    for (const [el, y] of pos) if (el.isConnected && el.scrollTop !== y) el.scrollTop = y;
  }
  let pop = null;
  function closePop() { if (pop) { pop.close(); pop = null; } }
  function openSwitcher(anchor) {
    try { W().prepare(); } catch {}
    if (pop) { closePop(); return; }
    if (UI.isMobile()) {
      const L = UI.openLayer({ kind: 'sheet', cls: 'wsm-layer', label: t('Cambiar de calendario'), html: `<div class="wsm" role="menu"><div class="wsm-h sheet-head"><h2>${t('Cambiar de calendario')}</h2></div><div class="wsm-list">${switcherHTML()}</div></div>`, onClose: () => { pop = null; } });
      pop = { close: () => L.close(), repaint: () => { const b = L.body.querySelector('.wsm-list'); if (b) keepScroll([L.body, L.panel, b], () => { b.innerHTML = switcherHTML(); }); }, el: L.body };
      wireMenu(L.body);
      return;
    }
    UI.$$('.menu.open').forEach(m => m._close());
    const m = UI.h(`<div class="menu wsm wsm-pop" role="menu" aria-label="${esc(t('Cambiar de calendario'))}"><div class="wsm-list">${switcherHTML()}</div></div>`);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px';
    m.style.top = (r.bottom + 8) + 'px';
    requestAnimationFrame(() => m.classList.add('open'));
    const off = e => { if (!m.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closePop(); };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    m._close = () => closePop();
    pop = {
      el: m,
      close: () => { m.classList.remove('open'); document.removeEventListener('pointerdown', off, true); setTimeout(() => m.remove(), 180); },
      repaint: () => { const b = m.querySelector('.wsm-list'); if (b) keepScroll([m, b], () => { b.innerHTML = switcherHTML(); }); },
    };
    wireMenu(m);
    const first = m.querySelector('.wsm-row.on') || m.querySelector('button'); if (first && !UI.touchy()) first.focus();
    m.addEventListener('keydown', e => {
      const bs = UI.$$('button', m), i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
      if (e.key === 'Escape') { e.stopPropagation(); closePop(); anchor.focus(); }
    });
  }
  function wireMenu(root) {
    root.addEventListener('click', e => {
      const g = e.target.closest('[data-wsgo]');
      if (g) { closePop(); go(g.dataset.wsgo || null); }
    });
  }

  // ---------- modo workspace: clases, color, aspecto y título ----------
  function lookDefaults(w) {
    return base => {
      if (base.design === 'dot') return { dotAccent: w.color };
      const d = { accent: w.color };
      if (w.bg.kind === 'anim' && ANIMS.includes(w.bg.value)) d.bg = w.bg.value;
      else if (w.bg.kind === 'image') { d.bg = 'imagen'; d.bgImage = 'ws:' + w.id + ':' + (w.bg.value || '0'); d.bgImgColors = 'none'; }
      else if (w.bg.kind === 'color') d.bg = 'liso';
      return d;
    };
  }
  let lastMode = '';
  function applyMode() {
    const root = document.documentElement, w = curWs();
    root.classList.toggle('in-ws', !!w);
    root.classList.toggle('ws-tint', !!(w && w.bg.kind === 'color'));
    if (w) root.style.setProperty('--ws-c', w.color); else root.style.removeProperty('--ws-c');
    const key = w ? JSON.stringify([w.id, w.color, w.bg, W().bgURL(w.id) ? 1 : 0]) : '';
    if (key !== lastMode) {
      lastMode = key;
      UI.look.setScope(w ? w.id : null, w ? lookDefaults(w) : null).catch(e => console.warn(e));
    }
    paintChip();
    if (UI.app && UI.app.state) decorateTitle(UI.app.state);
    if (UI.side && document.getElementById('side') && document.getElementById('side').dataset.built) { try { UI.side.render(); } catch {} }
  }

  function decorateTitle(state) {
    const pt = document.getElementById('periodTitle'); if (!pt) return;
    const h1 = pt.querySelector('h1'); if (!h1) return;
    const w = curWs();
    pt.querySelectorAll('.ws-dname').forEach(x => x.remove());
    pt.classList.toggle('ws-title', !!w);
    if (!w) { pt.querySelectorAll('.ws-dtitle').forEach(x => x.remove()); return; }
    const month = h1.textContent.replace(/(\D)(\d{4})$/, '$1 $2'), monthHTML = h1.innerHTML;
    const len = Math.min(40, [...w.name].length);
    h1.innerHTML = `<span class="ws-name" style="--len:${len}" title="${esc(t('Ajustes del workspace'))}"><span class="ws-tb">${badge(w, 22)}</span><span class="ws-nt">${esc(w.name)}</span></span><span class="ws-month">${monthHTML}</span>`;
    document.title = w.name + ' · ' + month + ' - ZenCalendar';
    // Dot: el nombre del workspace es el título grande (con puntos si es corto, en ZenDot si es largo) y el mes, pequeño
    pt.querySelectorAll('.ws-dtitle').forEach(x => x.remove());
    if (UI.look.isDot()) {
      const n = [...w.name].length, mob = UI.isMobile();
      const big = n <= (mob ? 9 : 14) && UI.dot && UI.dot.matrix;
      const name = big ? `<span class="ws-dm">${UI.dot.matrix([{ text: w.name }], { pitch: mob ? 3.2 : 3.4 })}</span>` : `<span class="ws-dtx" style="--len:${Math.min(40, n)}">${esc(w.name)}</span>`;
      pt.insertAdjacentHTML('afterbegin', `<span class="ws-dtitle" aria-hidden="true"><span class="ws-dname" title="${esc(t('Ajustes del workspace'))}">${badge(w, mob ? 18 : 22)}${name}</span><span class="ws-dmonth">${esc(month)}</span></span>`);
    }
  }
  function chrome(state) { paintChip(); decorateTitle(state); }

  // ---------- Ajustes del workspace (y crear uno) ----------
  // Una hoja con todo: foto, nombre, icono, color, fondo, miembros (invitar y quitar), tu aspecto, salir y borrar.
  // Quien no es el dueño ve lo mismo, pero solo puede cambiar su aspecto, salir y ver quién está.
  function editDialog(wid) {
    if (!st().signedIn) return connectThen(() => editDialog(wid));
    let w = wid ? W().get(wid) : null;
    if (wid && !w) return;
    const owner = !w || w.isOwner;
    const D = w ? { name: w.name, color: w.color, icon: w.icon, bg: Object.assign({}, w.bg) } : { name: '', color: COLORS[(W().list().length * 3) % COLORS.length], icon: 'estrella', bg: { kind: 'none', value: '' } };
    let photo = null, photoURL = w && w.bg.kind === 'image' ? W().bgURL(w.id) : null, busy = false;
    let av;            // la foto de perfil: undefined = sin cambios, null = quitarla, 'data:…' = la nueva
    let q = '';        // lo que se busca en los iconos
    let offCh = () => {};
    const L = UI.openLayer({ kind: 'modal', cls: 'wsd-layer', panelCls: 'wsd-panel', label: w ? t('Ajustes del workspace') : t('Crear workspace'), html: '<div class="wsd"></div>', onClose: () => offCh() });
    const box = L.body.querySelector('.wsd');
    const isDot = UI.look.isDot();
    const avNow = () => (av !== undefined ? av : (w ? W().avatarURL(w.id) : null));
    const iconsHTML = () => {
      const ids = UI.wsIcons.search(q);
      if (!ids.length) return `<p class="mut wsd-inone">${t('No hay ningún icono con ese nombre')}</p>`;
      return ids.map(id => { const l = esc(UI.wsIcons.label(id)); return `<button type="button" class="wsd-i ${id === D.icon ? 'on' : ''}" data-ico="${id}" role="option" aria-selected="${id === D.icon}" aria-label="${l}" title="${l}">${UI.wsIcons.svg(id, 22)}</button>`; }).join('');
    };
    function paint() {
      const me = meUid();
      if (w) w = W().get(w.id) || w;
      const prevW = { name: D.name || t('Nuevo workspace'), color: D.color, icon: D.icon, avatarURL: avNow() };
      const hasAv = !!avNow();
      const own = w && W().current() && W().current().id === w.id ? Object.keys(UI.look.scopeOwn()).length : 0;
      box.style.setProperty('--wc', D.color);
      // (la caja que se desplaza se vuelve a crear: se guarda dónde estaba y se deja igual)
      const sy = (box.querySelector('.wsd-body') || {}).scrollTop || 0;
      keepScroll([L.panel, L.body], () => { box.innerHTML = `
        <div class="sheet-head wsd-head"><h2>${w ? t('Ajustes del workspace') : t('Crear workspace')}</h2><button type="button" class="ibtn" data-x aria-label="${t('Cerrar')}">${UI.icon('x', 20)}</button></div>
        <div class="layer-scroll wsd-body">
          <div class="wsd-prev">
            <span class="wsd-av">${badge(prevW, 60)}${owner ? `<label class="wsd-avbtn" title="${esc(hasAv ? t('Cambiar la foto') : t('Poner una foto'))}">${UI.icon('camera', 15)}<input type="file" accept="image/*" class="wsd-file" data-avfile aria-label="${esc(hasAv ? t('Cambiar la foto') : t('Poner una foto'))}"></label>` : ''}</span>
            <span class="wsd-pt"><b>${esc(prevW.name)}</b><small>${w ? esc(people(w.members.length)) : t('Solo tú, de momento')}</small>${w ? faces(w.members, 5, 22) : ''}</span>
          </div>
          ${owner ? `
          <div class="wsd-sec"><span class="lbl">${t('Foto de perfil')}</span>
            <div class="wsd-avrow"><label class="btn soft sm">${UI.icon('image', 17)}<span>${hasAv ? t('Cambiar la foto') : t('Elegir una foto')}</span><input type="file" accept="image/*" class="wsd-file" data-avfile></label>${UI.touchy() ? `<label class="btn soft sm">${UI.icon('camera', 17)}<span>${t('Hacer una foto')}</span><input type="file" accept="image/*" capture="user" class="wsd-file" data-avfile></label>` : ''}${hasAv ? `<button type="button" class="btn ghost sm" data-wsd="avdel">${UI.icon('x', 16)}<span>${t('Quitar la foto')}</span></button>` : ''}</div>
            <small class="mut wsd-note">${hasAv ? t('Todos ven la foto en lugar del icono.') : t('Si pones una foto, sale en lugar del icono.')}</small></div>
          <label class="fld"><span>${t('Nombre')}</span><input class="in" name="name" maxlength="60" value="${esc(D.name)}" placeholder="${esc(t('Por ejemplo: Cenas de los viernes'))}" autocomplete="off" ${w ? '' : 'autofocus'}></label>
          <div class="wsd-sec"><span class="lbl">${t('Icono')}</span>
            <label class="wsd-isearch">${UI.icon('search', 17)}<input class="in" type="search" data-isearch value="${esc(q)}" placeholder="${esc(t('Buscar: casa, viaje, fútbol…'))}" aria-label="${esc(t('Buscar un icono'))}" autocomplete="off"></label>
            <div class="wsd-icons" role="listbox" aria-label="${esc(t('Icono'))}">${iconsHTML()}</div></div>
          <div class="wsd-sec"><span class="lbl">${t('Color')}</span><div class="color-grid">${COLORS.map(c => `<button type="button" class="cdot ${c.toLowerCase() === D.color.toLowerCase() ? 'on' : ''}" style="--c:${c}" data-col="${c}" aria-label="${c}"></button>`).join('')}<label class="cdot custom" style="--c:${esc(D.color)}" title="${esc(t('Otro color'))}">${UI.icon('palette', 16)}<input type="color" value="${esc(D.color)}" aria-label="${esc(t('Otro color'))}"></label></div></div>
          <div class="wsd-sec"><span class="lbl">${t('Fondo')}</span>
            <div class="seg wsd-bgk">${[['none', t('El de cada uno')], ['color', t('Color')], ['anim', t('Animado')], ['image', t('Foto')]].map(([k, l]) => `<button type="button" data-bgk="${k}" class="${D.bg.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
            ${D.bg.kind === 'anim' ? `<div class="wsd-anims">${ANIMS.map(a => `<button type="button" class="wsd-anim ${D.bg.value === a ? 'on' : ''}" data-wsanim="${a}"><span class="bgc-th" data-bg="${a}"></span><small>${esc(t(UI.look.BGS[a] || a))}</small></button>`).join('')}</div>` : ''}
            ${D.bg.kind === 'image' ? `<div class="wsd-photo"><span class="wsd-ph" style="${photoURL ? `background-image:url('${esc(photoURL)}')` : ''}">${photoURL ? '' : UI.icon('image', 24)}</span><button type="button" class="btn soft" data-wsd="photo">${UI.icon('upload', 18)}${photoURL ? t('Cambiar foto') : t('Elegir foto')}</button></div>` : ''}
            <small class="mut wsd-note">${isDot ? t('En el diseño Dot el color del workspace es el acento.') : D.bg.kind === 'none' ? t('Cada uno lo ve con su propio fondo, con el color del workspace.') : t('Es el de todos al entrar. Cada uno lo puede retocar para sí en Ajustes → Aspecto.')}</small>
          </div>` : `<p class="mut wsd-only">${UI.icon('crown', 15)}<span>${t('Solo {x} puede cambiar la foto, el nombre, el icono, el color y el fondo.', { x: esc(nameOf(w, w.owner) || t('el dueño')) })}</span></p>`}
          ${w ? `<div class="wsd-sec"><span class="lbl">${t('Miembros')}</span><div class="wsd-mem">${w.members.map(m => `<div class="wsd-m">${face(m, 34)}<span class="wsd-mt"><b>${esc(m.name || m.email || '?')}${m.uid === me ? ` <small class="mut">(${t('tú')})</small>` : ''}</b><small>${esc(m.email || '')}</small></span>${m.owner ? `<span class="wsd-own">${UI.icon('crown', 14)}${t('Dueño')}</span>` : owner ? `<button type="button" class="ibtn sm" data-kick="${esc(m.uid)}" aria-label="${esc(t('Quitar a {x}', { x: m.name || m.email }))}" title="${esc(t('Quitar del workspace'))}">${UI.icon('x', 16)}</button>` : ''}</div>`).join('')}
            ${w.invitedEmails.length && owner ? w.invitedEmails.map(e => `<div class="wsd-m pend"><span class="ws-face" style="--fs:34px;--fh:${hue(e)}">${UI.icon('mail', 16)}</span><span class="wsd-mt"><b>${esc(e)}</b><small>${t('Invitado, aún no ha entrado')}</small></span></div>`).join('') : ''}</div>
            ${owner ? `<button type="button" class="btn soft wsd-inv" data-wsact="invite" data-wid="${esc(w.id)}">${UI.icon('share', 18)}${t('Invitar')}</button>` : ''}</div>
          <div class="wsd-sec"><span class="lbl">${t('Tu aspecto')}</span>
            <div class="wsd-look"><span>${t('Solo para ti: el fondo y los colores con los que ves «{x}». A los demás no les cambia nada.', { x: esc(w.name) })}</span>
            <div class="wsd-lookb"><button type="button" class="btn soft sm" data-wsd="look">${UI.icon('palette', 17)}<span>${t('Cambiar mi aspecto')}</span></button>${own ? `<button type="button" class="btn ghost sm" data-wsd="lookreset">${UI.icon('restore', 16)}<span>${t('Como al principio')}</span></button>` : ''}</div></div></div>` : ''}
        </div>
        <div class="ed-foot wsd-foot">
          ${w ? (owner ? `<button type="button" class="btn ghost danger" data-wsd="delete">${UI.icon('trash', 18)}<span>${t('Borrar workspace')}</span></button>` : `<button type="button" class="btn ghost danger" data-wsd="leave">${UI.icon('door', 18)}<span>${t('Salir del workspace')}</span></button>`) : ''}
          <span style="flex:1"></span>
          ${owner ? `<button type="button" class="btn ghost" data-x>${t('Cancelar')}</button><button type="button" class="btn pri" data-wsd="save" ${busy ? 'disabled' : ''}>${busy ? '<span class="spin"></span>' : ''}${w ? t('Guardar') : t('Crear')}</button>` : `<button type="button" class="btn pri" data-x>${t('Listo')}</button>`}
        </div>`; });
      box.querySelectorAll('.bgc-th').forEach(el => { try { el.appendChild(UI.bg.thumb(el.dataset.bg, 96, 60)); } catch {} });
      const nb = box.querySelector('.wsd-body'); if (nb && sy) nb.scrollTop = sy;
      requestAnimationFrame(() => box.querySelectorAll('.seg').forEach(UI.paintSeg));
    }
    const read = () => { const i = box.querySelector('input[name=name]'); if (i) D.name = i.value; };
    box.addEventListener('input', e => {
      if (e.target.name === 'name') { D.name = e.target.value; const b = box.querySelector('.wsd-pt b'); if (b) b.textContent = D.name || t('Nuevo workspace'); }
      if (e.target.matches('[data-isearch]')) { q = e.target.value; const g = box.querySelector('.wsd-icons'); if (g) g.innerHTML = iconsHTML(); }
      if (e.target.type === 'color') { D.color = e.target.value; read(); paint(); }
    });
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-isearch]')) { e.preventDefault(); const f = box.querySelector('.wsd-i'); if (f) f.click(); } });
    // la foto de perfil: elegirla (o hacerla con la cámara), recortarla y verla al momento; se guarda con «Guardar»
    box.addEventListener('change', async e => {
      if (!e.target.matches('[data-avfile]')) return;
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      read();
      const url = await cropPhoto(f);
      if (url) { av = url; paint(); }
    });
    box.addEventListener('click', async e => {
      if (e.target.closest('[data-x]')) { L.close(); return; }
      const ic = e.target.closest('[data-ico]'); if (ic) { read(); D.icon = ic.dataset.ico; box.querySelectorAll('.wsd-i').forEach(b => { const on = b === ic; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }); const bd = box.querySelector('.wsd-prev .ws-badge'); if (bd && !avNow()) bd.outerHTML = badge({ color: D.color, icon: D.icon, avatarURL: null }, 60); UI.haptic('tick'); return; }
      const co = e.target.closest('[data-col]'); if (co) { read(); D.color = co.dataset.col; paint(); return; }
      const bk = e.target.closest('[data-bgk]'); if (bk) { read(); D.bg = { kind: bk.dataset.bgk, value: bk.dataset.bgk === 'anim' ? (ANIMS.includes(D.bg.value) ? D.bg.value : 'aurora') : '' }; paint(); if (D.bg.kind === 'image' && !photoURL) pickPhoto(); return; }
      const an = e.target.closest('[data-wsanim]'); if (an) { D.bg.value = an.dataset.wsanim; paint(); return; }
      const kick = e.target.closest('[data-kick]');
      if (kick) {
        const nm = nameOf(w, kick.dataset.kick);
        const ok = await UI.confirm(t('¿Quitar a {x}?', { x: nm }), t('Dejará de ver este workspace. El enlace de invitación cambia para que no pueda volver a entrar con el de antes.'), { ok: t('Quitar'), danger: true, icon: 'users' });
        if (!ok) return;
        try { read(); await W().removeMember(w.id, kick.dataset.kick); paint(); UI.toast(t('{x} ya no está en el workspace', { x: nm }), { icon: 'check' }); } catch (err) { UI.toast(errText(err)); }
        return;
      }
      const a = e.target.closest('[data-wsd]'); if (!a) return;
      const act = a.dataset.wsd;
      if (act === 'photo') pickPhoto();
      if (act === 'avdel') { read(); av = null; paint(); }
      if (act === 'look') {
        // tu aspecto se cambia en Ajustes → Aspecto estando dentro del workspace
        L.close();
        if (!W().current() || W().current().id !== w.id) await go(w.id);
        UI.settings.open('look');
      }
      if (act === 'lookreset') { await UI.look.resetScope(); paint(); UI.toast(t('Como al principio'), { icon: 'check' }); }
      if (act === 'save') {
        read();
        if (!D.name.trim()) { const i = box.querySelector('input[name=name]'); if (i) { i.focus(); i.classList.add('bad'); } UI.toast(t('Ponle un nombre')); return; }
        busy = true; paint();
        try {
          const bg = D.bg.kind === 'image' ? (w && w.bg.kind === 'image' && !photo ? w.bg : { kind: 'none', value: '' }) : D.bg;
          let x;
          if (w) x = await W().update(w.id, { name: D.name, color: D.color, icon: D.icon, bg });
          else x = await W().create({ name: D.name, color: D.color, icon: D.icon, bg });
          if (photo) await W().setBackground(x.id, photo);
          else if (w && w.bg.kind === 'image' && D.bg.kind !== 'image') await W().setBackground(x.id, null);
          if (av !== undefined && (av || (w && w.avatar))) await W().setAvatar(x.id, av);
          L.close('saved');
          if (!w) {
            await W().switchTo(x.id);
            UI.confetti(innerWidth / 2, 120, 24);
            UI.toast(t('«{x}» creado. Ahora invita a quien quieras.', { x: x.name }), { icon: 'check', action: { label: t('Invitar'), fn: () => inviteSheet(x.id) } });
          } else UI.toast(t('Guardado'), { icon: 'check' });
        } catch (err) { busy = false; paint(); UI.toast(errText(err)); }
      }
      if (act === 'delete') {
        const ok = await UI.confirm(t('¿Borrar «{x}»?', { x: w.name }), t('Se borra para todos, con sus eventos y tareas. No se puede deshacer.'), { ok: t('Borrar'), danger: true, icon: 'trash' });
        if (!ok) return;
        try { await W().remove(w.id); L.close(); UI.toast(t('Workspace borrado'), { icon: 'trash' }); } catch (err) { UI.toast(errText(err)); }
      }
      if (act === 'leave') {
        const ok = await UI.confirm(t('¿Salir de «{x}»?', { x: w.name }), t('Dejarás de verlo. Para volver, te tendrán que invitar otra vez.'), { ok: t('Salir'), danger: true, icon: 'door' });
        if (!ok) return;
        try { await W().leave(w.id); L.close(); UI.toast(t('Has salido de «{x}»', { x: w.name }), { icon: 'door' }); } catch (err) { UI.toast(errText(err)); }
      }
    });
    async function pickPhoto() {
      const [f] = await UI.pickFile({ accept: 'image/*' });
      if (!f) { if (!photoURL) { D.bg = { kind: 'none', value: '' }; paint(); } return; }
      photo = f; photoURL = URL.createObjectURL(f); D.bg = { kind: 'image', value: '' }; read(); paint();
    }
    // si otro cambia el workspace mientras está abierta (o llega su foto), se repinta sin perder lo que llevas
    if (w) offCh = W().on('change', () => { if (!W().get(w.id)) { L.close(); return; } if (!busy && !box.contains(document.activeElement && document.activeElement.matches('input:not([type=file])') ? document.activeElement : null)) { read(); paint(); } });
    paint();
    return L;
  }

  // ---------- recortar la foto de perfil: cuadrada, arrastrando y con zoom ----------
  function cropPhoto(file) {
    return new Promise(async res => {
      let bmp;
      try { bmp = await createImageBitmap(file); } catch { UI.toast(t('No se ha podido abrir esa foto')); res(null); return; }
      const url = URL.createObjectURL(file);
      const V = Math.max(180, Math.min(300, innerWidth - 80));
      const W0 = bmp.width, H0 = bmp.height, cover = V / Math.min(W0, H0);
      let z = 1, ox = 0, oy = 0, done = false;
      const L = UI.openLayer({ kind: 'modal', cls: 'wsc-layer', panelCls: 'dlg wsc-panel', label: t('Recortar la foto'),
        html: `<div class="dlg-in wsc"><h2>${t('Recortar la foto')}</h2><p class="mut">${t('Arrástrala para encuadrarla y acércala con la barra.')}</p>
          <div class="wsc-vp" style="--v:${V}px"><img src="${url}" alt="" draggable="false"><i class="wsc-frame"></i></div>
          <label class="wsc-zoom">${UI.icon('minus', 16)}<input type="range" min="1" max="4" step="0.01" value="1" aria-label="${esc(t('Acercar'))}">${UI.icon('plus', 16)}</label>
          <div class="dlg-acts"><button type="button" class="btn ghost" data-c="no">${t('Cancelar')}</button><button type="button" class="btn pri" data-c="ok">${t('Usar esta foto')}</button></div></div>`,
        onClose: () => { URL.revokeObjectURL(url); if (!done) res(null); } });
      const vp = L.body.querySelector('.wsc-vp'), img = vp.querySelector('img'), rng = L.body.querySelector('.wsc-zoom input');
      const size = () => [W0 * cover * z, H0 * cover * z];
      function apply() {
        const [w, h] = size(), mx = (w - V) / 2, my = (h - V) / 2;
        ox = Math.max(-mx, Math.min(mx, ox)); oy = Math.max(-my, Math.min(my, oy));
        img.style.width = w + 'px'; img.style.height = h + 'px';
        img.style.transform = `translate(${V / 2 - w / 2 + ox}px, ${V / 2 - h / 2 + oy}px)`;
      }
      const zoomTo = nz => { z = Math.max(1, Math.min(4, nz)); rng.value = String(z); apply(); };
      const pts = new Map(); let pinch = null;
      vp.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); try { vp.setPointerCapture(e.pointerId); } catch {} if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; } e.preventDefault(); });
      vp.addEventListener('pointermove', e => {
        const p = pts.get(e.pointerId); if (!p) return;
        if (pts.size === 2 && pinch) { pts.set(e.pointerId, [e.clientX, e.clientY]); const [a, b] = [...pts.values()]; zoomTo(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / (pinch.d || 1)); return; }
        ox += e.clientX - p[0]; oy += e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]); apply();
      });
      const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
      vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
      vp.addEventListener('wheel', e => { e.preventDefault(); zoomTo(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
      rng.addEventListener('input', () => zoomTo(+rng.value));
      L.body.addEventListener('click', e => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        if (b.dataset.c === 'no') { L.close(); return; }
        const k = cover * z, s = V / k;
        const sx = W0 / 2 - ox / k - s / 2, sy = H0 / 2 - oy / k - s / 2;
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.drawImage(bmp, sx, sy, s, s, 0, 0, 256, 256);
        if (bmp.close) bmp.close();
        done = true; L.close('ok');
        res(W().compressAvatar(cv));
      });
      apply();
    });
  }

  // ---------- invitar ----------
  function inviteSheet(wid) {
    const w = W().get(wid); if (!w) return;
    if (!w.isOwner) { UI.toast(t('Solo {x} puede invitar', { x: nameOf(w, w.owner) || t('el dueño') })); return; }
    const L = UI.openLayer({ kind: 'modal', cls: 'wsi-layer', panelCls: 'dlg wsi-panel', label: t('Invitar'), html: '<div class="dlg-in wsi"></div>' });
    const box = L.body.querySelector('.wsi');
    const msg = () => t('Únete a «{x}» en ZenCalendar, nuestro calendario compartido:', { x: w.name });
    function paint() {
      const x = W().get(wid) || w, link = W().inviteLink(wid);
      box.style.setProperty('--wc', x.color);
      const sy = [L.panel, L.body].map(el => [el, el.scrollTop]);
      requestAnimationFrame(() => { for (const [el, y] of sy) if (el.scrollTop !== y) el.scrollTop = y; });
      box.innerHTML = `<div class="wsi-top">${badge(x, 40)}<span><h2>${t('Invitar a «{x}»', { x: esc(x.name) })}</h2><small class="mut">${t('Quien tenga el enlace puede entrar y editar.')}</small></span></div>
        <div class="wsi-link"><input class="in" readonly value="${esc(link)}" aria-label="${esc(t('Enlace de invitación'))}"><button type="button" class="btn pri" data-wi="copy">${UI.icon('copy', 18)}${t('Copiar')}</button></div>
        <div class="wsi-btns">
          <button type="button" class="wsi-b wa" data-wi="wa">${UI.icon('whatsapp', 22)}<span>WhatsApp</span></button>
          <button type="button" class="wsi-b" data-wi="mail">${UI.icon('mail', 22)}<span>${t('Correo')}</span></button>
          <button type="button" class="wsi-b" data-wi="share">${UI.icon('share', 22)}<span>${t('Compartir…')}</span></button>
        </div>
        <div class="wsi-sec"><b>${t('Invitar por correo de Google')}</b><small class="mut">${t('Le saldrá en su ZenCalendar al conectar esa cuenta, sin enlace.')}</small>
          <form class="wsi-mail"><input class="in" type="email" name="mail" placeholder="${esc(t('nombre@gmail.com'))}" autocomplete="off" aria-label="${esc(t('Correo de Google'))}"><button class="btn soft">${t('Invitar')}</button></form>
          ${x.invitedEmails.map(e => `<div class="wsi-pend">${UI.icon('mail', 16)}<span>${esc(e)}</span><button type="button" class="ibtn sm" data-unmail="${esc(e)}" aria-label="${esc(t('Quitar invitación'))}">${UI.icon('x', 15)}</button></div>`).join('')}</div>
        <div class="dlg-acts"><button type="button" class="btn ghost" data-wi="regen">${UI.icon('refresh', 17)}${t('Cambiar el enlace')}</button><span style="flex:1"></span><button type="button" class="btn pri" data-wi="close">${t('Listo')}</button></div>`;
    }
    box.addEventListener('click', async e => {
      const em = e.target.closest('[data-unmail]');
      if (em) { try { await W().uninviteEmail(wid, em.dataset.unmail); paint(); } catch (err) { UI.toast(errText(err)); } return; }
      const b = e.target.closest('[data-wi]'); if (!b) return;
      const link = W().inviteLink(wid), a = b.dataset.wi;
      if (a === 'close') L.close();
      if (a === 'copy') {
        let ok = false;
        try { await navigator.clipboard.writeText(link); ok = true; } catch { const i = box.querySelector('.wsi-link input'); i.select(); try { ok = document.execCommand('copy'); } catch {} }
        UI.toast(ok ? t('Enlace copiado') : t('Selecciona el enlace y cópialo'), { icon: 'check' });
        UI.haptic('ok');
      }
      if (a === 'wa') ZC.platform.share({ title: w.name, text: msg(), url: link, app: 'whatsapp' });
      if (a === 'mail') {
        const r = await ZC.platform.share({ title: t('Te invito a «{x}»', { x: w.name }), text: msg(), url: link, app: 'email' });
        if (r === 'copied') UI.toast(t('Enlace copiado'), { icon: 'check' });
      }
      if (a === 'share') { const r = await ZC.platform.share({ title: t('Te invito a «{x}»', { x: w.name }), text: msg(), url: link }); if (r === 'copied') UI.toast(t('Enlace copiado'), { icon: 'check' }); }
      if (a === 'regen') {
        const ok = await UI.confirm(t('¿Cambiar el enlace?'), t('El enlace de antes dejará de funcionar. Los que ya están dentro siguen igual.'), { ok: t('Cambiar'), icon: 'refresh' });
        if (!ok) return;
        try { await W().regenerateLink(wid); paint(); UI.toast(t('Enlace nuevo listo'), { icon: 'check' }); } catch (err) { UI.toast(errText(err)); }
      }
    });
    box.addEventListener('submit', async e => {
      e.preventDefault();
      const i = box.querySelector('input[name=mail]');
      try { await W().inviteEmail(wid, i.value); UI.toast(t('Invitación enviada a {x}', { x: i.value.trim() }), { icon: 'check' }); paint(); } catch (err) { UI.toast(errText(err)); }
    });
    paint();
  }

  // ---------- entrar con un enlace ----------
  async function joinAsk() {
    const v = await UI.prompt(t('Unirme con un enlace'), '', { ok: t('Seguir'), placeholder: 'https://luckicla.github.io/ZenCalendar/w/#…', label: t('Pega aquí el enlace que te han pasado') });
    if (!v) return;
    if (!W().parseCode(v)) { UI.toast(t('Ese enlace no parece de ZenCalendar')); return; }
    joinFlow(v);
  }
  function joinFlow(code) {
    if (!on()) { UI.toast(t('Esta versión aún no tiene configurados los workspaces')); return; }
    const L = UI.openLayer({ kind: 'modal', cls: 'wsj-layer', panelCls: 'dlg wsj-panel', label: t('Invitación'), html: '<div class="wsj"></div>' });
    const box = L.body.querySelector('.wsj');
    let info = null, err = null, busy = false;
    function paint() {
      const s = st();
      const c = info ? info.color : 'var(--a1)';
      box.style.setProperty('--wc', c);
      let mid;
      if (err) mid = `<div class="wsj-art bad">${UI.icon('link', 34)}</div><h2>${t('Este enlace ya no vale')}</h2><p>${esc(t(err))}</p><div class="dlg-acts"><button type="button" class="btn pri" data-j="close">${t('Cerrar')}</button></div>`;
      else if (!s.signedIn) mid = `<div class="wsj-art">${UI.icon('users', 34)}</div><p class="wsj-k">${t('Te han invitado a un workspace')}</p><h2>${t('Calendario compartido')}</h2><p>${t('Para entrar, conecta tu cuenta de Google. Así los demás sabrán quién eres.')}</p>
        <div class="dlg-acts"><button type="button" class="btn ghost" data-j="close">${t('Ahora no')}</button><button type="button" class="btn pri" data-j="conn" ${busy || s.connecting ? 'disabled' : ''}>${busy || s.connecting ? '<span class="spin"></span>' : (UI.gacc ? UI.gacc.LOGO : '')}${t('Conectar con Google')}</button></div>`;
      else if (!info) mid = `<div class="wsj-art"><span class="spin"></span></div><p>${t('Mirando la invitación…')}</p>`;
      else mid = `<div class="wsj-badge">${badge(info, 72)}</div><p class="wsj-k">${info.member ? t('Ya estás en') : t('Te han invitado a')}</p><h2>${esc(info.name)}</h2><p class="mut">${esc([info.ownerName ? t('De {x}', { x: info.ownerName }) : '', people(info.count || 1)].filter(Boolean).join(' · '))}</p>
        <div class="dlg-acts"><button type="button" class="btn ghost" data-j="close">${t('Ahora no')}</button><button type="button" class="btn pri lg" data-j="join" ${busy ? 'disabled' : ''}>${busy ? '<span class="spin"></span>' : ''}${info.member ? t('Abrir') : t('Entrar')}</button></div>`;
      keepScroll([L.panel, L.body], () => { box.innerHTML = mid; });
    }
    async function look() {
      if (!st().signedIn) { paint(); return; }
      try { info = await W().peek(code); } catch (e) { err = (e && e.message) || 'Este enlace ya no vale: pide uno nuevo'; }
      paint();
    }
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-j]'); if (!b) return;
      if (b.dataset.j === 'close') L.close();
      if (b.dataset.j === 'conn') { busy = true; paint(); try { await W().connect(); } catch (er) { UI.toast(errText(er)); } busy = false; look(); }
      if (b.dataset.j === 'join') {
        busy = true; paint();
        try { const x = await W().join(code); L.close(); if (x) { UI.confetti(innerWidth / 2, 140, 26); UI.toast(info.member ? t('Estás en «{x}»', { x: x.name }) : t('¡Bienvenido a «{x}»!', { x: x.name }), { icon: 'check' }); } }
        catch (er) { busy = false; err = er.message; paint(); }
      }
    });
    paint(); look();
  }

  // conectar y, si va bien, seguir con lo que se quería hacer
  async function connectThen(fn) {
    try { await W().connect(); if (fn) fn(); }
    catch (e) { UI.toast(errText(e), { icon: 'info' }); }
    if (pop) pop.repaint();
  }

  // ---------- clics con data-wsact (menú, Ajustes, panel lateral) ----------
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-wsact]'); if (!b) return;
    const a = b.dataset.wsact, wid = b.dataset.wid;
    if (a !== 'connect' && a !== 'dim' && a !== 'mine') closePop();
    if (a === 'connect') { b.disabled = true; await connectThen(); refreshAll(); }
    else if (a === 'create') editDialog(null);
    else if (a === 'joinask') joinAsk();
    else if (a === 'edit' || a === 'settings') { const id = wid || (curWs() || {}).id; if (id) editDialog(id); }
    else if (a === 'invite') inviteSheet(wid || (curWs() || {}).id);
    else if (a === 'open') { if (UI.settings.isOpen()) UI.back(); go(wid); }
    else if (a === 'accept') { try { const x = await W().acceptInvite(wid); if (x) UI.toast(t('¡Bienvenido a «{x}»!', { x: x.name }), { icon: 'check' }); } catch (er) { UI.toast(errText(er)); } }
    else if (a === 'decline') { try { await W().declineInvite(wid); } catch (er) { UI.toast(errText(er)); } }
    else if (a === 'dim') { W().setDim(!W().dim()); refreshAll(); }
    else if (a === 'mine') { mine = !mine; ZC.store.local('ws.mine', mine || null); UI.app.render(); try { UI.side.render(); } catch {} }
    else if (a === 'signout') {
      const ok = await UI.confirm(t('¿Cerrar la sesión de los workspaces?'), t('Dejarás de verlos en este dispositivo. No se borra nada: vuelve a conectar cuando quieras.'), { ok: t('Cerrar sesión') });
      if (ok) { await W().signOut(); refreshAll(); }
    }
  });

  // ---------- panel lateral, tareas y editor ----------
  let mine = !!ZC.store.local('ws.mine');
  const mineActive = () => !!(mine && curWs());
  function sideHTML() {
    const w = curWs(); if (!w) return '';
    const dim = W().dim();
    return `<header><h3>${t('Workspace')}</h3><button class="ibtn sm" data-wsact="settings" data-wid="${esc(w.id)}" aria-label="${esc(t('Ajustes del workspace'))}" title="${esc(t('Ajustes del workspace'))}">${UI.icon('gear', 18)}</button></header>
      <button type="button" class="ws-side" style="--wc:${esc(w.color)}" data-wsact="settings" data-wid="${esc(w.id)}" aria-label="${esc(t('Ajustes de «{x}»', { x: w.name }))}">${badge(w, 40)}<span class="ws-side-t"><b>${esc(w.name)}</b><small>${faces(w.members, 5, 20)}<span>${esc(people(w.members.length))}</span></small></span>${UI.icon('chevR', 18, 'ws-side-go')}</button>
      ${w.isOwner ? `<button type="button" class="btn soft sm ws-side-inv" data-wsact="invite" data-wid="${esc(w.id)}">${UI.icon('share', 17)}${t('Invitar')}</button>` : ''}
      <div class="ws-side-row" role="button" tabindex="0" data-wsact="dim"><span>${t('Ver también mi calendario')}</span><button type="button" class="sw" role="switch" aria-checked="${dim}" aria-label="${esc(t('Ver también mi calendario'))}" tabindex="-1"></button></div>`;
  }
  function tasksToggle() {
    if (!curWs()) return '';
    return `<button type="button" class="chip ws-mine ${mine ? 'on' : ''}" data-wsact="mine" aria-pressed="${mine}">${UI.icon('user', 15)}${t('Mis tareas')}</button>`;
  }
  const isMine = ev => !mineActive() || ev.assignee === meUid() || (!ev.assignee && ev.createdBy === meUid());
  function forChip(ev) {
    if (!ev || !ZC.store.isWsId(ev.calendarId)) return '';
    const w = W().get(ev.calendarId.slice(3)); if (!w) return '';
    if (ev.assignee) { const m = w.members.find(x => x.uid === ev.assignee); if (m) return `<span class="ws-for">${face(m, 16)}${esc(ev.assignee === meUid() ? t('Para ti') : t('Para: {x}', { x: m.name || m.email }))}</span>`; }
    return '';
  }
  // editor: «Para:» (tareas de un workspace)
  function editorRow(D) {
    if (!D || !ZC.store.isWsId(D.calendarId) || D.kind !== 'task') return '';
    const w = W().get(D.calendarId.slice(3)); if (!w) return '';
    const chip = (uid, label, m) => `<button type="button" class="chip ${(D.assignee || null) === uid ? 'on' : ''}" data-assign="${esc(uid || '')}">${m ? face(m, 18) : UI.icon('users', 15)}${esc(label)}</button>`;
    return `<div class="ed-row top ws-assign"><span class="ed-ic">${UI.icon('user', 20)}</span><div class="ws-as"><span class="lbl">${t('Para')}</span><div class="chips-row">${chip(null, t('Cualquiera'))}${w.members.map(m => chip(m.uid, m.uid === meUid() ? t('Para mí') : (m.name || m.email), m)).join('')}</div></div></div>`;
  }
  function detailRow(ev) {
    if (!ev || !ZC.store.isWsId(ev.calendarId)) return '';
    const w = W().get(ev.calendarId.slice(3)); if (!w) return '';
    const by = w.members.find(x => x.uid === ev.createdBy);
    const to = ev.assignee && w.members.find(x => x.uid === ev.assignee);
    return `<div class="ws-det">${badge(w, 22)}<span>${esc(w.name)}</span>${by ? `<span class="ws-by">${face(by, 20)}${esc(ev.createdBy === meUid() ? t('Lo añadiste tú') : t('Lo añadió {x}', { x: by.name || by.email }))}</span>` : ''}${to ? `<span class="ws-by">${face(to, 20)}${esc(ev.assignee === meUid() ? t('Para ti') : t('Para: {x}', { x: to.name || to.email }))}</span>` : ''}</div>`;
  }

  // ---------- avisos ----------
  const NOTE = { add: '{who} ha añadido «{title}»', edit: '{who} ha cambiado «{title}»', delete: '{who} ha borrado «{title}»', assign: '{who} te ha asignado «{title}»', done: '{who} ha completado «{title}»' };
  let noteQ = [], noteT = 0;
  function onNotice(n) {
    if (!n) return;
    if (n.kind === 'error') { UI.toast(t(n.title || 'No se pudo guardar en el workspace'), { icon: 'info' }); return; }
    if (n.kind === 'invite') { UI.toast(t('{who} te ha invitado a «{title}»', { who: n.who || t('Alguien'), title: n.title }), { art: n.ws ? badge(n.ws, 22, 'tb') : '', icon: 'users', action: { label: t('Ver'), fn: () => openSwitcher(document.getElementById('wsChip')) } }); paintChip(); return; }
    if (n.kind === 'removed') { UI.toast(t('Ya no estás en «{title}»', { title: n.title }), { art: n.ws ? badge(Object.assign({}, n.ws, { avatarURL: null }), 22, 'tb') : '', icon: 'door' }); return; }
    noteQ.push(n);
    clearTimeout(noteT);
    noteT = setTimeout(flushNotes, 350);
  }
  function flushNotes() {
    const q = noteQ; noteQ = [];
    const byWs = new Map();
    for (const n of q) { if (!byWs.has(n.wid)) byWs.set(n.wid, []); byWs.get(n.wid).push(n); }
    for (const [wid, list] of byWs) {
      const n = list[list.length - 1], w = n.ws || W().get(wid) || { name: '' };
      let text = t(NOTE[n.kind] || NOTE.edit, { who: n.who || t('Alguien'), title: n.title || t('(sin título)') });
      if (list.length > 1) text += ' ' + t('y {n} más', { n: list.length - 1 });
      const full = n.here ? text : w.name + ' · ' + text;
      const ws = W().get(wid) || w;
      if (!n.hidden) UI.toast(full, { art: ws.color ? badge(ws, 22, 'tb') : '', icon: 'users', ms: 5200, action: n.here ? (n.kind !== 'delete' && n.id ? { label: t('Ver'), fn: () => openItem(n.id) } : null) : { label: t('Ver'), fn: () => go(wid) } });
      // (la app en segundo plano, solo en la web: en Android y Windows avisa el nativo)
      else if (ZC.platform.kind === 'web') ZC.platform.notify({ title: w.name, body: text, tag: 'ws-' + wid, data: { action: 'workspace', wid, id: wid } });
    }
    paintChip();
    if (pop) pop.repaint();
  }
  function openItem(id) {
    const ev = ZC.store.get(id); if (!ev) return;
    try { UI.editor.detail(UI.cal.occOf(ev)); } catch {}
  }
  function onOpen(o) {
    if (!o) return;
    if (o.action === 'join' && o.code) joinFlow(o.code);
    if (o.action === 'workspace' && (o.wid || o.id)) {
      const wid = o.wid || o.id;
      if (W().get(wid)) go(wid);
      else { const off = W().on('change', () => { if (W().get(wid)) { off(); go(wid); } }); setTimeout(off, 15000); }
    }
  }

  // ---------- Ajustes → Workspaces ----------
  function settingsSection() {
    const P = UI.settings.parts, s = st();
    if (!on()) return P.card(`<div class="ws-hero"><span class="wsm-art">${UI.icon('users', 30)}</span><h2>${t('Calendarios compartidos')}</h2><p>${t('Crea un workspace, invita a tus amigos con un enlace y apuntad juntos planes y tareas. Se guarda para todos.')}</p></div><p class="note warn">${UI.icon('info', 15)}${t('Esta versión aún no tiene configurados los workspaces')}</p>`);
    if (!s.signedIn) {
      return P.card(`<div class="ws-hero"><span class="wsm-art">${UI.icon('users', 30)}</span><h2>${t('Calendarios compartidos')}</h2><p>${t('Crea un workspace, invita a tus amigos con un enlace y apuntad juntos planes y tareas. Se guarda para todos.')}</p>
        ${s.error ? `<p class="note warn">${UI.icon('info', 15)}${esc(t(s.error))}</p>` : ''}
        <div class="wid-btns" style="justify-content:center"><button type="button" class="btn lg gbtn" data-wsact="connect" ${s.connecting ? 'disabled' : ''}>${s.connecting ? '<span class="spin"></span>' : (UI.gacc ? UI.gacc.LOGO : '')}${s.connecting ? t('Conectando…') : t('Conectar con Google')}</button><button type="button" class="btn soft" data-wsact="joinask">${UI.icon('link', 18)}${t('Unirme con un enlace')}</button></div></div>`)
        + P.card(P.h3(t('Cómo funciona')) + howto());
    }
    const u = W().user() || {}, list = W().list(), inv = W().pendingInvites(), cur = curWs();
    return P.card(`<div class="acct">${face(Object.assign({ uid: u.uid }, u), 44)}<div><b>${esc(u.name || t('Tu cuenta'))}</b><small>${esc(u.email || '')}</small></div></div>`)
      + (inv.length ? P.card(P.h3(t('Te han invitado')) + inv.map(x => `<div class="wsm-inv" style="--wc:${esc(x.color)}">${badge(x, 34)}<span class="wsm-tx"><b>${esc(x.name)}</b><small>${esc(t('De {x}', { x: nameOf(x, x.owner) || '…' }))}</small></span><button type="button" class="btn sm pri" data-wsact="accept" data-wid="${esc(x.id)}">${t('Entrar')}</button><button type="button" class="ibtn sm" data-wsact="decline" data-wid="${esc(x.id)}" aria-label="${esc(t('No, gracias'))}">${UI.icon('x', 16)}</button></div>`).join('')) : '')
      + P.card(P.h3(t('Tus workspaces'), list.length ? '' : t('Aún no tienes ninguno. Crea uno o entra con un enlace.'))
        + `<div class="ws-list">${list.map(x => `<div class="ws-li" style="--wc:${esc(x.color)}">${badge(x, 38)}<span class="wsm-tx"><b>${esc(x.name)}${x.isOwner ? ` <i class="ws-tag">${t('Tuyo')}</i>` : ''}</b><small>${faces(x.members, 4, 18)}<span>${esc(people(x.members.length))}</span></small></span>
          ${cur && cur.id === x.id ? `<span class="ws-tag on">${t('Abierto')}</span>` : `<button type="button" class="btn sm soft" data-wsact="open" data-wid="${esc(x.id)}">${t('Abrir')}</button>`}<button type="button" class="ibtn sm" data-wsact="settings" data-wid="${esc(x.id)}" aria-label="${esc(t('Ajustes de «{x}»', { x: x.name }))}" title="${esc(t('Ajustes del workspace'))}">${UI.icon('gear', 18)}</button></div>`).join('')}</div>
        <div class="wid-btns"><button type="button" class="btn pri" data-wsact="create">${UI.icon('plus', 18)}${t('Crear workspace')}</button><button type="button" class="btn soft" data-wsact="joinask">${UI.icon('link', 18)}${t('Unirme con un enlace')}</button></div>`)
      + P.card(P.h3(t('Dentro de un workspace'))
        + P.row(t('Ver también mi calendario'), t('Tus eventos salen atenuados detrás de los del workspace.'), `<button type="button" class="sw" role="switch" data-wsact="dim" aria-checked="${W().dim()}" aria-label="${esc(t('Ver también mi calendario'))}"></button>`)
        + `<p class="mut ws-p">${t('El aspecto de cada workspace (fondo, colores…) se cambia en Aspecto mientras estás dentro: solo para ti.')}</p>`)
      + P.card(P.h3(t('Cómo funciona')) + howto() + `<div class="wid-btns"><button type="button" class="btn ghost" data-wsact="signout">${UI.icon('logout', 18)}${t('Cerrar sesión de los workspaces')}</button></div>`);
  }
  const howto = () => `<ul class="howto"><li>${t('Arriba, en «Mi calendario», cambias de tu calendario a un workspace y vuelves.')}</li><li>${t('Todos los miembros añaden y cambian eventos y tareas; os llega un aviso cuando alguien toca algo.')}</li><li>${t('Solo quien lo crea cambia el nombre, el color y el fondo, invita y quita gente.')}</li><li>${t('Se guarda en Firebase (de Google). Tu calendario de siempre sigue siendo solo tuyo.')}</li></ul>`;

  // aviso en Aspecto/Fondo mientras estás en un workspace
  function wrapLookSections() {
    const S = UI.settings.sections;
    for (const k of ['look', 'bg']) {
      const orig = S[k]; if (!orig || orig._ws) continue;
      S[k] = () => { const w = curWs(); return (w ? `<div class="ws-lookbar" style="--wc:${esc(w.color)}">${badge(w, 26)}<span>${t('Cambias el aspecto de «{x}», solo para ti. Tu calendario no cambia.', { x: esc(w.name) })}</span>${Object.keys(UI.look.scopeOwn()).length ? `<button type="button" class="btn sm ghost" data-wsact="lookreset">${t('Como al principio')}</button>` : ''}</div>` : '') + orig(); };
      S[k]._ws = true;
    }
    document.addEventListener('click', async e => { if (e.target.closest('[data-wsact="lookreset"]')) { await UI.look.resetScope(); UI.settings.refresh(); } });
  }

  function refreshAll() {
    applyMode();
    if (pop) pop.repaint();
    try { if (UI.settings.isOpen() && UI.settings.current() === 'ws') UI.settings.refresh(); } catch {}
  }

  // ---------- arranque ----------
  function init() {
    if (!W()) return;
    UI.settings.addSection('ws', 'Workspaces', 'users', 'Calendarios compartidos con amigos', settingsSection, 'drive');
    wrapLookSections();
    W().on('change', refreshAll);
    W().on('state', () => { paintChip(); if (pop) pop.repaint(); try { if (UI.settings.isOpen() && UI.settings.current() === 'ws') UI.settings.refresh(); } catch {} });
    W().on('notice', onNotice);
    try { ZC.i18n && document.addEventListener('zc-lang', () => W().refreshCreds()); } catch {}
  }
  init();

  UI.wsui = { chrome, applyMode, openSwitcher, editDialog, inviteSheet, joinFlow, joinAsk, onOpen, sideHTML, tasksToggle, isMine, mineActive, forChip, editorRow, detailRow, face, badge, refresh: refreshAll, available: on };
})();
