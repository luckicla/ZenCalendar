'use strict';
// ZenCalendar · vistas Agenda (lista infinita por días), Año (12 meses con mapa de calor) y Tareas.
(function () {
  const ZC = window.ZC, UI = ZC.ui, C = UI.cal, t = (...a) => ZC.t(...a);
  const { ymd, sod, addDays, sameDay, lastDay, esc } = C;
  UI.views = UI.views || {};

  // tarjeta de un evento en listas (agenda, lista del día, búsqueda)
  function agendaCard(o, i = 0, { date } = {}) {
    const ev = o.ev, d = date || o.start;
    let time;
    if (o.allDay) time = `<span class="ag-time all">${t('Todo el día')}</span>`;
    else if (C.multiDay(o)) time = `<span class="ag-time">${sameDay(d, o.start) ? C.fmtT(o.start) : '···'}<small>${sameDay(d, lastDay(o)) ? C.fmtT(o.end) : '···'}</small></span>`;
    else time = `<span class="ag-time">${C.fmtT(o.start)}${o.isTask ? '' : `<small>${C.fmtT(o.end)}</small>`}</span>`;
    const sub = [ev.alarm ? `<span class="mi al" title="${esc(C.alarmText(ev))}">${UI.icon('alarm', 13)}${esc(C.alarmTime(ev))}</span>` : '', ev.location ? `<span class="mi">${UI.icon('pin', 13)}<span class="mt">${esc(ev.location)}</span></span>` : '', ev.rrule ? `<span class="mi" title="${esc(t('Se repite'))}">${UI.icon('repeat', 13)}</span>` : '', (ev.attachments || []).length ? `<span class="mi">${UI.icon('image', 13)}${ev.attachments.length}</span>` : '', (ev.checklist || []).length ? `<span class="mi">${UI.icon('list', 13)}${ev.checklist.filter(c => c.done).length}/${ev.checklist.length}</span>` : ''].filter(Boolean).join('');
    return `<div class="ag-card ${o.isTask ? 'task' : ''} ${o.done ? 'done' : ''} ${!o.isTask && o.end < new Date() ? 'past' : ''}" role="button" tabindex="0" data-key="${esc(o.key)}" style="${C.evVars(o)};--i:${i}">
      ${time}<span class="ag-bar"></span>
      <span class="ag-main"><b>${esc(C.titleOf(ev))}</b>${sub || o.calendar ? `<small>${o.calendar ? `<span class="mi cal-n"><i class="dot" style="background:${esc(o.calendar.color)}"></i><span class="mt">${esc(o.calendar.name)}</span></span>` : ''}${sub}</small>` : ''}</span>
      ${o.isTask ? `<span class="tick ${o.done ? 'on' : ''}" role="checkbox" aria-checked="${o.done}" aria-label="${t('Hecha')}">${UI.icon('check', 14)}</span>` : ''}</div>`;
  }
  UI.views.agendaCard = agendaCard;

  function bindCards(root, list) {
    const map = new Map(list.map(o => [o.key, o]));
    root.addEventListener('click', e => {
      const card = e.target.closest('[data-key]'); if (!card) return;
      const o = card._o || map.get(card.dataset.key); if (!o) return;
      const tk = e.target.closest('.tick');
      if (tk) { e.stopPropagation(); C.toggleTask(o, tk); return; }
      UI.editor.detail(o, card);
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-key]')) e.target.click(); });
    return map;
  }

  // ---------- agenda ----------
  const CHUNK = 45;
  function buildAgenda(d) {
    const el = UI.h('<div class="view v-agenda"><div class="ag-scroll"><div class="ag-list"></div><div class="ag-sent" aria-hidden="true"></div></div></div>');
    const sc = el.querySelector('.ag-scroll'), box = el.querySelector('.ag-list');
    const start = sod(sameDay(new Date(d.getFullYear(), d.getMonth(), 1), new Date(C.today().getFullYear(), C.today().getMonth(), 1)) ? C.today() : d);
    let from = start, to = start, all = [], lastMonth = null, any = false;
    const map = new Map();
    bindCards(box, []);
    box.addEventListener('click', e => { const c = e.target.closest('[data-key]'); if (c && !c._o) c._o = map.get(c.dataset.key); }, true);
    const prevBtn = UI.h(`<button class="btn sm ghost ag-prev">${UI.icon('chevU', 16)}${t('Ver días anteriores')}</button>`);
    box.before(prevBtn);
    function dayBlock(dd, items, idx) {
      const tdy = C.today(), hn = C.holidays(dd, addDays(dd, 1)).get(ymd(dd));
      const rel = sameDay(dd, tdy) ? t('Hoy') : sameDay(dd, addDays(tdy, 1)) ? t('Mañana') : sameDay(dd, addDays(tdy, -1)) ? t('Ayer') : '';
      let html = '';
      const mk = dd.getFullYear() * 12 + dd.getMonth();
      if (mk !== lastMonth) { lastMonth = mk; html += `<div class="ag-month"><span>${esc(ZC.i18n.D.month(dd))}</span> <small>${dd.getFullYear()}</small></div>`; }
      html += `<section class="ag-day ${sameDay(dd, tdy) ? 'today' : ''} ${dd < tdy ? 'past' : ''}" data-d="${ymd(dd)}" style="--i:${idx}">
        <div class="ag-date"><span class="n">${dd.getDate()}</span><span class="w">${esc(ZC.i18n.D.wd(dd))}</span></div>
        <div class="ag-items">${rel || hn ? `<div class="ag-tags">${rel ? `<span class="pill">${rel}</span>` : ''}${hn ? `<span class="pill hol">${esc(hn)}</span>` : ''}</div>` : ''}
        ${items.length ? items.map((o, i) => agendaCard(o, i, { date: dd })).join('') : `<div class="ag-free">${t('Día libre')}</div>`}</div></section>`;
      return html;
    }
    function render(a, b) {
      const list = C.occ(a, b); let html = '', idx = 0;
      for (let dd = new Date(a); dd < b; dd = addDays(dd, 1)) {
        const items = C.onDay(list, dd);
        items.forEach(o => map.set(o.key, o));
        if (items.length || sameDay(dd, C.today())) { html += dayBlock(dd, items, idx++); if (items.length) any = true; }
      }
      return html;
    }
    function more() {
      const a = to, b = addDays(to, CHUNK);
      box.insertAdjacentHTML('beforeend', render(a, b));
      to = b;
      if (!any && C.daysBetween(start, to) > 360) { box.innerHTML = `<div class="empty">${UI.ART.calm}<b>${t('Todo despejado')}</b><p>${t('No tienes nada en los próximos meses. Pulsa + para añadir algo.')}</p></div>`; io.disconnect(); }
    }
    prevBtn.onclick = () => {
      const a = addDays(from, -30), h0 = sc.scrollHeight, keepMonth = lastMonth;
      lastMonth = null;
      const html = render(a, from), lastNew = lastMonth;
      lastMonth = keepMonth;
      // si lo nuevo acaba en el mismo mes que lo que ya había arriba, sobra el título de mes de antes
      const oldHead = box.querySelector('.ag-month');
      if (html && oldHead && oldHead === box.firstElementChild && lastNew === from.getFullYear() * 12 + from.getMonth()) oldHead.remove();
      box.insertAdjacentHTML('afterbegin', html || `<div class="ag-gap">${t('Nada en los 30 días anteriores')}</div>`);
      from = a;
      sc.scrollTop += sc.scrollHeight - h0;
    };
    // carga trozos mientras el final esté cerca: con pocos eventos un trozo no llena la pantalla y el
    // observador no vuelve a avisar (se quedaría parada). Como mucho unos dos años de golpe.
    let stopped = false;
    const sent = el.querySelector('.ag-sent');
    function fill() {
      for (let i = 0; i < 16 && !stopped; i++) {
        const r = sent.getBoundingClientRect(), sr = sc.getBoundingClientRect();
        if (!sr.height || r.top > sr.bottom + 600) break;
        more();
      }
    }
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) fill(); }, { root: sc, rootMargin: '600px' });
    const disconnect = io.disconnect.bind(io);
    io.disconnect = () => { stopped = true; disconnect(); };
    more();
    setTimeout(() => io.observe(sent), 50);
    el._io = io;
    return el;
  }
  UI.views.agenda = {
    icon: 'agenda', label: 'Agenda', key: 'a',
    title: d => UI.isMobile() ? t('Agenda') : `${t('Agenda')}<span class="yr">${esc(ZC.i18n.D.month(d))}</span>`,
    step: (d, dir) => C.addMonths(new Date(d.getFullYear(), d.getMonth(), 1), dir),
    build: buildAgenda,
  };

  // ---------- año ----------
  function buildYear(d) {
    const y = d.getFullYear(), from = new Date(y, 0, 1), to = new Date(y + 1, 0, 1);
    const list = C.occ(from, to), count = new Map(), hol = C.holidays(from, to), tdy = C.today(), fd = C.prefsCal().firstDay;
    for (const o of list) { let dd = sod(o.start); const ld = lastDay(o); for (let k = 0; dd <= ld && k < 62; k++, dd = addDays(dd, 1)) { const key = ymd(dd); count.set(key, (count.get(key) || 0) + 1); } }
    const el = UI.h('<div class="view v-year"><div class="yr-scroll"><div class="yr-grid stagger"></div></div></div>');
    const grid = el.querySelector('.yr-grid');
    for (let m = 0; m < 12; m++) {
      const first = new Date(y, m, 1), start = C.sow(first, fd);
      let html = `<section class="yr-m ${m === tdy.getMonth() && y === tdy.getFullYear() ? 'cur' : ''}" style="--i:${m}"><button class="yr-mt" data-m="${m}">${esc(ZC.i18n.D.month(first))}</button><div class="yr-days">`;
      for (let i = 0; i < 7; i++) html += `<span class="wd">${ZC.i18n.D.wdLetter(addDays(start, i))}</span>`;
      for (let i = 0; i < 42; i++) {
        const dd = addDays(start, i);
        if (i >= 35 && dd.getMonth() !== m) break;
        if (dd.getMonth() !== m) { html += '<span></span>'; continue; }
        const k = ymd(dd), c = count.get(k) || 0, lvl = c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : c <= 5 ? 3 : 4;
        html += `<button class="yd l${lvl} ${sameDay(dd, tdy) ? 'today' : ''} ${hol.has(k) ? 'hol' : ''}" data-d="${k}" title="${esc(ZC.i18n.D.day(dd))}${c ? ': ' + ZC.i18n.tn(c, '{n} evento', '{n} eventos') : ''}${hol.has(k) ? ', ' + esc(hol.get(k)) : ''}">${dd.getDate()}</button>`;
      }
      grid.insertAdjacentHTML('beforeend', html + '</div></section>');
    }
    el.addEventListener('click', e => {
      const b = e.target.closest('.yd'); if (b) { UI.app.go({ view: UI.isMobile() ? 'month' : 'day', date: C.parse(b.dataset.d), sel: C.parse(b.dataset.d) }); return; }
      const mt = e.target.closest('.yr-mt'); if (mt) UI.app.go({ view: 'month', date: new Date(y, +mt.dataset.m, 1) });
    });
    return el;
  }
  UI.views.year = {
    icon: 'year', label: 'Año', key: 'y',
    title: d => `${d.getFullYear()}`,
    step: (d, dir) => new Date(d.getFullYear() + dir, d.getMonth(), 1),
    build: buildYear,
  };

  // ---------- tareas ----------
  function buildTasks() {
    const el = UI.h(`<div class="view v-tasks"><div class="tk-scroll">
      <form class="tk-add"><span class="tick ghost">${UI.icon('plus', 14)}</span><input class="in" placeholder="${esc(t('Añadir tarea… (p. ej. «comprar pan mañana»)'))}" aria-label="${esc(t('Añadir tarea'))}"><button class="btn sm pri" type="submit">${t('Añadir')}</button></form>
      <div class="tk-body"></div></div></div>`);
    const body = el.querySelector('.tk-body');
    const showDone = UI.views._tasksDone;
    const all = ZC.store.events().filter(e => e.kind === 'task');
    const tdy = C.today(), tmw = addDays(tdy, 1), wk = addDays(tdy, 7);
    // cada tarea con la aparición que toca (en las que se repiten, la primera sin hacer de hoy en adelante)
    const occOf = new Map(all.map(e => [e.id, e.done ? C.occOf(e) : C.taskOcc(e)]));
    const startOf = e => occOf.get(e.id).start;
    const pending = all.filter(e => !e.done && occOf.get(e.id)).sort((a, b) => startOf(a) - startOf(b));
    const done = all.filter(e => e.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 60);
    const groups = [[t('Atrasadas'), e => startOf(e) < tdy, 'late'], [t('Hoy'), e => sameDay(startOf(e), tdy)], [t('Mañana'), e => sameDay(startOf(e), tmw)], [t('Esta semana'), e => startOf(e) >= addDays(tmw, 1) && startOf(e) < wk], [t('Más adelante'), e => startOf(e) >= wk]];
    let html = '', k = 0;
    const row = (ev, late) => {
      const o = occOf.get(ev.id), s = o.start;
      const when = ev.allDay ? ZC.i18n.D.short(s) : ZC.i18n.D.short(s) + ', ' + C.fmtT(s);
      return `<div class="task-row ${ev.done ? 'done' : ''}" data-key="${esc(o.key)}" style="${C.evVars(o)};--i:${k++}"><span class="tick ${ev.done ? 'on' : ''}" role="checkbox" aria-checked="${!!ev.done}" tabindex="0">${UI.icon('check', 14)}</span><span class="tt"><b>${esc(C.titleOf(ev))}${C.alarmMark(ev, 14)}</b><small class="${late ? 'late' : ''}">${esc(when)}${ev.rrule ? '. ' + esc(ZC.recur.describe(ev.rrule, ZC.i18n.lang(), C.parse(ev.start))) : ''}</small></span></div>`;
    };
    if (!showDone) {
      for (const [name, fn, cls] of groups) {
        const items = pending.filter(fn); if (!items.length) continue;
        html += `<section class="tk-grp stagger"><h3>${esc(name)} <span>${items.length}</span></h3>${items.map(e => row(e, cls === 'late')).join('')}</section>`;
      }
      if (!pending.length) html = `<div class="empty">${UI.ART.tasks}<b>${t('Nada pendiente')}</b><p>${t('Cuando añadas tareas o recordatorios aparecerán aquí. Escribe arriba para crear una.')}</p></div>`;
    } else {
      html = done.length ? `<section class="tk-grp stagger"><h3>${t('Hechas')} <span>${done.length}</span></h3>${done.map(e => row(e)).join('')}</section>` : `<div class="empty">${UI.ART.tasks}<b>${t('Aún no has terminado ninguna')}</b></div>`;
    }
    body.innerHTML = `<div class="tk-top"><div class="seg" id="tkSeg"><button data-v="0" class="${showDone ? '' : 'on'}">${t('Pendientes')} <span class="cnt">${pending.length}</span></button><button data-v="1" class="${showDone ? 'on' : ''}">${t('Hechas')}</button></div></div>` + html;
    const map = new Map();
    for (const o of occOf.values()) if (o) map.set(o.key, o);
    body.addEventListener('click', e => {
      const sb = e.target.closest('#tkSeg button'); if (sb) { UI.views._tasksDone = sb.dataset.v === '1'; UI.app.render(); return; }
      const r = e.target.closest('[data-key]'); if (!r) return;
      const o = map.get(r.dataset.key); if (!o) return;
      const tk = e.target.closest('.tick');
      if (tk) { r.classList.toggle('done'); C.toggleTask(o, tk); return; }
      UI.editor.detail(o, r);
    });
    el.querySelector('.tk-add').onsubmit = async e => {
      e.preventDefault();
      const inp = el.querySelector('.tk-add input'), txt = inp.value.trim(); if (!txt) return;
      let p = null; try { p = ZC.nlp.parse(txt, { lang: ZC.i18n.lang() }); } catch {}
      const ev = { kind: 'task', title: (p && p.title) || txt, calendarId: (ZC.store.calendars()[0] || {}).id || 'personal', allDay: !(p && p.start && !p.allDay), start: p && p.start ? p.start : ymd(C.today()), reminders: p && p.reminders && p.reminders.length ? p.reminders : [], rrule: p ? p.rrule : null, alarm: !!(p && p.alarm) };
      ev.end = ev.start;
      inp.value = '';
      await ZC.store.saveEvent(ev);
      UI.haptic('ok');
      UI.toast(t('Tarea añadida'), { icon: 'check' });
    };
    return el;
  }
  UI.views.tasks = {
    icon: 'tasks', label: 'Tareas', key: 'k', noNav: true,
    title: () => t('Tareas'),
    step: d => d,
    build: buildTasks,
  };
})();
