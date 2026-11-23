'use strict';
// ZenCalendar: días festivos.
//
// between(from, to, country = 'ES', lang = 'es') → [{ date: 'YYYY-MM-DD', name }]
//
// 'ES' son las fiestas nacionales de España (las que son fiesta en todo el
// país), con el Viernes Santo calculado a partir de la Pascua. También hay
// algunas comunidades ('ES-CT', 'ES-IB', 'ES-MD', 'ES-VC', 'ES-AN') que suman
// las suyas a las nacionales. Para añadir otro país: ZC.holidays.register(código, nombre, fn(año) → [[mes, día, clave]]).
(function (root) {
  const ZC = root.ZC = root.ZC || {};

  // Domingo de Pascua (algoritmo anónimo gregoriano, «Meeus/Jones/Butcher»)
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  // [mes (1-12), día] relativo a la Pascua
  function fromEaster(y, days) {
    const d = easter(y);
    d.setDate(d.getDate() + days);
    return [d.getMonth() + 1, d.getDate()];
  }

  // nombres en cada idioma
  const NAMES = {
    newyear: ['Año Nuevo', 'Any Nou', "New Year's Day"],
    epiphany: ['Epifanía del Señor (Reyes)', 'Reis', 'Epiphany'],
    holythu: ['Jueves Santo', 'Dijous Sant', 'Maundy Thursday'],
    goodfri: ['Viernes Santo', 'Divendres Sant', 'Good Friday'],
    eastermon: ['Lunes de Pascua', 'Dilluns de Pasqua', 'Easter Monday'],
    labour: ['Fiesta del Trabajo', 'Festa del Treball', 'Labour Day'],
    assumption: ['Asunción de la Virgen', "L'Assumpció", 'Assumption of Mary'],
    national: ['Fiesta Nacional de España', "Festa Nacional d'Espanya", 'Spanish National Day'],
    allsaints: ['Todos los Santos', 'Tots Sants', "All Saints' Day"],
    constitution: ['Día de la Constitución', 'Dia de la Constitució', 'Constitution Day'],
    immaculate: ['Inmaculada Concepción', 'La Immaculada', 'Immaculate Conception'],
    christmas: ['Navidad', 'Nadal', 'Christmas Day'],
    stephen: ['San Esteban', 'Sant Esteve', "St Stephen's Day"],
    santjoan: ['San Juan', 'Sant Joan', "St John's Day"],
    diada: ['Diada Nacional de Cataluña', 'Diada Nacional de Catalunya', 'National Day of Catalonia'],
    balears: ['Día de las Illes Balears', 'Diada de les Illes Balears', 'Balearic Islands Day'],
    madrid: ['Fiesta de la Comunidad de Madrid', 'Festa de la Comunitat de Madrid', 'Community of Madrid Day'],
    valencia: ['Día de la Comunitat Valenciana', 'Dia de la Comunitat Valenciana', 'Valencian Community Day'],
    josep: ['San José', 'Sant Josep', "St Joseph's Day"],
    andalucia: ['Día de Andalucía', "Dia d'Andalusia", 'Andalusia Day'],
  };
  const LANGS = { es: 0, ca: 1, en: 2 };

  // fiestas nacionales de España
  function spain(y) {
    return [
      [1, 1, 'newyear'], [1, 6, 'epiphany'], [...fromEaster(y, -2), 'goodfri'], [5, 1, 'labour'],
      [8, 15, 'assumption'], [10, 12, 'national'], [11, 1, 'allsaints'], [12, 6, 'constitution'],
      [12, 8, 'immaculate'], [12, 25, 'christmas'],
    ];
  }

  const COUNTRIES = {
    ES: { name: 'España', fn: spain },
    'ES-CT': { name: 'España · Cataluña', fn: y => spain(y).concat([[...fromEaster(y, 1), 'eastermon'], [6, 24, 'santjoan'], [9, 11, 'diada'], [12, 26, 'stephen']]) },
    'ES-IB': { name: 'España · Illes Balears', fn: y => spain(y).concat([[3, 1, 'balears'], [...fromEaster(y, -3), 'holythu'], [...fromEaster(y, 1), 'eastermon'], [12, 26, 'stephen']]) },
    'ES-MD': { name: 'España · Madrid', fn: y => spain(y).concat([[...fromEaster(y, -3), 'holythu'], [5, 2, 'madrid']]) },
    'ES-VC': { name: 'España · Comunitat Valenciana', fn: y => spain(y).concat([[3, 19, 'josep'], [...fromEaster(y, 1), 'eastermon'], [6, 24, 'santjoan'], [10, 9, 'valencia']]) },
    'ES-AN': { name: 'España · Andalucía', fn: y => spain(y).concat([[2, 28, 'andalucia'], [...fromEaster(y, -3), 'holythu']]) },
  };

  const cache = {};
  function ofYear(y, country, lang) {
    const k = country + ':' + y + ':' + lang;
    if (cache[k]) return cache[k];
    const c = COUNTRIES[country];
    if (!c) return [];
    const li = LANGS[lang] != null ? LANGS[lang] : 0;
    const pad = n => String(n).padStart(2, '0');
    const seen = new Set();
    const out = [];
    for (const [m, d, key] of c.fn(y)) {
      const date = y + '-' + pad(m) + '-' + pad(d);
      if (seen.has(date)) continue;
      seen.add(date);
      out.push({ date, name: NAMES[key] ? NAMES[key][li] : key, key });
    }
    out.sort((a, b) => a.date < b.date ? -1 : 1);
    return (cache[k] = out);
  }

  function between(from, to, country, lang) {
    country = country || 'ES';
    if (country === 'none') return [];
    const U = ZC.util;
    const f = U.parse(from), t = U.parse(to);
    if (!f || !t) return [];
    const a = U.ymd(f);
    const out = [];
    for (let y = f.getFullYear(); y <= t.getFullYear(); y++) {
      for (const h of ofYear(y, country, String(lang || 'es').slice(0, 2))) {
        // [from, to), como occurrences: un día entra si empieza antes de `to`
        if (h.date >= a && U.parse(h.date) < t) out.push({ date: h.date, name: h.name });
      }
    }
    return out;
  }

  function register(code, name, fn) { COUNTRIES[code] = { name, fn }; for (const k in cache) if (k.startsWith(code + ':')) delete cache[k]; }
  const countries = () => Object.keys(COUNTRIES).map(id => ({ id, name: COUNTRIES[id].name }));

  ZC.holidays = { between, easter, register, countries, NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
