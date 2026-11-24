'use strict';
// ZenCalendar · asistente: chat con ZC.ai.run, fotos de carteles, y vista previa de los cambios
// (crear / mover / borrar / completar) con «Aplicar» o «Descartar».
(function () {
  const ZC = window.ZC, UI = ZC.ui, C = UI.cal, t = (...a) => ZC.t(...a);
  const { esc, parse } = C;
  let log = [];          // [{ role, text, images:[url], actions, state }]
  let history = [];      // para el proveedor: [{ role, content }]
  let L = null, pending = [], busy = false;

  const SUGG = () => [t('¿Qué tengo mañana?'), t('Cena con Marta el viernes a las 9 y recuérdamelo 1 h antes'), t('Despiértame a las 7'), t('Quita todo lo de mañana'), t('Mueve el dentista al martes'), t('Gimnasio cada lunes y miércoles a las 7 de la tarde')];

  function providerInfo() {
    let cfg = {}, list = [];
    try { cfg = ZC.ai.getConfig() || {}; list = ZC.ai.providers || []; } catch {}
    const p = list.find(x => x.id === cfg.provider) || list[0] || { id: 'rules', name: t('Integrado'), offline: true };
    return { cfg, p };
  }

  function open(prefill, images) {
    if (images && images.length) { pending.forEach(x => URL.revokeObjectURL(x.url)); pending = []; images.forEach(b => pending.push({ blob: b, url: URL.createObjectURL(b) })); }
    if (L && !L.closed) { const ta = L.body.querySelector('textarea'); if (images && images.length) paintAtt(); if ((prefill || (images && images.length)) && ta) { ta.value = prefill || ''; send(); } else ta && ta.focus(); return; }
    const { p } = providerInfo();
    L = UI.openLayer({ kind: 'drawer', cls: 'ai-layer', panelCls: 'ai-panel', label: t('Asistente'), scrim: UI.isMobile(), html: `
      <div class="sheet-head ai-head"><span class="ai-badge">${UI.icon('sparkles', 20)}</span><div class="ai-ttl"><h2>${t('Asistente')}</h2><small class="mut">${esc(t(p.name || ''))}${p.offline ? ', ' + t('sin internet') : ''}</small></div>
        <button class="ibtn" data-a="clear" aria-label="${t('Nueva conversación')}" title="${t('Nueva conversación')}">${UI.icon('refresh', 19)}</button>
        <button class="ibtn" data-a="cfg" aria-label="${t('Ajustes del asistente')}" title="${t('Ajustes del asistente')}">${UI.icon('settings', 19)}</button>
        <button class="ibtn" data-a="close" aria-label="${t('Cerrar')}">${UI.icon('x', 20)}</button></div>
      <div class="ai-log layer-scroll" aria-live="polite"></div>
      <form class="ai-input">
        <div class="ai-att" hidden></div>
        <div class="ai-box">
          <button type="button" class="ibtn" data-a="img" aria-label="${t('Añadir foto')}" title="${t('Añadir foto (un cartel, una invitación…)')}">${UI.icon('image', 20)}</button>
          <textarea rows="1" placeholder="${esc(t('Escribe o pega lo que quieras…'))}" aria-label="${esc(t('Mensaje para el asistente'))}" enterkeyhint="send"></textarea>
          <button class="ibtn send" type="submit" aria-label="${t('Enviar')}">${UI.icon('send', 20)}</button>
        </div>
      </form>` });
    const ta = L.body.querySelector('textarea');
    paintLog();
    setTimeout(() => ta.focus(), 120);
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    L.body.querySelector('form').onsubmit = e => { e.preventDefault(); send(); };
    L.body.addEventListener('click', onClick);
    L.body.addEventListener('paste', e => { const f = [...(e.clipboardData || {}).files || []].filter(x => x.type.startsWith('image/')); if (f.length) { e.preventDefault(); addImgs(f); } });
    if (pending.length) paintAtt();
    if (prefill || pending.length) { ta.value = prefill || ''; send(); }
  }

  async function addImgs(files) {
    for (const f of files) { const { blob } = await UI.shrinkImage(f, 1600, .85); pending.push({ blob, url: URL.createObjectURL(blob) }); }
    paintAtt();
  }
  function paintAtt() {
    const box = L.body.querySelector('.ai-att');
    box.hidden = !pending.length;
    box.innerHTML = pending.map((p, i) => `<div class="thumb"><img src="${p.url}" alt=""><button type="button" class="ibtn sm" data-rm="${i}" aria-label="${t('Quitar')}">${UI.icon('x', 14)}</button></div>`).join('');
  }

  function evWhen(ev) {
    try { return C.whenText({ ev, start: parse(ev.start), end: parse(ev.end || ev.start), allDay: !!ev.allDay, isTask: ev.kind === 'task' }, { withDate: true }); } catch { return ''; }
  }
  // el evento tal y como sale ese día (borrar una sola repetición de una serie)
  function occEv(ev, date) {
    if (!date || !ev || !ev.start) return ev;
    const s = parse(ev.start), e = parse(ev.end || ev.start), d = parse(date);
    const shift = C.sod(d) - C.sod(s);
    const ns = new Date(s.getTime() + shift), ne = new Date(e.getTime() + shift);
    return { ...ev, start: C.toLocal(ns, ev.allDay), end: C.toLocal(ne, ev.allDay) };
  }
  const colorOf = ev => { const cal = ev && ZC.store.calendar(ev.calendarId); return (ev && ev.color) || (cal && cal.color) || 'var(--a1)'; };
  const isSug = a => !!(a && a.suggest);
  // a qué evento se refiere una acción (por id o por ref al «crear» de la misma respuesta)
  function targetOf(m, a) {
    if (a.ref != null && m.actions[a.ref] && m.actions[a.ref].type === 'create') return m.actions[a.ref].event || {};
    if (a.ref != null && m.actions[a.ref] && m.actions[a.ref].id) return ZC.store.get(m.actions[a.ref].id) || {};
    return ZC.store.get(a.id) || {};
  }
  const onlyAlarm = ch => ch && Object.keys(ch).every(k => k === 'alarm' || k === 'alarmTime');

  function actionCard(m, a, i, k) {
    const state = m.state;
    let ic = 'plus', title = '', sub = '', cls = a.type, verb = { create: t('Crear'), update: t('Cambiar'), delete: t('Borrar'), complete: t('Completar') }[a.type] || '';
    let ev = a.type === 'create' ? (a.event || {}) : targetOf(m, a);
    if (a.type === 'create') { title = C.titleOf(ev); sub = evWhen(ev) + (ev.location ? ', ' + ev.location : '') + (ev.rrule ? '. ' + (ZC.recur.describe(ev.rrule, ZC.i18n.lang(), parse(ev.start)) || '') : '') + ((ev.reminders || []).length ? '. ' + t('Aviso: {x}', { x: ev.reminders.map(m => C.remText(m)).join(', ') }) : '') + (ev.alarm ? '. ' + C.alarmText(ev) : ''); ic = ev.kind === 'task' ? 'tasks' : 'plus'; }
    else {
      title = C.titleOf(ev);
      if (a.type === 'update') {
        ic = 'edit'; const ch = a.changes || {}, nv = { ...ev, ...ch };
        if (onlyAlarm(ch)) { ic = 'alarm'; cls += ' alarm'; verb = ch.alarm === false ? t('Quitar alarma') : t('Poner alarma'); sub = ch.alarm === false ? evWhen(ev) : C.alarmText(nv) + ', ' + evWhen(ev); }
        else sub = (ch.start || ch.end) ? t('De {a} a {b}', { a: evWhen(ev), b: evWhen(nv) }) : Object.keys(ch).map(k => t({ title: 'título', location: 'lugar', notes: 'notas', reminders: 'avisos', calendarId: 'calendario', color: 'color', rrule: 'repetición', alarm: 'alarma', alarmTime: 'hora de la alarma' }[k] || k)).join(', ');
      }
      if (a.type === 'delete') { ic = 'trash'; sub = evWhen(occEv(ev, a.mode !== 'all' && a.date)) + (ev.rrule && a.mode === 'all' ? '. ' + t('Toda la serie') : ''); }
      if (a.type === 'complete') { ic = 'check'; sub = t('Marcar como hecha'); }
    }
    const tog = state === 'preview' ? `<button class="ibtn sm" data-tog="${k}:${i}" aria-label="${a._off ? t('Incluir') : t('Quitar')}" title="${a._off ? t('Incluir') : t('Quitar')}">${UI.icon(a._off ? 'plus' : 'x', 16)}</button>` : '';
    return `<div class="ai-act ${cls} ${a._off ? 'off' : ''}" style="--c:${esc(colorOf(ev))};--i:${i}"><span class="ai-act-ic">${UI.icon(ic, 18)}</span><span class="ai-act-tx"><small>${esc(verb)}</small><b>${esc(title)}${a.type === 'create' ? C.alarmMark(ev, 14) : ''}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>${tog}</div>`;
  }

  // «de mañana», «del viernes 28», «del 3 al 7 dic»
  const low = x => ZC.i18n.lang() === 'en' || !x ? x : x.charAt(0).toLowerCase() + x.slice(1);
  function scopeOf(items) {
    const ds = items.map(({ ev, a }) => { const e = occEv(ev, a.mode !== 'all' && a.date); return e && e.start ? C.sod(parse(e.start)) : null; }).filter(Boolean);
    if (!ds.length) return '';
    const min = new Date(Math.min(...ds)), max = new Date(Math.max(...ds)), td = C.today(), D = ZC.i18n.D;
    if (C.sameDay(min, max)) {
      if (C.sameDay(min, td)) return t('de hoy');
      if (C.sameDay(min, C.addDays(td, 1))) return t('de mañana');
      if (C.sameDay(min, C.addDays(td, -1))) return t('de ayer');
      return t('del {x}', { x: low(D.short(min)) });
    }
    return t('del {a} al {b}', { a: low(D.short(min)), b: low(D.short(max)) });
  }
  function delCount(items) {
    const n = items.length, tasks = items.every(x => x.ev.kind === 'task');
    return tasks ? ZC.i18n.tn(n, '{n} tarea', '{n} tareas') : ZC.i18n.tn(n, '{n} evento', '{n} eventos');
  }
  function groupCard(m, idx, k) {
    const prev = m.state === 'preview';
    // ya aplicado (o deshecho): solo lo que se borró de verdad
    const items = idx.map(i => ({ i, a: m.actions[i], ev: ZC.store.get(m.actions[i].id) || m.snap && m.snap[m.actions[i].id] || {} })).filter(x => prev || !x.a._off);
    if (!items.length) return '';
    const on = items.filter(x => !x.a._off), open = !!(m.open || {}).del;
    const head = (delCount(items) + ' ' + scopeOf(items)).trim();
    // todo el mismo día: en la lista basta con la hora (el día ya va en el título)
    const days = new Set(items.map(({ ev, a }) => { const e = occEv(ev, a.mode !== 'all' && a.date); return e && e.start ? String(e.start).slice(0, 10) + (e.allDay && e.end && e.end !== e.start ? '+' : '') : '?'; }));
    const oneDay = days.size === 1 && ![...days][0].includes('+') && ![...days][0].includes('?');
    const left = items.length - on.length;
    const sub = prev ? (left ? ZC.i18n.tn(left, 'Se queda {n}', 'Se quedan {n}') : (open ? t('Desmarca lo que quieras conservar') : t('Toca para ver la lista'))) : '';
    return `<div class="ai-grp ${open ? 'open' : ''} ${on.length ? '' : 'off'}" style="--i:${idx[0]}">
      <button type="button" class="ai-grp-head" data-grp="${k}" aria-expanded="${open}"><span class="ai-act-ic">${UI.icon('trash', 18)}</span><span class="ai-act-tx"><small>${t('Borrar')}</small><b>${esc(head)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span><span class="ai-grp-chev">${UI.icon('chevD', 18)}</span></button>
      <div class="ai-grp-list" ${open ? '' : 'hidden'}>${items.map(({ i, a, ev }) => {
        const e = occEv(ev, a.mode !== 'all' && a.date);
        let when = evWhen(e);
        if (oneDay && e && e.start) try { when = C.whenText({ ev: e, start: parse(e.start), end: parse(e.end || e.start), allDay: !!e.allDay, isTask: e.kind === 'task' }); } catch {}
        return `<label class="ai-grp-it ${a._off ? 'off' : ''}" style="--c:${esc(colorOf(ev))}"><input type="checkbox" class="ck" data-chk="${k}:${i}" ${a._off ? '' : 'checked'} ${prev ? '' : 'disabled'}><i class="dot"></i><span><b>${esc(C.titleOf(ev))}</b><small>${esc(when)}${ev.rrule && a.mode === 'all' ? '. ' + esc(t('Toda la serie')) : ''}</small></span></label>`;
      }).join('')}</div></div>`;
  }
  function suggCard(m, a, i, k) {
    const ev = targetOf(m, a), ch = a.changes || {};
    const alarm = a.type === 'update' && onlyAlarm(ch) && ch.alarm !== false;
    const on = !a._off;
    const what = alarm ? t('Poner alarma') : ({ create: t('Crear'), update: t('Cambiar'), delete: t('Borrar'), complete: t('Completar') }[a.type] || '') + ' ' + C.titleOf(a.type === 'create' ? a.event || {} : ev);
    const sub = alarm ? C.titleOf(ev) + ', ' + C.alarmTime({ ...ev, ...ch }) : evWhen(a.type === 'create' ? a.event || {} : ev);
    const prev = m.state === 'preview';
    if (!prev && !on) return '';
    return `<div class="ai-sug ${on ? 'on' : ''} ${prev ? '' : 'done'}" style="--c:${esc(colorOf(ev))};--i:${i}"><span class="ai-act-ic">${UI.icon(alarm ? 'alarm' : 'sparkles', 18)}</span>
      <span class="ai-act-tx"><small>${t('Sugerencia')}</small><b>${esc(what)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}${a.why ? `<em>${esc(a.why)}</em>` : ''}</span>
      ${prev ? `<button type="button" class="sw" role="switch" aria-checked="${on}" data-sug="${k}:${i}" aria-label="${esc(what)}"></button>` : ''}</div>`;
  }
  function actsHTML(m, k) {
    const acts = m.actions || [];
    const dels = acts.map((a, i) => a.type === 'delete' && !a._sug ? i : -1).filter(i => i >= 0);
    const grouped = dels.length >= 2;
    let html = '';
    acts.forEach((a, i) => {
      if (a._sug) return;
      if (grouped && a.type === 'delete') { if (i === dels[0]) html += groupCard(m, dels, k); return; }
      html += actionCard(m, a, i, k);
    });
    acts.forEach((a, i) => { if (a._sug) html += suggCard(m, a, i, k); });
    return html;
  }

  // lo que se manda a ZC.ai.apply: sin lo desmarcado, sin sugerencias rechazadas, y con las aceptadas
  // que apuntan a un «crear» de la misma respuesta ya metidas en ese evento (no hace falta «ref»)
  function prepare(m) {
    const acts = m.actions || [];
    const keep = acts.map(() => false);
    const alive = i => { const a = acts[i]; if (!a || a._off) return false; if (a.ref != null && a.ref !== i) return alive(a.ref); return true; };
    acts.forEach((a, i) => { keep[i] = alive(i); });
    const out = [], map = new Map();
    acts.forEach((a, i) => {
      if (!keep[i]) return;
      const x = JSON.parse(JSON.stringify(a)); delete x._off; delete x._sug; delete x.suggest; delete x.why;
      if (x.ref != null) {
        const tgt = acts[x.ref];
        if (tgt && tgt.type === 'create' && map.has(x.ref) && x.type === 'update') { Object.assign(out[map.get(x.ref)].event, x.changes || {}); return; }
        if (tgt && tgt.id) { x.id = tgt.id; delete x.ref; }
        else if (map.has(x.ref)) x.ref = map.get(x.ref);
      }
      map.set(i, out.length); out.push(x);
    });
    return out;
  }
  function applyLabel(m) {
    const acts = prepare(m);
    if (!acts.length) return t('Aplicar');
    const dels = acts.filter(a => a.type === 'delete');
    if (dels.length === acts.length) {
      const tasks = dels.every(a => (ZC.store.get(a.id) || {}).kind === 'task');
      return tasks ? ZC.i18n.tn(dels.length, 'Borrar {n} tarea', 'Borrar {n} tareas') : ZC.i18n.tn(dels.length, 'Borrar {n} evento', 'Borrar {n} eventos');
    }
    if (acts.length > 1) return t('Aplicar {n} cambios', { n: acts.length });
    const a = acts[0];
    if (a.type === 'create') { const task = a.event && a.event.kind === 'task'; return a.event && a.event.alarm ? (task ? t('Crear tarea con alarma') : t('Crear evento con alarma')) : (task ? t('Crear tarea') : t('Crear evento')); }
    if (a.type === 'update' && onlyAlarm(a.changes)) return a.changes.alarm === false ? t('Quitar alarma') : t('Poner alarma');
    return { update: t('Guardar el cambio'), delete: t('Borrar evento'), complete: t('Marcar como hecha') }[a.type] || t('Aplicar');
  }

  function paintLog() {
    if (!L) return;
    const box = L.body.querySelector('.ai-log');
    if (!log.length) {
      box.innerHTML = `<div class="ai-intro">${UI.ART.ai}<h3>${t('¿En qué te ayudo?')}</h3><p>${t('Escribe como hablas. Puedo crear, mover o borrar eventos, ponerte alarmas, decirte qué tienes o leer la foto de un cartel.')}</p>
        <div class="ai-sugg stagger">${SUGG().map((s, i) => `<button class="chip" data-s="${esc(s)}" style="--i:${i}">${esc(s)}</button>`).join('')}</div></div>`;
      return;
    }
    const keepScroll = box._keep; box._keep = null;
    box.classList.toggle('still', !!keepScroll);  // repintar por un toque: sin volver a animar las tarjetas
    const st = box.scrollTop;
    box.innerHTML = log.map((m, k) => {
      if (m.role === 'user') return `<div class="msg me">${m.images && m.images.length ? `<div class="msg-imgs">${m.images.map(u => `<img src="${u}" alt="">`).join('')}</div>` : ''}${m.text ? `<div class="bub">${esc(m.text)}</div>` : ''}</div>`;
      const acts = m.actions || [];
      return `<div class="msg ai"><span class="ai-av">${UI.icon('sparkles', 16)}</span><div class="ai-col">
        <div class="bub ${m.state === 'thinking' && !m.text ? 'typing' : ''}">${m.state === 'thinking' && !m.text ? '<i></i><i></i><i></i>' : esc(m.text || '').replace(/\n/g, '<br>')}</div>
        ${acts.length ? `<div class="ai-acts">${actsHTML(m, k)}
          ${m.state === 'preview' ? `<div class="ai-btns"><button class="btn sm ghost" data-discard="${k}">${t('Descartar')}</button><button class="btn sm ${prepare(m).every(a => a.type === 'delete') && prepare(m).length ? 'danger' : 'pri'}" data-apply="${k}" ${prepare(m).length ? '' : 'disabled'}>${UI.icon(prepare(m).every(a => a.type === 'delete') && prepare(m).length ? 'trash' : 'check', 16)}${esc(applyLabel(m))}</button></div>` : ''}
          ${m.state === 'applied' ? `<div class="ai-done">${UI.icon('check', 16)}${esc(m.doneText || t('Hecho'))}${m.undo ? ` <button class="link" data-undo="${k}">${t('Deshacer')}</button>` : ''}</div>` : ''}
          ${m.state === 'discarded' ? `<div class="ai-done off">${m.undone ? t('Deshecho') : t('Descartado')}</div>` : ''}
        </div>` : ''}
        ${m.error ? `<button class="btn sm soft" data-a="cfg">${UI.icon('settings', 16)}${t('Revisar ajustes del asistente')}</button>` : ''}
      </div></div>`;
    }).join('');
    box.scrollTop = keepScroll ? st : box.scrollHeight;
  }

  async function send() {
    if (busy || !L) return;
    const ta = L.body.querySelector('textarea');
    const text = ta.value.trim();
    if (!text && !pending.length) return;
    const imgs = pending.slice(); pending = []; paintAtt();
    ta.value = ''; ta.style.height = 'auto';
    log.push({ role: 'user', text, images: imgs.map(i => i.url) });
    const m = { role: 'assistant', text: '', state: 'thinking', actions: [] };
    log.push(m); paintLog();
    busy = true; L.body.querySelector('.send').disabled = true;
    try {
      const res = await ZC.ai.run(text, { images: imgs.map(i => i.blob), history: history.slice(-12), lang: ZC.i18n.lang(), onToken: tok => { m.text += tok; const bubs = L && L.body.querySelectorAll('.msg.ai .bub'); const b = bubs && bubs[bubs.length - 1]; if (b) { b.classList.remove('typing'); b.innerHTML = esc(m.text).replace(/\n/g, '<br>'); const lg = L.body.querySelector('.ai-log'); lg.scrollTop = lg.scrollHeight; } } }) || {};
      m.text = res.reply || m.text || (res.actions && res.actions.length ? t('Esto es lo que haría:') : t('Hecho.'));
      // las sugerencias llegan desmarcadas; se recuerdan como tales aunque el usuario las acepte
      m.actions = (res.actions || []).map(a => a && a.suggest ? { ...a, _sug: true, _off: true } : a).filter(Boolean);
      m.confirmMany = !!res.confirmMany;
      const nd = m.actions.filter(a => a.type === 'delete' && !a.suggest).length;
      m.open = { del: nd >= 2 && nd <= 5 };
      if (res.error) { m.error = true; if (!m.text.includes(res.error)) m.text = (m.text ? m.text + '\n\n' : '') + '⚠️ ' + res.error; }
      history.push({ role: 'user', content: text }, { role: 'assistant', content: m.text });
      if (m.actions.length) {
        let auto = false; try { auto = !!ZC.ai.getConfig().autoApply; } catch {}
        m.state = 'preview';
        // nunca se borra en bloque ni se decide una sugerencia sin que el usuario lo vea
        if (auto && !m.confirmMany && nd < 2 && !m.actions.some(a => a._sug)) { paintLog(); await apply(log.indexOf(m)); }
      } else m.state = 'done';
    } catch (e) {
      console.error(e);
      m.text = t('No he podido responder: {x}', { x: e.message || e });
      m.state = 'done'; m.error = true;
    }
    busy = false;
    if (L) { const sb = L.body.querySelector('.send'); if (sb) sb.disabled = false; }
    paintLog();
  }

  async function apply(k) {
    const m = log[k]; if (!m || m.state !== 'preview') return;
    const acts = prepare(m);
    if (!acts.length) { m.state = 'discarded'; paintLog(); return; }
    const dels = acts.filter(a => a.type === 'delete');
    if (m.confirmMany || dels.length > 20) {
      const label = applyLabel(m);
      const ok = await UI.confirm(dels.length === acts.length ? t('¿{x}?', { x: label }) : t('¿Aplicar {n} cambios?', { n: acts.length }), ZC.i18n.tn(dels.length, 'Se borra {n} cosa de golpe. Puedes deshacerlo justo después.', 'Se borran {n} cosas de golpe. Puedes deshacerlo justo después.'), { ok: label, danger: true, icon: 'trash' });
      if (!ok || m.state !== 'preview') return;
    }
    const before = new Map();
    for (const a of acts) if (a.id) { const ev = ZC.store.get(a.id); if (ev) before.set(a.id, JSON.parse(JSON.stringify(ev))); }
    const idsBefore = new Set(ZC.store.events().map(e => e.id));
    try {
      const res = await ZC.ai.apply(acts);
      // lo borrado de paso (las copias sueltas «solo este» de una serie borrada entera) también vuelve con «Deshacer»
      for (const e of Array.isArray(res) ? res : []) if (e && e.id && e.deleted && !before.has(e.id)) { const { deleted, ...rest } = e; before.set(e.id, rest); }
      const created = ZC.store.events().filter(e => !idsBefore.has(e.id)).map(e => e.id);
      // deshacer devuelve todo lo borrado (series enteras incluidas) y quita lo creado
      m.undo = async () => { for (const ev of before.values()) await ZC.store.saveEvent({ ...ev, deleted: false }); for (const id of created) await ZC.store.deleteEvent(id, { mode: 'all' }); };
      m.state = 'applied'; m.open = { ...(m.open || {}), del: false }; m.snap = Object.fromEntries(before);
      m.doneText = dels.length === acts.length ? (dels.every(a => (before.get(a.id) || {}).kind === 'task') ? ZC.i18n.tn(dels.length, '{n} tarea borrada', '{n} tareas borradas') : ZC.i18n.tn(dels.length, '{n} evento borrado', '{n} eventos borrados')) : t('Hecho');
      UI.haptic('ok');
      const btn = L && L.body.querySelector(`[data-apply="${k}"]`);
      if (btn && dels.length < acts.length) { const r = btn.getBoundingClientRect(); UI.confetti(r.left + r.width / 2, r.top + r.height / 2, 12); }
      // lleva el calendario a la fecha del primer evento creado o movido
      const first = acts.find(a => a.type === 'create' || (a.type === 'update' && a.changes && a.changes.start));
      if (first) { const s = parse(first.type === 'create' ? first.event.start : first.changes.start); UI.app.go({ date: s, sel: s }); }
    } catch (e) { console.error(e); UI.toast(t('No se han podido aplicar los cambios')); }
    paintLog();
  }

  const keep = () => { const b = L && L.body.querySelector('.ai-log'); if (b) b._keep = true; };
  async function onClick(e) {
    const s = e.target.closest('[data-s]'); if (s) { L.body.querySelector('textarea').value = s.dataset.s; send(); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { const p = pending.splice(+rm.dataset.rm, 1)[0]; if (p) URL.revokeObjectURL(p.url); paintAtt(); return; }
    // (cada tarjeta dice de qué mensaje es: con dos vistas previas abiertas se quita en la buena)
    const tg = e.target.closest('[data-tog]'); if (tg) { const [k, i] = tg.dataset.tog.split(':').map(Number); const m = log[k]; const a = m && m.state === 'preview' && m.actions[i]; if (a) { a._off = !a._off; paintLog(); } return; }
    const ck = e.target.closest('[data-chk]'); if (ck) { const [k, i] = ck.dataset.chk.split(':').map(Number); const m = log[k]; const a = m && m.state === 'preview' && m.actions[i]; if (a) { a._off = !ck.checked; keep(); paintLog(); } return; }
    const sg = e.target.closest('[data-sug]'); if (sg) { const [k, i] = sg.dataset.sug.split(':').map(Number); const m = log[k]; const a = m && m.state === 'preview' && m.actions[i]; if (a) { a._off = !a._off; a.suggest = a._off; UI.haptic('tick'); keep(); paintLog(); } return; }
    const gp = e.target.closest('[data-grp]'); if (gp) { const m = log[+gp.dataset.grp]; if (m) { m.open = { ...(m.open || {}), del: !(m.open || {}).del }; keep(); paintLog(); } return; }
    const ap = e.target.closest('[data-apply]'); if (ap) { apply(+ap.dataset.apply); return; }
    const di = e.target.closest('[data-discard]'); if (di) { log[+di.dataset.discard].state = 'discarded'; paintLog(); return; }
    const un = e.target.closest('[data-undo]'); if (un) { const m = log[+un.dataset.undo]; if (m && m.undo) { const u = m.undo; m.undo = null; await u(); m.state = 'discarded'; m.undone = true; UI.haptic('ok'); keep(); paintLog(); } return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'close') L.close();
    if (a.dataset.a === 'clear') { log.forEach(m => (m.images || []).forEach(u => { try { URL.revokeObjectURL(u); } catch {} })); log = []; history = []; paintLog(); }
    if (a.dataset.a === 'cfg') { L.close(); UI.settings.open('ai'); }
    if (a.dataset.a === 'img') { const f = await UI.pickFile({ accept: 'image/*', multiple: true }); if (f.length) addImgs(f); }
  }

  UI.aipanel = { open };
})();
