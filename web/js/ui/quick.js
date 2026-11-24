'use strict';
// ZenCalendar · «añadir rápido» con lenguaje natural (enseña en vivo lo que ha entendido) y buscador.
(function () {
  const ZC = window.ZC, UI = ZC.ui, C = UI.cal, t = (...a) => ZC.t(...a);
  const { esc, parse } = C;
  const lang = () => ZC.i18n.lang();
  const debounce = (fn, ms) => { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; };
  const describe = (r, s) => { try { return ZC.recur.describe(r, lang(), s ? parse(s) : undefined); } catch { return ''; } };

  function parseText(v) {
    let p = null;
    try { p = v.trim().length > 1 ? ZC.nlp.parse(v, { lang: lang(), now: new Date() }) : null; } catch (e) { console.warn(e); }
    return p;
  }
  function chipsFor(p) {
    const out = [];
    if (!p) return out;
    out.push([p.kind === 'task' ? 'tasks' : 'calendar', p.kind === 'task' ? t('Tarea') : t('Evento')]);
    if (p.title) out.push(['edit', '«' + esc(p.title) + '»']);
    if (p.start) {
      const s = parse(p.start);
      out.push(['today', esc(ZC.i18n.D.short(s))]);
      out.push(p.allDay ? ['sun', t('Todo el día')] : ['clock', C.fmtT(s) + (p.end && p.end !== p.start && p.kind !== 'task' ? ' – ' + C.fmtT(parse(p.end)) : '')]);
    }
    if (p.location) out.push(['pin', esc(p.location)]);
    if (p.rrule) out.push(['repeat', esc(describe(p.rrule, p.start))]);
    (p.reminders || []).forEach(m => out.push(['bell', esc(C.remText(m))]));
    return out;
  }
  // alarma: la pide la frase (p.alarm), la sugiere (p.alarmSuggested) o el usuario la cambia con el chip (al = true/false)
  const wantsAlarm = (p, al) => al != null ? al : !!(p && p.alarm);
  function eventFrom(p, text, al) {
    const cal = C.prefsCal(), cals = ZC.store.calendars();
    const calId = (cals.find(c => c.visible !== false) || cals[0] || { id: 'personal' }).id;
    const d = C.today();
    const start = p && p.start ? p.start : C.ymd(UI.app.state.view === 'month' ? UI.app.state.sel : d);
    const allDay = p && p.start ? !!p.allDay : true;
    const kind = (p && p.kind) || 'event';
    return { kind, title: (p && p.title) || text.trim(), calendarId: (p && p.calendarId && ZC.store.calendar(p.calendarId)) ? p.calendarId : calId, emoji: (p && p.emoji) || null, allDay, start, end: kind === 'task' ? start : (p && p.end) || start, location: (p && p.location) || '', rrule: (p && p.rrule) || null, alarm: wantsAlarm(p, al), reminders: p && p.reminders && p.reminders.length ? p.reminders : (kind === 'task' ? [0] : [...(cal.defaultReminders || [])]) };
  }

  // ---------- barra de añadir rápido (PC) ----------
  function mount() {
    const box = document.getElementById('quick'); if (!box) return;
    box.innerHTML = `<form class="qa" autocomplete="off">${UI.icon('sparkles', 19)}<input id="qaIn" placeholder="${esc(t('Añade algo: «café con Ana mañana a las 10 en La Pepita»'))}" aria-label="${esc(t('Añadir rápido'))}" enterkeyhint="done"><kbd>Q</kbd></form><div class="qa-chips" hidden></div>`;
    const inp = box.querySelector('#qaIn'), chips = box.querySelector('.qa-chips'), kbd = box.querySelector('kbd');
    let p = null, al = null;
    const paint = debounce(() => {
      const v = inp.value;
      kbd.hidden = !!v;
      if (!v.trim()) { chips.hidden = true; p = null; al = null; return; }
      p = parseText(v);
      const ch = chipsFor(p || { title: v.trim() });
      const on = wantsAlarm(p, al);
      const alChip = on ? `<button type="button" class="chip al on" data-q="alarm" style="--i:${ch.length}" aria-pressed="true" title="${esc(t('Quitar la alarma'))}">${UI.icon('alarm', 15)}${t('Alarma')}${UI.icon('x', 13)}</button>`
        : (p && p.alarmSuggested && p.start) ? `<button type="button" class="chip al sug" data-q="alarm" style="--i:${ch.length}" aria-pressed="false">${UI.icon('alarm', 15)}${t('¿Le pongo alarma?')}</button>` : '';
      chips.hidden = false;
      chips.innerHTML = `<span class="lbl">${t('Entendido')}</span>${ch.map(([ic, tx], i) => `<span class="chip" style="--i:${i}">${UI.icon(ic, 15)}${tx}</span>`).join('')}${alChip}
        <span class="go"><button type="button" class="btn sm ghost" data-q="more">${t('Abrir en el editor')}</button><button type="button" class="btn sm pri" data-q="save">${t('Añadir al calendario')} <kbd>Intro</kbd></button></span>`;
    }, 120);
    inp.addEventListener('input', paint);
    inp.addEventListener('keydown', e => { if (e.key === 'Escape') { inp.value = ''; paint(); inp.blur(); e.stopPropagation(); } });
    inp.addEventListener('blur', () => setTimeout(() => { if (!box.contains(document.activeElement)) chips.hidden = true; }, 150));
    inp.addEventListener('focus', () => { if (inp.value.trim()) paint(); });
    async function save() {
      const v = inp.value.trim(); if (!v) return;
      p = parseText(v);
      const ev = eventFrom(p, v, al);
      al = null;
      const saved = await ZC.store.saveEvent(ev);
      inp.value = ''; chips.hidden = true; kbd.hidden = false;
      UI.haptic('ok');
      UI.toast(t('Añadido: {x}', { x: (saved.title || '').slice(0, 40) }), { icon: 'check', action: { label: t('Ver'), fn: () => { UI.app.go({ date: parse(saved.start), sel: parse(saved.start) }); UI.editor.detail(C.occOf(saved)); } }, undo: () => ZC.store.deleteEvent(saved.id, { mode: 'all' }) });
    }
    box.querySelector('form').onsubmit = e => { e.preventDefault(); save(); };
    chips.addEventListener('pointerdown', e => e.preventDefault());
    chips.addEventListener('click', e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      if (b.dataset.q === 'alarm') { al = !wantsAlarm(p, al); UI.haptic('tick'); paint(); inp.focus(); return; }
      if (b.dataset.q === 'save') save();
      else { const v = inp.value.trim(); const pp = parseText(v); const ev = eventFrom(pp, v, al); inp.value = ''; chips.hidden = true; al = null; UI.editor.open({ prefill: ev, alarmSuggested: !!(pp && pp.alarmSuggested), kind: ev.kind, start: ev.allDay ? null : parse(ev.start), end: ev.allDay ? null : parse(ev.end), date: parse(ev.start), allDay: ev.allDay }); }
    });
  }
  function focus() {
    const inp = document.getElementById('qaIn');
    if (inp && inp.offsetParent) { inp.focus(); return; }
    UI.editor.open({ date: UI.app.state.date });
  }

  // ---------- buscador ----------
  function search() {
    if (document.querySelector('.search-layer')) return;
    const L = UI.openLayer({ kind: 'modal', cls: 'search-layer', panelCls: 'search-panel', label: t('Buscar'), html: `
      <div class="sr-head">${UI.icon('search', 20)}<input class="sr-in" placeholder="${esc(t('Busca eventos, lugares, notas…'))}" aria-label="${esc(t('Buscar'))}" autofocus autocomplete="off" enterkeyhint="search"><button class="ibtn sm" data-x aria-label="${t('Cerrar')}">${UI.icon('x', 18)}</button></div>
      <div class="sr-res layer-scroll"></div>` });
    const inp = L.body.querySelector('.sr-in'), res = L.body.querySelector('.sr-res');
    setTimeout(() => inp.focus(), 80);
    let items = [], sel = 0;
    function empty() {
      const v = inp.value.trim();
      res.innerHTML = `<div class="sr-acts">
        ${v ? `<button class="row-btn" data-a="ai">${UI.icon('sparkles', 20)}<span><b>${t('Preguntar al asistente')}</b><small>«${esc(v)}»</small></span></button>
        <button class="row-btn" data-a="new">${UI.icon('plus', 20)}<span><b>${t('Crear «{x}»', { x: esc(v) })}</b><small>${t('Con lo que entienda de la frase')}</small></span></button>` :
        `<button class="row-btn" data-a="today">${UI.icon('today', 20)}<span><b>${t('Ir a hoy')}</b></span><kbd>T</kbd></button>
        <button class="row-btn" data-a="goto">${UI.icon('goto', 20)}<span><b>${t('Ir a una fecha…')}</b></span><kbd>G</kbd></button>
        <button class="row-btn" data-a="new">${UI.icon('plus', 20)}<span><b>${t('Nuevo evento')}</b></span><kbd>N</kbd></button>`}
      </div>${v ? `<div class="empty">${UI.ART.search}<b>${t('Nada con «{x}»', { x: esc(v) })}</b></div>` : ''}`;
    }
    const run = debounce(() => {
      const v = inp.value.trim();
      if (!v) { items = []; empty(); return; }
      let found = [];
      try { found = ZC.store.search(v) || []; } catch (e) { console.error(e); }
      const now = C.today(), horizon = C.addDays(now, 400);
      const occAll = found.length ? C.occ(C.addDays(now, -1), horizon, { includeHidden: true }) : [];
      items = found.slice(0, 40).map(ev => {
        const next = occAll.find(o => o.id === ev.id && o.start >= now);
        return next || C.occOf(ev);
      }).sort((a, b) => { const fa = a.start >= now, fb = b.start >= now; if (fa !== fb) return fa ? -1 : 1; return fa ? a.start - b.start : b.start - a.start; });
      if (!items.length) { empty(); return; }
      sel = 0;
      const up = items.filter(o => o.start >= now), past = items.filter(o => o.start < now);
      let html = '';
      const card = (o, i) => `<div class="sr-item ${i === sel ? 'on' : ''}" data-i="${i}"><span class="sr-date"><b>${o.start.getDate()}</b><small>${esc(ZC.i18n.D.month(o.start, 'short').replace('.', ''))}${o.start.getFullYear() !== now.getFullYear() ? ' ' + o.start.getFullYear() : ''}</small></span>${UI.views.agendaCard(o, i)}</div>`;
      if (up.length) html += `<h4>${t('Próximos')}</h4>` + up.map(o => card(o, items.indexOf(o))).join('');
      if (past.length) html += `<h4>${t('Pasados')}</h4>` + past.map(o => card(o, items.indexOf(o))).join('');
      res.innerHTML = html;
      const q = v.toLowerCase();
      res.querySelectorAll('.ag-main b').forEach(b => { const tx = b.textContent, k = tx.toLowerCase().indexOf(q); if (k >= 0) b.innerHTML = esc(tx.slice(0, k)) + '<mark>' + esc(tx.slice(k, k + q.length)) + '</mark>' + esc(tx.slice(k + q.length)); });
    }, 90);
    function pick(i) {
      const o = items[i]; if (!o) return;
      L.close();
      UI.app.go({ date: o.start, sel: o.start });
      setTimeout(() => UI.editor.detail(o), 200);
    }
    inp.addEventListener('input', run);
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!items.length) return;
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        res.querySelectorAll('.sr-item').forEach(x => x.classList.toggle('on', +x.dataset.i === sel));
        const on = res.querySelector('.sr-item.on'); on && on.scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter') { e.preventDefault(); if (items.length) pick(sel); else { const a = res.querySelector('[data-a]'); a && a.click(); } }
    });
    L.body.addEventListener('click', e => {
      if (e.target.closest('[data-x]')) { L.close(); return; }
      const it = e.target.closest('.sr-item');
      if (it) { if (e.target.closest('.tick')) return; e.stopPropagation(); pick(+it.dataset.i); return; }
      const a = e.target.closest('[data-a]'); if (!a) return;
      const v = inp.value.trim();
      L.close();
      if (a.dataset.a === 'today') UI.app.goToday();
      if (a.dataset.a === 'goto') UI.app.goToDate();
      if (a.dataset.a === 'ai') UI.aipanel.open(v);
      if (a.dataset.a === 'new') { const pp = v ? parseText(v) : null; const ev = v ? eventFrom(pp, v) : null; UI.editor.open(ev ? { prefill: ev, alarmSuggested: !!(pp && pp.alarmSuggested), kind: ev.kind, date: parse(ev.start), start: ev.allDay ? null : parse(ev.start), end: ev.allDay ? null : parse(ev.end), allDay: ev.allDay } : { date: UI.app.state.date }); }
    }, true);
    empty();
  }

  UI.quick = { mount, focus, search, parseText, chipsFor, eventFrom };
})();
