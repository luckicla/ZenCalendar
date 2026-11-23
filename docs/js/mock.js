'use strict';
// Datos de ejemplo y piezas de la interfaz de ZenCalendar dibujadas en HTML (para la demo, el personalizador,
// los widgets y los huecos de capturas). Todo es relativo a hoy, para que la semana de ejemplo sea siempre la actual.
window.ZCW = window.ZCW || {};
window.ZCW.mock = (() => {
  const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const CALS = { personal: 'Personal', work: 'Trabajo', birthdays: 'Cumpleaños' };

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
  const sow = d => addDays(sod(d), -((d.getDay() + 6) % 7));   // lunes
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const monthTitle = d => `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
  const dayTitle = d => `${cap(DOW_LONG[d.getDay()])} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;

  let seq = 0;
  function sample(now = new Date()) {
    const ws = sow(now);
    const ev = (day, h, m, mins, title, cal = 'personal', extra = {}) => {
      const start = addDays(ws, day);
      if (h == null) return { id: 's' + seq++, title, cal, allDay: true, start, end: addDays(start, (extra.days || 1) - 1), ...extra };
      start.setHours(h, m);
      return { id: 's' + seq++, title, cal, allDay: false, start, end: new Date(start.getTime() + mins * 60000), ...extra };
    };
    return [
      ev(0, 9, 0, 60, 'Reunión de equipo', 'work', { rrule: { freq: 'weekly', byDay: ['MO'] } }),
      ev(0, 18, 30, 60, 'Yoga'),
      ev(1, 7, 30, 45, 'Correr', 'personal', { rrule: { freq: 'weekly', byDay: ['TU', 'TH'] } }),
      ev(1, 13, 30, 60, 'Comida con Ana'),
      ev(2, 10, 0, 90, 'Revisión del proyecto', 'work'),
      ev(2, 17, 0, 45, 'Dentista'),
      ev(3, null, 0, 0, 'Cumpleaños de Laura', 'birthdays'),
      ev(3, 15, 0, 60, 'Llamada con Pablo', 'work'),
      ev(4, 12, 0, 60, 'Entrega del diseño', 'work'),
      ev(5, null, 0, 0, 'Excursión a Montserrat'),
      ev(6, 11, 0, 90, 'Mercado'),
      ev(-5, 21, 0, 120, 'Concierto'),
      ev(-2, 10, 30, 60, 'Brunch con los primos'),
      ev(8, 9, 30, 30, 'Médico'),
      ev(10, 20, 0, 120, 'Cine'),
      ev(12, null, 0, 0, 'Viaje a Lisboa', 'personal', { days: 3 }),
      ev(-9, 19, 0, 60, 'Clase de cerámica'),
      ev(17, 16, 0, 60, 'Presentación', 'work'),
      ev(20, null, 0, 0, 'Cumpleaños de Iván', 'birthdays'),
      ev(-12, 20, 30, 90, 'Cena de antiguos alumnos'),
    ];
  }
  const tasks = () => [{ title: 'Comprar pan', done: true }, { title: 'Llamar al fontanero', done: false }, { title: 'Reservar mesa para el sábado', done: false }];

  // repeticiones sencillas: semanal por días, diaria, mensual y anual; y eventos de varios días
  function occurrences(list, from, to) {
    const out = [];
    for (const e of list) {
      const len = e.end - e.start;
      const push = s => {
        const st = new Date(s), en = new Date(st.getTime() + len);
        if (e.allDay) {
          for (let d = sod(st); d <= sod(en); d = addDays(d, 1)) if (d >= from && d < to) out.push({ e, start: d, end: d, allDay: true, key: e.id + '@' + ymd(d), first: sameDay(d, st) });
        } else if (st < to && en > from) out.push({ e, start: st, end: en, allDay: false, key: e.id + '@' + ymd(st), first: true });
      };
      const r = e.rrule;
      if (!r) { push(e.start); continue; }
      const iv = r.interval || 1;
      for (let d = sod(from < e.start ? e.start : from); d < to; d = addDays(d, 1)) {
        const s = new Date(d); s.setHours(e.start.getHours(), e.start.getMinutes());
        if (d < sod(e.start)) continue;
        const diffDays = Math.round((sod(d) - sod(e.start)) / 864e5);
        let ok = false;
        if (r.freq === 'daily') ok = diffDays % iv === 0;
        else if (r.freq === 'weekly') ok = (r.byDay || [BYDAY[e.start.getDay()]]).includes(BYDAY[d.getDay()]) && Math.floor(Math.round((sow(d) - sow(e.start)) / 864e5) / 7) % iv === 0;
        else if (r.freq === 'monthly') ok = d.getDate() === e.start.getDate();
        else if (r.freq === 'yearly') ok = d.getDate() === e.start.getDate() && d.getMonth() === e.start.getMonth();
        if (ok) push(s);
      }
    }
    return out.sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
  }

  const pill = (o, { time = true } = {}) =>
    `<span class="ev ev--${o.e.cal}${o.allDay ? ' ev--day' : ''}${o.e.kind === 'task' ? ' ev--task' : ''}" data-key="${esc(o.key)}">${time && !o.allDay ? `<b>${hm(o.start)}</b> ` : ''}${esc(o.e.title)}</span>`;

  // Mes: 6 semanas de lunes a domingo
  function monthHTML(list, month, { today = new Date(), selected = null, max = 2, dots = false, dow = DOW } = {}) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = sow(first), end = addDays(start, 42);
    const occ = occurrences(list, start, end);
    let html = dow.map(d => `<span class="mo-dow" aria-hidden="true">${d}</span>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i), key = ymd(d);
      const items = occ.filter(o => sameDay(o.start, d));
      const cls = ['mo-day', d.getMonth() !== month.getMonth() && 'is-out', sameDay(d, today) && 'is-today', selected && sameDay(d, selected) && 'is-sel', (i % 7) > 4 && 'is-weekend'].filter(Boolean).join(' ');
      const label = `${dayTitle(d)}${items.length ? `, ${items.length} ${items.length === 1 ? 'evento' : 'eventos'}` : ''}`;
      const shown = items.slice(0, max).map(o => pill(o, { time: false })).join('');
      const more = items.length > max ? `<span class="ev-more">+${items.length - max}</span>` : '';
      const dotsHTML = `<span class="mo-dots" aria-hidden="true">${items.slice(0, 3).map(o => `<i class="dot dot--${o.e.cal}"></i>`).join('')}</span>`;
      html += `<button type="button" class="${cls}" data-date="${key}" aria-label="${esc(label)}"${selected && sameDay(d, selected) ? ' aria-pressed="true"' : ' aria-pressed="false"'}><span class="mo-num">${d.getDate()}</span>${dots ? dotsHTML : ''}<span class="mo-evs">${shown}${more}</span></button>`;
    }
    return html;
  }

  // Semana con horas (para la maqueta del personalizador y la captura de PC)
  function weekHTML(list, now = new Date(), { from = 7, to = 21 } = {}) {
    const ws = sow(now), we = addDays(ws, 7);
    const occ = occurrences(list, ws, we);
    const hours = to - from;
    const todayIdx = (now.getDay() + 6) % 7;
    const near = i => (i >= Math.min(todayIdx, 4) && i < Math.min(todayIdx, 4) + 3);
    let head = '<span class="wk-corner"></span>', allday = '<span class="wk-corner wk-corner--ad">día</span>', cols = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const attrs = `data-i="${i}"${near(i) ? ' data-near' : ''}`;
      head += `<span class="wk-head${i === todayIdx ? ' is-today' : ''}" ${attrs}><small>${DOW[i]}</small><b>${d.getDate()}</b></span>`;
      allday += `<span class="wk-ad" ${attrs}>${occ.filter(o => o.allDay && sameDay(o.start, d)).map(o => pill(o, { time: false })).join('')}</span>`;
      const blocks = occ.filter(o => !o.allDay && sameDay(o.start, d)).map(o => {
        const top = ((o.start.getHours() + o.start.getMinutes() / 60) - from) / hours * 100;
        const h = Math.max((o.end - o.start) / 36e5 / hours * 100, 4.2);
        const short = (o.end - o.start) <= 3600000;
        return `<span class="blk ev--${o.e.cal}${short ? ' blk--short' : ''}" style="top:${top.toFixed(2)}%;height:${h.toFixed(2)}%"><b>${esc(o.e.title)}</b>${short ? '' : `<small>${hm(o.start)}</small>`}</span>`;
      }).join('');
      const nowLine = i === todayIdx && now.getHours() >= from && now.getHours() < to
        ? `<i class="wk-now" style="top:${(((now.getHours() + now.getMinutes() / 60) - from) / hours * 100).toFixed(2)}%"></i>` : '';
      cols += `<span class="wk-col" ${attrs}>${blocks}${nowLine}</span>`;
    }
    let gutter = '';
    for (let h = from; h < to; h += 2) gutter += `<span style="top:${((h - from) / hours * 100).toFixed(2)}%">${pad(h)}:00</span>`;
    return `<div class="wk-headrow">${head}</div><div class="wk-adrow">${allday}</div><div class="wk-body" style="--hours:${hours}"><span class="wk-gutter">${gutter}</span>${cols}</div>`;
  }

  // Agenda: próximos días agrupados
  function agendaHTML(list, now = new Date(), { days = 5, maxPerDay = 4 } = {}) {
    const from = sod(now), to = addDays(from, days);
    const occ = occurrences(list, from, to);
    let html = '';
    for (let d = from; d < to; d = addDays(d, 1)) {
      const items = occ.filter(o => sameDay(o.start, d)).slice(0, maxPerDay);
      if (!items.length) continue;
      const label = sameDay(d, now) ? 'Hoy' : sameDay(d, addDays(now, 1)) ? 'Mañana' : cap(DOW_LONG[d.getDay()]);
      html += `<div class="ag-day"><p class="ag-date"><b>${label}</b> ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}</p>${items.map(o =>
        `<p class="ag-item ev--${o.e.cal}"><i></i><span>${esc(o.e.title)}</span><small>${o.allDay ? 'Todo el día' : hm(o.start)}</small></p>`).join('')}</div>`;
    }
    return html;
  }

  // Mes en Dot (como la app): cada día es un punto que se enciende según lo que tiene, y debajo el día elegido
  function dotMonthHTML(list, month, { today = new Date() } = {}) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1), last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const start = sow(first), weeks = Math.ceil((Math.round((sod(last) - start) / 864e5) + 1) / 7), end = addDays(start, weeks * 7);
    const occ = occurrences(list, start, end);
    let grid = DOW.map(d => `<span class="dmo-dow">${d}</span>`).join('');
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i), n = occ.filter(o => sameDay(o.start, d)).length;
      const out = d.getMonth() !== month.getMonth();
      const cls = ['dmo-d', 'l' + Math.min(4, n), out && 'is-out', sameDay(d, today) && 'is-today', !out && sod(d) < sod(today) && 'is-past'].filter(Boolean).join(' ');
      grid += `<span class="${cls}"><b>${out ? '' : d.getDate()}</b></span>`;
    }
    const items = occ.filter(o => sameDay(o.start, today));
    const panel = `<div class="dmo-head"><span class="dmo-big">${pad(today.getDate())}</span><span><b>${cap(DOW_LONG[today.getDay()])}</b><small>${MONTHS[today.getMonth()]} ${today.getFullYear()}</small></span></div>`
      + (items.length ? items.slice(0, 4).map(o => `<p class="dmo-ev ev--${o.e.cal}"><small>${o.allDay ? 'Todo el día' : hm(o.start)}</small><i></i><span>${esc(o.e.title)}</span></p>`).join('') : '<p class="dmo-free">Día libre</p>');
    return `<div class="dmo" style="--weeks:${weeks}">${grid}</div><div class="dmo-panel">${panel}</div>`;
  }

  function miniMonthHTML(now = new Date()) {
    const first = new Date(now.getFullYear(), now.getMonth(), 1), start = sow(first);
    let h = DOW.map(d => `<i>${d}</i>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      h += `<span class="${d.getMonth() !== now.getMonth() ? 'is-out' : ''}${sameDay(d, now) ? ' is-today' : ''}">${d.getDate()}</span>`;
    }
    return h;
  }

  // El logo, con los colores del tema (para la maqueta y los iconos alternativos)
  let gid = 0;
  function logoSVG(a = '#9F8DFF', b = '#F0A6CC', cls = '') {
    const id = 'lg' + gid++;
    return `<svg class="${cls}" viewBox="0 0 1024 1024" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1024" height="1024" rx="232" fill="url(#${id})"/><rect x="248" y="290" width="528" height="500" rx="104" fill="#fff"/><rect x="368" y="222" width="60" height="124" rx="30" fill="#fff"/><rect x="596" y="222" width="60" height="124" rx="30" fill="#fff"/><path d="M400 452H624L400 652H624" fill="none" stroke="url(#${id})" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  // El icono de Dot, igual que el de la app (web/js/ui/dot.js): squircle negro con las dos pestañas del calendario y
  // la «Z» hechas de puntos (rejilla de 5×5, como la fuente ZenDot); el último punto de la «Z» es el rojo.
  function dotLogoSVG(bg = '#000', fg = '#fff', acc = '#D71921', cls = '') {
    const Z = ['11111', '00010', '00100', '01000', '11112'];
    let d = '', red = '';
    Z.forEach((row, y) => [...row].forEach((v, x) => {
      const c = `<circle cx="${(6.8 + x * 2.6).toFixed(1)}" cy="${(9.2 + y * 2.6).toFixed(1)}" r="0.98"`;
      if (v === '1') d += c + '/>'; else if (v === '2') red = c + ` fill="${acc}"/>`;
    }));
    const edge = bg === '#000' ? 'rgb(255 255 255 / 0.22)' : 'rgb(0 0 0 / 0.12)';
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><rect x=".5" y=".5" width="23" height="23" rx="7" fill="${bg}" stroke="${edge}" stroke-width="1"/><g fill="${fg}"><circle cx="9.4" cy="5" r="1.1"/><circle cx="14.6" cy="5" r="1.1"/>${d}</g>${red}</svg>`;
  }

  // Fondo «glyph» de Dot: un anillo y una tira de puntos que se encienden por turnos (como las luces de la trasera)
  function glyphHTML() {
    let h = '';
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      h += `<i class="gl" style="left:calc(78% + ${(Math.cos(a) * 15).toFixed(2)}cqw);top:calc(70% + ${(Math.sin(a) * 15).toFixed(2)}cqw);animation-delay:${(i * 0.09).toFixed(2)}s"></i>`;
    }
    for (let i = 0; i < 12; i++) h += `<i class="gl gl--strip" style="left:calc(12% + ${i * 3.4}cqw);top:calc(18% + ${i * 1.1}cqw);animation-delay:${(1.3 + i * 0.07).toFixed(2)}s"></i>`;
    return h;
  }

  return { DOW, DOW_LONG, MONTHS, CALS, esc, pad, ymd, hm, sod, sow, addDays, sameDay, cap, monthTitle, dayTitle,
    sample, tasks, occurrences, monthHTML, dotMonthHTML, weekHTML, agendaHTML, miniMonthHTML, logoSVG, dotLogoSVG, glyphHTML };
})();
