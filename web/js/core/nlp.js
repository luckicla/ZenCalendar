'use strict';
// ZenCalendar: «añadir rápido» en lenguaje natural, sin internet.
//
// parse(text, { now, lang, defaultDuration }) →
//   { kind, title, start, end, allDay, location, reminders, rrule, confidence }
//   (+ calendarId y emoji si lo adivina, p. ej. en los cumpleaños) o null si no hay texto.
//   reminders = null cuando no se dice nada (el frontend pone los de siempre).
//
// Entiende español e inglés (y algo de catalán):
//   «mañana a las 5 dentista», «cena con Marta el viernes 21:30 en Casa Pepe»,
//   «cada lunes gimnasio a las 7 de la tarde», «recuérdame comprar pan»,
//   «del 3 al 7 de diciembre vacaciones», «en 2 horas llamar a mamá»,
//   «25 dic Navidad», «avísame 30 min antes», «dentist tomorrow at 5pm»…
//
// Cómo funciona: se pasa el texto a minúsculas y sin tildes (con la misma
// longitud, para saber qué trozo del original es cada cosa) y se van buscando
// las partes de fecha/hora/repetición/aviso/lugar en un orden fijo. Lo que se
// reconoce se «tacha» para que no lo coja otra regla y para quitarlo del título.
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const U = () => ZC.util;
  const X = '\u0001'; // marca de «ya usado»

  // ---------- vocabulario ----------
  const MONTHS = {
    enero: 0, ene: 0, january: 0, jan: 0, gener: 0, gen: 0,
    febrero: 1, feb: 1, february: 1, febrer: 1,
    marzo: 2, mar: 2, march: 2, marc: 2,
    abril: 3, abr: 3, april: 3, apr: 3,
    mayo: 4, may: 4, maig: 4,
    junio: 5, jun: 5, june: 5, juny: 5,
    julio: 6, jul: 6, july: 6, juliol: 6,
    agosto: 7, ago: 7, august: 7, aug: 7, agost: 7,
    septiembre: 8, setiembre: 8, sept: 8, sep: 8, set: 8, september: 8, setembre: 8,
    octubre: 9, oct: 9, october: 9,
    noviembre: 10, nov: 10, november: 10, novembre: 10,
    diciembre: 11, dic: 11, december: 11, dec: 11, desembre: 11, des: 11,
  };
  const WDAYS = {
    domingo: 0, domingos: 0, sunday: 0, sundays: 0, diumenge: 0, diumenges: 0,
    lunes: 1, monday: 1, mondays: 1, dilluns: 1,
    martes: 2, tuesday: 2, tuesdays: 2, dimarts: 2,
    miercoles: 3, wednesday: 3, wednesdays: 3, dimecres: 3,
    jueves: 4, thursday: 4, thursdays: 4, dijous: 4,
    viernes: 5, friday: 5, fridays: 5, divendres: 5,
    sabado: 6, sabados: 6, saturday: 6, saturdays: 6, dissabte: 6, dissabtes: 6,
  };
  const NUMW = {
    media: 0.5, 'half an': 0.5, 'half a': 0.5, un: 1, una: 1, uno: 1, a: 1, an: 1, one: 1, dos: 2, two: 2, tres: 3, three: 3,
    cuatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6, siete: 7, seven: 7, ocho: 8, eight: 8,
    nueve: 9, nine: 9, diez: 10, ten: 10, once: 11, eleven: 11, doce: 12, twelve: 12, quince: 15, fifteen: 15,
    veinte: 20, twenty: 20, treinta: 30, thirty: 30, cuarenta: 40, forty: 40, 'cuarenta y cinco': 45, 'forty-five': 45,
    'un parell de': 2, 'un par de': 2, 'a couple of': 2, 'couple of': 2,
  };
  const DAYPART_HOUR = { manana: 9, morning: 9, mati: 9, mediodia: 13, migdia: 13, noon: 12, tarde: 17, tarda: 17, afternoon: 16, evening: 19, vespre: 19, noche: 21, night: 21, nit: 21, madrugada: 4 };
  const ORD = { primer: 1, primero: 1, '1er': 1, '1o': 1, first: 1, '1st': 1, segundo: 2, '2o': 2, second: 2, '2nd': 2, tercer: 3, tercero: 3, '3er': 3, '3o': 3, third: 3, '3rd': 3, cuarto: 4, '4o': 4, fourth: 4, '4th': 4, ultimo: -1, last: -1, quinto: 5 };

  const alt = obj => Object.keys(obj).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const MON = '(' + alt(MONTHS) + ')\\.?';
  const WD = '(?:' + alt(WDAYS) + ')';
  const WDC = '(' + alt(WDAYS) + ')';
  const NUM = '(\\d+(?:[.,]\\d+)?|' + alt(NUMW) + ')';
  const UNIT = '(minutos?|minuts?|minutes?|mins?|min|m|horas?|hores?|hours?|hrs?|h|dias?|dies|days?|d|semanas?|setmanes?|weeks?|sem|w|meses|mesos|mes|months?|anos?|anys?|years?)';
  const HOURW = '(\\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
  const AMPM = '(am|pm|a\\.m\\.|p\\.m\\.|hs|h)';
  const FRAC = '(?:\\s+y\\s+(media|cuarto|\\d{1,2})|\\s+menos\\s+(cuarto|\\d{1,2})|\\s+i\\s+(mitja|quart))';
  const DP = '(?:\\s+(?:de\\s+la|por\\s+la|en\\s+la|del|de|in\\s+the|at|al|a\\s+la)\\s+(manana|tarde|noche|madrugada|mediodia|morning|afternoon|evening|night|mati|tarda|vespre|nit|migdia))';
  // una hora: grupos → [hora, minutos, am/pm, «y …», «menos …», «i …», parte del día]
  const TIME = HOURW + '(?:[:.h](\\d{2}))?(?:\\s*' + AMPM + '(?![a-z]))?' + FRAC + '?' + DP + '?';
  const TIME_GROUPS = 7;

  const num = s => {
    if (s == null) return NaN;
    s = String(s).trim();
    if (/^\d/.test(s)) return parseFloat(s.replace(',', '.'));
    return NUMW[s] != null ? NUMW[s] : NaN;
  };
  function unitInfo(u) {
    u = String(u || '');
    if (/^(m|mins?|min|minutos?|minuts?|minutes?)$/.test(u)) return { min: 1 };
    if (/^(h|hrs?|horas?|hores?|hours?)$/.test(u)) return { min: 60 };
    if (/^(d|dias?|dies|days?)$/.test(u)) return { min: 1440, days: 1 };
    if (/^(sem|w|semanas?|setmanes?|weeks?)$/.test(u)) return { min: 10080, days: 7 };
    if (/^(mes|meses|mesos|months?)$/.test(u)) return { min: 43200, months: 1 };
    if (/^(anos?|anys?|years?)$/.test(u)) return { min: 525600, months: 12 };
    return null;
  }

  // ---------- texto con marcas ----------
  function normalize(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      let l = c.toLowerCase();
      if (l.length !== 1) l = c;
      const d = l.normalize('NFD')[0];
      out += (d && d.length === 1) ? d : l;
    }
    return out.replace(/[’`´]/g, "'");
  }

  function makeState(orig) { return { orig, n: normalize(orig), used: new Array(orig.length).fill(false) }; }
  function consume(S, a, b) {
    for (let i = a; i < b; i++) S.used[i] = true;
    S.n = S.n.slice(0, a) + X.repeat(b - a) + S.n.slice(b);
  }
  /** Busca re en el texto (lo no usado) y llama a fn(m) por cada coincidencia;
   *  si fn no devuelve false, ese trozo se tacha. `all` = todas, si no la primera. */
  function take(S, src, fn, all) {
    const re = new RegExp(src, 'g');
    const found = [];
    let m;
    while ((m = re.exec(S.n))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      found.push(m);
    }
    let hit = false;
    for (const mm of found) {
      // (puede que otra coincidencia de esta misma pasada ya la haya tachado)
      if (S.n.slice(mm.index, mm.index + mm[0].length).includes(X)) continue;
      const r = fn(mm);
      if (r === false) continue;
      let a = mm.index, b = mm.index + mm[0].length;
      // no tachar los espacios del principio (para no pegar palabras)
      while (a < b && /\s/.test(S.n[a])) a++;
      while (b > a && /\s/.test(S.n[b - 1])) b--;
      consume(S, a, b);
      hit = true;
      if (!all) break;
    }
    return hit;
  }

  // ---------- fechas ----------
  function mkDate(y, m, d) {
    const r = new Date(y, m, d);
    return r.getMonth() === m && r.getDate() === d ? r : null;
  }
  function yearFix(y) { y = +y; return y < 100 ? 2000 + y : y; }
  // día+mes sin año: este año, o el que viene si ya pasó
  function noYear(today, m, d) {
    let r = mkDate(today.getFullYear(), m, d);
    if (!r && m === 1 && d === 29) { for (let y = today.getFullYear() + 1; y < today.getFullYear() + 8; y++) { r = mkDate(y, m, d); if (r) return r; } }
    if (r && r < today) r = mkDate(today.getFullYear() + 1, m, d);
    return r;
  }
  // solo el día del mes: este mes, o el siguiente si ya pasó
  function dayOfMonth(today, d) {
    for (let k = 0; k < 13; k++) {
      const y = today.getFullYear(), m = today.getMonth() + k;
      const r = mkDate(y + Math.floor(m / 12), m % 12, d);
      if (r && r >= today) return r;
    }
    return null;
  }
  function nextWeekday(today, dow, mode) {
    let diff = (dow - today.getDay() + 7) % 7;
    if (diff === 0 && mode !== 'this') diff = 7;
    return U().addDays(today, diff);
  }

  // ---------- horas ----------
  function hourOf(s) { const n = num(s); return isNaN(n) ? NaN : n; }
  /** grupos de TIME → { h, m, amb } o null */
  function timeFrom(g, defaultPm) {
    let h = hourOf(g[0]);
    if (isNaN(h)) return null;
    let m = g[1] != null ? +g[1] : 0;
    const ap = (g[2] || '').replace(/\./g, '');
    if (g[3]) m = g[3] === 'media' ? 30 : g[3] === 'cuarto' ? 15 : +g[3];
    if (g[4]) { h -= 1; m = 60 - (g[4] === 'cuarto' ? 15 : +g[4]); if (h < 0) h = 23; }
    if (g[5]) m = g[5] === 'mitja' ? 30 : 15; // català: «les 5 i mitja»
    const dp = g[6] || '';
    if (h > 24 || m > 59) return null;
    if (h === 24) h = 0;
    let amb = false;
    if (ap === 'pm') { if (h < 12) h += 12; }
    else if (ap === 'am') { if (h === 12) h = 0; }
    else if (dp) h = applyDaypart(h, dp);
    // «a las 9», «5:30»: sin am/pm ni parte del día puede ser mañana o tarde (lo decide guessHour al final).
    // Con un cero delante («07:30») es una hora de 24 h y no se toca.
    else if (h >= 1 && h <= 12 && ap !== 'h' && ap !== 'hs' && !/^0\d/.test(String(g[0]))) amb = true;
    return { h, m, amb };
  }
  // palabras que dicen si un plan es de tarde/noche («cena a las 9» = 21:00) o de mañana («desayuno a las 9»)
  const PM_WORDS = /\b(cena|cenas|cenar|cenamos|cenita|concierto|conciertos|copas?|fiesta|fiestas|discoteca|disco|botellon|cubatas?|birras?|teatro|musical|sopar|festa|concert|dinner|supper|drinks?|party|gig|nightclub|club|pub|afterwork|after\s+work)\b/;
  const AM_WORDS = /\b(desayuno|desayunar|desayunamos|esmorzar|esmorzem|breakfast)\b/;
  /** hora ambigua → la más probable: de 1 a 7 por la tarde; con planes de tarde/noche, de 1 a 11 también */
  function guessHour(t, hint) {
    if (!t || !t.amb || t.h >= 12) return t;
    if (hint === 'am') return Object.assign({}, t, { amb: false });
    if (t.h <= 7 || hint === 'pm') return Object.assign({}, t, { h: t.h + 12 });
    return t;
  }
  /** final de un rango («de 10 a 2»): si es ambiguo, la primera de las dos posibles que va después del inicio */
  function rangeEnd(t1, t2) {
    if (!t2.amb || t2.h >= 12) return t2;
    const a = t1.h * 60 + t1.m;
    const pm = t2.h + 12;
    if (t2.h * 60 + t2.m > a) return t2;
    if (pm * 60 + t2.m > a) return Object.assign({}, t2, { h: pm });
    return t2; // al día siguiente (p. ej. de 22:00 a 2:00)
  }
  function applyDaypart(h, dp) {
    if (/^(tarde|tarda|afternoon|evening|vespre)$/.test(dp)) return h < 12 ? h + 12 : h;
    if (/^(noche|night|nit)$/.test(dp)) return h === 12 ? 0 : (h >= 5 && h < 12 ? h + 12 : h);
    if (/^(mediodia|migdia)$/.test(dp)) return h < 6 ? h + 12 : h;
    if (dp === 'madrugada') return h === 12 ? 0 : h;
    return h === 12 && /^(manana|morning|mati)$/.test(dp) ? 12 : h;
  }

  // ---------- el análisis ----------
  function parse(text, opts) {
    const u = U();
    opts = opts || {};
    const orig = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!orig) return null;
    const now = opts.now ? new Date(opts.now) : new Date();
    const today = u.startOfDay(now);
    const lang = String(opts.lang || 'es').slice(0, 2);
    const S = makeState(orig);
    const R = { kind: 'event', reminders: null, rrule: null, date: null, date2: null, time: null, time2: null, dur: null, rel: null, allDay: false, forN: null, until: null, count: null, approx: false };

    // 1) tareas: «recuérdame…», «tarea:», «remind me to…»
    take(S, '^\\s*(?:recuerdame(?:\\s+que)?|recordarme|recordatorio\\s*:|acuerdate\\s+de|no\\s+(?:te\\s+)?olvides\\s+(?:de\\s+)?|no\\s+olvidar|tarea\\b\\s*:?|todo\\s*:|pendiente\\s*:|remind\\s+me\\s+(?:to|that|about)?|reminder\\s*:?|task\\s*:?|to-?do\\s*:|recorda\'m\\s+(?:que\\s+)?|avisame\\s+(?:de|que|para)\\s+)\\s*', () => { R.kind = 'task'; });

    // 2) avisos: «avísame 30 min antes», «sin aviso»
    take(S, '[,;]?\\s*\\b(?:sin\\s+(?:aviso|avisos|recordatorio|alarma)|no\\s+avisar|no\\s+reminders?|without\\s+reminders?)\\b', () => { R.reminders = []; });
    take(S, '[,;]?\\s*(?:\\b(?:y\\s+|and\\s+)?(?:avisame|avisarme|avisa|aviso|alarma|alerta|recordatorio|recuerdamelo|recuerdame|notificame|remind\\s+me|reminder|alert|notify\\s+me|avisa\'m)\\s+(?:de\\s+|con\\s+)?)?(?:\\b(?:y|and)\\s+)?\\b' + NUM + '\\s*' + UNIT + '\\s+(?:antes|de\\s+antelacion|before|early|prior|abans)\\b', m => {
      const n = num(m[1]), ui = unitInfo(m[2]);
      if (isNaN(n) || !ui) return false;
      R.reminders = (R.reminders || []).concat(Math.round(n * ui.min));
    }, true);
    take(S, '[,;]?\\s*\\b(?:avisame|avisa|aviso|remind\\s+me|alert\\s+me)\\s+(?:a\\s+la\\s+hora|en\\s+el\\s+momento|al\\s+empezar|at\\s+the\\s+time|when\\s+it\\s+starts)\\b', () => { R.reminders = (R.reminders || []).concat(0); });

    // 3) repeticiones
    const setRule = r => { if (!R.rrule) R.rrule = Object.assign({ interval: 1, byDay: null, monthMode: 'day', until: null, count: null }, r); };
    take(S, '\\b(?:de\\s+lunes\\s+a\\s+viernes|entre\\s+semana|todos\\s+los\\s+dias\\s+laborables|los\\s+dias\\s+laborables|dias\\s+laborables|cada\\s+dia\\s+laborable|weekdays|every\\s+weekday|on\\s+weekdays|monday\\s+(?:to|through|thru)\\s+friday|de\\s+dilluns\\s+a\\s+divendres|entre\\s+setmana)\\b', () => setRule({ freq: 'weekly', byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] }));
    take(S, '\\b(?:todos\\s+los\\s+fines\\s+de\\s+semana|los\\s+fines\\s+de\\s+semana|cada\\s+fin\\s+de\\s+semana|cada\\s+finde|los\\s+findes|every\\s+weekend|on\\s+weekends|weekends|els\\s+caps\\s+de\\s+setmana)\\b', () => setRule({ freq: 'weekly', byDay: ['SA', 'SU'] }));
    take(S, '\\b(?:cada\\s+quince\\s+dias|cada\\s+dos\\s+semanas|biweekly|fortnightly|every\\s+other\\s+week)\\b', () => setRule({ freq: 'weekly', interval: 2 }));
    take(S, '\\b(?:cada|every|cada\\s+uno\\s+de)\\s+' + NUM + '\\s+(dias|dies|days|semanas|setmanes|weeks|meses|mesos|months|anos|anys|years)\\b', m => {
      const n = Math.round(num(m[1])), ui = unitInfo(m[2]);
      if (!n || !ui) return false;
      setRule({ freq: ui.months === 12 ? 'yearly' : ui.months ? 'monthly' : ui.days === 7 ? 'weekly' : 'daily', interval: n });
    });
    // el n-ésimo día de la semana de cada mes
    take(S, '\\b(?:el\\s+|cada\\s+|the\\s+|every\\s+)?(' + alt(ORD) + ')\\s+' + WDC + '\\s+(?:de\\s+cada\\s+mes|del\\s+mes|de\\s+todos\\s+los\\s+meses|of\\s+(?:every|each|the)\\s+month|de\\s+cada\\s+mes|cada\\s+mes|monthly)\\b', m => {
      const n = ORD[m[1]], dow = WDAYS[m[2]];
      if (n == null || dow == null) return false;
      setRule({ freq: 'monthly', monthMode: 'weekday', nth: n });
      for (let k = 0; k < 14 && !R.date; k++) {
        const y = today.getFullYear(), mm = today.getMonth() + k;
        const d = ZC.recur ? ZC.recur.nthWeekday(y + Math.floor(mm / 12), mm % 12, dow, n) : null;
        if (d && d >= today) R.date = d;
      }
    });
    take(S, '\\b(?:el\\s+)?(?:dia\\s+)?(\\d{1,2})\\s+de\\s+cada\\s+mes\\b|\\btodos\\s+los\\s+(?:dias\\s+)?(\\d{1,2})\\b(?!\\s*(?:de|:|h))|\\bon\\s+the\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+(?:every|each)\\s+month\\b|\\bevery\\s+month\\s+on\\s+the\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b', m => {
      const d = +(m[1] || m[2] || m[3] || m[4]);
      if (!d || d > 31) return false;
      setRule({ freq: 'monthly' });
      R.date = dayOfMonth(today, d);
    });
    take(S, '\\b(?:todos\\s+los\\s+dias|todos\\s+los\\s+dia|cada\\s+dia|diariamente|a\\s+diario|every\\s*day|daily|tots\\s+els\\s+dies|cada\\s+dia)\\b', () => setRule({ freq: 'daily' }));
    take(S, '\\b(?:(?:cada|todas\\s+las)\\s+semanas?|semanalmente|weekly|every\\s+week|cada\\s+setmana)\\b', () => setRule({ freq: 'weekly' }));
    take(S, '\\b(?:(?:cada|todos\\s+los)\\s+mes(?:es)?|mensualmente|monthly|every\\s+month|cada\\s+mes)\\b', () => setRule({ freq: 'monthly' }));
    take(S, '\\b(?:(?:cada|todos\\s+los)\\s+anos?|anualmente|yearly|annually|every\\s+year|cada\\s+any|tots\\s+els\\s+anys)\\b', () => setRule({ freq: 'yearly' }));
    // días de la semana que se repiten: «cada lunes», «los martes y jueves», «every monday», «on fridays»
    const WDLIST = '(' + WD + '(?:\\s*(?:,|\\by\\b|\\be\\b|\\band\\b|&|\\bi\\b)\\s*(?:los\\s+|las\\s+|els\\s+|el\\s+)?' + WD + ')*)';
    const wdList = s => [...new Set(s.split(/\s*(?:,|\by\b|\be\b|\band\b|&|\bi\b)\s*(?:los\s+|las\s+|els\s+|el\s+)?/).map(x => WDAYS[x.trim()]).filter(x => x != null))];
    const setWeekdays = s => {
      const ds = wdList(s);
      if (!ds.length) return false;
      const by = ds.map(d => ZC.recur ? ZC.recur.DAYS[d] : ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]);
      if (R.rrule && R.rrule.freq === 'weekly' && !R.rrule.byDay) R.rrule.byDay = by;
      else if (R.rrule && R.rrule.freq !== 'weekly') return false;
      else setRule({ freq: 'weekly', byDay: by });
    };
    take(S, '\\b(?:cada|todos\\s+los|todas\\s+las|every|tots\\s+els|cada\\s+uno\\s+de\\s+los)\\s+' + WDLIST + '\\b', m => setWeekdays(m[1]));
    take(S, '\\b(?:los|els)\\s+' + WDLIST + '\\b', m => setWeekdays(m[1]));
    take(S, '\\b(?:on\\s+)?((?:mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)(?:\\s*(?:,|and|&)\\s*(?:mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays))*)\\b', m => setWeekdays(m[1]));
    if (R.rrule) {
      // hasta cuándo / cuántas veces
      take(S, '[,]?\\s*\\b(?:hasta|until|till|fins)\\s+(?:el\\s+|al\\s+|the\\s+|a\\s+)?(?:dia\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+de|\\s+of)?\\s+' + MON + '(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?\\b', m => {
        const d = m[3] ? mkDate(+m[3], MONTHS[m[2]], +m[1]) : noYear(today, MONTHS[m[2]], +m[1]);
        if (!d) return false;
        R.until = d;
      });
      if (!R.until) take(S, '[,]?\\s*\\b(?:until|till)\\s+' + MON + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b', m => {
        const d = m[3] ? mkDate(+m[3], MONTHS[m[1]], +m[2]) : noYear(today, MONTHS[m[1]], +m[2]);
        if (!d) return false;
        R.until = d;
      });
      if (!R.until) take(S, '[,]?\\s*\\b(?:hasta|until|till|fins)\\s+(?:el\\s+|al\\s+)?(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?\\b', m => {
        let d = +m[1], mo = +m[2];
        if (lang === 'en' && mo <= 31 && d <= 12) { const t = d; d = mo; mo = t; }
        const r = m[3] ? mkDate(yearFix(m[3]), mo - 1, d) : noYear(today, mo - 1, d);
        if (!r) return false;
        R.until = r;
      });
      take(S, '[,]?\\s*\\b' + NUM + '\\s+(?:veces|times|vegades)\\b', m => { const n = Math.round(num(m[1])); if (!n) return false; R.count = n; });
      take(S, '[,]?\\s*\\b(?:durante|during|for|durant)\\s+' + NUM + '\\s+(dias|dies|days|semanas|setmanes|weeks|meses|mesos|months|anos|anys|years)\\b', m => {
        const n = num(m[1]), ui = unitInfo(m[2]);
        if (!n || !ui) return false;
        R.forN = { n, ui };
      });
    }

    // 4) cuánto dura: «durante 2 horas», «(1h)», «for 30 minutes»
    take(S, '\\b(?:durante|during|for|que\\s+dure|dura|durant)\\s+(?:una\\s+|an\\s+)?hora\\s+y\\s+media\\b', () => { R.dur = 90; });
    take(S, '\\b(?:durante|during|for|que\\s+dure|dura|durant)\\s+' + NUM + '\\s*' + UNIT + '(?:\\s+y\\s+(media|\\d+\\s*(?:minutos|min|m)))?\\b', m => {
      const n = num(m[1]), ui = unitInfo(m[2]);
      if (isNaN(n) || !ui) return false;
      let mins = n * ui.min;
      if (m[3]) mins += m[3] === 'media' ? ui.min / 2 : parseInt(m[3], 10);
      R.dur = Math.round(mins);
    });
    take(S, '\\(\\s*' + NUM + '\\s*' + UNIT + '\\s*\\)', m => {
      const n = num(m[1]), ui = unitInfo(m[2]);
      if (isNaN(n) || !ui || ui.min > 1440) return false;
      R.dur = Math.round(n * ui.min);
    });

    // 5) «en 2 horas», «dentro de 3 días», «in 20 minutes», «en un rato»
    take(S, '\\b(?:en|dentro\\s+de|in|d\'aqui\\s+a|daqui\\s+a)\\s+(?:una\\s+|an\\s+)?hora\\s+y\\s+media\\b', () => { R.rel = u.addMinutes(now, 90); });
    take(S, '\\b(?:en|dentro\\s+de|in|d\'aqui\\s+a|daqui\\s+a|within)\\s+' + NUM + '\\s*' + UNIT + '(?:\\s+y\\s+(media|\\d+\\s*(?:minutos|min|m)))?\\b', m => {
      const n = num(m[1]), ui = unitInfo(m[2]);
      if (isNaN(n) || !ui) return false;
      if (ui.min < 1440) {
        let mins = n * ui.min;
        if (m[3]) mins += m[3] === 'media' ? ui.min / 2 : parseInt(m[3], 10);
        R.rel = u.addMinutes(now, Math.round(mins));
      } else if (ui.months) R.date = u.addMonths(today, Math.round(n * ui.months));
      else R.date = u.addDays(today, Math.round(n * ui.days));
    });
    take(S, '\\b(?:en|dentro\\s+de)\\s+un\\s+rato\\b|\\bin\\s+a\\s+(?:bit|while)\\b|\\bluego\\b|\\bmas\\s+tarde\\b|\\blater\\s+today\\b', () => { if (!R.rel) R.rel = u.addMinutes(now, 60); });

    // 6) rangos de fechas: «del 3 al 7 de diciembre», «from dec 3 to 7», «3-7 dic», «este finde»
    take(S, '\\b(?:del?|desde\\s+el)\\s+(?:dia\\s+)?(\\d{1,2})(?:\\s+(?:de\\s+)?' + MON + ')?\\s+(?:al?|hasta\\s+el)\\s+(?:dia\\s+)?(\\d{1,2})\\s+(?:de\\s+)?' + MON + '(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?\\b', m => {
      const m2 = MONTHS[m[4]], m1 = m[2] ? MONTHS[m[2]] : m2;
      const range = rangeDates(today, m[5], m1, +m[1], m2, +m[3]);
      if (!range) return false;
      [R.date, R.date2] = range;
    });
    if (!R.date) take(S, '\\b(?:from\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:to|until|through|-|–)\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MON + '(?:,?\\s+(\\d{4}))?\\b', m => {
      const mo = MONTHS[m[3]];
      const range = rangeDates(today, m[4], mo, +m[1], mo, +m[2]);
      if (!range) return false;
      [R.date, R.date2] = range;
    });
    if (!R.date) take(S, '\\b(?:from\\s+)?' + MON + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|until|through|-|–)\\s*(?:' + MON + '\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b', m => {
      const m1 = MONTHS[m[1]], m2 = m[3] ? MONTHS[m[3]] : m1;
      const range = rangeDates(today, m[5], m1, +m[2], m2, +m[4]);
      if (!range) return false;
      [R.date, R.date2] = range;
    });
    if (!R.date) take(S, '\\b(?:del?\\s+)?' + WDC + '\\s+(?:al?|hasta\\s+el|to|until|through|-)\\s+(?:el\\s+)?' + WDC + '\\b', m => {
      const a = WDAYS[m[1]], b = WDAYS[m[2]];
      if (a == null || b == null || a === b) return false;
      R.date = nextWeekday(today, a, 'this');
      R.date2 = u.addDays(R.date, (b - a + 7) % 7);
    });
    if (!R.date) take(S, '\\b(?:este|el|this|aquest|el\\s+proximo|next|el\\s+que\\s+viene)\\s+(?:finde|fin\\s+de\\s+semana|weekend|cap\\s+de\\s+setmana)(?:\\s+que\\s+viene)?\\b', m => {
      const sat = nextWeekday(today, 6, 'this');
      const next = /proximo|next|viene/.test(m[0]);
      // en domingo «este finde» es hoy
      R.date = today.getDay() === 0 && !next ? today : (next && today.getDay() === 6 ? u.addDays(sat, 7) : sat);
      R.date2 = today.getDay() === 0 && !next ? today : u.addDays(R.date, 1);
      R.weekendRange = true;
    });

    // 7) rangos de horas: «de 10 a 12», «10:00-11:30», «from 3 to 5pm», «entre las 5 y las 7»
    take(S, '\\b(?:de\\s+(?:las?\\s+)?|desde\\s+(?:las?\\s+)?|entre\\s+(?:las?\\s+)?|from\\s+|between\\s+|de\\s+les\\s+)' + TIME + '\\s*(?:a|hasta|-|–|y|to|till|until|and|al?|fins\\s+a)\\s+(?:las?\\s+|les\\s+)?' + TIME + '\\b', m => {
      const g1 = m.slice(1, 1 + TIME_GROUPS), g2 = m.slice(1 + TIME_GROUPS, 1 + 2 * TIME_GROUPS);
      // la parte del día / am-pm del final vale para las dos («de 3 a 5 de la tarde»)
      if (!g1[2] && !g1[6] && (g2[2] === 'pm' || g2[6])) { g1[6] = g2[6] || ''; if (g2[2] === 'pm') g1[2] = 'pm'; }
      const t1 = timeFrom(g1, true), t2 = timeFrom(g2, true);
      if (!t1 || !t2) return false;
      R.time = t1; R.time2 = t2;
    });
    if (!R.time) take(S, '\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|h)?\\s*[-–]\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(h|am|pm)\\b|\\b(\\d{1,2}):(\\d{2})\\s*[-–]\\s*(\\d{1,2}):(\\d{2})\\b', m => {
      let t1, t2;
      if (m[7]) { t1 = timeFrom([m[7], m[8]], false); t2 = timeFrom([m[9], m[10]], false); }
      else {
        const ap2 = m[6] === 'h' ? 'h' : m[6];
        t1 = timeFrom([m[1], m[2], m[3] || (ap2 === 'pm' && +m[1] <= +m[4] ? 'pm' : ap2 === 'h' ? 'h' : '')], false);
        t2 = timeFrom([m[4], m[5], ap2], false);
      }
      if (!t1 || !t2) return false;
      R.time = t1; R.time2 = t2;
    });

    // 8) una hora suelta
    const setTime = t => { if (!t) return false; if (R.time) return false; R.time = t; };
    take(S, '\\b(?:a\\s+eso\\s+de\\s+las?|sobre\\s+las?|hacia\\s+las?|como\\s+a\\s+las?|a\\s+las?|at\\s+around|around|at|@|a\\s+les|a\\s+la|cap\\s+a\\s+les)\\s+' + TIME + '\\b', m => setTime(timeFrom(m.slice(1, 1 + TIME_GROUPS), true)));
    take(S, '\\b(\\d{1,2}):(\\d{2})\\s*(am|pm|a\\.m\\.|p\\.m\\.|hs|h)?' + DP + '?(?![\\d/])', m => setTime(timeFrom([m[1], m[2], m[3], null, null, null, m[4]], false)));
    take(S, '\\b(\\d{1,2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)(?=\\s|$|[,.;' + X + '])', m => setTime(timeFrom([m[1], null, m[2]], false)));
    take(S, '\\b' + HOURW + FRAC + '?' + DP + '\\b', m => setTime(timeFrom([m[1], null, null, m[2], m[3], m[4], m[5]], false)));
    take(S, '\\b(\\d{1,2})\\s+(?:y\\s+(media|cuarto)|menos\\s+(cuarto))\\b', m => setTime(timeFrom([m[1], null, null, m[2], m[3]], true)));
    take(S, '\\b(\\d{1,2})\\s*(?:h|hs)\\b(?!\\s*(?:antes|before))', m => {
      const n = +m[1];
      if (n <= 3 && !R.dur) { R.dur = n * 60; return; } // «reunión 2h» = lo que dura
      if (n > 23) return false;
      return setTime({ h: n, m: 0, amb: false });
    });
    take(S, '\\b(?:a\\s+|al\\s+|at\\s+)?(?:mediodia|noon|migdia)\\b', () => setTime({ h: 12, m: 0, amb: false }));
    take(S, '\\b(?:a\\s+|at\\s+)?(?:medianoche|midnight|mitjanit)\\b', () => setTime({ h: 23, m: 59, amb: false }));
    // partes del día: «esta tarde», «tonight», «por la mañana»
    take(S, '\\b(?:esta|this|aquesta)\\s+(manana|tarde|noche|morning|afternoon|evening|nit|tarda)\\b|\\b(tonight)\\b', m => {
      if (!R.date) R.date = today;
      daypart(R, m[1] || 'night');
    });
    take(S, '\\b(?:por|de|en|a)\\s+la\\s+(manana|tarde|noche|madrugada)\\b|\\bin\\s+the\\s+(morning|afternoon|evening)\\b|\\bat\\s+(night)\\b|\\b(?:al|el)\\s+(mati|vespre)\\b|\\b(?:a\\s+la|de\\s+la)\\s+(nit|tarda)\\b|\\ba\\s+primera\\s+hora\\b', m => {
      daypart(R, m[1] || m[2] || m[3] || m[4] || m[5] || 'primera');
    });

    // 9) fechas absolutas
    take(S, '\\b(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b', m => { const d = mkDate(+m[1], +m[2] - 1, +m[3]); if (!d || R.date) return false; R.date = d; });
    take(S, '\\b(?:el\\s+|on\\s+)?(?:' + WDC + ',?\\s+)?(?:dia\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+de|\\s+of)?\\s+' + MON + '(?:,?\\s+(?:de\\s+|del\\s+)?(\\d{4}))?\\b', m => {
      if (R.date) return false;
      const d = m[4] ? mkDate(+m[4], MONTHS[m[3]], +m[2]) : noYear(today, MONTHS[m[3]], +m[2]);
      if (!d) return false;
      R.date = d;
    });
    take(S, '\\b(?:on\\s+)?(?:' + WDC + ',?\\s+)?' + MON + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b', m => {
      if (R.date) return false;
      const d = m[4] ? mkDate(+m[4], MONTHS[m[2]], +m[3]) : noYear(today, MONTHS[m[2]], +m[3]);
      if (!d) return false;
      R.date = d;
    });
    take(S, '\\b(?:el\\s+|on\\s+)?(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?\\b', m => {
      if (R.date) return false;
      let d = +m[1], mo = +m[2];
      if (lang === 'en') { const t = d; d = mo; mo = t; }
      if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
      const r = m[3] ? mkDate(yearFix(m[3]), mo - 1, d) : noYear(today, mo - 1, d);
      if (!r) return false;
      R.date = r;
    });
    // «el viernes 27», «el día 15», «the 3rd»
    take(S, '\\b(?:el\\s+|this\\s+|on\\s+)?' + WDC + '\\s+(?:dia\\s+|the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?::|h\\b|de\\s+la|am|pm|y\\s+media|menos))', m => {
      if (R.date) return false;
      const d = dayOfMonth(today, +m[2]);
      if (!d) return false;
      R.date = d;
    });
    take(S, '\\b(?:el\\s+)?dia\\s+(\\d{1,2})\\b|\\bel\\s+(\\d{1,2})\\b(?!\\s*(?::|h\\b|de\\s+la|personas|am|pm|%))|\\b(?:on\\s+)?the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b', m => {
      if (R.date) return false;
      const d = dayOfMonth(today, +(m[1] || m[2] || m[3]));
      if (!d) return false;
      R.date = d;
    });

    // 10) hoy, mañana, el viernes…
    take(S, '\\b(?:pasado\\s+manana|day\\s+after\\s+tomorrow|dema\\s+passat|passat\\s+dema)\\b', () => { if (R.date) return false; R.date = u.addDays(today, 2); });
    take(S, '\\b(?:manana|tomorrow|tmrw|tmr|dema)\\b', () => { if (R.date) return false; R.date = u.addDays(today, 1); });
    take(S, '\\b(?:hoy|today|avui|tonite)\\b', () => { if (R.date && !u.sameDay(R.date, today)) return false; R.date = today; });
    take(S, '\\b(?:anteayer|antes\\s+de\\s+ayer|abans-d\'ahir)\\b', () => { if (R.date) return false; R.date = u.addDays(today, -2); });
    take(S, '\\b(?:ayer|yesterday|ahir)\\b', () => { if (R.date) return false; R.date = u.addDays(today, -1); });
    take(S, '\\b(?:la\\s+)?(?:semana\\s+que\\s+viene|proxima\\s+semana|next\\s+week|setmana\\s+que\\s+ve)\\b', () => {
      if (R.date) return false;
      R.date = u.addDays(u.startOfWeek(today, 1), 7); R.approx = true;
    });
    take(S, '\\b(?:el\\s+)?(?:mes\\s+que\\s+viene|proximo\\s+mes|next\\s+month|mes\\s+que\\s+ve)\\b', () => {
      if (R.date) return false;
      R.date = new Date(today.getFullYear(), today.getMonth() + 1, 1); R.approx = true;
    });
    take(S, '\\b(?:(el\\s+proximo|el\\s+siguiente|next|el\\s+que\\s+ve)\\s+|(este|esta|this|aquest|aquesta)\\s+|(?:el|on|aquest)\\s+)?' + WDC + '(\\s+que\\s+viene|\\s+proximo|\\s+que\\s+ve)?\\b', m => {
      const dow = WDAYS[m[3]];
      if (dow == null) return false;
      if (R.rrule && R.rrule.freq === 'weekly') {
        // «cada semana el martes»
        if (!R.rrule.byDay) R.rrule.byDay = [ZC.recur.DAYS[dow]];
        return;
      }
      if (R.date) return false;
      R.date = nextWeekday(today, dow, m[2] ? 'this' : m[1] || m[4] ? 'next' : 'plain');
    });
    // «en diciembre», «in march» (día 1, aproximado)
    take(S, '\\b(?:en|in|a|al)\\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|gener|febrer|marc|maig|juny|juliol|agost|setembre|novembre|desembre)\\b', m => {
      if (R.date) return false;
      const mo = MONTHS[m[1]];
      let d = new Date(today.getFullYear(), mo, 1);
      if (mo < today.getMonth()) d = new Date(today.getFullYear() + 1, mo, 1);
      else if (mo === today.getMonth()) d = today;
      R.date = d; R.approx = true;
    });

    // 11) todo el día
    take(S, '\\b(?:todo\\s+el\\s+dia|el\\s+dia\\s+entero|dia\\s+entero|all\\s*-?\\s*day|the\\s+whole\\s+day|tot\\s+el\\s+dia)\\b', () => { R.allDay = true; });

    // 12) lugar: «en Casa Pepe», «at Starbucks», «@ la oficina»
    const location = findLocation(S);

    // 13) el título: lo que queda
    let title = cleanTitle(S);
    const ft = u.fold(title);
    if (R.kind !== 'task' && /^(recordar|comprar|llamar|pagar|enviar|mandar|devolver|recoger|renovar|reservar|pedir|escribir|contestar|responder|buy|call|pay|send|pick\s+up|return|renew|book|order|email|reply|trucar|comprar|enviar)\b/.test(ft)) R.kind = 'task';
    let calendarId, emoji;
    if (/\b(cumple|cumpleanos|birthday|bday|aniversari|aniversario)\b/.test(ft)) {
      calendarId = 'birthdays'; emoji = '🎂';
      if (!R.rrule && !R.rel) setRule({ freq: 'yearly' });
      if (!R.time) R.allDay = true;
    }

    // ---- juntar todo ----
    let start, end, allDay = false;
    const hadDate = !!(R.date || R.rel), hadTime = !!(R.time || R.rel);
    if (R.rrule && !R.date && !R.rel) {
      // primera aparición: hoy (si toca) o el próximo día de los de la lista
      if (R.rrule.byDay) {
        const want = R.rrule.byDay.map(x => ZC.recur.DAYS.indexOf(x));
        let best = null;
        for (const dow of want) {
          let d = nextWeekday(today, dow, 'this');
          if (u.sameDay(d, today) && R.time && (R.time.h * 60 + R.time.m) <= now.getHours() * 60 + now.getMinutes()) d = u.addDays(d, 7);
          if (!best || d < best) best = d;
        }
        R.date = best;
      } else R.date = today;
    }
    if (R.rel) {
      start = new Date(R.rel.getTime()); start.setSeconds(0, 0);
    } else if (R.date || R.time) {
      let date = R.date;
      const fo = u.fold(orig);
      const hint = AM_WORDS.test(fo) ? 'am' : PM_WORDS.test(fo) ? 'pm' : null;
      let t = guessHour(R.time, hint);
      if (!date || u.sameDay(date, today)) {
        // la hora ya pasó hoy: si podía ser por la tarde, por la tarde; si no, mañana (si no se ha dicho «hoy»)
        if (t) {
          const nowMin = now.getHours() * 60 + now.getMinutes();
          if (t.h * 60 + t.m <= nowMin) {
            if (R.rrule) { /* se repite: la primera puede quedar atrás, da igual */ }
            else if (t.amb && t.h < 12 && (t.h + 12) * 60 + t.m > nowMin) t = Object.assign({}, t, { h: t.h + 12 });
            else if (!date) date = u.addDays(today, 1);
          }
        }
        if (!date) date = today;
      }
      if (t && !R.allDay) start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), t.h, t.m);
      else { start = new Date(date.getTime()); allDay = true; }
      if (R.time2 && !allDay) {
        const t2 = rangeEnd(t, R.time2);
        end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), t2.h, t2.m);
        if (end <= start) end = u.addDays(end, 1);
      }
    } else if (R.kind === 'task') {
      start = new Date(today.getTime()); allDay = true;
    } else {
      // nada de fecha ni hora: la próxima hora en punto
      start = new Date(now.getTime()); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1);
    }
    if (R.allDay && !allDay) { allDay = true; start = u.startOfDay(start); end = null; }
    if (R.date2) {
      if (allDay) end = R.date2;
      else if (!end) {
        // del 3 al 7 a las 10: cada día igual que el primero, pero acabando el último día
        end = new Date(R.date2.getFullYear(), R.date2.getMonth(), R.date2.getDate(), start.getHours(), start.getMinutes());
        end = u.addMinutes(end, R.dur || opts.defaultDuration || 60);
      }
    }
    // «este finde a las 10»: un solo día
    if (R.weekendRange && !allDay) end = null;
    if (!end) {
      if (allDay) end = R.dur && R.dur >= 1440 ? u.addDays(start, Math.round(R.dur / 1440) - 1) : start;
      else end = u.addMinutes(start, R.dur || opts.defaultDuration || 60);
    }
    let rrule = null;
    if (R.rrule) {
      rrule = Object.assign({}, R.rrule);
      if (rrule.freq === 'weekly' && !rrule.byDay) rrule.byDay = [ZC.recur.DAYS[start.getDay()]];
      if (R.until) rrule.until = u.ymd(R.until);
      if (R.count) rrule.count = R.count;
      if (R.forN && !rrule.until && !rrule.count) {
        const f = R.forN;
        const lastDay = f.ui.months ? u.addMonths(start, Math.round(f.n * f.ui.months)) : u.addDays(start, Math.round(f.n * f.ui.days));
        rrule.until = u.ymd(u.addDays(lastDay, -1));
      }
      if (rrule.nth == null) delete rrule.nth;
    }
    let reminders = R.reminders;
    if (reminders) reminders = [...new Set(reminders)].sort((a, b) => a - b);
    if (R.kind === 'task' && !reminders && !allDay && hadTime) reminders = [0];

    let confidence = 0.3;
    if (hadDate || R.rrule) confidence += 0.3;
    if (hadTime) confidence += 0.2;
    if (title) confidence += 0.1;
    if (location) confidence += 0.05;
    if (R.approx) confidence -= 0.15;
    if (!hadDate && !hadTime && !R.rrule) confidence = title ? 0.3 : 0.1;
    confidence = Math.round(Math.max(0.05, Math.min(0.98, confidence)) * 100) / 100;

    const out = {
      kind: R.kind, title, start: u.toLocal(start, allDay), end: R.kind === 'task' ? u.toLocal(start, allDay) : u.toLocal(end, allDay),
      allDay, location, reminders, rrule, confidence,
    };
    if (calendarId) out.calendarId = calendarId;
    if (emoji) out.emoji = emoji;
    return out;
  }

  function daypart(R, dp) {
    if (R.time) {
      if (R.time.amb) R.time = Object.assign({}, R.time, { h: applyDaypart(R.time.h > 12 ? R.time.h - 12 : R.time.h, dp), amb: false });
      return;
    }
    const h = dp === 'primera' ? 8 : (DAYPART_HOUR[dp] != null ? DAYPART_HOUR[dp] : 9);
    R.time = { h, m: 0, amb: false, vague: true };
  }

  function rangeDates(today, year, m1, d1, m2, d2) {
    let a, b;
    if (year) { a = mkDate(+year, m1, d1); b = mkDate(+year, m2, d2); if (a && b && b < a) b = mkDate(+year + 1, m2, d2); }
    else {
      a = mkDate(today.getFullYear(), m1, d1); b = mkDate(today.getFullYear(), m2, d2);
      if (a && b && b < a) b = mkDate(today.getFullYear() + 1, m2, d2);
      if (a && b && b < today) { a = mkDate(a.getFullYear() + 1, m1, d1); b = mkDate(b.getFullYear() + 1, m2, d2); }
    }
    return a && b && b >= a ? [a, b] : null;
  }

  const PLACE_START = /^(el|la|los|las|l'|mi|mis|su|casa|cal|ca|the|my|un|una|calle|c\/|avda|avenida|av\.|plaza|placa|bar|restaurante|hospital|centro|oficina|cafe|cafeteria|gimnasio|gym|parque|cine|teatro|colegio|cole|escuela|universidad|uni|clinica|aeropuerto|estacion|hotel|piscina|biblioteca|museo|playa|office|home|school|work|trabajo|zoom|meet|teams|discord|google\s+meet)\b/;
  const NOT_PLACE = new RegExp('^(?:' + alt(WDAYS) + '|' + alt(MONTHS) + '|serio|punto|general|realidad|cuanto|vez|plan|persona|directo|linea|line|time|a\\s+bit|while|total|marcha)\\b');

  function findLocation(S) {
    const re = /(^|[\s,;(])(en|at|@|in|a\s+casa\s+de|al|a\s+la)\s+/g;
    let m, best = null;
    while ((m = re.exec(S.n))) {
      const markA = m.index + m[1].length;
      const p = m.index + m[0].length;
      if (S.n[p] === X || p >= S.n.length) continue;
      // hasta lo siguiente ya usado, una coma o «con/with/para/for»
      let q = p;
      while (q < S.n.length && S.n[q] !== X && !/[,;()\n]/.test(S.n[q])) q++;
      let seg = S.n.slice(p, q);
      const stop = /\s+(?:con|with|para|for|y\s+luego|and\s+then|amb|per)\s+/.exec(seg);
      if (stop) { seg = seg.slice(0, stop.index); q = p + stop.index; }
      seg = seg.replace(/[\s.!?:-]+$/, '');
      q = p + seg.length;
      if (!seg.trim() || /^\d+$/.test(seg.trim())) continue;
      const word = m[2].replace(/\s+/g, ' ');
      const first = S.orig[p];
      const upper = first && first !== first.toLowerCase() && first === first.toUpperCase();
      if (NOT_PLACE.test(seg)) continue;
      let ok = false;
      if (word === '@') ok = true;
      else if (word === 'a casa de') ok = true;
      else if (word === 'in') ok = upper;
      else if (word === 'al' || word === 'a la') ok = upper; // «al Mercadona» sí, «al médico» se queda en el título
      else ok = upper || PLACE_START.test(seg);
      if (!ok) continue;
      best = { a: markA, p, q, word };
    }
    if (!best) return '';
    let loc = S.orig.slice(best.p, best.q).trim().replace(/[.,;:!?]+$/, '');
    if (best.word === 'a casa de') loc = S.orig.slice(best.a, best.q).trim().replace(/^a\s+/i, '');
    consume(S, best.a, best.q);
    return loc;
  }

  const EDGE = new Set(['a', 'al', 'el', 'la', 'las', 'los', 'de', 'del', 'en', 'para', 'por', 'y', 'e', 'o', 'con', 'desde', 'hasta', 'que', 'este', 'esta', 'the', 'at', 'on', 'in', 'to', 'for', 'from', 'by', 'and', 'of', 'les', 'els', 'i', 'per', 'amb', 'un', 'una', 'hoy', '-', '–', '—', ',', '.', ';', ':', '·', 'sobre', 'hacia', 'around', 'every', 'cada']);

  function cleanTitle(S) {
    let s = '';
    for (let i = 0; i < S.orig.length; i++) s += S.used[i] ? ' ' : S.orig[i];
    s = s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:])(?:\s*[,;:])+/g, '$1').trim();
    let words = s.split(' ').filter(Boolean);
    const f = w => U().fold(w).replace(/[,.;:!?]+$/, '');
    while (words.length && EDGE.has(f(words[0]))) words.shift();
    while (words.length && (EDGE.has(f(words[words.length - 1])) || /^[,.;:\-–—·]+$/.test(words[words.length - 1]))) words.pop();
    // palabras de unión sueltas que se quedaron dos veces seguidas («cena con el a Marta»)
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i], n = words[i + 1];
      if (n && EDGE.has(f(w)) && EDGE.has(f(n)) && ['el', 'la', 'a', 'de', 'en', 'the', 'at', 'on'].includes(f(w)) && ['a', 'las', 'el', 'de', 'en', 'at', 'on', 'the'].includes(f(n))) continue;
      out.push(w);
    }
    s = out.join(' ').replace(/^[,.;:\-–—·\s]+|[,;:\-–—·\s]+$/g, '').trim();
    if (s) s = s[0].toUpperCase() + s.slice(1);
    return s;
  }

  ZC.nlp = { parse, _normalize: normalize };
})(typeof window !== 'undefined' ? window : globalThis);
