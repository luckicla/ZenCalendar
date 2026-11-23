'use strict';
// La portada: la página del mes. Escribes una frase en la línea, ZCW.nlp la entiende y el evento cae en su día.
// Es el único momento orquestado de la web: al cargar se traza el mes y se escribe sola la frase de ejemplo.
(() => {
  const M = window.ZCW.mock, NLP = window.ZCW.nlp;
  const $ = s => document.querySelector(s);
  const grid = $('#demo-grid'), form = $('#demo-form'), input = $('#demo-input'), status = $('#demo-status');
  if (!grid || !form) return;

  const hero = $('.hero');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const now = new Date();
  const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  let events = M.sample(now);
  let view = new Date(now.getFullYear(), now.getMonth(), 1);
  let selected = null, userTouched = false, n = 0, lastAdded = null;

  const dayLabel = d => `${M.DOW_LONG[d.getDay()]} ${d.getDate()} de ${M.MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ' de ' + d.getFullYear() : ''}`;
  const PLURAL = { MO: 'lunes', TU: 'martes', WE: 'miércoles', TH: 'jueves', FR: 'viernes', SA: 'sábados', SU: 'domingos' };
  const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a[0];
  function describe(r) {
    if (r.freq === 'daily') return 'cada día';
    if (r.freq === 'weekly') return r.interval > 1 ? `cada ${r.interval} semanas` : `todos los ${list((r.byDay || []).map(d => PLURAL[d]))}`;
    if (r.freq === 'monthly') return 'cada mes';
    return 'cada año';
  }

  // Avisa de lo que enseña la demo (el diseño Dot lo pinta en su pantalla de puntos): día, hora y título.
  const emit = (kind, date, extra = {}) => document.dispatchEvent(new CustomEvent('zc:demo', { detail: { kind, date, ...extra } }));

  const monthEl = $('#demo-month'), yearEl = $('#demo-year');
  function render(animate = false) {
    const name = M.MONTHS[view.getMonth()];
    monthEl.textContent = name;
    monthEl.classList.toggle('is-long', name.length > 9);
    yearEl.textContent = view.getFullYear();
    grid.innerHTML = M.monthHTML(events, view, { today: now, selected, max: 2, dots: true, dow: DOW });
    grid.querySelectorAll('.mo-dow, .mo-day').forEach((c, i) => c.style.setProperty('--i', i));
    grid.classList.remove('fade');
    if (animate && !reduce.matches) { void grid.offsetWidth; grid.classList.add('fade'); }
  }
  const go = d => { view = new Date(view.getFullYear(), view.getMonth() + d, 1); render(true); emit('month', new Date(view)); };
  $('#demo-prev').addEventListener('click', () => go(-1));
  $('#demo-next').addEventListener('click', () => go(1));
  $('#demo-today').addEventListener('click', () => { selected = M.sod(now); view = new Date(now.getFullYear(), now.getMonth(), 1); render(true); showDay(selected); });

  // tocar un día: lo que hay apuntado
  function showDay(d) {
    const occ = M.occurrences(events, d, M.addDays(d, 1));
    const items = occ.map(o => `${M.esc(o.e.title)}${o.allDay ? '' : ' a las ' + M.hm(o.start)}`);
    status.innerHTML = `<b>${M.esc(M.cap(dayLabel(d)))}:</b> ` + (items.length ? list(items) + '.' : 'nada apuntado. Escribe algo en la línea.');
    emit(M.sameDay(d, now) ? 'today' : 'select', d, { count: occ.length, title: occ[0] && occ[0].e.title, time: occ[0] && !occ[0].allDay ? M.hm(occ[0].start) : null });
  }
  grid.addEventListener('click', e => {
    const b = e.target.closest('.mo-day'); if (!b) return;
    const [y, m, d] = b.dataset.date.split('-').map(Number);
    selected = new Date(y, m - 1, d);
    const other = m - 1 !== view.getMonth();
    if (other) view = new Date(y, m - 1, 1);
    render(other);
    showDay(selected);
    const again = grid.querySelector(`[data-date="${b.dataset.date}"]`); if (again) again.focus({ preventScroll: true });
  });

  // el evento cae desde la línea hasta su casilla
  function fly(ev, target) {
    return new Promise(res => {
      if (reduce.matches || !target) return res();
      const from = input.getBoundingClientRect(), to = target.getBoundingClientRect();
      const g = document.createElement('div');
      g.className = 'fly'; g.textContent = ev.title;
      g.style.setProperty('--c', `var(--c-${ev.cal})`);
      document.body.appendChild(g);
      const gw = g.offsetWidth, gh = g.offsetHeight;
      const x0 = from.left + 10, y0 = from.top + (from.height - gh) / 2;
      const x1 = to.left + 8, y1 = to.top + Math.min(32, to.height / 2);
      const s1 = Math.max(0.55, Math.min(1, (to.width - 16) / gw));
      const a = g.animate([
        { transform: `translate(${x0}px, ${y0}px)`, opacity: 0 },
        { transform: `translate(${x0}px, ${y0 - 8}px)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${x1}px, ${y1}px) scale(${s1})`, opacity: 0.3 }
      ], { duration: 760, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' });
      a.onfinish = () => { g.remove(); res(); };
    });
  }

  async function add(text) {
    const r = NLP.parse(text, { now: new Date() });
    if (!r) { status.textContent = 'Escribe algo, por ejemplo «comida con Ana el jueves a las 2».'; return; }
    const ev = { id: 'u' + n++, title: r.title, cal: r.calendar, allDay: r.allDay, start: r.start, end: r.end, rrule: r.rrule, kind: r.kind };
    const target = M.sod(r.start);
    const other = target.getMonth() !== view.getMonth() || target.getFullYear() !== view.getFullYear();
    selected = target;
    if (other) { view = new Date(target.getFullYear(), target.getMonth(), 1); render(true); await new Promise(t => setTimeout(t, reduce.matches ? 0 : 320)); }
    else render();
    await fly(ev, grid.querySelector(`[data-date="${M.ymd(target)}"]`));
    events.push(ev); lastAdded = ev;
    render();
    grid.querySelectorAll(`[data-key^="${ev.id}@"]`).forEach((p, i) => { p.classList.add('pop'); p.style.animationDelay = `${Math.min(i, 8) * 50}ms`; });
    const cell = grid.querySelector(`[data-date="${M.ymd(target)}"]`);
    if (cell) cell.classList.add('flash');

    let when;
    if (r.rrule) when = `${describe(r.rrule)}${r.allDay ? '' : ` a las ${M.hm(r.start)}`}, desde el ${dayLabel(r.start)}`;
    else if (r.allDay) when = M.sameDay(r.start, r.end) ? `el ${dayLabel(r.start)}, todo el día` : `del ${dayLabel(r.start)} al ${dayLabel(r.end)}`;
    else if (r.kind === 'task') when = `el ${dayLabel(r.start)} a las ${M.hm(r.start)}`;
    else when = `el ${dayLabel(r.start)}, de ${M.hm(r.start)} a ${M.hm(r.end)}`;
    const extra = [r.location && `en ${r.location}`, r.reminders.length && `con aviso ${r.reminders[0]} minutos antes`].filter(Boolean).join(', ');
    const what = r.kind === 'task' ? 'Tarea apuntada' : 'Apuntado';
    emit('add', r.start, { title: r.title, time: r.allDay ? null : M.hm(r.start), cal: r.calendar });
    status.innerHTML = `${what}: <b>${M.esc(r.title)}</b>, ${M.esc(when)}${extra ? ', ' + M.esc(extra) : ''}.${r.guessed ? ' No has dicho cuándo, así que va a hoy.' : ''} <button type="button" class="undo">Deshacer</button>`;
  }

  status.addEventListener('click', e => {
    if (!e.target.closest('.undo') || !lastAdded) return;
    events = events.filter(x => x !== lastAdded); lastAdded = null;
    render(); status.textContent = 'Quitado. Prueba con otra cosa.';
    emit('undo', now);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    userTouched = true;
    const t = input.value.trim();
    if (!t) { input.focus(); status.textContent = 'Escribe algo, por ejemplo «comida con Ana el jueves a las 2».'; return; }
    input.value = '';
    add(t);
  });
  input.addEventListener('input', () => { userTouched = true; });

  // los ejemplos se escriben solos en la línea
  let typing = null;
  function typeAndAdd(text, auto = false) {
    clearInterval(typing);
    if (reduce.matches) { input.value = ''; add(text); return; }
    let i = 0; input.value = '';
    typing = setInterval(() => {
      if (auto && userTouched) { clearInterval(typing); input.value = ''; return; }
      input.value = text.slice(0, ++i);
      if (i >= text.length) { clearInterval(typing); setTimeout(() => { if (auto && userTouched) return; input.value = ''; add(text); }, 280); }
    }, 38);
  }
  document.querySelectorAll('.try-chip').forEach(b => b.addEventListener('click', () => { userTouched = true; typeAndAdd(b.textContent.trim()); }));

  // al cargar: se traza el mes, aparecen los días y se escribe sola la frase del ejemplo
  render();
  if (!reduce.matches) {
    hero.classList.add('intro');
    setTimeout(() => hero.classList.remove('intro'), 1700);
    setTimeout(() => { if (!userTouched && hero.getBoundingClientRect().top < innerHeight) typeAndAdd('cena con Marta el viernes a las 9', true); }, 1500);
  }
})();
