'use strict';
// El personalizador en vivo (diseño, tema o acento, modo, fondo, vidrio, desenfoque, esquinas, letra e icono)
// y las maquetas de los widgets y de los huecos de capturas, con los mismos temas que la app.
// Las maquetas siguen el diseño de la página (Zen o Dot, evento zc:design); el personalizador, además, tiene su
// propio «Diseño: Zen / Dot», que cambia solo la maqueta.
(() => {
  const M = window.ZCW.mock;
  const $ = s => document.querySelector(s);
  const now = new Date();
  const events = M.sample(now);
  const pageDesign = () => document.documentElement.dataset.design === 'dot' ? 'dot' : 'zen';

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
  // Dot: monocromo con un acento. Fondo, superficie, texto y texto secundario, en claro y en oscuro.
  // (los mismos valores que la app: web/js/ui/dot.js)
  const DOT = { red: '#D71921', light: ['#F2F2F2', '#FFFFFF', '#000000', '#6A6A6A'], dark: ['#000000', '#141414', '#FFFFFF', '#8F8F8F'] };
  const ACCENTS = { red: ['Rojo', '#D71921'], ink: ['Tinta', null], amber: ['Ámbar', '#F2A900'], cyan: ['Cian', '#1FB5C8'], green: ['Verde', '#2DB46C'], custom: ['Otro', null] };
  const DOT_FONTS = {
    archivo: { name: 'Archivo', stack: '"Archivo", "Barlow", "Roboto", system-ui, sans-serif', href: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&display=swap' },
    system: { name: 'Sistema', stack: '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif' },
    atkinson: { name: 'Muy legible', stack: '"Atkinson Hyperlegible", system-ui, sans-serif', href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap' },
  };
  const ICONS = [
    { id: 'zen', name: 'Lavanda y rosa', a: '#9F8DFF', b: '#F0A6CC' },
    { id: 'dot', name: 'Dot', dot: true },
    { id: 'mint', name: 'Menta', a: '#6FD3B5', b: '#B9A6FF' },
    { id: 'peach', name: 'Melocotón', a: '#FFB08A', b: '#F0A6CC' },
    { id: 'sky', name: 'Cielo', a: '#86C1FF', b: '#B9A6FF' },
    { id: 'night', name: 'Noche', a: '#3D3355', b: '#8C76E0' },
  ];
  const iconSVG = ic => ic.dot ? M.dotLogoSVG() : M.logoSVG(ic.a, ic.b);
  const FONTS = {
    modern: { stack: 'var(--font-body)' },
    round: { stack: '"Nunito", ui-rounded, "SF Pro Rounded", "Varela Round", var(--font-body)', href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap' },
    serif: { stack: '"Fraunces", var(--font-serif)', href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap' },
  };
  const loaded = new Set();
  const loadFont = f => { const h = (FONTS[f] || DOT_FONTS[f] || {}).href; if (!h || loaded.has(h)) return; loaded.add(h); const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.appendChild(l); };

  function setTheme(el, id, mode) {
    const t = THEMES[id], p = t[mode];
    const s = el.style;
    s.setProperty('--a1', t.a[0]); s.setProperty('--a2', t.a[1]); s.setProperty('--a3', t.a[2]);
    s.setProperty('--bg', p[0]); s.setProperty('--s1', p[1]); s.setProperty('--fg', p[2]); s.setProperty('--mu', p[3]);
    s.removeProperty('--acc');
    el.dataset.design = 'zen';
    el.dataset.mode = mode;
  }
  function setDot(el, mode, acc = DOT.red) {
    const p = DOT[mode], s = el.style;
    s.setProperty('--bg', p[0]); s.setProperty('--s1', p[1]); s.setProperty('--fg', p[2]); s.setProperty('--mu', p[3]);
    s.setProperty('--acc', acc);
    // el texto sobre el acento: blanco o negro, el que se lea mejor
    s.setProperty('--on-acc', luma(acc) > 0.6 ? '#000' : '#fff');
    el.dataset.design = 'dot';
    el.dataset.mode = mode;
  }
  function luma(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  // Fondos dibujados con elementos (como en la app, nada descargado). Zen: aurora, sakura, burbujas, estrellas y liso.
  // Dot: puntos, rejilla y liso son solo CSS; «glyph» añade los puntos que se encienden.
  const rnd = (a, b) => a + Math.random() * (b - a);
  function setBg(el, kind) {
    const bg = el.querySelector('.app-bg'); if (!bg) return;
    if (el.dataset.bg === kind && bg.dataset.kind === kind) return;
    let h = '';
    if (kind === 'aurora') h = '<i class="au"></i><i class="au"></i><i class="au"></i>';
    else if (kind === 'sakura') for (let i = 0; i < 16; i++) h += `<i class="pe" style="left:${rnd(0, 104).toFixed(1)}%;animation-duration:${rnd(9, 16).toFixed(1)}s;animation-delay:-${rnd(0, 16).toFixed(1)}s;scale:${rnd(0.6, 1.3).toFixed(2)};opacity:${rnd(0.5, 0.95).toFixed(2)}"></i>`;
    else if (kind === 'bubbles') for (let i = 0; i < 12; i++) { const sz = rnd(14, 54).toFixed(0); h += `<i class="bu" style="left:${rnd(0, 96).toFixed(1)}%;width:${sz}px;height:${sz}px;animation-duration:${rnd(10, 20).toFixed(1)}s;animation-delay:-${rnd(0, 20).toFixed(1)}s"></i>`; }
    else if (kind === 'stars') { h = '<i class="moon"></i>'; for (let i = 0; i < 46; i++) h += `<i class="st" style="left:${rnd(0, 100).toFixed(1)}%;top:${rnd(0, 100).toFixed(1)}%;animation-duration:${rnd(1.6, 4).toFixed(1)}s;animation-delay:-${rnd(0, 4).toFixed(1)}s;scale:${rnd(0.6, 1.4).toFixed(2)}"></i>`; }
    else if (kind === 'glyph') h = M.glyphHTML();
    bg.innerHTML = h;
    bg.dataset.kind = kind;
    el.dataset.bg = kind;
  }

  // Pausa las animaciones de las maquetas que no se ven
  const visIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('paused', !e.isIntersecting)), { rootMargin: '100px' }) : null;
  const watch = el => visIO && visIO.observe(el);
  const unwatch = el => visIO && visIO.unobserve(el);

  // ───── Personalizador ─────
  const app = $('#app');
  const custom = { setDesign() {} };
  if (app) {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const st = { design: pageDesign(), theme: 'nube', mode: 'light', bg: 'aurora', dbg: 'dots', accent: 'red', color: '#FF6A13', dotcolor: 'dot', dfont: 'archivo',
      glass: 62, blur: 18, radius: 18, font: 'modern', icon: 'zen', iconAuto: true };
    $('#app-week').innerHTML = M.weekHTML(events, now);
    $('#app-mini').innerHTML = M.miniMonthHTML(now);
    $('#app-month').textContent = M.monthTitle(now);
    $('#app-tasks').innerHTML = M.tasks().map(t => `<li${t.done ? ' class="done"' : ''}>${M.esc(t.title)}</li>`).join('');

    const form = $('#controls');
    form.addEventListener('submit', e => e.preventDefault());
    const ctlOf = sel => { const n = form.querySelector(sel); return n && n.closest('.ctl'); };

    // Controles nuevos para Dot (se crean aquí para no tocar el HTML de la página)
    const seg = (name, id, opts) => `<div class="seg${opts.length > 3 ? ' seg--wrap' : ''}" id="${id}">${opts.map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}"><span>${t}</span></label>`).join('')}</div>`;
    const designCtl = document.createElement('fieldset');
    designCtl.className = 'ctl ctl--design';
    designCtl.innerHTML = `<legend>Diseño</legend>${seg('design', 'designs', [['zen', 'Zen'], ['dot', 'Dot']])}`;
    form.prepend(designCtl);

    const accentCtl = document.createElement('fieldset');
    accentCtl.className = 'ctl ctl--accent'; accentCtl.dataset.only = 'dot';
    accentCtl.innerHTML = `<legend>Acento</legend>${seg('accent', 'accents', Object.entries(ACCENTS).map(([id, a]) => [id, a[0]]))}
      <label class="ctl-color" hidden><input type="color" id="accent-color" value="${st.color}"><span>Elige el color</span></label>`;
    const themesCtl = ctlOf('#themes');
    if (themesCtl) { themesCtl.dataset.only = 'zen'; themesCtl.after(accentCtl); } else designCtl.after(accentCtl);

    const dbgCtl = document.createElement('fieldset');
    dbgCtl.className = 'ctl'; dbgCtl.dataset.only = 'dot';
    dbgCtl.innerHTML = `<legend>Fondo</legend>${seg('dbg', 'dbgs', [['dots', 'Puntos'], ['grid', 'Rejilla'], ['plain', 'Liso'], ['glyph', 'Glyph']])}`;
    const bgCtl = ctlOf('#bgs');
    if (bgCtl) { bgCtl.dataset.only = 'zen'; bgCtl.after(dbgCtl); } else accentCtl.after(dbgCtl);
    // los calendarios en Dot, como en la app: un punto de su color, el contorno de su color o sin color
    const calCtl = document.createElement('fieldset');
    calCtl.className = 'ctl'; calCtl.dataset.only = 'dot';
    calCtl.innerHTML = `<legend>Calendarios</legend>${seg('dotcolor', 'dotcolors', [['dot', 'Un punto'], ['full', 'Contorno'], ['mono', 'Sin color']])}`;
    dbgCtl.after(calCtl);
    // la letra: en Dot los números y rótulos van siempre en ZenDot; el texto, en una de las tres de la app
    const fontCtl = ctlOf('#fonts');
    const dfontCtl = document.createElement('fieldset');
    dfontCtl.className = 'ctl'; dfontCtl.dataset.only = 'dot';
    dfontCtl.innerHTML = `<legend>Letra</legend>${seg('dfont', 'dfonts', Object.entries(DOT_FONTS).map(([id, f]) => [id, f.name]))}`;
    if (fontCtl) { fontCtl.dataset.only = 'zen'; fontCtl.after(dfontCtl); } else calCtl.after(dfontCtl);
    // en Dot las esquinas son fijas (forman parte del diseño, como en la app)
    const radiusRow = $('#r-radius') && $('#r-radius').closest('label');
    if (radiusRow) radiusRow.dataset.only = 'zen';
    const colorWrap = accentCtl.querySelector('.ctl-color'), colorIn = $('#accent-color');

    // muestras de tema e iconos (radiogroup accesible con flechas)
    const themesEl = $('#themes');
    themesEl.setAttribute('role', 'radiogroup'); themesEl.setAttribute('aria-label', 'Tema');
    themesEl.innerHTML = Object.entries(THEMES).map(([id, t]) =>
      `<button type="button" class="sw" role="radio" data-id="${id}" aria-checked="${id === st.theme}" tabindex="${id === st.theme ? 0 : -1}" style="--s-a:${t.a[0]};--s-b:${t.a[1]};--s-c:${t.a[2]}"><span class="sw-chip"></span>${t.name}</button>`).join('');
    const iconsEl = $('#icons');
    iconsEl.setAttribute('role', 'radiogroup'); iconsEl.setAttribute('aria-label', 'Icono de la app');
    iconsEl.innerHTML = ICONS.map(ic => `<button type="button" class="ic" role="radio" data-id="${ic.id}" aria-checked="${ic.id === st.icon}" tabindex="${ic.id === st.icon ? 0 : -1}" aria-label="${ic.name}" title="${ic.name}">${iconSVG(ic)}</button>`).join('');

    const checkRadio = (el, id) => el.querySelectorAll('[role="radio"]').forEach(x => { const on = x.dataset.id === id; x.setAttribute('aria-checked', on); x.tabIndex = on ? 0 : -1; });
    function radioGroup(el, key, after) {
      const items = () => [...el.querySelectorAll('[role="radio"]')];
      const pick = b => { checkRadio(el, b.dataset.id); st[key] = b.dataset.id; after(); apply(); };
      el.addEventListener('click', e => { const b = e.target.closest('[role="radio"]'); if (b) pick(b); });
      el.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!k) return;
        e.preventDefault();
        const list = items(), i = list.indexOf(document.activeElement);
        const b = list[(i + k + list.length) % list.length]; b.focus(); pick(b);
      });
    }
    radioGroup(themesEl, 'theme', () => {});
    radioGroup(iconsEl, 'icon', () => { st.iconAuto = false; });

    const setRadio = (name, v) => { const i = form.querySelector(`input[name="${name}"][value="${v}"]`); if (i) i.checked = true; };
    form.addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'design') setDesign(t.value);
      if (t.name === 'mode') st.mode = t.value;
      if (t.name === 'bg') st.bg = t.value;
      if (t.name === 'dbg') st.dbg = t.value;
      if (t.name === 'accent') st.accent = t.value;
      if (t.name === 'dotcolor') st.dotcolor = t.value;
      if (t.name === 'dfont') { st.dfont = t.value; loadFont(st.dfont); }
      if (t.name === 'font') { st.font = t.value; loadFont(st.font); }
      apply();
    });
    colorIn.addEventListener('input', () => { st.color = colorIn.value; apply(); });
    const sliders = [['#r-glass', 'glass', v => `${v} %`], ['#r-blur', 'blur', v => `${v} px`], ['#r-radius', 'radius', v => `${v} px`]];
    sliders.forEach(([sel, key, fmt]) => {
      const r = $(sel); if (!r) return;
      const out = r.nextElementSibling;
      const upd = () => {
        st[key] = +r.value; if (out) out.textContent = fmt(r.value);
        r.style.setProperty('--level', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
        apply();
      };
      r.addEventListener('input', upd); upd();
    });

    // Cambiar el diseño de la maqueta. Con Dot se sugiere su icono (si no has elegido otro a mano).
    function setDesign(d) {
      st.design = d === 'dot' ? 'dot' : 'zen';
      setRadio('design', st.design);
      if (st.iconAuto) { st.icon = st.design === 'dot' ? 'dot' : 'zen'; checkRadio(iconsEl, st.icon); }
      if (st.design === 'dot') loadFont(st.dfont);
      form.querySelectorAll('[data-only]').forEach(c => { c.hidden = c.dataset.only !== st.design; });
      // los textos de alrededor hablan del diseño de la maqueta (en Dot no hay temas ni esquinas)
      swapText($('#aspecto .lead'), st.design, 'Prueba aquí Dot: el acento, el fondo, el color de los calendarios, la transparencia, la letra y el icono. La app cambia igual.');
      swapText($('#aspecto .page-body > .note'), st.design, 'En la app hay más: claro u oscuro según el sistema, la separación de los puntos, la velocidad del glyph, la densidad y las animaciones.');
      swapText($('#r-glass') && $('#r-glass').previousElementSibling, st.design, 'Transparencia');
      apply();
    }
    custom.setDesign = setDesign;

    function apply() {
      const s = app.style;
      if (st.design === 'dot') {
        const acc = st.accent === 'ink' ? DOT[st.mode][2] : st.accent === 'custom' ? st.color : (ACCENTS[st.accent] || ACCENTS.red)[1];
        setDot(app, st.mode, acc);
        setBg(app, st.dbg);
        app.dataset.dotcolor = st.dotcolor;
        s.removeProperty('--font');
        s.setProperty('--dot-font', DOT_FONTS[st.dfont].stack);
      } else {
        setTheme(app, st.theme, st.mode);
        setBg(app, st.bg);
        s.setProperty('--font', FONTS[st.font].stack);
      }
      s.setProperty('--ga', st.glass + '%');
      s.setProperty('--gb', st.blur + 'px');
      if (st.design === 'dot') s.removeProperty('--r'); else s.setProperty('--r', st.radius + 'px');
      colorWrap.hidden = st.accent !== 'custom';
      const ic = ICONS.find(i => i.id === st.icon);
      $('#app-logo').innerHTML = iconSVG(ic);
    }
    // si el sistema está en oscuro, la maqueta empieza en Noche oscuro, a juego con la página
    if (dark) {
      st.theme = 'noche'; st.mode = 'dark'; st.bg = 'stars';
      checkRadio(themesEl, 'noche');
    }
    setRadio('mode', st.mode); setRadio('bg', st.bg); setRadio('dbg', st.dbg); setRadio('accent', st.accent); setRadio('dotcolor', st.dotcolor); setRadio('dfont', st.dfont);
    setDesign(st.design);
    watch(app);
  }

  // ───── Widgets ─────
  function renderWidgets() {
    const d = pageDesign();
    const occToday = M.occurrences(events, M.sod(now), M.addDays(M.sod(now), 2)).filter(o => o.allDay || o.end > now);
    const next = occToday[0];
    const logo = () => d === 'dot' ? M.dotLogoSVG() : M.logoSVG();
    const wt = $('#w-today');
    if (wt) wt.innerHTML = `<span class="wt-day">${now.getDate()}</span><span class="wt-dow">${M.cap(M.DOW_LONG[now.getDay()])}</span><span class="wt-month">${M.cap(M.MONTHS[now.getMonth()])} ${now.getFullYear()}</span>` +
      (next ? `<span class="wt-next ev--${next.e.cal}"><i class="dot dot--${next.e.cal}"></i>${M.esc(next.e.title)}<small>${next.allDay ? 'Todo el día' : (M.sameDay(next.start, now) ? '' : 'Mañana ') + M.hm(next.start)}</small></span>` : '');
    const head = title => `<h4>${logo()}${title}<span aria-hidden="true">+</span></h4>`;
    const wa = $('#w-agenda');
    if (wa) wa.innerHTML = head('Agenda') + M.agendaHTML(events, now, { days: 4, maxPerDay: 2 });
    const wd = $('#w-desk');
    if (wd) wd.innerHTML = head('Próximos días') + M.agendaHTML(events, now, { days: 5, maxPerDay: 3 });
    [wt, wa, wd].forEach(w => { if (w) w.dataset.design = d; });
    if (d === 'dot') loadFont('archivo');
  }
  renderWidgets();

  // ───── Maquetas para los huecos de capturas (hasta que haya capturas reales en capturas/) ─────
  const ico = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l1.7 5.1a3 3 0 0 0 1.9 1.9l5.1 1.7-5.1 1.7a3 3 0 0 0-1.9 1.9L12 20l-1.7-5.2a3 3 0 0 0-1.9-1.9L3.3 11.2l5.1-1.7a3 3 0 0 0 1.9-1.9z"/></svg>';
  function mock(kind, design = pageDesign()) {
    const el = document.createElement('div');
    const dot = design === 'dot';
    if (kind === 'pc') {
      el.className = 'app';
      el.innerHTML = `<div class="app-bg"></div><div class="app-bar"><span class="app-logo">${dot ? M.dotLogoSVG() : M.logoSVG()}</span><b class="app-name">ZenCalendar</b><span class="app-tabs"><i>Mes</i><i class="on">Semana</i><i>Día</i><i>Agenda</i><i>Año</i></span><span class="app-btns"><i class="app-search"></i><i class="app-add">+</i></span><span class="app-win"><i></i><i></i><i></i></span></div>
        <div class="app-main"><aside class="app-side pane"><p class="app-month">${M.monthTitle(now)}</p><div class="mini">${M.miniMonthHTML(now)}</div><p class="app-label">Calendarios</p><ul class="app-cals"><li><i class="dot dot--personal"></i>Personal</li><li><i class="dot dot--work"></i>Trabajo</li><li><i class="dot dot--birthdays"></i>Cumpleaños</li></ul><p class="app-label">Tareas</p><ul class="app-tasks">${M.tasks().map(t => `<li${t.done ? ' class="done"' : ''}>${M.esc(t.title)}</li>`).join('')}</ul></aside><div class="app-week pane">${M.weekHTML(events, now)}</div></div>`;
      if (dot) { setDot(el, 'dark'); setBg(el, 'dots'); } else { setTheme(el, 'nube', 'light'); setBg(el, 'aurora'); }
    } else {
      el.className = 'app app--phone';
      const isMonth = kind === 'phone-month';
      const title = isMonth ? `<span class="ph-title"><small>${now.getFullYear()}</small>${M.cap(M.MONTHS[now.getMonth()])}</span>` : `<span class="ph-title"><small>Próximos días</small>Agenda</span>`;
      const body = isMonth ? (dot ? M.dotMonthHTML(events, now, { today: now }) : `<div class="mo">${M.monthHTML(events, now, { today: now, max: 2 })}</div>`) : M.agendaHTML(events, now, { days: 7, maxPerDay: 3 });
      el.innerHTML = `<div class="app-bg"></div><div class="app-bar">${title}<span class="app-btns"><i class="app-search"></i></span></div>
        <div class="ph-body pane">${body}</div>
        <div class="ph-quick pane">${ico}Escribe o pregunta…<i>+</i></div>
        <div class="ph-tabs pane"><i${isMonth ? ' class="on"' : ''}>Mes</i><i>Semana</i><i>Día</i><i${isMonth ? '' : ' class="on"'}>Agenda</i></div>`;
      if (dot) { if (isMonth) { setDot(el, 'light'); setBg(el, 'grid'); } else { setDot(el, 'dark'); setBg(el, 'glyph'); } }
      else if (isMonth) { setTheme(el, 'lavanda', 'light'); setBg(el, 'sakura'); }
      else { setTheme(el, 'noche', 'dark'); setBg(el, 'stars'); }
      el.querySelectorAll('button').forEach(b => { b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); });
    }
    if (dot) { el.dataset.dotcolor = 'dot'; loadFont('archivo'); }
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  // se dibujan a tamaño de pantalla real (960×624 el PC, 360×760 el móvil) y se escalan al hueco, como una captura
  const fit = slot => { const el = slot.querySelector(':scope > .app'); if (el && el.offsetWidth) slot.style.setProperty('--k', slot.clientWidth / el.offsetWidth); };
  const ro = 'ResizeObserver' in window ? new ResizeObserver(es => es.forEach(e => fit(e.target))) : null;
  // un texto con su versión para Dot (la de Zen se guarda en data-zen la primera vez)
  function swapText(el, d, dotText) {
    if (!el) return;
    if (!('zen' in el.dataset)) el.dataset.zen = el.textContent;
    el.textContent = d === 'dot' ? (el.dataset.dot || dotText) : el.dataset.zen;
  }
  // pies de foto en Dot (si el HTML trae data-dot en el figcaption, manda ese)
  const DOT_CAPTIONS = { 'pc-semana': 'La semana en Windows, en Dot oscuro.', 'movil-mes': 'El mes en el móvil, en Dot claro.', 'movil-agenda': 'La agenda en Dot, con el fondo glyph.' };
  function renderShots() {
    const d = pageDesign();
    document.querySelectorAll('.shot-mock').forEach(slot => {
      const old = slot.querySelector(':scope > .app');
      if (old && old.dataset.design === d) return;
      if (old) { unwatch(old); old.remove(); }
      const el = mock(slot.dataset.mock, d);
      slot.appendChild(el); watch(el); fit(slot);
      if (ro && !slot.dataset.ro) { ro.observe(slot); slot.dataset.ro = '1'; }
    });
    document.querySelectorAll('.shot[data-shot] figcaption').forEach(c => {
      if (!('zen' in c.dataset)) c.dataset.zen = c.textContent;
      const dotText = c.dataset.dot || DOT_CAPTIONS[c.closest('.shot').dataset.shot];
      c.textContent = d === 'dot' && dotText ? dotText : c.dataset.zen;
    });
  }
  renderShots();
  const WIDGETS_DOT = 'En Dot, los widgets van en negro o en blanco, con la fecha en puntos y tu color de acento. Tocas un evento y se abre justo ahí.';
  swapText(document.querySelector('#widgets .lead'), pageDesign(), WIDGETS_DOT);

  // La página cambia de diseño: las maquetas se van con ella (el personalizador también, aunque luego lo cambies)
  let last = pageDesign();
  document.addEventListener('zc:design', e => {
    const d = e.detail && e.detail.design === 'dot' ? 'dot' : 'zen';
    if (d === last) return;
    last = d;
    custom.setDesign(d);
    swapText(document.querySelector('#widgets .lead'), d, WIDGETS_DOT);
    renderWidgets();
    renderShots();
  });
  window.ZCW.mockApp = mock;
})();
