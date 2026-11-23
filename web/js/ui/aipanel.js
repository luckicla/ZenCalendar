'use strict';
// ZenCalendar · asistente: chat con ZC.ai.run, fotos de carteles, y vista previa de los cambios
// (crear / mover / borrar / completar) con «Aplicar» o «Descartar».
(function () {
  const ZC = window.ZC, UI = ZC.ui, C = UI.cal, t = (...a) => ZC.t(...a);
  const { esc, parse } = C;
  let log = [];          // [{ role, text, images:[url], actions, state }]
  let history = [];      // para el proveedor: [{ role, content }]
  let L = null, pending = [], busy = false;

  const SUGG = () => [t('¿Qué tengo mañana?'), t('Cena con Marta el viernes a las 9 y recuérdamelo 1 h antes'), t('Mueve el dentista al martes'), t('Organízame la semana de exámenes'), t('Gimnasio cada lunes y miércoles a las 7 de la tarde')];

  function providerInfo() {
    let cfg = {}, list = [];
    try { cfg = ZC.ai.getConfig() || {}; list = ZC.ai.providers || []; } catch {}
    const p = list.find(x => x.id === cfg.provider) || list[0] || { id: 'rules', name: t('Integrado'), offline: true };
    return { cfg, p };
  }

  function open(prefill, images) {
    if (images && images.length) { pending = []; images.forEach(b => pending.push({ blob: b, url: URL.createObjectURL(b) })); }
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
  function actionCard(a, i, state) {
    let ic = 'plus', title = '', sub = '', cls = a.type;
    if (a.type === 'create') { const ev = a.event || {}; title = C.titleOf(ev); sub = evWhen(ev) + (ev.location ? ', ' + ev.location : '') + (ev.rrule ? '. ' + (ZC.recur.describe(ev.rrule, ZC.i18n.lang(), parse(ev.start)) || '') : '') + ((ev.reminders || []).length ? '. ' + t('Aviso: {x}', { x: ev.reminders.map(m => C.remText(m)).join(', ') }) : ''); ic = ev.kind === 'task' ? 'tasks' : 'plus'; }
    else {
      const ev = ZC.store.get(a.id) || {};
      title = C.titleOf(ev);
      if (a.type === 'update') { ic = 'edit'; const nv = { ...ev, ...(a.changes || {}) }; sub = (a.changes && (a.changes.start || a.changes.end)) ? t('De {a} a {b}', { a: evWhen(ev), b: evWhen(nv) }) : Object.keys(a.changes || {}).map(k => t({ title: 'título', location: 'lugar', notes: 'notas', reminders: 'avisos', calendarId: 'calendario', color: 'color', rrule: 'repetición' }[k] || k)).join(', '); }
      if (a.type === 'delete') { ic = 'trash'; sub = evWhen(ev); }
      if (a.type === 'complete') { ic = 'check'; sub = t('Marcar como hecha'); }
    }
    const verb = { create: t('Crear'), update: t('Cambiar'), delete: t('Borrar'), complete: t('Completar') }[a.type] || '';
    const ev = a.type === 'create' ? a.event : ZC.store.get(a.id);
    const cal = ev && ZC.store.calendar(ev.calendarId);
    const color = (ev && ev.color) || (cal && cal.color) || 'var(--a1)';
    return `<div class="ai-act ${cls} ${a._off ? 'off' : ''}" style="--c:${esc(color)};--i:${i}"><span class="ai-act-ic">${UI.icon(ic, 18)}</span><span class="ai-act-tx"><small>${esc(verb)}</small><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>${state === 'preview' ? `<button class="ibtn sm" data-tog="${i}" aria-label="${a._off ? t('Incluir') : t('Quitar')}" title="${a._off ? t('Incluir') : t('Quitar')}">${UI.icon(a._off ? 'plus' : 'x', 16)}</button>` : ''}</div>`;
  }

  function paintLog() {
    if (!L) return;
    const box = L.body.querySelector('.ai-log');
    if (!log.length) {
      box.innerHTML = `<div class="ai-intro">${UI.ART.ai}<h3>${t('¿En qué te ayudo?')}</h3><p>${t('Escribe como hablas. Puedo crear, mover o borrar eventos, decirte qué tienes o leer la foto de un cartel.')}</p>
        <div class="ai-sugg stagger">${SUGG().map((s, i) => `<button class="chip" data-s="${esc(s)}" style="--i:${i}">${esc(s)}</button>`).join('')}</div></div>`;
      return;
    }
    box.innerHTML = log.map((m, k) => {
      if (m.role === 'user') return `<div class="msg me">${m.images && m.images.length ? `<div class="msg-imgs">${m.images.map(u => `<img src="${u}" alt="">`).join('')}</div>` : ''}${m.text ? `<div class="bub">${esc(m.text)}</div>` : ''}</div>`;
      const acts = m.actions || [];
      return `<div class="msg ai"><span class="ai-av">${UI.icon('sparkles', 16)}</span><div class="ai-col">
        <div class="bub ${m.state === 'thinking' && !m.text ? 'typing' : ''}">${m.state === 'thinking' && !m.text ? '<i></i><i></i><i></i>' : esc(m.text || '').replace(/\n/g, '<br>')}</div>
        ${acts.length ? `<div class="ai-acts">${acts.map((a, i) => actionCard(a, i, m.state)).join('')}
          ${m.state === 'preview' ? `<div class="ai-btns"><button class="btn sm ghost" data-discard="${k}">${t('Descartar')}</button><button class="btn sm pri" data-apply="${k}">${UI.icon('check', 16)}${(() => { const on = acts.filter(a => !a._off); if (on.length > 1) return t('Aplicar {n} cambios', { n: on.length }); const a = on[0] || {}; return { create: a.event && a.event.kind === 'task' ? t('Crear tarea') : t('Crear evento'), update: t('Guardar el cambio'), delete: t('Borrar evento'), complete: t('Marcar como hecha') }[a.type] || t('Aplicar'); })()}</button></div>` : ''}
          ${m.state === 'applied' ? `<div class="ai-done">${UI.icon('check', 16)}${t('Hecho')}${m.undo ? ` <button class="link" data-undo="${k}">${t('Deshacer')}</button>` : ''}</div>` : ''}
          ${m.state === 'discarded' ? `<div class="ai-done off">${t('Descartado')}</div>` : ''}
        </div>` : ''}
        ${m.error ? `<button class="btn sm soft" data-a="cfg">${UI.icon('settings', 16)}${t('Revisar ajustes del asistente')}</button>` : ''}
      </div></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
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
      m.actions = res.actions || [];
      if (res.error) { m.error = true; m.text = (m.text ? m.text + '\n\n' : '') + '⚠️ ' + res.error; }
      history.push({ role: 'user', content: text }, { role: 'assistant', content: m.text });
      if (m.actions.length) {
        let auto = false; try { auto = !!ZC.ai.getConfig().autoApply; } catch {}
        m.state = 'preview';
        if (auto) { paintLog(); await apply(log.indexOf(m)); }
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
    const acts = m.actions.filter(a => !a._off).map(a => { const x = { ...a }; delete x._off; return x; });
    if (!acts.length) { m.state = 'discarded'; paintLog(); return; }
    const before = new Map();
    for (const a of acts) if (a.id) { const ev = ZC.store.get(a.id); if (ev) before.set(a.id, JSON.parse(JSON.stringify(ev))); }
    const idsBefore = new Set(ZC.store.events().map(e => e.id));
    try {
      await ZC.ai.apply(acts);
      const created = ZC.store.events().filter(e => !idsBefore.has(e.id)).map(e => e.id);
      m.undo = async () => { for (const ev of before.values()) await ZC.store.saveEvent({ ...ev, deleted: false }); for (const id of created) await ZC.store.deleteEvent(id, { mode: 'all' }); };
      m.state = 'applied';
      UI.haptic('ok');
      const btn = L && L.body.querySelector(`[data-apply="${k}"]`);
      if (btn) { const r = btn.getBoundingClientRect(); UI.confetti(r.left + r.width / 2, r.top + r.height / 2, 12); }
      // lleva el calendario a la fecha del primer evento creado o movido
      const first = acts.find(a => a.type === 'create' || (a.type === 'update' && a.changes && a.changes.start));
      if (first) { const s = parse(first.type === 'create' ? first.event.start : first.changes.start); UI.app.go({ date: s, sel: s }); }
    } catch (e) { console.error(e); UI.toast(t('No se han podido aplicar los cambios')); }
    paintLog();
  }

  async function onClick(e) {
    const s = e.target.closest('[data-s]'); if (s) { L.body.querySelector('textarea').value = s.dataset.s; send(); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { const p = pending.splice(+rm.dataset.rm, 1)[0]; if (p) URL.revokeObjectURL(p.url); paintAtt(); return; }
    const tg = e.target.closest('[data-tog]'); if (tg) { const m = [...log].reverse().find(x => x.state === 'preview'); if (m) { const a = m.actions[+tg.dataset.tog]; a._off = !a._off; paintLog(); } return; }
    const ap = e.target.closest('[data-apply]'); if (ap) { apply(+ap.dataset.apply); return; }
    const di = e.target.closest('[data-discard]'); if (di) { log[+di.dataset.discard].state = 'discarded'; paintLog(); return; }
    const un = e.target.closest('[data-undo]'); if (un) { const m = log[+un.dataset.undo]; if (m && m.undo) { await m.undo(); m.undo = null; m.state = 'discarded'; m.text += '\n' + t('(deshecho)'); paintLog(); } return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'close') L.close();
    if (a.dataset.a === 'clear') { log = []; history = []; paintLog(); }
    if (a.dataset.a === 'cfg') { L.close(); UI.settings.open('ai'); }
    if (a.dataset.a === 'img') { const f = await UI.pickFile({ accept: 'image/*', multiple: true }); if (f.length) addImgs(f); }
  }

  UI.aipanel = { open };
})();
