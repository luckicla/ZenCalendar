'use strict';
// Entiende frases sueltas («cena con Marta el viernes a las 9») y las convierte en un evento.
// Es una versión pequeña, solo para la demo de la web: sin internet y al instante, como el «añadir rápido» de la app.
// ZCW.nlp.parse(texto, { now }) → { kind, title, start: Date, end: Date, allDay, location, reminders, rrule, calendar, guessed } | null
window.ZCW = window.ZCW || {};
window.ZCW.nlp = (() => {
  const DAYS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const MONTHS = { enero: 0, ene: 0, febrero: 1, feb: 1, marzo: 2, mar: 2, abril: 3, abr: 3, mayo: 4, may: 4, junio: 5, jun: 5,
    julio: 6, jul: 6, agosto: 7, ago: 7, septiembre: 8, setiembre: 8, sept: 8, sep: 8, octubre: 9, oct: 9, noviembre: 10, nov: 10,
    diciembre: 11, dic: 11, january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9,
    november: 10, december: 11, dec: 11 };
  const NUMS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
    once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, media: 0.5, a: 1, an: 1, one: 1, two: 2, three: 3 };
  const DAY_RE = '(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
  const MONTH_RE = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|january|february|march|april|june|july|august|september|october|november|december|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic|dec)';
  const NIGHTY = /\b(cena|cenar|cenamos|copas|fiesta|concierto|cine|pelicula|teatro|noche|partido|bar|tapas|discoteca|sopar|dinner|drinks|party|concert)\b/;
  const WORK = /\b(reunion|trabajo|cliente|oficina|entrega|proyecto|presentacion|equipo|jefe|meeting|call|llamada con)\b/;
  const BDAY = /\b(cumple|cumpleanos|aniversario|birthday)\b/;

  // quita acentos pero mantiene la longitud, para poder recortar por posición en el texto original
  const fold = s => s.toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n');
  const dayNum = w => DAYS[w] ?? DAYS[w.replace(/s$/, '')];
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
  const num = w => (w == null ? null : /^\d+$/.test(w) ? +w : NUMS[w] ?? null);

  function parse(text, { now = new Date() } = {}) {
    if (!text || !text.trim()) return null;
    let orig = ' ' + text.trim().replace(/\s+/g, ' ') + ' ';
    let low = fold(orig);
    // recorta lo que ya se ha entendido (en las dos copias) y devuelve lo encontrado
    const take = re => {
      const m = re.exec(low);
      if (!m) return null;
      const blank = ' '.repeat(m[0].length);
      low = low.slice(0, m.index) + blank + low.slice(m.index + m[0].length);
      orig = orig.slice(0, m.index) + blank + orig.slice(m.index + m[0].length);
      return m;
    };

    const out = { kind: 'event', title: '', start: null, end: null, allDay: false, location: '', reminders: [], rrule: null, calendar: 'personal', guessed: false };
    const today = startOfDay(now);
    let date = null, endDate = null, hh = null, mm = 0, eh = null, em = 0, period = null, offsetMin = null, h24 = false;

    // tareas
    let m = take(/^\s*(recuerdame(?: que)?|recordarme|recordar|tarea:?|pendiente:?|remind me to|todo:)\s+/);
    if (m) out.kind = 'task';

    // avisos: «avísame 30 min antes»
    if ((m = take(/\b(?:avisame|recuerdamelo|aviso)\s+(\d+|una?|media)\s*(min(?:utos?)?|h(?:oras?)?|dias?)\s+antes\b/))) {
      const n = num(m[1]) ?? 1, u = m[2][0];
      out.reminders = [Math.round(n * (u === 'h' ? 60 : u === 'd' ? 1440 : 1))];
    }

    // repeticiones
    if ((m = take(new RegExp(`\\b(?:cada|todos los|todas las|los|every)\\s+${DAY_RE}(?:\\s*(?:,|y|and)\\s*${DAY_RE})?\\b`)))) {
      const ds = [m[1], m[2]].filter(Boolean).map(dayNum);
      out.rrule = { freq: 'weekly', interval: 1, byDay: ds.map(d => BYDAY[d]) };
      const diff = Math.min(...ds.map(d => (d - now.getDay() + 7) % 7));
      date = addDays(today, diff);
    } else if (take(/\b(?:cada dia|todos los dias|a diario|diariamente|every day|daily)\b/)) out.rrule = { freq: 'daily', interval: 1 };
    else if (take(/\b(?:cada semana|todas las semanas|semanalmente|every week|weekly)\b/)) out.rrule = { freq: 'weekly', interval: 1 };
    else if ((m = take(/\b(?:cada (\d+|dos|tres) semanas)\b/))) out.rrule = { freq: 'weekly', interval: num(m[1]) || 2 };
    else if (take(/\b(?:cada mes|todos los meses|mensualmente|every month|monthly)\b/)) out.rrule = { freq: 'monthly', interval: 1, monthMode: 'day' };
    else if (take(/\b(?:cada ano|todos los anos|anualmente|every year|yearly)\b/)) out.rrule = { freq: 'yearly', interval: 1 };

    // rango de días: «del 3 al 7 de diciembre»
    if ((m = take(new RegExp(`\\bdel?\\s+(\\d{1,2})\\s+al?\\s+(\\d{1,2})\\s+(?:de\\s+)?${MONTH_RE}\\b(?:\\s+(?:de\\s+)?(\\d{4}))?`)))) {
      const mo = MONTHS[m[3]];
      let y = m[4] ? +m[4] : now.getFullYear();
      if (!m[4] && new Date(y, mo, +m[2]) < today) y++;
      date = new Date(y, mo, +m[1]); endDate = new Date(y, mo, +m[2]);
    }

    // dentro de un rato: «en 2 horas», «dentro de 3 días»
    if ((m = take(/\b(?:en|dentro de|in)\s+(\d+|una?|dos|tres|cuatro|cinco|media|an?|one|two|three)\s+(minutos?|mins?|horas?|h|dias?|semanas?|minutes?|hours?|days?|weeks?)\b/))) {
      const n = num(m[1]) ?? 1, u = m[2];
      if (/^m/.test(u)) offsetMin = n;
      else if (/^h/.test(u)) offsetMin = n * 60;
      else if (/^(d)/.test(u)) date = addDays(today, n);
      else date = addDays(today, 7 * n);
      if (m[1] === 'media' && /^h/.test(u)) offsetMin = 30;
    }

    // momentos del día (antes que «mañana» como día)
    if (take(/\b(?:de|por) la manana\b|\bde madrugada\b|\bin the morning\b/)) period = 'am';
    if (take(/\b(?:de|por) la tarde\b|\besta tarde\b|\bin the afternoon\b/)) { period = 'pm'; }
    if ((m = take(/\b(?:de|por) la noche\b|\besta noche\b|\btonight\b|\bin the evening\b/))) { period = 'night'; if (/esta|tonight/.test(m[0]) && !date) date = today; }
    if (/esta tarde/.test(text.toLowerCase()) && !date) date = today;
    if (take(/\b(?:a|al|at)?\s*(?:mediodia|noon)\b/)) { hh = 12; mm = 0; }
    if (take(/\b(?:a )?(?:medianoche|midnight)\b/)) { hh = 0; mm = 0; period = 'am'; }

    // horas: rango «de 5 a 7», «9:00-10:30»
    if ((m = take(/\b(?:de|desde las?|entre las?|from)\s+(\d{1,2})(?:[:.h](\d{2}))?\s*(?:a|hasta las?|y las?|-|to)\s*(?:las?\s+)?(\d{1,2})(?:[:.h](\d{2}))?\s*(?:h\b)?/)) ||
        (m = take(/\b(\d{1,2})[:.h](\d{2})\s*-\s*(\d{1,2})[:.h](\d{2})\b/))) {
      hh = +m[1]; mm = +(m[2] || 0); eh = +m[3]; em = +(m[4] || 0);
      h24 = /^0\d/.test(m[1]);
    } else if ((m = take(/\b(?:a\s+las?|a\s+la|sobre\s+las?|hacia\s+las?|at)\s+(\d{1,2})(?:[:.h](\d{2}))?(?:\s+(y media|y cuarto|menos cuarto))?(?:\s*(am|pm|h)\b)?/)) ||
               (m = take(/\b(\d{1,2})[:h](\d{2})(?:\s*(am|pm))?\b/)) ||
               (m = take(/\b(\d{1,2})\s*(am|pm|h)\b/))) {
      hh = +m[1];
      // «07:30» o «7h»: hora de 24 h, no se pasa a la tarde
      h24 = /^0\d/.test(m[1]) || /\dh\b|\s+h\b/.test(m[0]);
      const second = m[2];
      if (second && /^\d+$/.test(second)) mm = +second;
      const extra = [m[2], m[3], m[4]].filter(x => x && !/^\d+$/.test(x)).join(' ');
      if (/y media/.test(extra)) mm = 30;
      if (/y cuarto/.test(extra)) mm = 15;
      if (/menos cuarto/.test(extra)) { hh -= 1; mm = 45; }
      if (/pm/.test(extra) && hh < 12) hh += 12;
      if (/am/.test(extra)) { if (hh === 12) hh = 0; period = 'am'; }
      if (/h/.test(extra) || (second && /^\d+$/.test(second))) period = period || (hh > 12 ? 'pm' : period);
    }

    // días: pasado mañana, mañana, hoy
    if (take(/\bpasado manana\b|\bthe day after tomorrow\b/)) date = addDays(today, 2);
    else if (take(/\bmanana\b|\btomorrow\b/)) date = addDays(today, 1);
    else if (take(/\bhoy\b|\btoday\b/)) date = today;

    // fecha con mes: «25 de diciembre», «25 dic», «el 3 de marzo de 2027»
    if (!date && (m = take(new RegExp(`\\b(?:el\\s+)?(?:dia\\s+)?(\\d{1,2})\\s+(?:de\\s+)?${MONTH_RE}\\.?\\b(?:\\s+(?:de\\s+)?(\\d{4}))?`)))) {
      const mo = MONTHS[m[2]];
      let y = m[3] ? +m[3] : now.getFullYear();
      if (!m[3] && new Date(y, mo, +m[1]) < today) y++;
      date = new Date(y, mo, +m[1]);
    }
    // fecha con números: «3/12», «03-12-2026»
    if (!date && (m = take(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/))) {
      const d = +m[1], mo = +m[2] - 1;
      if (mo >= 0 && mo < 12 && d >= 1 && d <= 31) {
        let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
        if (!m[3] && new Date(y, mo, d) < today) y++;
        date = new Date(y, mo, d);
      }
    }
    // día de la semana: «el viernes», «el próximo lunes», «este sábado»
    if (!date && (m = take(new RegExp(`\\b(?:(el|este|esta|el proximo|proximo|next|on|this)\\s+)?${DAY_RE}(\\s+que viene)?\\b`)))) {
      const target = dayNum(m[2]);
      let diff = (target - now.getDay() + 7) % 7;
      if (diff === 0 && !/este|esta|this/.test(m[1] || '')) diff = 7;
      if (diff < 7 && /proximo|next/.test(m[1] || '') && diff <= 1) diff += 7;
      date = addDays(today, diff);
    }
    // «el 25», «el día 3»
    if (!date && (m = take(/\bel\s+(?:dia\s+)?(\d{1,2})\b/))) {
      const d = +m[1];
      if (d >= 1 && d <= 31) {
        date = new Date(now.getFullYear(), now.getMonth(), d);
        if (date < today) date = new Date(now.getFullYear(), now.getMonth() + 1, d);
      }
    }

    // lugar: «en Casa Pepe», «en el Retiro», «en casa»
    if ((m = /\s(?:en|at)\s+((?:el|la|los|las|casa de|the)\s+)?([A-ZÁÉÍÓÚÑ][\wáéíóúñü'’.]*(?:\s+(?:de|del|la|el|y|[A-ZÁÉÍÓÚÑ0-9][\wáéíóúñü'’.]*))*)/.exec(orig))) {
      let place = ((m[1] || '') + m[2]).trim().replace(/\s+(de|del|la|el|y)$/i, '');
      out.location = place.charAt(0).toUpperCase() + place.slice(1);
      orig = orig.slice(0, m.index) + ' '.repeat(m[0].length) + orig.slice(m.index + m[0].length);
      low = fold(orig);
    } else if (take(/\ben casa\b/)) out.location = 'Casa';

    // título: lo que queda, sin muletillas
    let title = orig.replace(/\s+/g, ' ').trim()
      .replace(/^(?:(?:tengo|tenemos|hay|apunta|apuntame|anota|anade|añade|pon|ponme|crea|add)\s+(?:que\s+)?)+/i, '')
      .replace(/^(?:el|la|a las|a la|a|de|y|para|que|,|-)\s+/i, '')
      .replace(/(?:\s+(?:el|la|a las|a la|a|de|del|y|para|que|con|en|,|-))+$/i, '')
      .replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, '');
    if (!title) title = out.kind === 'task' ? 'Tarea' : 'Evento';
    out.title = title.charAt(0).toUpperCase() + title.slice(1);

    const fl = fold(text);
    if (WORK.test(fl)) out.calendar = 'work';
    if (BDAY.test(fl)) { out.calendar = 'birthdays'; if (!out.rrule && hh == null) out.rrule = { freq: 'yearly', interval: 1 }; }

    // de la hora suelta a la hora de verdad: «a las 5» casi siempre es por la tarde, y una cena a las 9 es a las 21
    if (hh != null) {
      if (period === 'pm' && hh < 12) hh += 12;
      else if (period === 'night') { if (hh === 12) hh = 0; else if (hh >= 5 && hh < 12) hh += 12; }
      else if (period == null && !h24 && hh >= 1 && hh <= 7) hh += 12;
      else if (period == null && !h24 && hh >= 8 && hh <= 11 && NIGHTY.test(fl)) hh += 12;
      // final del rango: «de 5 a 7» → 17–19; «de 10 a 2» de fiesta → 22:00–02:00 (del día siguiente)
      if (eh != null && eh * 60 + em <= hh * 60 + mm && eh < 12 && (eh + 12) * 60 + em > hh * 60 + mm) eh += 12;
    } else if (period && !endDate) {
      hh = period === 'am' ? 9 : period === 'pm' ? 17 : 21;
    }

    if (offsetMin != null) {
      const s = new Date(now.getTime() + offsetMin * 60000);
      s.setSeconds(0, 0);
      s.setMinutes(Math.ceil(s.getMinutes() / 5) * 5);
      out.start = s;
    } else {
      if (!date) {
        if (out.rrule && out.rrule.freq === 'weekly' && !out.rrule.byDay) date = today;
        else if (hh != null) {
          date = today;
          const t = new Date(today); t.setHours(hh, mm);
          if (t < now) date = addDays(today, 1);
        } else { date = today; out.guessed = !out.rrule && out.kind !== 'task'; }
      }
      out.start = new Date(date);
      if (hh != null) out.start.setHours(Math.min(hh, 23), Math.min(mm, 59), 0, 0);
      else out.allDay = true;
    }

    if (out.allDay) {
      out.end = endDate ? new Date(endDate) : new Date(out.start);
    } else if (eh != null) {
      out.end = new Date(out.start); out.end.setHours(eh, em, 0, 0);
      if (out.end <= out.start) out.end = addDays(out.end, 1);
    } else {
      const mins = out.kind === 'task' ? 0 : /\b(cena|comida|cine|concierto|teatro)\b/.test(fl) ? 120 : 60;
      out.end = new Date(out.start.getTime() + mins * 60000);
    }
    if (out.rrule && out.rrule.freq === 'weekly' && !out.rrule.byDay) out.rrule.byDay = [BYDAY[out.start.getDay()]];
    return out;
  }

  return { parse };
})();
