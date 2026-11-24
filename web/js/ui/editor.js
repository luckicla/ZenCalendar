'use strict';
// ZenCalendar · editor de eventos y tareas (título con emoji, todo el día, fechas, repetición,
// calendario y color, avisos, lugar, notas, lista, imágenes) y la vista de detalle.
(function () {
  const ZC = window.ZC, UI = ZC.ui, C = UI.cal, t = (...a) => ZC.t(...a);
  const { ymd, sod, addDays, sameDay, esc, parse, toLocal } = C;
  const EMOJIS = '🎂 🎉 🎁 ❤️ 💼 📚 ✏️ 🏋️ 🧘 🏃 🚴 ⚽ 🎾 🏊 🍽️ ☕ 🍕 🍷 🛒 💊 🩺 🦷 💇 🐶 🐱 🌱 🏠 🧹 🧺 🚗 ✈️ 🚆 🏖️ ⛰️ 🎬 🎵 🎮 📞 💻 📝 📅 ⏰ 💡 ⭐ 🌙 ☀️ 🌸 🍀 🎓 👶 💍 🙏'.split(' ');
  const EV_COLORS = ['#B9A2FF', '#FF9CCB', '#7CC8F2', '#7ED6C3', '#FFB38A', '#F2C14E', '#C38BEB', '#FF8A8A', '#86B862', '#9AA0B5'];
  const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const lang = () => ZC.i18n.lang();
  const describe = (r, start) => { try { return ZC.recur.describe(r, lang(), start ? parse(start) : undefined); } catch { return ''; } };

  // ---------- repetición ----------
  function repeatPresets(start) {
    const d = parse(start), wd = WD[d.getDay()], nth = Math.ceil(d.getDate() / 7);
    const wdName = ZC.i18n.D.wd(d, 'long').toLowerCase();
    const nthName = [t('primer'), t('segundo'), t('tercer'), t('cuarto'), t('último')][Math.min(nth, 5) - 1];
    return [
      ['none', t('No se repite'), null],
      ['daily', t('Cada día'), { freq: 'daily', interval: 1 }],
      ['weekdays', t('Días laborables (lunes a viernes)'), { freq: 'weekly', interval: 1, byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] }],
      ['weekly', t('Cada semana, el {x}', { x: wdName }), { freq: 'weekly', interval: 1, byDay: [wd] }],
      ['biweekly', t('Cada 2 semanas, el {x}', { x: wdName }), { freq: 'weekly', interval: 2, byDay: [wd] }],
      ['monthly', t('Cada mes, el día {n}', { n: d.getDate() }), { freq: 'monthly', interval: 1, monthMode: 'day' }],
      ['monthlyWd', t('Cada mes, el {n} {x}', { n: nthName, x: wdName }), { freq: 'monthly', interval: 1, monthMode: 'weekday' }],
      ['yearly', t('Cada año, el {x}', { x: ZC.i18n.D.dm(d) }), { freq: 'yearly', interval: 1 }],
      ['custom', t('Personalizado…'), 'custom'],
    ];
  }
  function presetOf(r, start) {
    if (!r) return 'none';
    for (const [id, , p] of repeatPresets(start)) {
      if (!p || p === 'custom') continue;
      if (p.freq === r.freq && (p.interval || 1) === (r.interval || 1) && JSON.stringify(p.byDay || null) === JSON.stringify(r.freq === 'weekly' ? (r.byDay || null) : null) && (r.freq !== 'monthly' || (p.monthMode || 'day') === (r.monthMode || 'day')) && !r.until && !r.count) return id;
    }
    return 'custom';
  }

  // ---------- borrador ----------
  function draftFrom(o) {
    const cal = C.prefsCal(), cals = ZC.store.calendars();
    const defCal = (cals.find(c => c.visible !== false) || cals[0] || { id: 'personal' }).id;
    if (o.ev) {
      const ev = JSON.parse(JSON.stringify(o.ev));
      if (o.occ && ev.rrule) { ev.start = toLocal(o.occ.start, ev.allDay); ev.end = toLocal(ev.allDay ? C.lastDay(o.occ) : o.occ.end, ev.allDay); }
      ev.alarm = !!ev.alarm; ev.reminders = ev.reminders || []; ev.checklist = ev.checklist || []; ev.attachments = ev.attachments || []; ev.exdates = ev.exdates || [];
      return ev;
    }
    const kind = o.kind || 'event';
    let s, e, allDay = !!o.allDay;
    if (o.start) { s = new Date(o.start); e = o.end ? new Date(o.end) : C.addDays(s, 0); if (!o.end) e = new Date(s.getTime() + (cal.defaultDuration || 60) * 60000); }
    else {
      const base = o.date ? sod(o.date) : C.today(), now = new Date();
      s = new Date(base);
      if (sameDay(base, now)) { s.setHours(now.getHours() + 1, 0, 0, 0); if (s.getDate() !== base.getDate()) s.setHours(23, 0); }
      else s.setHours(9, 0, 0, 0);
      e = new Date(s.getTime() + (cal.defaultDuration || 60) * 60000);
    }
    const ev = { kind, title: '', notes: '', location: '', calendarId: o.calendarId || defCal, color: null, emoji: null, allDay,
      start: toLocal(s, allDay), end: toLocal(allDay ? s : e, allDay), rrule: null, exdates: [], reminders: [...(cal.defaultReminders || [])], alarm: false, attachments: [], checklist: [], done: false, ...(o.prefill || {}) };
    ev.alarm = !!ev.alarm;
    if (kind === 'task') { ev.end = ev.start; ev.reminders = ev.reminders.length ? ev.reminders : [0]; }
    return ev;
  }

  // ---------- editor ----------
  function open(o = {}) {
    const isNew = !o.ev;
    const D = draftFrom(o);
    const orig = o.ev ? JSON.parse(JSON.stringify(o.ev)) : null;
    const addedBlobs = [], removedBlobs = [];
    let alarmSuggested = !!o.alarmSuggested && !D.alarm;
    let nlpHint = null, nlpDismissed = false, datesTouched = !!(o.start || o.ev);
    let customOpen = false; // «Personalizado…» elegido a mano: se ve el panel aunque la regla coincida con un preset
    const L = UI.openLayer({ kind: 'modal', cls: 'ed-layer', panelCls: 'ed-panel', from: o.from, label: isNew ? t('Nuevo evento') : t('Editar'), html: '', dismissable: true, onClose: why => { if (why !== 'saved') cleanup(); } });
    const fab = document.getElementById('fab'); if (fab) fab.classList.add('open');
    const body = L.body;
    body.classList.add('ed');
    function cleanup() { if (fab) fab.classList.remove('open'); addedBlobs.forEach(id => ZC.store.deleteBlob(id).catch(() => {})); }

    function paint() {
      const task = D.kind === 'task';
      const cals = ZC.store.calendars();
      const cal = ZC.store.calendar(D.calendarId) || cals[0] || {};
      const color = D.color || cal.color || '#B9A2FF';
      const s = parse(D.start), e = parse(D.end || D.start);
      const preset = customOpen && D.rrule ? 'custom' : presetOf(D.rrule, D.start);
      body.style.setProperty('--c', color);
      body.innerHTML = `
        <div class="sheet-head ed-head">
          <div class="seg ed-kind" role="tablist"><button type="button" data-kind="event" class="${task ? '' : 'on'}">${UI.icon('calendar', 16)}${t('Evento')}</button><button type="button" data-kind="task" class="${task ? 'on' : ''}">${UI.icon('tasks', 16)}${t('Tarea')}</button></div>
          <span style="flex:1"></span>
          <button type="button" class="ibtn" data-act="close" aria-label="${t('Cerrar')}">${UI.icon('x', 20)}</button>
        </div>
        <div class="layer-scroll ed-body">
          <div class="ed-title">
            <button type="button" class="ed-emoji ${D.emoji ? 'has' : ''}" data-act="emoji" aria-label="${t('Elegir emoji')}">${D.emoji ? esc(D.emoji) : UI.icon('smile', 22)}</button>
            <textarea class="ed-tin" name="title" rows="1" placeholder="${esc(task ? t('¿Qué tienes que hacer?') : t('Título (prueba: «cena con Marta el viernes a las 9»)'))}" autocomplete="off" ${isNew ? 'autofocus' : ''}>${esc(D.title)}</textarea>
          </div>
          <div class="ed-nlp" hidden></div>
          <div class="ed-sec">
            <div class="ed-row"><span class="ed-ic">${UI.icon('clock', 20)}</span><label class="ed-sw"><span>${t('Todo el día')}</span><button type="button" class="sw" role="switch" aria-checked="${!!D.allDay}" data-act="allday" aria-label="${t('Todo el día')}"></button></label></div>
            <div class="ed-dates ${task ? 'task' : ''}">
              <div class="ed-dt"><span class="lbl">${task ? t('Cuándo') : t('Empieza')}</span><input class="in" type="date" name="sd" value="${ymd(s)}" required>${D.allDay ? '' : `<input class="in" type="time" name="st" value="${C.pad(s.getHours())}:${C.pad(s.getMinutes())}" step="300">`}</div>
              ${task ? '' : `<div class="ed-dt"><span class="lbl">${t('Termina')}</span><input class="in" type="date" name="ed" value="${ymd(e)}" required>${D.allDay ? '' : `<input class="in" type="time" name="et" value="${C.pad(e.getHours())}:${C.pad(e.getMinutes())}" step="300">`}</div>`}
              <div class="ed-dur mut">${durHint()}</div>
            </div>
            <div class="ed-row"><span class="ed-ic">${UI.icon('repeat', 20)}</span><select class="in" name="repeat" aria-label="${t('Repetición')}">${repeatPresets(D.start).map(([id, label]) => `<option value="${id}" ${id === preset ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
            <div class="ed-custom" ${preset === 'custom' ? '' : 'hidden'}>${customHTML()}</div>
          </div>
          <div class="ed-sec">
            <div class="ed-row top"><span class="ed-ic">${UI.icon('calendar', 20)}</span><div class="ed-cals">${cals.map(c => `<button type="button" class="chip cal-chip ${c.id === D.calendarId ? 'on' : ''}" data-cal="${esc(c.id)}" style="--cc:${esc(c.color)}"><i class="dot" style="background:${esc(c.color)}"></i>${esc(c.name)}</button>`).join('')}</div></div>
            <div class="ed-row"><span class="ed-ic">${UI.icon('palette', 20)}</span><div class="ed-colors"><button type="button" class="cdot sm ${!D.color ? 'on' : ''}" data-color="" style="--c:${esc(cal.color || '#B9A2FF')}" title="${t('Color del calendario')}"><span>A</span></button>${EV_COLORS.map(c => `<button type="button" class="cdot sm ${D.color && D.color.toLowerCase() === c.toLowerCase() ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div></div>
            <div class="ed-row top"><span class="ed-ic">${UI.icon('bell', 20)}</span><div class="ed-rems">${D.reminders.slice().sort((a, b) => a - b).map(m => `<span class="chip">${esc(remLabel(m))}<button type="button" class="x" data-rem="${m}" aria-label="${t('Quitar aviso')}">${UI.icon('x', 14)}</button></span>`).join('')}<button type="button" class="chip add" data-act="addrem">${UI.icon('plus', 15)}${t('Aviso')}</button></div></div>
            <div class="ed-row top ed-alarm ${D.alarm ? 'on' : ''}"><span class="ed-ic">${UI.icon('alarm', 20)}</span><div class="ed-al">
              <label class="ed-sw"><span>${t('Alarma')}</span><button type="button" class="sw" role="switch" aria-checked="${!!D.alarm}" data-act="alarm" aria-label="${t('Alarma')}"></button></label>
              <small class="mut">${D.allDay ? t('Suena como un despertador a la hora que elijas, aunque el móvil esté en silencio.') : t('Suena como un despertador a la hora del evento, aunque el móvil esté en silencio.')}</small>
              ${D.alarm && D.allDay ? `<label class="ed-al-t"><span>${t('Suena a las')}</span><input class="in sm" type="time" name="alarmTime" value="${esc(/^\d{1,2}:\d{2}$/.test(D.alarmTime || '') ? D.alarmTime : '09:00')}" step="300"></label>` : ''}
              ${alarmTip()}
            </div></div>
          </div>
          <div class="ed-sec">
            <div class="ed-row"><span class="ed-ic">${UI.icon('pin', 20)}</span><div class="ed-loc"><input class="in" name="location" value="${esc(D.location || '')}" placeholder="${esc(t('Lugar'))}" autocomplete="off"><button type="button" class="ibtn" data-act="maps" ${D.location ? '' : 'hidden'} aria-label="${t('Abrir en Google Maps')}" title="${t('Abrir en Google Maps')}">${UI.icon('external', 18)}</button></div></div>
            <div class="ed-row top"><span class="ed-ic">${UI.icon('notes', 20)}</span><textarea class="in" name="notes" rows="3" placeholder="${esc(t('Notas'))}">${esc(D.notes || '')}</textarea></div>
            <div class="ed-row top"><span class="ed-ic">${UI.icon('list', 20)}</span><div class="ed-check">${D.checklist.map(it => `<div class="ck-item ${it.done ? 'done' : ''}" data-ck="${esc(it.id)}"><span class="tick ${it.done ? 'on' : ''}" role="checkbox" aria-checked="${!!it.done}" tabindex="0">${UI.icon('check', 14)}</span><input class="ck-in" value="${esc(it.text)}" aria-label="${t('Elemento de la lista')}"><button type="button" class="ibtn sm" data-ckdel="${esc(it.id)}" aria-label="${t('Quitar')}">${UI.icon('x', 16)}</button></div>`).join('')}<input class="in ck-new" placeholder="${esc(t('Añadir a la lista…'))}" aria-label="${t('Añadir a la lista')}"></div></div>
            <div class="ed-row top"><span class="ed-ic">${UI.icon('image', 20)}</span><div class="ed-imgs"><div class="thumbs"></div><div class="img-btns"><button type="button" class="chip add" data-act="addimg">${UI.icon('plus', 15)}${t('Imagen')}</button><button type="button" class="chip add" data-act="camera">${UI.icon('camera', 15)}${t('Cámara')}</button></div></div></div>
          </div>
        </div>
        <div class="ed-foot">
          ${isNew ? '' : `<button type="button" class="ibtn" data-act="delete" aria-label="${t('Borrar')}" title="${t('Borrar')}">${UI.icon('trash', 20)}</button><button type="button" class="ibtn" data-act="dup" aria-label="${t('Duplicar')}" title="${t('Duplicar')}">${UI.icon('copy', 20)}</button>`}
          <span style="flex:1"></span>
          <button type="button" class="btn ghost" data-act="close">${t('Cancelar')}</button>
          <button type="button" class="btn pri" data-act="save">${isNew ? (task ? t('Guardar tarea') : t('Guardar evento')) : t('Guardar cambios')}</button>
        </div>`;
      paintThumbs();
      autosize(body.querySelector('.ed-tin'));
      requestAnimationFrame(() => body.querySelectorAll('.seg').forEach(UI.paintSeg));
      if (nlpHint) showNlp(nlpHint);
    }
    // sugerencia de «añadir rápido» o del título: «¿Le pongo alarma?»
    function alarmTip() {
      if (D.alarm || !alarmSuggested) return '';
      return `<button type="button" class="al-tip" data-act="alarmyes">${UI.icon('alarm', 16)}<span>${t('Parece importante. ¿Le pongo alarma?')}</span><b>${t('Poner alarma')}</b></button>`;
    }
    function remLabel(m) { if (D.allDay) { if (m === 0) return t('El mismo día (9:00)'); } return C.remText(m); }
    function durHint() {
      if (D.kind === 'task') return '';
      const s = parse(D.start), e = parse(D.end || D.start);
      if (D.allDay) { const n = C.daysBetween(s, e) + 1; return n > 1 ? ZC.i18n.tn(n, '{n} día', '{n} días') : ''; }
      const m = Math.round((e - s) / 60000);
      return m > 0 ? C.durText(m) : `<span class="warn">${t('Termina antes de empezar')}</span>`;
    }
    function customHTML() {
      const r = D.rrule || { freq: 'weekly', interval: 1, byDay: [WD[parse(D.start).getDay()]] };
      const s0 = sod(parse(D.start)), days = Array.from({ length: 7 }, (_, i) => addDays(C.sow(s0), i));
      const endMode = r.until ? 'until' : r.count ? 'count' : 'never';
      return `<div class="cu-row"><span>${t('Cada')}</span><input class="in sm" type="number" min="1" max="99" name="cuInt" value="${r.interval || 1}"><select class="in sm" name="cuFreq">${[['daily', t('días')], ['weekly', t('semanas')], ['monthly', t('meses')], ['yearly', t('años')]].map(([v, l]) => `<option value="${v}" ${r.freq === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        ${r.freq === 'weekly' ? `<div class="cu-days">${days.map(d => `<button type="button" class="cu-d ${(r.byDay || []).includes(WD[d.getDay()]) ? 'on' : ''}" data-wd="${WD[d.getDay()]}" aria-label="${esc(ZC.i18n.D.wd(d, 'long'))}">${ZC.i18n.D.wdLetter(d)}</button>`).join('')}</div>` : ''}
        ${r.freq === 'monthly' ? `<div class="seg" data-cu="monthMode"><button type="button" data-v="day" class="${r.monthMode !== 'weekday' ? 'on' : ''}">${t('El día {n}', { n: s0.getDate() })}</button><button type="button" data-v="weekday" class="${r.monthMode === 'weekday' ? 'on' : ''}">${t('El mismo día de la semana')}</button></div>` : ''}
        <div class="cu-row"><span>${t('Termina')}</span><div class="seg" data-cu="end"><button type="button" data-v="never" class="${endMode === 'never' ? 'on' : ''}">${t('Nunca')}</button><button type="button" data-v="until" class="${endMode === 'until' ? 'on' : ''}">${t('El día')}</button><button type="button" data-v="count" class="${endMode === 'count' ? 'on' : ''}">${t('Tras')}</button></div>
          ${endMode === 'until' ? `<input class="in sm" type="date" name="cuUntil" value="${r.until || ymd(addDays(s0, 30))}">` : ''}${endMode === 'count' ? `<input class="in sm" type="number" min="1" max="999" name="cuCount" value="${r.count || 10}"><span>${t('veces')}</span>` : ''}</div>
        <p class="cu-desc">${UI.icon('repeat', 15)}<span>${esc(describe(D.rrule, D.start))}</span></p>`;
    }
    async function paintThumbs() {
      const box = body.querySelector('.thumbs'); if (!box) return;
      box.innerHTML = D.attachments.map((a, i) => `<div class="thumb" data-i="${i}"><img alt="${esc(a.name || '')}"><button type="button" class="ibtn sm" data-imgdel="${i}" aria-label="${t('Quitar imagen')}">${UI.icon('x', 14)}</button></div>`).join('');
      D.attachments.forEach(async (a, i) => { try { const u = await ZC.store.blobURL(a.id); const im = box.querySelector(`[data-i="${i}"] img`); if (im && u) im.src = u; } catch {} });
    }
    function autosize(ta) { if (!ta) return; ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; }

    // lee los campos al borrador
    function read() {
      const f = n => body.querySelector(`[name="${n}"]`);
      const ti = f('title'); if (ti) D.title = ti.value.replace(/\n/g, ' ').trim();
      const loc = f('location'); if (loc) D.location = loc.value.trim();
      const no = f('notes'); if (no) D.notes = no.value;
      const sd = f('sd'), st = f('st'), ed = f('ed'), et = f('et');
      if (sd && sd.value) {
        if (D.allDay) { D.start = sd.value; D.end = D.kind === 'task' ? sd.value : (ed && ed.value ? ed.value : sd.value); if (D.end < D.start) D.end = D.start; }
        else { D.start = sd.value + 'T' + (st && st.value ? st.value : '09:00'); D.end = D.kind === 'task' ? D.start : ((ed && ed.value ? ed.value : sd.value) + 'T' + (et && et.value ? et.value : '10:00')); }
      }
      const at = f('alarmTime'); if (at && at.value) D.alarmTime = at.value;
      body.querySelectorAll('.ck-item').forEach(row => { const it = D.checklist.find(x => x.id === row.dataset.ck); if (it) it.text = row.querySelector('.ck-in').value; });
    }

    // ---------- lenguaje natural en el título ----------
    const nlpRun = (ZC.util && ZC.util.debounce ? ZC.util.debounce : (fn => fn))(() => {
      if (!isNew || nlpDismissed || !ZC.nlp) return;
      const v = (body.querySelector('[name=title]') || {}).value || '';
      let p = null; try { p = v.trim().length > 3 ? ZC.nlp.parse(v, { lang: lang() }) : null; } catch {}
      if (p && (p.start || p.location || p.rrule || (p.reminders && p.reminders.length) || p.kind === 'task' || p.alarm) && (p.confidence == null || p.confidence >= .35)) { nlpHint = p; showNlp(p); }
      else { nlpHint = null; const box = body.querySelector('.ed-nlp'); if (box) box.hidden = true; }
    }, 180);
    function nlpChips(p) {
      const out = [];
      if (p.kind === 'task' && D.kind !== 'task') out.push([UI.icon('tasks', 15), t('Tarea')]);
      if (p.start) { const s = parse(p.start); out.push([UI.icon('calendar', 15), ZC.i18n.D.short(s)]); if (!p.allDay) out.push([UI.icon('clock', 15), C.fmtT(s) + (p.end && p.end !== p.start && p.kind !== 'task' ? ' – ' + C.fmtT(parse(p.end)) : '')]); else out.push([UI.icon('sun', 15), t('Todo el día')]); }
      if (p.location) out.push([UI.icon('pin', 15), esc(p.location)]);
      if (p.rrule) out.push([UI.icon('repeat', 15), esc(describe(p.rrule, p.start))]);
      (p.reminders || []).forEach(m => out.push([UI.icon('bell', 15), esc(C.remText(m))]));
      if (p.alarm) out.push([UI.icon('alarm', 15), t('Alarma')]);
      return out;
    }
    function showNlp(p) {
      const box = body.querySelector('.ed-nlp'); if (!box) return;
      const ch = nlpChips(p);
      if (!ch.length) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = `<span class="lbl">${UI.icon('sparkles', 15)}${t('Entendido')}</span>${ch.map(([ic, tx], i) => `<span class="chip" style="--i:${i}">${ic}${tx}</span>`).join('')}<button type="button" class="btn sm soft" data-act="nlpok">${t('Aplicar')}</button><button type="button" class="ibtn sm" data-act="nlpno" aria-label="${t('Descartar')}">${UI.icon('x', 16)}</button>`;
    }
    function applyNlp(p) {
      read();
      if (p.kind) D.kind = p.kind;
      if (p.title) D.title = p.title;
      if (p.start) { D.allDay = !!p.allDay; D.start = p.start; D.end = D.kind === 'task' ? p.start : (p.end || p.start); }
      if (p.location) D.location = p.location;
      if (p.rrule) D.rrule = p.rrule;
      if (p.reminders && p.reminders.length) D.reminders = [...new Set(p.reminders)];
      if (p.emoji && !D.emoji) D.emoji = p.emoji;
      if (p.calendarId && ZC.store.calendar(p.calendarId)) D.calendarId = p.calendarId;
      if (p.alarm) { D.alarm = true; alarmSuggested = false; } else if (p.alarmSuggested && !D.alarm) alarmSuggested = true;
      nlpHint = null; nlpDismissed = true; datesTouched = true;
      paint();
      UI.haptic('ok');
    }

    // ---------- eventos ----------
    body.addEventListener('input', e => {
      const n = e.target.name;
      if (n === 'title') { autosize(e.target); nlpRun(); }
      if (n === 'location') { const b = body.querySelector('[data-act=maps]'); if (b) b.hidden = !e.target.value.trim(); }
      if (n === 'cuInt' || n === 'cuUntil' || n === 'cuCount') { readCustom(); body.querySelector('.cu-desc span').textContent = describe(D.rrule, D.start); }
    });
    body.addEventListener('change', e => {
      const n = e.target.name;
      if (['sd', 'st', 'ed', 'et'].includes(n)) {
        datesTouched = true;
        const before = { s: parse(D.start), e: parse(D.end || D.start) };
        read();
        // al mover el inicio, el final se mueve con él (misma duración)
        if (n === 'sd' || n === 'st') {
          const ns = parse(D.start), dur = before.e - before.s;
          if (D.kind !== 'task') D.end = toLocal(D.allDay ? addDays(ns, Math.round(dur / 864e5)) : new Date(ns.getTime() + dur), D.allDay);
          if (D.rrule && n === 'sd') { const p = presetOf(D.rrule, toLocal(before.s, D.allDay)); const np = repeatPresets(D.start).find(x => x[0] === p); if (np && np[2] && np[2] !== 'custom') D.rrule = { ...np[2], until: null, count: null }; }
          paint();
        } else body.querySelector('.ed-dur').innerHTML = durHint();
      }
      if (n === 'repeat') {
        read();
        const v = e.target.value, pr = repeatPresets(D.start).find(x => x[0] === v);
        customOpen = v === 'custom';
        if (v === 'custom') { D.rrule = D.rrule || { freq: 'weekly', interval: 1, byDay: [WD[parse(D.start).getDay()]], until: null, count: null }; }
        else D.rrule = pr && pr[2] ? { until: null, count: null, byDay: null, monthMode: 'day', ...pr[2] } : null;
        paint();
      }
      if (n === 'cuFreq') { read(); readCustom(); D.rrule.freq = e.target.value; if (D.rrule.freq === 'weekly' && !(D.rrule.byDay || []).length) D.rrule.byDay = [WD[parse(D.start).getDay()]]; paint(); }
    });
    function readCustom() {
      const f = n => body.querySelector(`[name="${n}"]`);
      D.rrule = D.rrule || { freq: 'weekly', interval: 1 };
      if (f('cuInt')) D.rrule.interval = Math.max(1, Math.min(99, +f('cuInt').value || 1));
      if (f('cuUntil')) D.rrule.until = f('cuUntil').value || null;
      if (f('cuCount')) D.rrule.count = Math.max(1, +f('cuCount').value || 1);
    }
    body.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.name === 'title') { e.preventDefault(); if (nlpHint && !nlpDismissed && !datesTouched) applyNlp(nlpHint); else save(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
      if (e.key === 'Enter' && e.target.classList.contains('ck-new')) {
        e.preventDefault(); const v = e.target.value.trim(); if (!v) return;
        read(); D.checklist.push({ id: (ZC.util && ZC.util.uid ? ZC.util.uid() : Math.random().toString(36).slice(2)), text: v, done: false }); paint();
        setTimeout(() => { const n = body.querySelector('.ck-new'); n && n.focus(); }, 20);
      }
    });
    body.addEventListener('click', async e => {
      const b = e.target.closest('[data-act], [data-kind], [data-cal], [data-color], [data-rem], [data-ckdel], [data-imgdel], .thumb img, .cu-d, [data-cu] button, .ck-item .tick');
      if (!b) return;
      if (b.dataset.kind) { read(); D.kind = b.dataset.kind; if (D.kind === 'task') D.end = D.start; else if (D.end === D.start && !D.allDay) D.end = toLocal(new Date(parse(D.start).getTime() + (C.prefsCal().defaultDuration || 60) * 60000)); paint(); return; }
      if (b.dataset.cal) { read(); D.calendarId = b.dataset.cal; paint(); return; }
      if ('color' in b.dataset) { read(); D.color = b.dataset.color || null; paint(); return; }
      if ('rem' in b.dataset) { read(); D.reminders = D.reminders.filter(m => m !== +b.dataset.rem); paint(); return; }
      if (b.dataset.ckdel) { read(); D.checklist = D.checklist.filter(x => x.id !== b.dataset.ckdel); paint(); return; }
      if (b.matches('.ck-item .tick')) { read(); const it = D.checklist.find(x => x.id === b.closest('.ck-item').dataset.ck); if (it) { it.done = !it.done; if (it.done) { const r = b.getBoundingClientRect(); UI.confetti(r.left + 10, r.top + 10, 8); } } paint(); return; }
      if (b.dataset.imgdel != null) { read(); const a = D.attachments.splice(+b.dataset.imgdel, 1)[0]; if (a) (addedBlobs.includes(a.id) ? ZC.store.deleteBlob(a.id).catch(() => {}) : removedBlobs.push(a.id)); paint(); return; }
      if (b.matches('.thumb img')) { UI.lightbox(D.attachments.map(a => a.id), +b.closest('.thumb').dataset.i); return; }
      if (b.classList.contains('cu-d')) { read(); readCustom(); const s = new Set(D.rrule.byDay || []); s.has(b.dataset.wd) ? s.delete(b.dataset.wd) : s.add(b.dataset.wd); if (!s.size) s.add(b.dataset.wd); D.rrule.byDay = WD.filter(x => s.has(x)); paint(); return; }
      if (b.closest('[data-cu]')) {
        read(); readCustom();
        const k = b.closest('[data-cu]').dataset.cu, v = b.dataset.v;
        if (k === 'monthMode') D.rrule.monthMode = v;
        if (k === 'end') { D.rrule.until = v === 'until' ? (D.rrule.until || ymd(addDays(parse(D.start), 30))) : null; D.rrule.count = v === 'count' ? (D.rrule.count || 10) : null; }
        paint(); return;
      }
      const act = b.dataset.act;
      if (act === 'close') L.close();
      else if (act === 'save') save();
      else if (act === 'allday') { read(); D.allDay = !D.allDay; const s = parse(D.start); if (D.allDay) { D.start = ymd(s); D.end = D.kind === 'task' ? D.start : ymd(parse(D.end)); D.reminders = D.reminders.length ? [0] : []; } else { s.setHours(9, 0); D.start = toLocal(s); D.end = D.kind === 'task' ? D.start : toLocal(new Date(s.getTime() + 3600000)); D.reminders = [...(C.prefsCal().defaultReminders || [])]; } datesTouched = true; paint(); }
      else if (act === 'alarm' || act === 'alarmyes') { read(); D.alarm = act === 'alarmyes' ? true : !D.alarm; if (D.alarm) alarmSuggested = false; UI.haptic('tick'); paint(); }
      else if (act === 'emoji') emojiPicker(b, em => { read(); D.emoji = em; paint(); });
      else if (act === 'addrem') { read(); remMenu(b); }
      else if (act === 'maps') { read(); openMaps(D.location); }
      else if (act === 'addimg' || act === 'camera') addImages(act === 'camera');
      else if (act === 'nlpok') applyNlp(nlpHint);
      else if (act === 'nlpno') { nlpDismissed = true; nlpHint = null; body.querySelector('.ed-nlp').hidden = true; }
      else if (act === 'delete') { const occ = o.occ || C.occOf(orig); if (await C.deleteOccurrence(occ)) L.close('saved'); }
      else if (act === 'dup') { read(); const copy = clean({ ...JSON.parse(JSON.stringify(D)) }); delete copy.id; delete copy.created; delete copy.updated; delete copy.recurrenceOf; delete copy.recurrenceDate; delete copy.doneDates; copy.title = D.title; const saved = await ZC.store.saveEvent(copy); L.close('saved'); UI.toast(t('Duplicado'), { icon: 'copy', undo: () => ZC.store.deleteEvent(saved.id, { mode: 'all' }) }); open({ ev: saved }); }
    });
    function remMenu(anchor) {
      const opts = D.allDay ? [[0, t('El mismo día (9:00)')], [1440, t('1 día antes')], [2880, t('2 días antes')], [10080, t('1 semana antes')]]
        : [[0, t('A la hora')], [5, t('5 min antes')], [10, t('10 min antes')], [15, t('15 min antes')], [30, t('30 min antes')], [60, t('1 h antes')], [120, t('2 h antes')], [1440, t('1 día antes')], [2880, t('2 días antes')], [10080, t('1 semana antes')]];
      UI.menu(anchor, opts.filter(([m]) => !D.reminders.includes(m)).map(([m, l]) => ({ label: l, icon: 'bell', act: () => { D.reminders.push(m); paint(); } })));
    }
    async function addImages(camera) {
      const files = await UI.pickFile({ accept: 'image/*', multiple: !camera, capture: camera ? 'environment' : undefined });
      if (!files.length) return;
      read();
      for (const f of files) {
        try {
          const { blob, w, h } = await UI.shrinkImage(f);
          const id = await ZC.store.putBlob(blob, { name: f.name || 'foto.jpg' });
          addedBlobs.push(id);
          D.attachments.push({ id, name: f.name || 'foto.jpg', type: blob.type || f.type || 'image/jpeg', w, h });
        } catch (e) { console.error(e); UI.toast(t('No se ha podido añadir la imagen')); }
      }
      paint();
    }
    function clean(ev) { ev.alarm = !!ev.alarm; if ((!ev.alarm || !ev.allDay) && ev.alarmTime) ev.alarmTime = null; ev.title = (ev.title || '').trim(); if (ev.kind === 'task') ev.end = ev.start; ev.reminders = [...new Set(ev.reminders)].sort((a, b) => a - b); ev.checklist = ev.checklist.filter(c => (c.text || '').trim()); return ev; }

    async function save() {
      read();
      if (nlpHint && !nlpDismissed && !datesTouched && isNew) { const p = nlpHint; applyNlp(p); read(); }
      const ev = clean(D);
      if (!ev.title && !ev.emoji) { const ti = body.querySelector('[name=title]'); ti && ti.focus(); ti && ti.classList.add('shake'); setTimeout(() => ti && ti.classList.remove('shake'), 500); UI.haptic('warn'); return; }
      if (!ev.allDay && ev.kind !== 'task' && parse(ev.end) < parse(ev.start)) ev.end = toLocal(new Date(parse(ev.start).getTime() + 3600000));
      const btn = body.querySelector('[data-act=save]'); if (btn) btn.disabled = true;
      try {
        let undo = null;
        if (isNew) { await ZC.store.saveEvent(ev); UI.toast(ev.kind === 'task' ? t('Tarea guardada') : t('Evento guardado'), { icon: 'check' }); }
        else if (orig.rrule && o.occ) {
          const rruleChanged = JSON.stringify(ZC.recur.normRule(orig.rrule)) !== JSON.stringify(ZC.recur.normRule(ev.rrule));
          const opts = [...(rruleChanged ? [] : [{ v: 'one', label: t('Solo este'), icon: 'calendar' }]), { v: 'future', label: t('Este y los siguientes'), icon: 'chevR' }, { v: 'all', label: t('Todos'), icon: 'repeat' }];
          const mode = await UI.choose(t('Cambiar evento repetido'), opts);
          if (!mode) { if (btn) btn.disabled = false; return; }
          const occStart = o.occ.start, snap = C.snapshotSeries(orig);
          if (mode === 'one') { const ch = { ...ev }; delete ch.id; delete ch.rrule; delete ch.exdates; delete ch.doneDates; delete ch.created; delete ch.updated; await ZC.store.saveEventOccurrence(orig.id, ymd(occStart), ch); }
          else if (mode === 'future' && !sameDay(occStart, parse(orig.start))) {
            const ch = { ...ev }; delete ch.id; delete ch.exdates; delete ch.doneDates;
            await C.splitSeries(orig, occStart, ch);
          } else {
            // toda la serie: se mueve lo mismo que se ha movido esta aparición (en días y en hora de reloj)
            const all = { ...ev, ...C.seriesShifted(orig, occStart, parse(ev.start), parse(ev.end || ev.start), { allDay: ev.allDay, kind: ev.kind, rrule: ev.rrule, moveDays: !rruleChanged }) };
            await ZC.store.saveEvent(all);
          }
          undo = snap();
        } else {
          await ZC.store.saveEvent(ev);
          undo = () => ZC.store.saveEvent(orig);
        }
        if (!isNew) {
          // las imágenes quitadas se borran si ya no las usa nadie (en «solo este» la serie las sigue teniendo)
          const restoreImgs = removedBlobs.length ? await C.holdBlobs(removedBlobs) : null;
          await C.dropUnusedBlobs(removedBlobs);
          UI.toast(t('Cambios guardados'), { icon: 'check', undo: async () => { if (restoreImgs) await restoreImgs(); await undo(); } });
        }
        addedBlobs.length = 0;
        UI.haptic('ok');
        if (fab) fab.classList.remove('open');
        L.close('saved');
      } catch (err) { console.error(err); UI.toast(t('No se ha podido guardar')); if (btn) btn.disabled = false; }
    }
    paint();
    return L;
  }

  function emojiPicker(anchor, cb) {
    const m = UI.h(`<div class="menu emoji-pick open" role="dialog" aria-label="${t('Elegir emoji')}"><div class="em-grid">${EMOJIS.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div><div class="em-foot"><input class="in sm" maxlength="4" placeholder="${esc(t('Otro…'))}" aria-label="${t('Otro emoji')}"><button type="button" class="btn sm ghost" data-e="">${t('Quitar')}</button></div></div>`);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px';
    m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6) + 'px';
    m.style.zIndex = 140;
    const close = () => { m.remove(); document.removeEventListener('pointerdown', off, true); };
    const off = e => { if (!m.contains(e.target)) close(); };
    m._close = close;
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    m.addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (b) { cb(b.dataset.e || null); close(); } });
    m.querySelector('input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v) { cb(v); close(); } } });
  }
  function openMaps(q) {
    if (!q) return;
    const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
    try { if (ZC.platform && ZC.platform.openExternal) { ZC.platform.openExternal(url); return; } } catch {}
    window.open(url, '_blank', 'noopener');
  }
  const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" data-ext="$1">$1</a>').replace(/\n/g, '<br>');

  // ---------- detalle ----------
  function detail(o, anchor) {
    if (!o || !o.ev) return;
    const ev = ZC.store.get(o.id) || o.ev;
    o = { ...o, ev, done: ev.rrule && ev.kind === 'task' ? !!o.done : !!ev.done };
    const cal = ZC.store.calendar(ev.calendarId) || o.calendar || {};
    const color = ev.color || cal.color || '#B9A2FF';
    const task = ev.kind === 'task';
    const rems = (ev.reminders || []).slice().sort((a, b) => a - b);
    const html = `
      <div class="dt" style="--c:${esc(color)}">
        <div class="dt-hero">
          <div class="dt-acts">
            <button class="ibtn" data-act="edit" aria-label="${t('Editar')}" title="${t('Editar')}">${UI.icon('edit', 19)}</button>
            <button class="ibtn" data-act="dup" aria-label="${t('Duplicar')}" title="${t('Duplicar')}">${UI.icon('copy', 19)}</button>
            <button class="ibtn" data-act="delete" aria-label="${t('Borrar')}" title="${t('Borrar')}">${UI.icon('trash', 19)}</button>
            <span style="flex:1"></span>
            <button class="ibtn" data-act="close" aria-label="${t('Cerrar')}">${UI.icon('x', 20)}</button>
          </div>
          ${ev.emoji ? `<div class="dt-emoji">${esc(ev.emoji)}</div>` : ''}
          <h2 class="${o.done ? 'done' : ''}">${esc(ev.title || (task ? t('Tarea sin título') : t('Sin título')))}</h2>
          <p class="dt-when">${esc(C.whenText(o, { withDate: true }))}</p>
          <div class="dt-tags"><span class="chip"><i class="dot" style="background:${esc(cal.color || color)}"></i>${esc(cal.name || '')}</span>${ev.rrule ? `<span class="chip">${UI.icon('repeat', 14)}${esc(describe(ev.rrule, ev.start))}</span>` : ''}${task ? `<span class="chip">${UI.icon('tasks', 14)}${t('Tarea')}</span>` : ''}${ev.alarm ? `<span class="chip al">${UI.icon('alarm', 14)}${t('Alarma')}</span>` : ''}</div>
        </div>
        <div class="dt-body">
          ${task ? `<button class="btn ${o.done ? 'soft' : 'pri'} block dt-done" data-act="done">${UI.icon('check', 18)}${o.done ? t('Marcar como pendiente') : t('Marcar como hecha')}</button>` : ''}
          ${ev.location ? `<div class="dt-row">${UI.icon('pin', 19)}<div><b>${esc(ev.location)}</b><button class="link" data-act="maps">${t('Abrir en Google Maps')}</button></div></div>` : ''}
          ${ev.alarm ? `<div class="dt-row dt-alarm">${UI.icon('alarm', 19)}<div><b>${esc(C.alarmText(ev))}</b><small class="mut">${t('Suena como un despertador, aunque el móvil esté en silencio.')}</small></div></div>` : ''}
          ${rems.length ? `<div class="dt-row">${UI.icon('bell', 19)}<div>${rems.map(m => `<span class="chip">${esc(ev.allDay && m === 0 ? t('El mismo día (9:00)') : C.remText(m))}</span>`).join(' ')}</div></div>` : ''}
          ${ev.notes ? `<div class="dt-row">${UI.icon('notes', 19)}<div class="dt-notes">${linkify(ev.notes)}</div></div>` : ''}
          ${(ev.checklist || []).length ? `<div class="dt-row">${UI.icon('list', 19)}<div class="dt-check">${ev.checklist.map(c => `<div class="ck-item ${c.done ? 'done' : ''}" data-ck="${esc(c.id)}"><span class="tick ${c.done ? 'on' : ''}" role="checkbox" aria-checked="${!!c.done}" tabindex="0">${UI.icon('check', 14)}</span><span>${esc(c.text)}</span></div>`).join('')}<small class="mut">${ev.checklist.filter(c => c.done).length}/${ev.checklist.length}</small></div></div>` : ''}
          ${(ev.attachments || []).length ? `<div class="dt-imgs">${ev.attachments.map((a, i) => `<button class="dt-img" data-i="${i}" aria-label="${esc(a.name || t('Imagen'))}"><img alt=""></button>`).join('')}</div>` : ''}
        </div>
      </div>`;
    const L = UI.openLayer({ kind: 'modal', panelCls: 'dt-panel', html, label: ev.title });
    (ev.attachments || []).forEach(async (a, i) => { try { const u = await ZC.store.blobURL(a.id); const im = L.body.querySelector(`.dt-img[data-i="${i}"] img`); if (im && u) im.src = u; } catch {} });
    L.body.addEventListener('click', async e => {
      const ext = e.target.closest('[data-ext]');
      if (ext && ZC.platform && ZC.platform.kind !== 'web') { e.preventDefault(); ZC.platform.openExternal(ext.dataset.ext); return; }
      const img = e.target.closest('.dt-img'); if (img) { UI.lightbox(ev.attachments.map(a => a.id), +img.dataset.i); return; }
      const ck = e.target.closest('.ck-item');
      if (ck) {
        const list = JSON.parse(JSON.stringify(ev.checklist)); const it = list.find(x => x.id === ck.dataset.ck);
        if (it) { it.done = !it.done; ck.classList.toggle('done', it.done); ck.querySelector('.tick').classList.toggle('on', it.done); if (it.done) { const r = ck.querySelector('.tick').getBoundingClientRect(); UI.confetti(r.left + 10, r.top + 10, 8); } ev.checklist = list; await ZC.store.saveEvent({ id: ev.id, checklist: list }); const sm = L.body.querySelector('.dt-check small'); if (sm) sm.textContent = list.filter(c => c.done).length + '/' + list.length; }
        return;
      }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'close') L.close();
      if (act === 'edit') { L.close(); setTimeout(() => open({ ev, occ: o }), UI.anim() ? 120 : 0); }
      if (act === 'dup') { const copy = JSON.parse(JSON.stringify(ev)); delete copy.id; delete copy.created; delete copy.updated; delete copy.recurrenceOf; delete copy.recurrenceDate; delete copy.doneDates; copy.done = false; copy.doneAt = null; const saved = await ZC.store.saveEvent(copy); L.close(); UI.toast(t('Duplicado'), { icon: 'copy', undo: () => ZC.store.deleteEvent(saved.id, { mode: 'all' }) }); }
      if (act === 'delete') { if (await C.deleteOccurrence(o)) L.close(); }
      if (act === 'maps') openMaps(ev.location);
      if (act === 'done') { await C.toggleTask(o, o.done ? null : b); L.close(); }
    });
    return L;
  }

  UI.editor = { open, detail, EMOJIS, openMaps };
})();
