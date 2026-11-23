'use strict';
// ZenCalendar · vista Mes: rejilla con barras continuas para lo de varios días, puntitos para lo que
// tiene hora, festivos y «+N». En el móvil, debajo, la lista del día elegido.
(function () {
  const ZC = window.ZC, UI = ZC.ui, C = UI.cal, t = (...a) => ZC.t(...a);
  const { ymd, sod, addDays, sameDay, sow, lastDay, multiDay, esc } = C;
  UI.views = UI.views || {};

  function gridRange(d) {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const start = sow(first);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const weeks = Math.ceil((C.daysBetween(start, last) + 1) / 7);
    return { start, weeks, end: addDays(start, weeks * 7) };
  }

  function build(d) {
    const cal = C.prefsCal(), { start, weeks, end } = gridRange(d);
    const list = C.occ(start, end);
    const hol = C.holidays(start, end);
    const wn = !!cal.weekNumbers, tdy = C.today();
    const mobile = UI.isMobile();
    const el = UI.h(`<div class="view v-month ${wn ? 'wn' : ''}" style="--weeks:${weeks}"></div>`);
    let head = `<div class="mv-head">${wn ? '<span class="mv-wk"></span>' : ''}`;
    for (let i = 0; i < 7; i++) { const dd = addDays(start, i); head += `<span class="${dd.getDay() === 0 || dd.getDay() === 6 ? 'we' : ''}">${mobile ? ZC.i18n.D.wdLetter(dd) : ZC.i18n.D.wd(dd)}</span>`; }
    el.appendChild(UI.h(head + '</div>'));
    const grid = UI.h('<div class="mv-grid"></div>');
    for (let w = 0; w < weeks; w++) {
      const ws = addDays(start, w * 7);
      const row = UI.h(`<div class="mv-week" data-ws="${ymd(ws)}"></div>`);
      if (wn) row.appendChild(UI.h(`<span class="mv-wk" title="${t('Semana')}">${C.isoWeek(addDays(ws, 3))}</span>`));
      const cells = UI.h('<div class="mv-cells"></div>');
      for (let i = 0; i < 7; i++) {
        const dd = addDays(ws, i), k = ymd(dd), hn = hol.get(k);
        const cls = ['mc-day', dd.getMonth() !== d.getMonth() ? 'out' : '', sameDay(dd, tdy) ? 'today' : '', dd.getDay() === 0 || dd.getDay() === 6 ? 'we' : '', hn ? 'hol' : '', UI.app && sameDay(dd, UI.app.state.sel) ? 'sel' : ''].join(' ');
        cells.appendChild(UI.h(`<div class="${cls}" data-d="${k}" tabindex="-1"><span class="num">${dd.getDate() === 1 && !mobile ? esc(ZC.i18n.D.dm(dd)) : dd.getDate()}</span>${hn ? `<span class="hol-n" title="${esc(hn)}">${esc(hn)}</span>` : ''}</div>`));
      }
      row.appendChild(cells);
      row.appendChild(UI.h('<div class="mv-bars"></div>'));
      row._ws = ws;
      row._items = list.filter(o => sod(o.start) < addDays(ws, 7) && lastDay(o) >= ws);
      grid.appendChild(row);
    }
    el.appendChild(grid);
    if (mobile) el.appendChild(UI.h('<div class="mv-daylist"></div>'));
    wire(el, d);
    return el;
  }

  // reparte cada semana en carriles y pinta las barras (necesita el tamaño real)
  function layout(el) {
    const mobile = UI.isMobile();
    el.querySelectorAll('.mv-week').forEach(row => {
      const bars = row.querySelector('.mv-bars'); bars.innerHTML = '';
      const ws = row._ws, items = row._items || [];
      const H = row.clientHeight, headH = mobile ? 24 : 32, laneH = mobile ? 17 : 22;
      const maxLanes = Math.max(1, Math.floor((H - headH - 2) / laneH));
      // orden: varios días primero (más largos antes), luego por hora
      const segs = items.map(o => {
        const a = Math.max(0, C.daysBetween(ws, o.start)), b = Math.min(6, C.daysBetween(ws, lastDay(o)));
        return { o, a, b, multi: multiDay(o) || o.allDay, cont: sod(o.start) < ws, more: lastDay(o) > addDays(ws, 6) };
      }).sort((x, y) => (y.multi - x.multi) || ((y.b - y.a) - (x.b - x.a)) || (x.a - y.a) || (x.o.start - y.o.start) || (x.o.isTask - y.o.isTask));
      const lanes = [];
      for (const s of segs) {
        let L = 0;
        while (lanes[L] && lanes[L].some(x => !(x.b < s.a || x.a > s.b))) L++;
        (lanes[L] = lanes[L] || []).push(s); s.lane = L;
      }
      const perDay = Array.from({ length: 7 }, (_, i) => segs.filter(s => s.a <= i && s.b >= i));
      const overflow = perDay.map(arr => arr.length > maxLanes);
      const frag = document.createDocumentFragment();
      let k = 0;
      for (const s of segs) {
        const hideAt = maxLanes - 1;
        const spanOver = overflow.slice(s.a, s.b + 1).some(Boolean);
        if (s.lane > hideAt || (s.lane === hideAt && spanOver)) continue;
        const o = s.o;
        const bar = document.createElement('button');
        bar.className = 'mv-ev' + (s.multi ? ' bar' : ' dotline') + (o.isTask ? ' task' : '') + (o.done ? ' done' : '') + (s.cont ? ' cont' : '') + (s.more ? ' more' : '');
        bar.style.cssText = `${C.evVars(o)};left:calc(${s.a} * 100% / 7 + 2px);width:calc(${s.b - s.a + 1} * 100% / 7 - 4px);top:${headH + s.lane * laneH}px;--i:${k++}`;
        bar.dataset.key = o.key;
        const time = !o.allDay && !s.multi && !mobile ? `<span class="tm">${C.fmtT(o.start)}</span>` : '';
        bar.innerHTML = (o.isTask ? `<i class="tk ${o.done ? 'on' : ''}"></i>` : (!s.multi && !mobile ? '<i class="dt"></i>' : '')) + time + `<span class="tl">${esc(C.titleOf(o.ev))}</span>`;
        bar.title = C.titleOf(o.ev) + '\n' + C.whenText(o);
        bar._o = o;
        frag.appendChild(bar);
      }
      perDay.forEach((arr, i) => {
        if (!overflow[i]) return;
        const hidden = arr.filter(s => s.lane >= maxLanes - 1).length;
        const m = document.createElement('button');
        m.className = 'mv-more';
        m.style.cssText = `left:calc(${i} * 100% / 7 + 2px);width:calc(100% / 7 - 4px);top:${headH + (maxLanes - 1) * laneH}px`;
        m.dataset.d = ymd(addDays(ws, i));
        m.textContent = mobile ? '+' + hidden : t('{n} más', { n: hidden });
        frag.appendChild(m);
      });
      bars.appendChild(frag);
    });
    if (UI.isMobile()) dayList(el);
  }

  function dayList(el) {
    const box = el.querySelector('.mv-daylist'); if (!box) return;
    const sel = UI.app.state.sel || C.today();
    const list = C.onDay(C.occ(sod(sel), addDays(sod(sel), 1)), sel);
    const hn = C.holidays(sod(sel), addDays(sod(sel), 1)).get(ymd(sel));
    let html = `<div class="dl-head"><b>${esc(ZC.i18n.D.day(sel))}</b>${sameDay(sel, C.today()) ? `<span class="pill">${t('Hoy')}</span>` : ''}${hn ? `<span class="pill hol">${esc(hn)}</span>` : ''}</div>`;
    if (!list.length) html += `<div class="dl-empty">${t('Nada por aquí. Mantén pulsado un día para añadir algo.')}</div>`;
    else html += '<div class="dl-list stagger">' + list.map((o, i) => UI.views.agendaCard(o, i)).join('') + '</div>';
    box.innerHTML = html;
    box.querySelectorAll('[data-key]').forEach(b => { const o = list.find(x => x.key === b.dataset.key); b._o = o; });
  }

  function wire(el, d) {
    let press = null;
    el.addEventListener('click', e => {
      if (el._dragged) { el._dragged = false; return; }
      const tk = e.target.closest('.tk, .tick');
      const ev = e.target.closest('[data-key]');
      if (tk && ev && ev._o) { e.stopPropagation(); C.toggleTask(ev._o, tk); return; }
      if (ev && ev._o) { UI.editor.detail(ev._o, ev); return; }
      const more = e.target.closest('.mv-more');
      if (more) { UI.app.go({ view: UI.isMobile() ? 'month' : 'day', date: C.parse(more.dataset.d), sel: C.parse(more.dataset.d) }); return; }
      const cell = e.target.closest('.mc-day');
      if (cell) {
        const dd = C.parse(cell.dataset.d);
        if (UI.isMobile()) {
          el.querySelectorAll('.mc-day.sel').forEach(x => x.classList.remove('sel'));
          cell.classList.add('sel');
          UI.app.state.sel = dd;
          if (dd.getMonth() !== d.getMonth()) { UI.app.go({ date: dd, sel: dd }, dd > d ? 1 : -1); return; }
          dayList(el); UI.haptic('tick');
        } else if (e.target.closest('.num')) UI.app.go({ view: 'day', date: dd });
        else { UI.app.state.sel = dd; el.querySelectorAll('.mc-day.sel').forEach(x => x.classList.remove('sel')); cell.classList.add('sel'); }
      }
    });
    el.addEventListener('dblclick', e => {
      const cell = e.target.closest('.mc-day'); if (!cell || e.target.closest('[data-key]')) return;
      UI.editor.open({ date: C.parse(cell.dataset.d), allDay: false });
    });
    // mantener pulsado (o arrastrar con el ratón) un día vacío = crear; arrastrar un evento = moverlo
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const ev = e.target.closest('.mv-ev');
      const cell = e.target.closest('.mc-day') || (e.target.closest('.mv-bars') && null);
      if (!ev && !cell) return;
      const touch = e.pointerType !== 'mouse';
      press = { x: e.clientX, y: e.clientY, ev, cell, touch, id: e.pointerId, t: setTimeout(() => {
        if (!press) return;
        if (press.ev && press.ev._o) startDrag(press, e);
        else if (press.cell && touch) { UI.haptic('ok'); el._dragged = true; el._lp = true; UI.editor.open({ date: C.parse(press.cell.dataset.d), from: { x: press.x, y: press.y } }); press = null; }
      }, touch ? 420 : 9999) };
    });
    el.addEventListener('pointermove', e => {
      if (!press || press.id !== e.pointerId) return;
      const dx = e.clientX - press.x, dy = e.clientY - press.y;
      if (press.dragging) { moveDrag(press, e); return; }
      if (Math.hypot(dx, dy) > 8) {
        if (!press.touch && press.ev && press.ev._o) startDrag(press, e);
        else { clearTimeout(press.t); press = null; }
      }
    });
    const up = e => {
      if (el._lp) { el._lp = false; UI.swallowClick(500); }
      if (!press) return;
      clearTimeout(press.t);
      if (press.dragging) endDrag(press, e);
      press = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { if (press && press.dragging) cancelDrag(press); if (press) clearTimeout(press.t); press = null; });
    el.addEventListener('touchmove', e => { if (press && press.dragging && e.cancelable) e.preventDefault(); }, { passive: false });

    function cellAt(x, y) { const n = document.elementFromPoint(x, y); return n && n.closest && n.closest('.mc-day'); }
    function startDrag(p, e) {
      p.dragging = true; el._dragged = true;
      const o = p.ev._o;
      p.ghost = UI.h(`<div class="mv-ghost" style="${C.evVars(o)}">${esc(C.titleOf(o.ev))}</div>`);
      document.body.appendChild(p.ghost);
      p.from = cellAt(p.x, p.y);
      p.ev.classList.add('dragging');
      try { el.setPointerCapture(p.id); } catch {}
      UI.haptic('tick');
      moveDrag(p, e);
    }
    function moveDrag(p, e) {
      p.ghost.style.transform = `translate(${e.clientX + 10}px, ${e.clientY - 14}px)`;
      const c = cellAt(e.clientX, e.clientY);
      if (c !== p.over) { if (p.over) p.over.classList.remove('drop'); p.over = c; if (c) { c.classList.add('drop'); UI.haptic('tick'); } }
    }
    function cancelDrag(p) { p.ghost && p.ghost.remove(); p.over && p.over.classList.remove('drop'); p.ev && p.ev.classList.remove('dragging'); }
    function endDrag(p) {
      cancelDrag(p);
      const o = p.ev._o, to = p.over, from = p.from;
      setTimeout(() => { el._dragged = false; }, 50);
      if (!to || !from || to === from) return;
      const delta = C.daysBetween(C.parse(from.dataset.d), C.parse(to.dataset.d));
      if (!delta) return;
      C.moveOccurrence(o, addDays(o.start, delta), addDays(o.allDay ? lastDay(o) : o.end, delta));
    }
  }

  UI.views.month = {
    icon: 'month', label: 'Mes', key: 'm',
    title: d => `${esc(ZC.i18n.D.month(d))}${UI.isMobile() && d.getFullYear() === new Date().getFullYear() ? '' : `<span class="yr">${d.getFullYear()}</span>`}`,
    step: (d, dir) => C.addMonths(new Date(d.getFullYear(), d.getMonth(), 1), dir),
    build, mount: layout, resize: layout,
    refreshSel: el => dayList(el),
  };
})();
