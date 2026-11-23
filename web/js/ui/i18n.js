'use strict';
// ZenCalendar · idiomas de la interfaz. La clave es el propio texto en español:
// t('Hoy') → 'Today' en inglés. Si falta una traducción se queda en español.
// Variables con {nombre}: t('Hace {n} min', { n: 5 }).
(function () {
  const ZC = window.ZC = window.ZC || {};
  const DICT = { en: {}, ca: {} };   // se rellenan en i18n-dict.js
  let lang = 'es';

  function sysLang() {
    const l = (navigator.languages && navigator.languages[0]) || navigator.language || 'es';
    if (/^ca\b/i.test(l)) return 'ca';
    if (/^es\b/i.test(l) || /^(gl|eu)\b/i.test(l)) return 'es';
    return /^en\b/i.test(l) ? 'en' : 'es';
  }
  function setLang(l) {
    lang = !l || l === 'auto' ? sysLang() : (['es', 'en', 'ca'].includes(l) ? l : 'es');
    document.documentElement.lang = lang;
    return lang;
  }
  function t(key, vars) {
    let s = (lang !== 'es' && DICT[lang] && DICT[lang][key]) || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return s;
  }
  // plural sencillo: tn(n, '{n} evento', '{n} eventos')
  const tn = (n, one, many) => t(n === 1 ? one : many, { n });
  const locale = () => ({ es: 'es-ES', en: 'en-GB', ca: 'ca-ES' }[lang] || 'es-ES');

  // ---------- fechas y horas ----------
  const cache = new Map();
  const fmt = (opts) => { const k = lang + JSON.stringify(opts); if (!cache.has(k)) cache.set(k, new Intl.DateTimeFormat(locale(), opts)); return cache.get(k); };
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const D = {
    month: (d, style = 'long') => cap(fmt({ month: style }).format(d)),
    monthYear: d => cap(fmt({ month: 'long', year: 'numeric' }).format(d)).replace(' de ', ' '),
    wd: (d, style = 'short') => cap(fmt({ weekday: style }).format(d).replace('.', '')),
    wdLetter: d => cap(fmt({ weekday: 'narrow' }).format(d)),
    day: (d, opts) => cap(fmt(opts || { weekday: 'long', day: 'numeric', month: 'long' }).format(d)),
    short: d => cap(fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d)).replace(/\./g, ''),
    dm: d => fmt({ day: 'numeric', month: 'short' }).format(d).replace(/\./g, ''),
    full: d => cap(fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)),
    time(d, h12) {
      if (h12 === undefined) h12 = ZC.ui && ZC.ui.prefsCal ? ZC.ui.prefsCal().timeFormat === '12' : false;
      const h = d.getHours(), m = d.getMinutes();
      if (!h12) return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      const hh = h % 12 || 12;
      return hh + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? ' am' : ' pm');
    },
    hourLabel(h, h12) {
      if (h12 === undefined) h12 = ZC.ui && ZC.ui.prefsCal ? ZC.ui.prefsCal().timeFormat === '12' : false;
      if (!h12) return String(h).padStart(2, '0') + ':00';
      return (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
    },
    rel(ms) {   // «hace 3 min»
      const s = Math.round((Date.now() - ms) / 1000);
      if (s < 45) return t('ahora mismo');
      if (s < 3600) return t('hace {n} min', { n: Math.round(s / 60) });
      if (s < 86400) return t('hace {n} h', { n: Math.round(s / 3600) });
      return t('hace {n} días', { n: Math.round(s / 86400) });
    },
  };

  ZC.i18n = { DICT, t, tn, setLang, lang: () => lang, sysLang, locale, D, cap };
  ZC.t = t;
})();
