'use strict';
// ZenCalendar: repeticiones de eventos.
//
// rrule = { freq: 'daily'|'weekly'|'monthly'|'yearly', interval: 1,
//           byDay: ['MO','WE'] | null,   (semanal)
//           monthMode: 'day' | 'weekday', (mensual: el día 15 / el tercer martes)
//           nth: null | 1..4 | -1,        (opcional, mensual por día de la semana: -1 = el último)
//           until: 'YYYY-MM-DD' | null, count: null | n }
// exdates: ['YYYY-MM-DD'] → repeticiones quitadas.
//
// expand(ev, from, to) da las apariciones que se solapan con [from, to):
//   [{ start: Date, end: Date }]
// Para los eventos de todo el día, end es el ÚLTIMO día (incluido) a las 00:00,
// igual que en los datos; para los que tienen hora, el momento en que acaban.
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const U = () => ZC.util;
  const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const MAX_ITER = 20000;

  // n-ésimo día de la semana del mes que corresponde a una fecha (1..5)
  const nthOf = d => Math.ceil(d.getDate() / 7);
  const isLastOf = d => d.getDate() + 7 > U().daysInMonth(d.getFullYear(), d.getMonth());

  // fecha del «n-ésimo <día de la semana>» de un mes (n = -1: el último). null si no existe
  function nthWeekday(y, m, dow, n) {
    if (n === -1) {
      const last = new Date(y, m + 1, 0);
      return new Date(y, m, last.getDate() - ((last.getDay() - dow + 7) % 7));
    }
    const first = new Date(y, m, 1);
    const day = 1 + ((dow - first.getDay() + 7) % 7) + (n - 1) * 7;
    return day > U().daysInMonth(y, m) ? null : new Date(y, m, day);
  }

  // Duración de un evento: en días (todo el día) o en minutos
  function spanOf(ev, s) {
    const u = U();
    const e = u.parse(ev.end) || s;
    if (ev.allDay) return { days: Math.max(0, u.daysBetween(s, e)) };
    return { ms: Math.max(0, e - s) };
  }

  function makeInstance(ev, day, s0, span) {
    const u = U();
    let start;
    if (ev.allDay) start = u.startOfDay(day);
    else start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s0.getHours(), s0.getMinutes());
    const end = ev.allDay ? u.addDays(start, span.days) : new Date(start.getTime() + span.ms);
    return { start, end };
  }

  // ¿se solapa la aparición con [from, to)?
  function overlaps(ev, inst, from, to) {
    const u = U();
    const endEx = ev.allDay ? u.addDays(inst.end, 1) : inst.end;
    if (inst.start >= to) return false;
    if (endEx > from) return true;
    // de duración cero (tareas, recordatorios): cuenta si empieza dentro
    return inst.start.getTime() === endEx.getTime() && inst.start >= from;
  }

  function normRule(r) {
    if (!r || !r.freq) return null;
    const freq = String(r.freq).toLowerCase();
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) return null;
    const interval = Math.max(1, Math.floor(+r.interval || 1));
    return {
      freq, interval,
      byDay: Array.isArray(r.byDay) && r.byDay.length ? r.byDay.map(x => String(x).toUpperCase().slice(-2)).filter(x => DAYS.includes(x)) : null,
      monthMode: r.monthMode === 'weekday' ? 'weekday' : 'day',
      nth: r.nth === -1 || (r.nth >= 1 && r.nth <= 5) ? +r.nth : null,
      until: r.until ? String(r.until).slice(0, 10) : null,
      count: r.count > 0 ? Math.floor(r.count) : null,
    };
  }

  /**
   * Genera los días (Date a las 00:00) de la serie en orden, llamando a cb(día, índice).
   * cb devuelve false para parar. Empieza en el primer día (DTSTART) y cuenta
   * todas las apariciones para que `count` funcione; si no hay `count` se salta
   * directamente cerca de `jumpTo` para no recorrer años de repeticiones.
   */
  function walk(rule, s0, jumpTo, cb) {
    const u = U();
    const first = u.startOfDay(s0);
    const untilD = rule.until ? u.parse(rule.until) : null;
    let idx = 0;
    const emit = d => {
      if (d < first) return true;
      if (untilD && d > untilD) return false;
      if (rule.count && idx >= rule.count) return false;
      const go = cb(d, idx);
      idx++;
      return go !== false;
    };
    const canJump = !rule.count && jumpTo && jumpTo > first;
    let k = 0;
    if (rule.freq === 'daily') {
      if (canJump) k = Math.max(0, Math.floor(u.daysBetween(first, jumpTo) / rule.interval) - 1);
      for (let i = 0; i < MAX_ITER; i++, k++) {
        if (!emit(u.addDays(first, k * rule.interval))) return;
      }
    } else if (rule.freq === 'weekly') {
      const days = (rule.byDay || [DAYS[first.getDay()]]).map(x => DAYS.indexOf(x));
      // semana empezando en lunes (como RRULE con WKST=MO)
      const wk0 = u.startOfWeek(first, 1);
      const order = days.map(d => (d + 6) % 7).sort((a, b) => a - b);
      if (canJump) k = Math.max(0, Math.floor(u.daysBetween(wk0, jumpTo) / 7 / rule.interval) - 1);
      for (let i = 0; i < MAX_ITER; i++, k++) {
        const wk = u.addDays(wk0, k * 7 * rule.interval);
        for (const off of order) {
          const d = u.addDays(wk, off);
          if (d < first) continue;
          if (!emit(d)) return;
        }
      }
    } else if (rule.freq === 'monthly') {
      const months0 = first.getFullYear() * 12 + first.getMonth();
      if (canJump) k = Math.max(0, Math.floor((jumpTo.getFullYear() * 12 + jumpTo.getMonth() - months0) / rule.interval) - 1);
      const dow = first.getDay();
      const n = rule.nth || (nthOf(first) === 5 ? -1 : nthOf(first));
      for (let i = 0; i < MAX_ITER; i++, k++) {
        const mm = months0 + k * rule.interval;
        const y = Math.floor(mm / 12), m = mm % 12;
        let d;
        if (rule.monthMode === 'weekday') d = nthWeekday(y, m, dow, n);
        else d = first.getDate() <= u.daysInMonth(y, m) ? new Date(y, m, first.getDate()) : null; // el 31 en meses de 30: se salta
        if (d && !emit(d)) return;
        if (!d && untilD && new Date(y, m, 1) > untilD) return;
      }
    } else if (rule.freq === 'yearly') {
      if (canJump) k = Math.max(0, Math.floor((jumpTo.getFullYear() - first.getFullYear()) / rule.interval) - 1);
      for (let i = 0; i < MAX_ITER; i++, k++) {
        const y = first.getFullYear() + k * rule.interval;
        const d = new Date(y, first.getMonth(), first.getDate());
        if (d.getMonth() !== first.getMonth()) { if (untilD && new Date(y, 0, 1) > untilD) return; continue; } // 29 de febrero
        if (!emit(d)) return;
      }
    }
  }

  function expand(ev, from, to) {
    const u = U();
    if (!ev) return [];
    const s0 = u.parse(ev.start);
    if (!s0) return [];
    from = u.parse(from); to = u.parse(to);
    const span = spanOf(ev, s0);
    const rule = normRule(ev.rrule);
    if (!rule) {
      const inst = makeInstance(ev, s0, s0, span);
      return overlaps(ev, inst, from, to) ? [inst] : [];
    }
    const ex = new Set(ev.exdates || []);
    const out = [];
    // lo que dura un evento, para empezar a mirar un poco antes de `from`
    const back = ev.allDay ? span.days + 1 : Math.ceil(span.ms / u.DAY) + 1;
    const jumpTo = u.addDays(u.startOfDay(from), -back);
    walk(rule, s0, jumpTo, d => {
      if (d >= to) return false;
      if (ex.has(u.ymd(d))) return true;
      const inst = makeInstance(ev, d, s0, span);
      if (overlaps(ev, inst, from, to)) out.push(inst);
      return true;
    });
    return out;
  }

  // ¿hay una aparición de la serie ese día? (por si hace falta comprobar una fecha)
  function occursOn(ev, date) {
    const u = U();
    const d = u.startOfDay(u.parse(date));
    return expand(Object.assign({}, ev, { end: ev.start }), d, u.addDays(d, 1))
      .some(i => u.sameDay(i.start, d));
  }

  // fecha (YYYY-MM-DD) de la última aparición, o null si no acaba nunca
  function lastDate(ev) {
    const u = U();
    const rule = normRule(ev.rrule);
    const s0 = u.parse(ev.start);
    if (!rule) return s0 ? u.ymd(s0) : null;
    if (!rule.until && !rule.count) return null;
    let last = null;
    walk(rule, s0, null, d => { last = d; return true; });
    return last ? u.ymd(last) : null;
  }

  // ---- describir una repetición con palabras ----
  const TXT = {
    es: {
      daily: ['Cada día', 'Cada %n días'], weekly: ['Cada semana', 'Cada %n semanas'],
      monthly: ['Cada mes', 'Cada %n meses'], yearly: ['Cada año', 'Cada %n años'],
      days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
      and: 'y', weekdays: 'de lunes a viernes', weekend: 'sábado y domingo',
      onDay: 'el día %d', nth: ['', 'primer', 'segundo', 'tercer', 'cuarto', 'quinto'], last: 'último',
      onNth: 'el %n %d', until: 'hasta el %s', times: '%n veces', once: '1 vez',
      months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
      date: (d, m, y) => `${d} ${m} ${y}`,
    },
    ca: {
      daily: ['Cada dia', 'Cada %n dies'], weekly: ['Cada setmana', 'Cada %n setmanes'],
      monthly: ['Cada mes', 'Cada %n mesos'], yearly: ['Cada any', 'Cada %n anys'],
      days: ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'],
      and: 'i', weekdays: 'de dilluns a divendres', weekend: 'dissabte i diumenge',
      onDay: 'el dia %d', nth: ['', 'primer', 'segon', 'tercer', 'quart', 'cinquè'], last: 'últim',
      onNth: 'el %n %d', until: 'fins al %s', times: '%n vegades', once: '1 vegada',
      months: ['gen', 'febr', 'març', 'abr', 'maig', 'juny', 'jul', 'ag', 'set', 'oct', 'nov', 'des'],
      date: (d, m, y) => `${d} ${m} ${y}`,
    },
    en: {
      daily: ['Every day', 'Every %n days'], weekly: ['Every week', 'Every %n weeks'],
      monthly: ['Every month', 'Every %n months'], yearly: ['Every year', 'Every %n years'],
      days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      and: 'and', weekdays: 'Monday to Friday', weekend: 'Saturday and Sunday',
      onDay: 'on day %d', nth: ['', 'first', 'second', 'third', 'fourth', 'fifth'], last: 'last',
      onNth: 'on the %n %d', until: 'until %s', times: '%n times', once: 'once',
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      date: (d, m, y) => `${m} ${d}, ${y}`,
    },
  };

  function list(items, and) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' ' + and + ' ' + items[items.length - 1];
  }

  /** describe(rrule, lang, start?) → «Cada semana, lunes y miércoles» */
  function describe(rrule, lang, start) {
    const r = normRule(rrule);
    if (!r) return '';
    const L = TXT[String(lang || 'es').slice(0, 2)] || TXT.es;
    const u = U();
    const s = start ? u.parse(start) : null;
    let txt = L[r.freq][r.interval > 1 ? 1 : 0].replace('%n', r.interval);
    const parts = [];
    if (r.freq === 'weekly' && (r.byDay || s)) {
      const ds = (r.byDay || [DAYS[s.getDay()]]).map(x => DAYS.indexOf(x)).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      const key = ds.join(',');
      if (key === '1,2,3,4,5') parts.push(L.weekdays);
      else if (key === '6,0') parts.push(L.weekend);
      else parts.push(list(ds.map(d => L.days[d]), L.and));
    }
    if (r.freq === 'monthly' && s) {
      if (r.monthMode === 'weekday') {
        const n = r.nth || (nthOf(s) === 5 ? -1 : nthOf(s));
        parts.push(L.onNth.replace('%n', n === -1 ? L.last : L.nth[n]).replace('%d', L.days[s.getDay()]));
      } else parts.push(L.onDay.replace('%d', s.getDate()));
    }
    if (r.until) {
      const d = u.parse(r.until);
      parts.push(L.until.replace('%s', L.date(d.getDate(), L.months[d.getMonth()], d.getFullYear())));
    } else if (r.count) parts.push(r.count === 1 ? L.once : L.times.replace('%n', r.count));
    if (parts.length) txt += ', ' + parts.join(', ');
    return txt;
  }

  ZC.recur = { expand, describe, normRule, occursOn, lastDate, nthWeekday, DAYS, isLastOf, nthOf };
})(typeof window !== 'undefined' ? window : globalThis);
