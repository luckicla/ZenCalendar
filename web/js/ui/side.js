'use strict';
// ZenCalendar · panel lateral: «Nuevo», mini calendario, calendarios (crear, renombrar, color,
// ocultar, borrar), tareas pendientes y el estado de Google Drive.
(function () {
  const ZC = window.ZC, UI = ZC.ui, C = UI.cal, t = (...a) => ZC.t(...a);
  const { ymd, sod, addDays, sameDay, esc } = C;
  const CAL_COLORS = ['#B9A2FF', '#FF9CCB', '#7CC8F2', '#7ED6C3', '#FFB38A', '#F2C14E', '#C38BEB', '#FF8A8A', '#86B862', '#9AA0B5', '#6AAEF5', '#F7A8D0'];
  let miniMonth = null;

  function render() {
    const side = document.getElementById('side'); if (!side) return;
    if (!side.dataset.built) {
      side.dataset.built = '1';
      side.innerHTML = `
        <button class="btn pri side-new" id="sideNew">${UI.icon('plus', 20)}<span>${t('Nuevo evento')}</span></button>
        <section class="side-sec mini" id="mini"></section>
        <section class="side-sec" id="sideCals"></section>
        <section class="side-sec" id="sideTasks"></section>
        <div class="side-foot" id="sideSync" role="button" tabindex="0"></div>`;
      side.querySelector('#sideNew').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); UI.app.closeSide(); UI.editor.open({ date: UI.app.state.view === 'month' ? UI.app.state.sel : UI.app.state.date, from: { x: r.left + 24, y: r.top + r.height / 2 } }); };
      side.querySelector('#sideSync').onclick = () => { UI.app.closeSide(); UI.settings.open('drive'); };
      side.addEventListener('click', onClick);
    }
    mini(); cals(); tasks(); sync();
  }

  function mini() {
    const box = document.getElementById('mini'); if (!box) return;
    const st = UI.app.state, cal = C.prefsCal();
    if (!miniMonth) miniMonth = new Date(st.date.getFullYear(), st.date.getMonth(), 1);
    const m = miniMonth, start = C.sow(m), tdy = C.today();
    const list = C.occ(start, addDays(start, 42));
    const has = new Set(); for (const o of list) has.add(ymd(o.start));
    // rango que se está viendo (para resaltarlo)
    let r0 = null, r1 = null;
    if (st.view === 'week') { r0 = C.sow(st.date); r1 = addDays(r0, 6); }
    else if (st.view === 'day') { r0 = r1 = sod(st.date); }
    const wn = !!cal.weekNumbers;
    let html = `<div class="mini-head"><b>${esc(ZC.i18n.D.monthYear(m))}</b><button class="ibtn sm" data-mm="-1" aria-label="${t('Mes anterior')}">${UI.icon('chevL', 18)}</button><button class="ibtn sm" data-mm="1" aria-label="${t('Mes siguiente')}">${UI.icon('chevR', 18)}</button></div><div class="mini-grid ${wn ? 'wn' : ''}">`;
    if (wn) html += '<span class="wd"></span>';
    for (let i = 0; i < 7; i++) html += `<span class="wd">${ZC.i18n.D.wdLetter(addDays(start, i))}</span>`;
    for (let w = 0; w < 6; w++) {
      if (wn) html += `<span class="wk">${C.isoWeek(addDays(start, w * 7 + 3))}</span>`;
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, w * 7 + i), inr = r0 && d >= r0 && d <= r1;
        html += `<button class="${d.getMonth() !== m.getMonth() ? 'out' : ''} ${sameDay(d, tdy) ? 'today' : ''} ${has.has(ymd(d)) ? 'has' : ''} ${inr ? 'inr' : ''} ${inr && sameDay(d, r0) ? 'r0' : ''} ${inr && sameDay(d, r1) ? 'r1' : ''}" data-md="${ymd(d)}" aria-label="${esc(ZC.i18n.D.day(d))}">${d.getDate()}</button>`;
      }
    }
    box.innerHTML = html + '</div>';
  }
  function cals() {
    const box = document.getElementById('sideCals'); if (!box) return;
    const list = ZC.store.calendars();
    box.innerHTML = `<header><h3>${t('Calendarios')}</h3><button class="ibtn sm" data-act="newcal" aria-label="${t('Nuevo calendario')}" title="${t('Nuevo calendario')}">${UI.icon('plus', 18)}</button></header>` +
      list.map(c => `<div class="cal-row ${c.visible === false ? 'off' : ''}" style="--c:${esc(c.color)}" data-cal="${esc(c.id)}" role="button" tabindex="0" aria-pressed="${c.visible !== false}"><span class="cbox">${UI.icon('check', 14)}</span><span class="nm">${esc(c.name)}</span><button class="ibtn sm more" data-calmenu="${esc(c.id)}" aria-label="${esc(t('Opciones de {x}', { x: c.name }))}">${UI.icon('more', 18)}</button></div>`).join('');
  }
  function tasks() {
    const box = document.getElementById('sideTasks'); if (!box) return;
    // (las que se repiten salen con la aparición que toca, no con la primera de la serie)
    const all = ZC.store.events().filter(e => e.kind === 'task' && !e.done).map(ev => ({ ev, o: C.taskOcc(ev) })).filter(x => x.o).sort((a, b) => a.o.start - b.o.start);
    const tdy = C.today();
    box.innerHTML = `<header><h3>${t('Tareas')}</h3><button class="ibtn sm" data-act="newtask" aria-label="${t('Nueva tarea')}" title="${t('Nueva tarea')}">${UI.icon('plus', 18)}</button></header>` +
      (all.length ? all.slice(0, 5).map(({ ev, o }) => {
        const s = o.start, late = s < tdy;
        const when = sameDay(s, tdy) ? (ev.allDay ? t('Hoy') : t('Hoy') + ', ' + C.fmtT(s)) : sameDay(s, addDays(tdy, 1)) ? t('Mañana') : ZC.i18n.D.short(s);
        return `<div class="task-row" data-task="${esc(ev.id)}" style="${C.evVars(o)}"><span class="tick" role="checkbox" aria-checked="false" tabindex="0" aria-label="${t('Marcar como hecha')}">${UI.icon('check', 14)}</span><span class="tt"><b>${esc(C.titleOf(ev))}</b><small class="${late ? 'late' : ''}">${esc(when)}</small></span></div>`;
      }).join('') + (all.length > 5 ? `<button class="side-more" data-act="alltasks">${t('Ver las {n}', { n: all.length })}</button>` : '')
        : `<p class="mut" style="font-size:.84rem;padding:2px 8px">${t('Sin tareas pendientes')}</p>`);
  }
  function sync() {
    const box = document.getElementById('sideSync'); if (!box || !ZC.drive) return;
    let s = {}; try { s = ZC.drive.state() || {}; } catch {}
    const av = (() => { try { return ZC.drive.available(); } catch { return false; } })();
    let text, ic = 'cloud';
    if (s.syncing) { text = t('Sincronizando…'); ic = 'refresh'; }
    else if (s.error) { text = t('Error al sincronizar'); ic = 'cloud'; }
    else if (s.connected) { text = s.lastSync ? t('Sincronizado {x}', { x: ZC.i18n.D.rel(s.lastSync) }) : t('Conectado a Google Drive'); ic = 'cloudSync'; }
    else text = av ? t('Sincroniza con Google Drive') : t('Solo en este dispositivo');
    box.className = 'side-foot' + (s.syncing ? ' busy' : '');
    box.innerHTML = `${UI.icon(ic, 18)}<span>${esc(text)}</span>`;
    const dot = document.getElementById('btnSettings');
    if (dot) { dot.classList.toggle('sync-dot', !!s.connected || !!s.error); dot.classList.toggle('err', !!s.error); dot.classList.toggle('busy', !!s.syncing); }
  }

  async function onClick(e) {
    const mm = e.target.closest('[data-mm]');
    if (mm) { miniMonth = C.addMonths(miniMonth, +mm.dataset.mm); mini(); return; }
    const md = e.target.closest('[data-md]');
    if (md) { const d = C.parse(md.dataset.md); const v = UI.app.state.view; UI.app.go({ date: d, sel: d, view: ['tasks', 'year'].includes(v) ? 'day' : v }); UI.app.closeSide(); return; }
    const menuB = e.target.closest('[data-calmenu]');
    if (menuB) { e.stopPropagation(); calMenu(menuB.dataset.calmenu, menuB); return; }
    const row = e.target.closest('[data-cal]');
    if (row) { const c = ZC.store.calendar(row.dataset.cal); if (c) { UI.haptic('tick'); await ZC.store.saveCalendar({ ...c, visible: c.visible === false }); } return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'newcal') newCalendar();
      if (a === 'newtask') { UI.app.closeSide(); UI.editor.open({ kind: 'task', date: UI.app.state.date }); }
      if (a === 'alltasks') { UI.app.closeSide(); UI.app.go({ view: 'tasks' }); }
      return;
    }
    const tick = e.target.closest('.tick');
    const tr = e.target.closest('[data-task]');
    if (tr) {
      const ev = ZC.store.get(tr.dataset.task); if (!ev) return;
      const o = C.taskOcc(ev) || C.occOf(ev);
      if (tick) { tr.classList.add('done'); C.toggleTask(o, tick); }
      else { UI.app.closeSide(); UI.editor.detail(o, tr); }
    }
  }

  async function newCalendar() {
    const name = await UI.prompt(t('Nuevo calendario'), '', { placeholder: t('Por ejemplo: Gimnasio'), ok: t('Crear') });
    if (!name) return;
    const used = new Set(ZC.store.calendars().map(c => c.color));
    const color = CAL_COLORS.find(c => !used.has(c)) || CAL_COLORS[Math.floor(Math.random() * CAL_COLORS.length)];
    await ZC.store.saveCalendar({ name, color, visible: true, order: ZC.store.calendars().length });
    UI.toast(t('Calendario «{x}» creado', { x: name }), { icon: 'check' });
  }
  function calMenu(id, anchor) {
    const c = ZC.store.calendar(id); if (!c) return;
    UI.menu(anchor, [
      { title: c.name },
      { label: t('Renombrar'), icon: 'edit', act: async () => { const n = await UI.prompt(t('Renombrar calendario'), c.name); if (n) ZC.store.saveCalendar({ ...c, name: n }); } },
      { label: t('Cambiar color'), icon: 'palette', act: () => colorPicker(c) },
      { label: c.visible === false ? t('Mostrar') : t('Ocultar'), icon: c.visible === false ? 'eye' : 'eyeOff', act: () => ZC.store.saveCalendar({ ...c, visible: c.visible === false }) },
      { label: t('Mostrar solo este'), icon: 'eye', act: () => ZC.store.calendars().forEach(x => ZC.store.saveCalendar({ ...x, visible: x.id === c.id })) },
      { label: t('Exportar .ics'), icon: 'download', act: () => UI.data.exportICS(c.id) },
      '-',
      { label: t('Borrar calendario'), icon: 'trash', danger: true, act: async () => {
        if (ZC.store.calendars().length <= 1) { UI.toast(t('Tiene que quedar al menos un calendario')); return; }
        const n = ZC.store.events().filter(e => e.calendarId === c.id).length;
        const ok = await UI.confirm(t('¿Borrar «{x}»?', { x: c.name }), n ? ZC.i18n.tn(n, 'También se borrará {n} evento suyo.', 'También se borrarán sus {n} eventos.') : t('No tiene eventos.'), { ok: t('Borrar'), danger: true, icon: 'trash' });
        if (ok) { await ZC.store.deleteCalendar(c.id); UI.toast(t('Calendario borrado'), { icon: 'trash' }); }
      } },
    ], { align: 'end' });
  }
  function colorPicker(c) {
    const L = UI.openLayer({ kind: 'modal', panelCls: 'dlg', html: `<div class="dlg-in"><h2>${t('Color de «{x}»', { x: esc(c.name) })}</h2>
      <div class="color-grid">${CAL_COLORS.map(col => `<button class="cdot ${col.toLowerCase() === String(c.color).toLowerCase() ? 'on' : ''}" style="--c:${col}" data-c="${col}" aria-label="${col}"></button>`).join('')}<label class="cdot custom" title="${t('Otro color')}"><input type="color" value="${esc(c.color)}"></label></div>
      <div class="dlg-acts"><button class="btn ghost" data-x>${t('Cerrar')}</button></div></div>` });
    L.body.addEventListener('click', e => {
      const b = e.target.closest('[data-c]'); if (b) { ZC.store.saveCalendar({ ...c, color: b.dataset.c }); L.close(); }
      if (e.target.closest('[data-x]')) L.close();
    });
    L.body.querySelector('input[type=color]').onchange = e => { ZC.store.saveCalendar({ ...c, color: e.target.value }); L.close(); };
  }

  UI.side = { render, mini, sync, CAL_COLORS, colorPicker, resetMini: () => { miniMonth = null; } };
})();
