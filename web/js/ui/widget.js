'use strict';
// ZenCalendar · widget de escritorio (Windows): la fecha, lo que queda de hoy y lo de mañana.
// Se actualiza solo con ZC.store.on('change') (los cambios llegan de la ventana principal).
(function () {
  const ZC = window.ZC, UI = ZC.ui, t = (...a) => ZC.t(...a);
  let C;
  const $ = s => document.querySelector(s);

  function row(o, day) {
    const ev = o.ev, past = !o.allDay && !o.isTask && o.end < new Date();
    const time = o.allDay ? t('Todo el día') : C.fmtT(o.start);
    return `<button class="w-ev ${past ? 'past' : ''} ${o.done ? 'done' : ''}" data-id="${UI.esc(o.id)}" data-d="${C.ymd(day)}" style="${C.evVars(o)}">
      ${o.isTask ? `<span class="w-tk ${o.done ? 'on' : ''}" data-tk="1" role="checkbox" aria-checked="${!!o.done}">${UI.icon('check', 11)}</span>` : '<i class="w-bar"></i>'}
      <span class="w-t">${UI.esc(time)}</span><span class="w-n">${UI.esc(C.titleOf(ev))}</span></button>`;
  }
  function render() {
    const now = new Date(), d0 = C.today(), d1 = C.addDays(d0, 1), d2 = C.addDays(d0, 2);
    const list = C.occ(d0, d2);
    const today = C.onDay(list, d0).filter(o => o.allDay || o.isTask || o.end >= now || C.multiDay(o));
    const tomorrow = C.onDay(list, d1);
    const hol = C.holidays(d0, d2);
    const D = ZC.i18n.D;
    $('#w').innerHTML = `
      <header class="w-head">
        <div class="w-date"><b>${d0.getDate()}</b><span><strong>${UI.esc(D.wd(d0, 'long'))}</strong><small>${UI.esc(D.month(d0))}${hol.get(C.ymd(d0)) ? ', ' + UI.esc(hol.get(C.ymd(d0))) : ''}</small></span></div>
        <button class="w-btn" data-a="new" aria-label="${t('Nuevo evento')}" title="${t('Nuevo evento')}">${UI.icon('plus', 18)}</button>
        <button class="w-btn" data-a="open" aria-label="${t('Abrir ZenCalendar')}" title="${t('Abrir ZenCalendar')}"><img src="img/ui/logo.svg" alt="" width="20" height="20"></button>
      </header>
      <div class="w-body">
        <section><h3>${t('Hoy')}</h3>${today.length ? today.map(o => row(o, d0)).join('') : `<p class="w-empty">${t('Nada más por hoy')}</p>`}</section>
        <section><h3>${t('Mañana')}${hol.get(C.ymd(d1)) ? ` <small>${UI.esc(hol.get(C.ymd(d1)))}</small>` : ''}</h3>${tomorrow.length ? tomorrow.map(o => row(o, d1)).join('') : `<p class="w-empty">${t('Día libre')}</p>`}</section>
      </div>`;
  }
  async function boot() {
    C = UI.cal;
    try { await ZC.core.init(); } catch (e) { console.error(e); }
    const prefs = ZC.store.getPrefs() || {};
    ZC.i18n.setLang((prefs.cal || {}).lang || 'auto');
    await UI.look.load(prefs.look);
    render();
    let tm = 0;
    ZC.store.on('change', ev => {
      C.clearCache();
      if (ev && ev.type === 'prefs') { const p = ZC.store.getPrefs() || {}; ZC.i18n.setLang((p.cal || {}).lang || 'auto'); UI.look.load(p.look); }
      clearTimeout(tm); tm = setTimeout(render, 60);
    });
    setInterval(() => { C.clearCache(); render(); }, 60000);
    $('#w').addEventListener('click', async e => {
      const a = e.target.closest('[data-a]');
      const P = ZC.platform;
      const open = o => { try { P.openApp ? P.openApp(o) : P._open(o); } catch (err) { console.error(err); } };
      if (a) { open({ action: a.dataset.a === 'new' ? 'new' : 'open', date: C.ymd(C.today()) }); return; }
      const ev = e.target.closest('.w-ev'); if (!ev) return;
      if (e.target.closest('[data-tk]')) {
        const x = ZC.store.get(ev.dataset.id);
        if (x) { const r = e.target.getBoundingClientRect(); UI.confetti(r.left + 6, r.top + 6, 10); await ZC.store.toggleDone(x.id, x.rrule ? ev.dataset.d : undefined); }
        return;
      }
      open({ action: 'open', id: ev.dataset.id, date: ev.dataset.d });
    });
    document.documentElement.classList.add('ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
