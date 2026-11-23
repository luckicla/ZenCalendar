'use strict';
// El personalizador en vivo (temas, modo, fondo animado, vidrio, desenfoque, esquinas, letra e icono)
// y las maquetas de los widgets y de los huecos de capturas, con los mismos temas que la app.
(() => {
  const M = window.ZCW.mock;
  const $ = s => document.querySelector(s);
  const now = new Date();
  const events = M.sample(now);

  // Temas de ZenCalendar: acentos a1/a2/a3 y versión clara y oscura
  const THEMES = {
    nube:      { name: 'Nube',      a: ['#C9B8FF', '#FFC8E3', '#BFF0E4'], light: ['#F6F2FF', '#FFFFFF', '#3D3355', '#7D7393'], dark: ['#1B1828', '#2A2540', '#EEE8FF', '#A79FC0'] },
    sakura:    { name: 'Sakura',    a: ['#FFB7D5', '#FFD9E8', '#C9B8FF'], light: ['#FFF3F7', '#FFFFFF', '#4A2F40', '#8E6F80'], dark: ['#24161E', '#3A2531', '#FFE9F2', '#C7A3B5'] },
    menta:     { name: 'Menta',     a: ['#9EE6CF', '#CFF5E8', '#FFD5BD'], light: ['#EFFAF6', '#FFFFFF', '#24433B', '#5F7F76'], dark: ['#14211E', '#20332E', '#E3FAF2', '#93B8AD'] },
    lavanda:   { name: 'Lavanda',   a: ['#B9A6FF', '#DCD0FF', '#FFC8E3'], light: ['#F4F0FF', '#FFFFFF', '#3B3160', '#776D99'], dark: ['#1A1730', '#2A2548', '#ECE7FF', '#A69FCB'] },
    melocoton: { name: 'Melocotón', a: ['#FFC2A1', '#FFE0CC', '#FFE89A'], light: ['#FFF6F0', '#FFFFFF', '#4D3328', '#8F6E60'], dark: ['#241A16', '#3A2A23', '#FFEDE3', '#C4A595'] },
    cielo:     { name: 'Cielo',     a: ['#A9D4FF', '#D6EBFF', '#C9B8FF'], light: ['#F1F7FF', '#FFFFFF', '#263A55', '#627891'], dark: ['#131C2A', '#1F2C40', '#E6F1FF', '#94A9C4'] },
    noche:     { name: 'Noche',     a: ['#B8A9FF', '#F6B6D6', '#9EE6CF'], light: ['#EEEAF8', '#FFFFFF', '#2E2745', '#6F6890'], dark: ['#13111D', '#221E33', '#EDE8FF', '#A39CC2'] },
    matcha:    { name: 'Matcha',    a: ['#C5E1A5', '#E6F2D5', '#FFE3B0'], light: ['#F5F9EE', '#FFFFFF', '#33402A', '#6E7D62'], dark: ['#171C12', '#252D1E', '#EEF6E2', '#A3B394'] },
  };
  const ICONS = [
    { id: 'zen', name: 'Lavanda y rosa', a: '#9F8DFF', b: '#F0A6CC' },
    { id: 'mint', name: 'Menta', a: '#6FD3B5', b: '#B9A6FF' },
    { id: 'peach', name: 'Melocotón', a: '#FFB08A', b: '#F0A6CC' },
    { id: 'sky', name: 'Cielo', a: '#86C1FF', b: '#B9A6FF' },
    { id: 'night', name: 'Noche', a: '#3D3355', b: '#8C76E0' },
  ];
  const FONTS = {
    modern: { stack: 'var(--font-body)' },
    round: { stack: '"Nunito", ui-rounded, "SF Pro Rounded", "Varela Round", var(--font-body)', href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap' },
    serif: { stack: '"Fraunces", var(--font-serif)', href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap' },
  };
  const loaded = new Set();
  const loadFont = f => { const h = FONTS[f].href; if (!h || loaded.has(h)) return; loaded.add(h); const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.appendChild(l); };

  function setTheme(el, id, mode) {
    const t = THEMES[id], p = t[mode];
    const s = el.style;
    s.setProperty('--a1', t.a[0]); s.setProperty('--a2', t.a[1]); s.setProperty('--a3', t.a[2]);
    s.setProperty('--bg', p[0]); s.setProperty('--s1', p[1]); s.setProperty('--fg', p[2]); s.setProperty('--mu', p[3]);
    el.dataset.mode = mode;
  }

  // Fondos animados dibujados con elementos (como en la app, nada descargado)
  const rnd = (a, b) => a + Math.random() * (b - a);
  function setBg(el, kind) {
    const bg = el.querySelector('.app-bg'); if (!bg) return;
    let h = '';
    if (kind === 'aurora') h = '<i class="au"></i><i class="au"></i><i class="au"></i>';
    else if (kind === 'sakura') for (let i = 0; i < 16; i++) h += `<i class="pe" style="left:${rnd(0, 104).toFixed(1)}%;animation-duration:${rnd(9, 16).toFixed(1)}s;animation-delay:-${rnd(0, 16).toFixed(1)}s;scale:${rnd(0.6, 1.3).toFixed(2)};opacity:${rnd(0.5, 0.95).toFixed(2)}"></i>`;
    else if (kind === 'bubbles') for (let i = 0; i < 12; i++) { const sz = rnd(14, 54).toFixed(0); h += `<i class="bu" style="left:${rnd(0, 96).toFixed(1)}%;width:${sz}px;height:${sz}px;animation-duration:${rnd(10, 20).toFixed(1)}s;animation-delay:-${rnd(0, 20).toFixed(1)}s"></i>`; }
    else if (kind === 'stars') { h = '<i class="moon"></i>'; for (let i = 0; i < 46; i++) h += `<i class="st" style="left:${rnd(0, 100).toFixed(1)}%;top:${rnd(0, 100).toFixed(1)}%;animation-duration:${rnd(1.6, 4).toFixed(1)}s;animation-delay:-${rnd(0, 4).toFixed(1)}s;scale:${rnd(0.6, 1.4).toFixed(2)}"></i>`; }
    bg.innerHTML = h;
    el.dataset.bg = kind;
  }

  // Pausa las animaciones de las maquetas que no se ven
  const visIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('paused', !e.isIntersecting)), { rootMargin: '100px' }) : null;
  const watch = el => visIO && visIO.observe(el);

  // ───── Personalizador ─────
  const app = $('#app');
  if (app) {
    const st = { theme: 'nube', mode: 'light', bg: 'aurora', glass: 62, blur: 18, radius: 18, font: 'modern', icon: 'zen' };
    $('#app-week').innerHTML = M.weekHTML(events, now);
    $('#app-mini').innerHTML = M.miniMonthHTML(now);
    $('#app-month').textContent = M.monthTitle(now);
    $('#app-tasks').innerHTML = M.tasks().map(t => `<li${t.done ? ' class="done"' : ''}>${M.esc(t.title)}</li>`).join('');

    // muestras de tema (radiogroup accesible con flechas)
    const themesEl = $('#themes');
    themesEl.setAttribute('role', 'radiogroup'); themesEl.setAttribute('aria-label', 'Tema');
    themesEl.innerHTML = Object.entries(THEMES).map(([id, t]) =>
      `<button type="button" class="sw" role="radio" data-id="${id}" aria-checked="${id === st.theme}" tabindex="${id === st.theme ? 0 : -1}" style="--s-a:${t.a[0]};--s-b:${t.a[1]};--s-c:${t.a[2]}"><span class="sw-chip"></span>${t.name}</button>`).join('');
    const iconsEl = $('#icons');
    iconsEl.setAttribute('role', 'radiogroup'); iconsEl.setAttribute('aria-label', 'Icono de la app');
    iconsEl.innerHTML = ICONS.map(ic => `<button type="button" class="ic" role="radio" data-id="${ic.id}" aria-checked="${ic.id === st.icon}" tabindex="${ic.id === st.icon ? 0 : -1}" aria-label="${ic.name}" title="${ic.name}">${M.logoSVG(ic.a, ic.b)}</button>`).join('');

    function radioGroup(el, key, after) {
      const items = () => [...el.querySelectorAll('[role="radio"]')];
      const pick = b => {
        items().forEach(x => { const on = x === b; x.setAttribute('aria-checked', on); x.tabIndex = on ? 0 : -1; });
        st[key] = b.dataset.id; after(); apply();
      };
      el.addEventListener('click', e => { const b = e.target.closest('[role="radio"]'); if (b) pick(b); });
      el.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!k) return;
        e.preventDefault();
        const list = items(), i = list.indexOf(document.activeElement);
        const b = list[(i + k + list.length) % list.length]; b.focus(); pick(b);
      });
    }
    radioGroup(themesEl, 'theme', () => {});
    radioGroup(iconsEl, 'icon', () => {});

    const form = $('#controls');
    form.addEventListener('submit', e => e.preventDefault());
    form.addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'mode') st.mode = t.value;
      if (t.name === 'bg') { st.bg = t.value; setBg(app, st.bg); }
      if (t.name === 'font') { st.font = t.value; loadFont(st.font); }
      apply();
    });
    const sliders = [['#r-glass', 'glass', v => `${v} %`], ['#r-blur', 'blur', v => `${v} px`], ['#r-radius', 'radius', v => `${v} px`]];
    sliders.forEach(([sel, key, fmt]) => {
      const r = $(sel), out = r.nextElementSibling;
      const upd = () => {
        st[key] = +r.value; out.textContent = fmt(r.value);
        r.style.setProperty('--level', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
        apply();
      };
      r.addEventListener('input', upd); upd();
    });

    function apply() {
      setTheme(app, st.theme, st.mode);
      app.style.setProperty('--ga', st.glass + '%');
      app.style.setProperty('--gb', st.blur + 'px');
      app.style.setProperty('--r', st.radius + 'px');
      app.style.setProperty('--font', FONTS[st.font].stack);
      const ic = ICONS.find(i => i.id === st.icon);
      $('#app-logo').innerHTML = M.logoSVG(ic.a, ic.b);
    }
    // si el sistema está en oscuro, la maqueta empieza en Noche oscuro, a juego con la página
    if (matchMedia('(prefers-color-scheme: dark)').matches) {
      st.theme = 'noche'; st.mode = 'dark'; st.bg = 'stars';
      form.querySelector('input[name="mode"][value="dark"]').checked = true;
      form.querySelector('input[name="bg"][value="stars"]').checked = true;
      themesEl.querySelectorAll('.sw').forEach(b => { const on = b.dataset.id === 'noche'; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
    }
    setBg(app, st.bg);
    apply();
    watch(app);
  }

  // ───── Widgets ─────
  const occToday = M.occurrences(events, M.sod(now), M.addDays(M.sod(now), 2)).filter(o => o.allDay || o.end > now);
  const next = occToday[0];
  const wt = $('#w-today');
  if (wt) wt.innerHTML = `<span class="wt-day">${now.getDate()}</span><span class="wt-dow">${M.cap(M.DOW_LONG[now.getDay()])}</span><span class="wt-month">${M.cap(M.MONTHS[now.getMonth()])} ${now.getFullYear()}</span>` +
    (next ? `<span class="wt-next ev--${next.e.cal}"><i class="dot dot--${next.e.cal}"></i>${M.esc(next.e.title)}<small>${next.allDay ? 'Todo el día' : (M.sameDay(next.start, now) ? '' : 'Mañana ') + M.hm(next.start)}</small></span>` : '');
  const head = (title) => `<h4>${M.logoSVG()}${title}<span aria-hidden="true">+</span></h4>`;
  const wa = $('#w-agenda');
  if (wa) wa.innerHTML = head('Agenda') + M.agendaHTML(events, now, { days: 4, maxPerDay: 2 });
  const wd = $('#w-desk');
  if (wd) wd.innerHTML = head('Próximos días') + M.agendaHTML(events, now, { days: 5, maxPerDay: 3 });

  // ───── Maquetas para los huecos de capturas (hasta que haya capturas reales en capturas/) ─────
  const ico = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l1.7 5.1a3 3 0 0 0 1.9 1.9l5.1 1.7-5.1 1.7a3 3 0 0 0-1.9 1.9L12 20l-1.7-5.2a3 3 0 0 0-1.9-1.9L3.3 11.2l5.1-1.7a3 3 0 0 0 1.9-1.9z"/></svg>';
  function mock(kind) {
    const el = document.createElement('div');
    if (kind === 'pc') {
      el.className = 'app';
      el.innerHTML = `<div class="app-bg"></div><div class="app-bar"><span class="app-logo">${M.logoSVG()}</span><b class="app-name">ZenCalendar</b><span class="app-tabs"><i>Mes</i><i class="on">Semana</i><i>Día</i><i>Agenda</i><i>Año</i></span><span class="app-btns"><i class="app-search"></i><i class="app-add">+</i></span><span class="app-win"><i></i><i></i><i></i></span></div>
        <div class="app-main"><aside class="app-side pane"><p class="app-month">${M.monthTitle(now)}</p><div class="mini">${M.miniMonthHTML(now)}</div><p class="app-label">Calendarios</p><ul class="app-cals"><li><i class="dot dot--personal"></i>Personal</li><li><i class="dot dot--work"></i>Trabajo</li><li><i class="dot dot--birthdays"></i>Cumpleaños</li></ul><p class="app-label">Tareas</p><ul class="app-tasks">${M.tasks().map(t => `<li${t.done ? ' class="done"' : ''}>${M.esc(t.title)}</li>`).join('')}</ul></aside><div class="app-week pane">${M.weekHTML(events, now)}</div></div>`;
      setTheme(el, 'nube', 'light'); setBg(el, 'aurora');
    } else {
      el.className = 'app app--phone';
      const isMonth = kind === 'phone-month';
      const title = isMonth ? `<span class="ph-title"><small>${now.getFullYear()}</small>${M.cap(M.MONTHS[now.getMonth()])}</span>` : `<span class="ph-title"><small>Próximos días</small>Agenda</span>`;
      const body = isMonth ? `<div class="mo">${M.monthHTML(events, now, { today: now, max: 2 })}</div>` : M.agendaHTML(events, now, { days: 7, maxPerDay: 3 });
      el.innerHTML = `<div class="app-bg"></div><div class="app-bar">${title}<span class="app-btns"><i class="app-search"></i></span></div>
        <div class="ph-body pane">${body}</div>
        <div class="ph-quick pane">${ico}Escribe o pregunta…<i>+</i></div>
        <div class="ph-tabs pane"><i${isMonth ? ' class="on"' : ''}>Mes</i><i>Semana</i><i>Día</i><i${isMonth ? '' : ' class="on"'}>Agenda</i></div>`;
      if (isMonth) { setTheme(el, 'lavanda', 'light'); setBg(el, 'sakura'); }
      else { setTheme(el, 'noche', 'dark'); setBg(el, 'stars'); }
      el.querySelectorAll('button').forEach(b => { b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); });
    }
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  // se dibujan a tamaño de pantalla real (960×624 el PC, 360×760 el móvil) y se escalan al hueco, como una captura
  const fit = slot => { const el = slot.firstElementChild; if (el) slot.style.setProperty('--k', slot.clientWidth / el.offsetWidth); };
  const ro = 'ResizeObserver' in window ? new ResizeObserver(es => es.forEach(e => fit(e.target))) : null;
  document.querySelectorAll('.shot-mock').forEach(slot => {
    const el = mock(slot.dataset.mock);
    slot.appendChild(el); watch(el); fit(slot);
    if (ro) ro.observe(slot);
  });
  window.ZCW.mockApp = mock;
})();
