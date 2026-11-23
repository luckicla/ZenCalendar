'use strict';
// Diseño Dot: la pantalla de puntos de la portada. Enseña el día en grande (cifras de 5×7 puntos redondos, con los
// puntos apagados a la vista, como un panel de verdad), el día de la semana, el mes y la hora. Cuando apuntas algo en
// la demo, la pantalla contesta con el día y la hora de lo apuntado. Al cargar se enciende columna a columna, a pasos:
// es el único movimiento que no responde a nada. La transición entre diseños la hace site.js (web-sistema).
(() => {
  const root = document.documentElement;
  const screen = document.getElementById('dot-screen');
  if (!screen) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const isDot = () => root.dataset.design === 'dot';

  // Cifras de 5×7: las mismas que la fuente ZenDot
  // <zendot> (lo escribe tools/mkfont.py: no lo cambies a mano)
  const DIGITS = {
    0: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    1: ['00100', '01100', '10100', '00100', '00100', '00100', '11111'],
    2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    3: ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
    4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  };
  // </zendot>
  const COLS = 13, ROWS = 9, P = 10;          // dos cifras + un hueco + un punto de margen alrededor
  const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const pad = n => String(n).padStart(2, '0');
  const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function bitmap(day) {
    const s = pad(day), on = new Set();
    [...s].forEach((ch, k) => DIGITS[ch].forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') on.add(`${1 + k * 6 + x},${1 + y}`); })));
    return on;
  }

  // Montaje: la matriz (SVG) y la columna de rótulos
  let circles = [];
  function build() {
    if (screen.childElementCount) return;
    let dots = '';
    for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) dots += `<circle cx="${x * P + P / 2}" cy="${y * P + P / 2}" r="${P * 0.36}" data-x="${x}" data-k="${x},${y}"/>`;
    screen.innerHTML = `<svg class="ds-matrix" viewBox="0 0 ${COLS * P} ${ROWS * P}" focusable="false">${dots}</svg>
      <div class="ds-side">
        <p class="ds-dow"></p>
        <p class="ds-month"></p>
        <p class="ds-live"><i></i><span class="ds-time"></span></p>
        <p class="ds-title"></p>
      </div>`;
    circles = [...screen.querySelectorAll('circle')];
  }

  // Lo que enseña: { date, time, title, live }
  let state = { date: new Date(), live: true, time: null, title: '' };
  let shown = new Set();
  const $ = s => screen.querySelector(s);

  function paint({ scan = false, step = false } = {}) {
    build();
    const d = state.date, next = bitmap(d.getDate());
    const instant = reduce.matches || (!scan && !step);
    if (scan) void screen.getBoundingClientRect();     // que los puntos se pinten apagados antes de encenderse
    circles.forEach(c => {
      const k = c.dataset.k, on = next.has(k);
      // a pasos, columna a columna (al cargar, más despacio y después de un respiro)
      const x = +c.dataset.x;
      c.style.setProperty('--d', instant ? '0ms' : `${(scan ? 160 : 0) + x * (scan ? 60 : 26)}ms`);
      if (on !== shown.has(k)) c.classList.toggle('on', on);
    });
    shown = next;
    $('.ds-dow').textContent = DOW[d.getDay()];
    $('.ds-month').textContent = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    $('.ds-live').classList.toggle('is-live', !!state.live);
    const t = state.live ? `ahora ${hm(new Date())}` : state.time ? `a las ${state.time}` : state.allDay ? 'todo el día' : '';
    $('.ds-time').textContent = t;
    $('.ds-live').hidden = !t;
    $('.ds-title').textContent = state.title || '';
  }

  // La hora en directo cambia sin animación (cada 15 s basta para no ir un minuto tarde)
  setInterval(() => {
    if (!isDot() || !state.live) return;
    const now = new Date();
    if (!sameDay(now, state.date)) { state.date = now; paint({ step: true }); }
    else $('.ds-time').textContent = `ahora ${hm(now)}`;
  }, 15000);

  // La demo cuenta lo que pasa
  document.addEventListener('zc:demo', e => {
    const { kind, date, time, title, count } = e.detail || {};
    if (!date || kind === 'month') return;
    const now = new Date();
    if (kind === 'add') state = { date: new Date(date), live: false, time, title, allDay: !time };
    else if (kind === 'undo') state = { date: now, live: true, time: null, title: '' };
    else if (kind === 'today' || kind === 'select') {
      const today = sameDay(date, now);
      state = { date: new Date(date), live: today, time: today ? null : time, allDay: !!count && !time,
        title: count ? (count > 1 ? `${title} y ${count - 1} más` : title) : 'nada apuntado' };
    }
    if (isDot()) paint({ step: true });
  });

  // Al entrar en Dot se pinta (si se entra al cargar, con el barrido de columnas)
  let started = false;
  function start(scan) {
    if (!isDot()) return;
    paint({ scan: scan && !started });
    started = true;
  }
  document.addEventListener('zc:design', e => { if (e.detail && e.detail.design === 'dot') start(!!e.detail.initial); });
  // por si el diseño cambia sin evento (o este script carga después del evento inicial)
  new MutationObserver(() => { if (isDot()) start(false); }).observe(root, { attributes: true, attributeFilter: ['data-design'] });
  start(true);

  window.ZCDot = Object.assign(window.ZCDot || {}, { paint: () => paint({ step: true }) });
})();
