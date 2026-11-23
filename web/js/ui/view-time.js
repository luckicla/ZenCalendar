'use strict';
// ZenCalendar · vistas Semana y Día: rejilla de horas, línea de la hora actual, eventos solapados
// en columnas, arrastrar para mover, estirar para cambiar la duración y arrastrar en vacío para crear.
(function () {
  const ZC = window.ZC, UI = ZC.ui, C = UI.cal, t = (...a) => ZC.t(...a);
  const { ymd, sod, addDays, sameDay, sow, lastDay, multiDay, esc } = C;
  const SNAP = 15;
  UI.views = UI.views || {};

  const daysOf = (d, n) => n === 7 ? Array.from({ length: 7 }, (_, i) => addDays(sow(d), i)) : [sod(d)];
  const hourH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hh')) || 52;

  function build(d, n) {
    const days = daysOf(d, n), from = days[0], to = addDays(days[days.length - 1], 1);
    const list = C.occ(from, to), hol = C.holidays(from, to), tdy = C.today(), cal = C.prefsCal();
    const mobile = UI.isMobile();
    const top = list.filter(o => o.allDay || multiDay(o));
    const timed = list.filter(o => !(o.allDay || multiDay(o)));
    const el = UI.h(`<div class="view v-time ${n === 1 ? 'v-day' : 'v-week'}" style="--days:${n}"></div>`);
    // cabecera
    let hd = `<div class="tg-head"><div class="tg-gutter">${cal.weekNumbers ? `<span class="wkn">${t('S')}${C.isoWeek(days[0])}</span>` : ''}</div>`;
    for (const dd of days) {
      const hn = hol.get(ymd(dd));
      hd += `<button class="tg-dh ${sameDay(dd, tdy) ? 'today' : ''} ${dd < tdy ? 'past' : ''}" data-d="${ymd(dd)}"><span class="wd">${mobile && n === 7 ? ZC.i18n.D.wdLetter(dd) : ZC.i18n.D.wd(dd)}</span><span class="nm">${dd.getDate()}</span>${hn && (n === 1 || !mobile) ? `<span class="hol-n">${esc(hn)}</span>` : ''}</button>`;
    }
    el.appendChild(UI.h(hd + '</div>'));
    // todo el día
    const ad = UI.h(`<div class="tg-allday ${top.length ? '' : 'empty'}"><div class="tg-gutter"><span>${t('todo el día')}</span></div><div class="tg-adl"></div></div>`);
    const adl = ad.querySelector('.tg-adl');
    const segs = top.map(o => ({ o, a: Math.max(0, C.daysBetween(from, o.start)), b: Math.min(n - 1, C.daysBetween(from, lastDay(o))), cont: sod(o.start) < from, more: lastDay(o) >= to }))
      .sort((x, y) => ((y.b - y.a) - (x.b - x.a)) || (x.a - y.a) || (x.o.start - y.o.start));
    const lanes = [];
    for (const s of segs) { let L = 0; while (lanes[L] && lanes[L].some(x => !(x.b < s.a || x.a > s.b))) L++; (lanes[L] = lanes[L] || []).push(s); s.lane = L; }
    const showL = UI.views._adOpen ? lanes.length : Math.min(lanes.length, 3);
    adl.style.height = Math.max(1, lanes.length ? Math.min(lanes.length, UI.views._adOpen ? 99 : 3) : 0) * 24 + 6 + 'px';
    segs.forEach((s, i) => {
      if (s.lane >= showL) return;
      const o = s.o;
      const b = UI.h(`<button class="mv-ev bar ${o.isTask ? 'task' : ''} ${o.done ? 'done' : ''} ${s.cont ? 'cont' : ''} ${s.more ? 'more' : ''}" data-key="${esc(o.key)}" style="${C.evVars(o)};left:calc(${s.a} * 100% / ${n} + 2px);width:calc(${s.b - s.a + 1} * 100% / ${n} - 4px);top:${3 + s.lane * 24}px;--i:${i}">${o.isTask ? `<i class="tk ${o.done ? 'on' : ''}"></i>` : ''}<span class="tl">${esc(C.titleOf(o.ev))}</span></button>`);
      b._o = o; adl.appendChild(b);
    });
    if (lanes.length > 3) {
      const tg = UI.h(`<button class="ad-more">${UI.views._adOpen ? t('menos') : t('{n} más', { n: segs.filter(s => s.lane >= 3).length })}</button>`);
      ad.querySelector('.tg-gutter').appendChild(tg);
    }
    el.appendChild(ad);
    // cuerpo
    const H = hourH();
    const scroll = UI.h('<div class="tg-scroll"></div>');
    const body = UI.h(`<div class="tg-body" style="height:${24 * H}px"></div>`);
    let hours = '<div class="tg-hours">';
    for (let h = 1; h < 24; h++) hours += `<span style="top:${h * H}px">${ZC.i18n.D.hourLabel(h)}</span>`;
    body.appendChild(UI.h(hours + '</div>'));
    const cols = UI.h('<div class="tg-cols"></div>');
    days.forEach((dd, ci) => {
      const col = UI.h(`<div class="tg-col ${sameDay(dd, tdy) ? 'today' : ''} ${dd.getDay() === 0 || dd.getDay() === 6 ? 'we' : ''}" data-d="${ymd(dd)}" data-ci="${ci}"></div>`);
      const items = timed.filter(o => sameDay(o.start, dd)).map(o => {
        const s = o.start.getHours() * 60 + o.start.getMinutes();
        let e = o.isTask ? s + 30 : (sameDay(o.end, dd) ? o.end.getHours() * 60 + o.end.getMinutes() : 1440);
        if (e <= s) e = s + 15;
        return { o, s, e };
      }).sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
      // columnas para lo que se solapa
      let cluster = [], cend = -1;
      const flush = () => { const colsEnd = []; for (const it of cluster) { let c = colsEnd.findIndex(x => x <= it.s); if (c < 0) { c = colsEnd.length; colsEnd.push(0); } colsEnd[c] = it.e; it.c = c; } for (const it of cluster) it.n = colsEnd.length; cluster = []; };
      for (const it of items) { if (it.s >= cend && cluster.length) flush(); cluster.push(it); cend = Math.max(cend, it.e); }
      if (cluster.length) flush();
      items.forEach((it, i) => {
        const o = it.o, hpx = Math.max(o.isTask ? 24 : 20, (it.e - it.s) / 60 * H - 2);
        // los solapados se reparten pero el último se estira un poco para que se lea mejor
        const w = it.n > 1 ? (it.c === it.n - 1 ? 1 / it.n : 1.6 / it.n) : 1;
        const short = hpx < 40;
        const ev = UI.h(`<button class="tg-ev ${o.isTask ? 'task' : ''} ${o.done ? 'done' : ''} ${short ? 'short' : ''} ${o.end < new Date() ? 'past' : ''}" data-key="${esc(o.key)}" style="${C.evVars(o)};top:${it.s / 60 * H + 1}px;height:${hpx}px;left:calc(${it.c / it.n * 100}% + 2px);width:calc(${Math.min(w, 1 - it.c / it.n) * 100}% - 5px);z-index:${2 + it.c};--i:${i}">
          ${o.isTask ? `<i class="tk ${o.done ? 'on' : ''}"></i>` : ''}<span class="tl">${esc(C.titleOf(o.ev))}</span><span class="tm">${o.isTask || short ? C.fmtT(o.start) : C.fmtT(o.start) + ' – ' + C.fmtT(o.end)}</span>${o.ev.location && hpx > 64 ? `<span class="lc">${UI.icon('pin', 12)}${esc(o.ev.location)}</span>` : ''}
          ${o.isTask ? '' : '<i class="rz" aria-hidden="true"></i>'}</button>`);
        ev._o = o; ev._s = it.s; ev._e = it.e;
        col.appendChild(ev);
      });
      cols.appendChild(col);
    });
    const now = new Date(), ti = days.findIndex(dd => sameDay(dd, now));
    if (ti >= 0) {
      const nl = UI.h(`<div class="now-line" style="--ci:${ti}"><i></i></div>`);
      cols.appendChild(nl);
    }
    body.appendChild(cols);
    scroll.appendChild(body);
    el.appendChild(scroll);
    el._days = days; el._n = n; el._H = H;
    wire(el, d, n);
    return el;
  }

  function placeNow(el) {
    const nl = el.querySelector('.now-line'); if (!nl) return;
    const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    nl.style.top = (m / 60 * el._H) + 'px';
  }
  function mount(el) {
    placeNow(el);
    const sc = el.querySelector('.tg-scroll');
    const remembered = UI.views._timeScroll;
    const now = new Date();
    const target = remembered != null ? remembered : Math.max(0, ((el._days.some(d => sameDay(d, now)) ? now.getHours() - 1.5 : 7.5)) * el._H);
    sc.scrollTop = target;
    sc.addEventListener('scroll', () => { UI.views._timeScroll = sc.scrollTop; }, { passive: true });
    clearInterval(el._tick); el._tick = setInterval(() => { if (!el.isConnected) return clearInterval(el._tick); placeNow(el); }, 30000);
  }

  function wire(el, d, n) {
    const scroll = () => el.querySelector('.tg-scroll');
    let P = null;
    const minsAt = (col, y) => { const r = col.getBoundingClientRect(); return Math.max(0, Math.min(1440, (y - r.top) / el._H * 60)); };
    const snap = m => Math.round(m / SNAP) * SNAP;
    const colAt = x => { const cs = [...el.querySelectorAll('.tg-col')]; return cs.find(c => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; }) || (x < cs[0].getBoundingClientRect().left ? cs[0] : cs[cs.length - 1]); };
    const dayOf = col => C.parse(col.dataset.d);
    const at = (col, m) => { const x = dayOf(col); x.setMinutes(m); return x; };

    el.addEventListener('click', e => {
      if (el._dragged) { el._dragged = false; return; }
      const tk = e.target.closest('.tk');
      const evb = e.target.closest('[data-key]');
      if (tk && evb && evb._o) { e.stopPropagation(); C.toggleTask(evb._o, tk); return; }
      if (evb && evb._o) { UI.editor.detail(evb._o, evb); return; }
      const dh = e.target.closest('.tg-dh');
      if (dh) { UI.app.go({ view: n === 7 ? 'day' : 'week', date: C.parse(dh.dataset.d) }); return; }
      if (e.target.closest('.ad-more')) { UI.views._adOpen = !UI.views._adOpen; UI.app.render(); return; }
    });
    el.addEventListener('dblclick', e => {
      const ad = e.target.closest('.tg-adl');
      if (ad && !e.target.closest('[data-key]')) {
        const r = ad.getBoundingClientRect(), i = Math.floor((e.clientX - r.left) / r.width * n);
        UI.editor.open({ date: el._days[Math.max(0, Math.min(n - 1, i))], allDay: true });
      }
    });

    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || P) return;
      const col = e.target.closest('.tg-col'); if (!col) return;
      const evb = e.target.closest('.tg-ev');
      const touch = e.pointerType !== 'mouse';
      const mode = evb ? (e.target.closest('.rz') ? 'resize' : 'move') : 'create';
      P = { mode, col, evb, touch, x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
      if (touch) P.timer = setTimeout(() => { if (P && !P.active) activate(e); }, mode === 'resize' ? 120 : 400);
    });
    el.addEventListener('pointermove', e => {
      if (!P || e.pointerId !== P.id) return;
      const dist = Math.hypot(e.clientX - P.x, e.clientY - P.y);
      if (!P.active) {
        if (P.touch) { if (dist > 9) { clearTimeout(P.timer); P = null; } return; }
        if (dist > 4) activate(e); else return;
      }
      update(e);
    });
    const finish = e => {
      if (!P) return;
      clearTimeout(P.timer);
      const p = P; P = null;
      if (!p.active) {
        // clic en un hueco con el ratón: nuevo evento a esa hora
        if (p.mode === 'create' && !p.touch && e && e.type === 'pointerup') {
          const m = Math.floor(minsAt(p.col, p.y) / 30) * 30;
          UI.editor.open({ start: at(p.col, m), end: at(p.col, m + (C.prefsCal().defaultDuration || 60)) });
        }
        return;
      }
      el._dragged = true; setTimeout(() => { el._dragged = false; }, 60);
      if (p.touch) UI.swallowClick();
      clearInterval(p.auto);
      p.ghost && p.ghost.remove(); p.evb && p.evb.classList.remove('dragging');
      document.documentElement.classList.remove('dragging-ev');
      if (e && e.type === 'pointercancel') return;
      if (p.mode === 'create') {
        const a = Math.min(p.m0, p.m1), b = Math.max(p.m0, p.m1);
        UI.editor.open({ start: at(p.col0, a), end: at(p.col0, Math.max(b, a + SNAP)) });
      } else if (p.mode === 'move') {
        const o = p.evb._o, s = at(p.cur, p.ns), dur = o.end - o.start;
        if (+s === +o.start) return;
        C.moveOccurrence(o, s, o.isTask ? s : new Date(s.getTime() + dur));
      } else if (p.mode === 'resize') {
        const o = p.evb._o, e2 = at(p.col, p.ne);
        if (+e2 === +o.end) return;
        C.moveOccurrence(o, o.start, e2);
      }
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
    el.addEventListener('touchmove', e => { if (P && P.active && e.cancelable) e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', e => { if (P && P.touch) e.preventDefault(); });

    function activate(e) {
      P.active = true;
      try { el.setPointerCapture(P.id); } catch {}
      document.documentElement.classList.add('dragging-ev');
      UI.haptic('ok');
      const g = UI.h('<div class="tg-ghost"><span></span></div>');
      if (P.mode === 'create') {
        P.col0 = P.col; P.m0 = P.m1 = snap(minsAt(P.col, P.y) - (P.touch ? 0 : 0));
        P.m1 = P.m0 + (P.touch ? 60 : SNAP);
        P.col.appendChild(g);
      } else {
        const o = P.evb._o;
        P.evb.classList.add('dragging');
        g.style.cssText = C.evVars(o);
        g.classList.add('ev');
        P.off = minsAt(P.col, P.y) - P.evb._s;
        P.cur = P.col; P.ns = P.evb._s; P.ne = P.evb._e;
        P.col.appendChild(g);
      }
      P.ghost = g;
      // desplazar solo cerca de los bordes
      P.auto = setInterval(() => {
        if (!P || !P.lastY) return;
        const sc = scroll(), r = sc.getBoundingClientRect();
        if (P.lastY < r.top + 36) sc.scrollTop -= 10; else if (P.lastY > r.bottom - 36) sc.scrollTop += 10; else return;
        update({ clientX: P.lastX, clientY: P.lastY });
      }, 30);
      update(e);
    }
    function label(a, b, col) { return C.fmtT(at(col, a)) + ' – ' + C.fmtT(at(col, Math.min(b, 1439))); }
    function update(e) {
      P.lastX = e.clientX; P.lastY = e.clientY;
      const H = el._H, g = P.ghost;
      if (P.mode === 'create') {
        P.m1 = snap(minsAt(P.col0, e.clientY));
        let a = Math.min(P.m0, P.m1), b = Math.max(P.m0, P.m1);
        if (b - a < SNAP) b = a + SNAP;
        g.style.top = a / 60 * H + 'px'; g.style.height = (b - a) / 60 * H + 'px';
        g.firstChild.textContent = label(a, b, P.col0);
      } else if (P.mode === 'move') {
        const col = n === 7 ? colAt(e.clientX) : P.col;
        if (col !== P.cur) { col.appendChild(g); P.cur = col; UI.haptic('tick'); }
        const dur = P.evb._e - P.evb._s;
        const ns = Math.max(0, Math.min(1440 - Math.min(dur, 60), snap(minsAt(col, e.clientY) - P.off)));
        if (ns !== P.ns) { P.ns = ns; }
        g.style.top = ns / 60 * H + 'px'; g.style.height = Math.max(20, dur / 60 * H - 2) + 'px';
        g.firstChild.textContent = P.evb._o.isTask ? C.fmtT(at(col, ns)) : label(ns, ns + dur, col);
      } else {
        const ne = Math.max(P.evb._s + SNAP, Math.min(1440, snap(minsAt(P.col, e.clientY))));
        P.ne = ne;
        g.style.top = P.evb._s / 60 * H + 'px'; g.style.height = (ne - P.evb._s) / 60 * H - 2 + 'px';
        g.firstChild.textContent = label(P.evb._s, ne, P.col) + ' (' + C.durText(ne - P.evb._s) + ')';
      }
    }
  }

  UI.views.week = {
    icon: 'week', label: 'Semana', key: 'w',
    title: d => { const a = sow(d), b = addDays(a, 6), D = ZC.i18n.D; return a.getMonth() === b.getMonth() ? `${esc(D.month(a))}<span class="yr">${a.getFullYear()}</span>` : `${esc(D.month(a, 'short').replace('.', ''))} – ${esc(D.month(b, 'short').replace('.', ''))}<span class="yr">${b.getFullYear()}</span>`; },
    step: (d, dir) => addDays(d, 7 * dir),
    build: d => build(d, 7), mount, resize: () => UI.app.render(),
  };
  UI.views.day = {
    icon: 'day', label: 'Día', key: 'd',
    title: d => UI.isMobile() ? `${esc(ZC.i18n.D.dm(d))}<span class="yr">${esc(ZC.i18n.D.wd(d))}</span>` : `${esc(ZC.i18n.D.day(d, { weekday: 'long', day: 'numeric', month: 'long' }))}<span class="yr">${d.getFullYear()}</span>`,
    step: (d, dir) => addDays(d, dir),
    build: d => build(d, 1), mount, resize: () => UI.app.render(),
  };
})();
