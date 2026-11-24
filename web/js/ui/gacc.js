'use strict';
// ZenCalendar · cuentas de Google en la interfaz: Google Calendar con varias cuentas (Ajustes → Cuentas de Google),
// calendarios agrupados por cuenta, eventos de solo lectura y el aviso «conéctala también aquí».
// Todo depende de ZC.gcal (núcleo): si no existe o available() es false, esta parte no se enseña y nada se rompe.
(function () {
  const ZC = window.ZC, UI = ZC.ui, t = (...a) => ZC.t(...a);
  const esc = s => UI.esc(s);
  const LOGO = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  const open = new Set();        // cuentas desplegadas en Ajustes
  let busy = '';                 // 'add' | id de cuenta mientras se conecta/sincroniza/quita

  // ---------- acceso seguro al núcleo ----------
  function G() { const g = ZC.gcal; try { return g && typeof g.available === 'function' && g.available() ? g : null; } catch { return null; } }
  const has = () => !!G();
  const lc = s => String(s || '').toLowerCase();
  // (una cuenta que viene de la lista sincronizada pero aún no tiene sesión en este dispositivo)
  const isRemote = a => !!(a && (a.remote || a.connected === false || a.needsConnect));
  function all() { const g = G(); if (!g) return []; try { return (g.accounts() || []).filter(Boolean); } catch { return []; } }
  const accounts = () => all().filter(a => !isRemote(a));
  function suggested() {
    const g = G(); if (!g) return [];
    let s = [];
    try { s = typeof g.suggested === 'function' ? (g.suggested() || []) : all().filter(isRemote); } catch {}
    const here = new Set(accounts().map(a => lc(a.email)));
    return s.filter(a => a && a.email && !here.has(lc(a.email)));
  }
  // conectar aquí una cuenta del otro dispositivo (o volver a iniciar sesión): reconnect(id); si no, por su email
  async function connectHere(s) {
    const g = G(); if (!g) return null;
    if (s.id && typeof g.reconnect === 'function') {
      if (busy) return null;
      busy = s.id; changed();
      try { const a = await g.reconnect(s.id); UI.toast(t('Calendarios de {x} conectados', { x: s.email }), { icon: 'calendar' }); UI.haptic('ok'); return a || true; }
      catch (e) { UI.toast(t('No se ha podido conectar: {x}', { x: errText(e) })); return null; }
      finally { busy = ''; changed(); }
    }
    return add(s.email);
  }
  function driveState() { try { return (ZC.drive && ZC.drive.state()) || {}; } catch { return {}; } }
  const account = id => accounts().find(a => a.id === id) || null;

  // ---------- calendarios y eventos de Google ----------
  const isGoogle = c => !!c && (c.source === 'google' || /^g:/.test(String(c.id || '')));
  function calEnabled(c) {
    if (!isGoogle(c)) return true;
    if (c.enabled === false) return false;
    const a = account(c.accountId), gc = a && (a.calendars || []).find(x => x.gid === c.gid);
    return !(gc && gc.enabled === false);
  }
  const roRole = c => !!c && (c.readOnly === true || c.accessRole === 'reader' || c.accessRole === 'freeBusyReader');
  function readOnlyCal(c) { return isGoogle(c) && roRole(c); }
  function readOnly(ev) {
    if (!ev) return false;
    if (ev.readOnly) return true;
    let c = null; try { c = ZC.store.calendar(ev.calendarId); } catch {}
    return readOnlyCal(c);
  }
  const roToast = () => { UI.toast(t('Este calendario es de solo lectura'), { icon: 'lock' }); UI.haptic('warn'); };
  /** Calendarios en grupos por cuenta: [{ id, label, acc, cals }]. Sin calendarios de Google, un solo grupo sin título. */
  function groups(cals) {
    const loc = cals.filter(c => !isGoogle(c)), goo = cals.filter(c => isGoogle(c) && calEnabled(c));
    if (!goo.length) return [{ id: 'local', label: '', cals: loc }];
    const out = [{ id: 'local', label: 'ZenCalendar', cals: loc }];
    const accs = accounts(), seen = new Set();
    for (const a of accs) { const cs = goo.filter(c => c.accountId === a.id); seen.add(a.id); if (cs.length) out.push({ id: a.id, label: a.email || a.name || 'Google', acc: a, cals: cs }); }
    const rest = goo.filter(c => !seen.has(c.accountId));
    for (const id of [...new Set(rest.map(c => c.accountId || 'google'))]) { const cs = rest.filter(c => (c.accountId || 'google') === id); out.push({ id, label: cs[0].email || cs[0].accountEmail || 'Google', cals: cs }); }
    return out.filter(g => g.cals.length || g.id === 'local');
  }
  function googleURL(ev) {
    if (ev && ev.htmlLink) return ev.htmlLink;
    const d = ev && ev.start ? String(ev.start).slice(0, 10).split('-').map(Number) : null;
    return 'https://calendar.google.com/calendar/r' + (d && d[0] ? `/day/${d[0]}/${d[1]}/${d[2]}` : '');
  }
  function openURL(url) { try { if (ZC.platform && ZC.platform.kind !== 'web' && ZC.platform.openExternal) { ZC.platform.openExternal(url); return; } } catch {} window.open(url, '_blank', 'noopener'); }

  // ---------- acciones ----------
  const errText = e => (e && (e.message || e)) || t('No se ha podido conectar');
  async function add(email) {
    const g = G(); if (!g || busy) return null;
    busy = 'add'; changed();
    try {
      const a = await g.addAccount(email ? { email, hint: email } : undefined);
      if (a && a.id) open.add(a.id);
      UI.toast(a && a.email ? t('Calendarios de {x} conectados', { x: a.email }) : t('Cuenta conectada'), { icon: 'calendar' });
      UI.haptic('ok');
      return a || true;
    } catch (e) {
      if (!(e && (e.cancelled || e.name === 'AbortError'))) UI.toast(t('No se ha podido conectar: {x}', { x: errText(e) }));
      return null;
    } finally { busy = ''; changed(); }
  }
  async function useMain() {
    const s = driveState();
    const r = s.email && suggested().find(x => lc(x.email) === lc(s.email));   // ya estaba en el otro dispositivo
    return r ? connectHere(r) : add(s.email || undefined);
  }
  async function reconnect(id) {
    const g = G(), a = account(id); if (!g || !a) return;
    if (typeof g.reconnect === 'function') { busy = id; changed(); try { await g.reconnect(id); UI.toast(t('Conectado de nuevo'), { icon: 'check' }); } catch (e) { UI.toast(t('No se ha podido conectar: {x}', { x: errText(e) })); } finally { busy = ''; changed(); } }
    else await add(a.email);
  }
  const needsLogin = a => !!(a.reauth || (a.error && a.reauth == null && /sesi|session|sessi/i.test(String(a.error))));
  async function remove(id) {
    const g = G(), a = account(id); if (!g || !a) return;
    const ok = await UI.confirm(t('¿Quitar {x}?', { x: a.email || t('esta cuenta') }), t('Sus calendarios dejarán de verse aquí. En Google Calendar no se borra nada.'), { ok: t('Quitar'), danger: true });
    if (!ok) return;
    busy = id; changed();
    try { await g.removeAccount(id); open.delete(id); UI.toast(t('Cuenta quitada'), { icon: 'check' }); } catch (e) { UI.toast(errText(e)); } finally { busy = ''; changed(); }
  }
  async function sync(id) { const g = G(); if (!g) return; busy = id; changed(); try { await g.sync(id); } catch (e) { UI.toast(errText(e)); } finally { busy = ''; changed(); } }
  async function setCal(id, gid, on) { const g = G(); if (!g) return; try { await g.setCalendarEnabled(id, gid, on); } catch (e) { UI.toast(errText(e)); } changed(); }

  // ---------- Ajustes → Cuentas de Google: la parte de Google Calendar ----------
  const avatar = a => a.photo ? `<img class="ga-av" src="${esc(a.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="ga-av av" style="--c:${esc(a.color || 'var(--a1)')}">${esc(String(a.name || a.email || '?').trim().charAt(0).toUpperCase())}</span>`;
  function status(a) {
    if (busy === a.id || a.syncing) return `<span class="ga-st busy"><span class="spin"></span>${t('Sincronizando…')}</span>`;
    if (a.error) return `<span class="ga-st err">${UI.icon('info', 14)}${esc(typeof a.error === 'string' ? a.error : t('No se ha podido sincronizar'))}</span>`;
    return `<span class="ga-st">${a.lastSync ? t('Sincronizado {x}', { x: esc(ZC.i18n.D.rel(a.lastSync)) }) : t('Conectada')}</span>`;
  }
  function accHTML(a) {
    const isOpen = open.has(a.id), cals = a.calendars || [];
    const on = cals.filter(c => c.enabled !== false).length;
    return `<div class="gacc ${isOpen ? 'open' : ''} ${a.error ? 'err' : ''}" data-gacc="${esc(a.id)}">
      <button type="button" class="ga-head" data-ga="toggle" aria-expanded="${isOpen}">${avatar(a)}<span class="ga-tx"><b>${esc(a.email || a.name || '')}</b>${status(a)}</span><span class="ga-n">${on}/${cals.length}</span>${UI.icon('chevD', 18, 'ga-chev')}</button>
      ${needsLogin(a) ? `<div class="ga-fix"><button type="button" class="btn sm pri" data-ga="reconnect" ${busy ? 'disabled' : ''}>${UI.icon('refresh', 16)}${t('Volver a conectar')}</button></div>` : ''}
      <div class="ga-body" ${isOpen ? '' : 'hidden'}>
        <div class="ga-cals">${cals.map(c => {
          const ro = roRole(c);
          return `<button type="button" class="ga-cal ${c.enabled === false ? 'off' : ''}" data-ga="cal" data-gid="${esc(c.gid)}" role="switch" aria-checked="${c.enabled !== false}" style="--c:${esc(c.color || '#9AA0B5')}"><span class="cbox">${UI.icon('check', 14)}</span><span class="nm">${esc(c.name || c.gid)}</span>${ro ? `<span class="ga-ro">${UI.icon('lock', 12)}${t('Solo lectura')}</span>` : ''}</button>`;
        }).join('') || `<p class="mut ga-none">${t('Esta cuenta no tiene calendarios.')}</p>`}</div>
        <div class="ga-acts"><button type="button" class="btn sm soft" data-ga="sync" ${busy ? 'disabled' : ''}>${UI.icon('refresh', 16)}${t('Sincronizar ahora')}</button><button type="button" class="btn sm ghost" data-ga="remove" ${busy ? 'disabled' : ''}>${UI.icon('logout', 16)}${t('Quitar cuenta')}</button></div>
      </div></div>`;
  }
  const warnLine = () => `<p class="ga-warn">${UI.icon('info', 14)}<span>${t('Google te enseñará un aviso porque la app aún está en revisión: pulsa «Configuración avanzada» y luego «Ir a ZenCalendar».')}</span></p>`;
  function section() {
    if (!has()) return '';
    const accs = accounts(), d = driveState(), sug = suggested();
    const mainIn = accs.some(a => a.isDrive) || (d.connected && d.email && accs.some(a => lc(a.email) === lc(d.email)));
    const shortcut = d.connected && d.email && !mainIn && !sug.some(s => lc(s.email) === lc(d.email))
      ? `<button type="button" class="ga-short" data-ga="main" ${busy ? 'disabled' : ''}>${UI.icon('calendar', 18)}<span>${t('Usar también tus calendarios de {x}', { x: `<b>${esc(d.email)}</b>` })}</span>${UI.icon('chevR', 16)}</button>` : '';
    const sugg = sug.map(s => `<div class="ga-sug"><span class="ga-av av ghost">${esc(String(s.email).charAt(0).toUpperCase())}</span><span class="ga-tx"><b>${esc(s.email)}</b><small>${t('Conectada en tu otro dispositivo')}</small></span><button type="button" class="btn sm pri" data-ga="connect" data-email="${esc(s.email)}" ${busy ? 'disabled' : ''}>${busy && busy === s.id ? '<span class="spin"></span>' : ''}${t('Conectar')}</button></div>`).join('');
    return `<section class="scard gcal-card">
      <div class="s-h"><h3>${t('Google Calendar')}</h3><p>${t('Tus calendarios de Google, aquí. Lo que cambies se cambia en los dos sitios.')}</p></div>
      ${sugg}${shortcut}
      <div class="ga-list">${accs.map(accHTML).join('')}</div>
      <button type="button" class="btn gbtn ga-add" data-ga="add" ${busy ? 'disabled' : ''}>${busy === 'add' ? '<span class="spin"></span>' : LOGO}${busy === 'add' ? t('Conectando…') : t('Añadir cuenta de Google')}</button>
      ${warnLine()}
    </section>`;
  }
  /** Clic dentro de la sección. Devuelve true si era suyo. */
  function click(e) {
    const b = e.target.closest('[data-ga]'); if (!b) return false;
    const box = b.closest('[data-gacc]'), id = box && box.dataset.gacc, k = b.dataset.ga;
    if (k === 'toggle') { open.has(id) ? open.delete(id) : open.add(id); changed(); }
    else if (k === 'cal') { const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(on)); b.classList.toggle('off', !on); UI.haptic('tick'); setCal(id, b.dataset.gid, on); }
    else if (k === 'add') add();
    else if (k === 'main') useMain();
    else if (k === 'connect') { const s = suggested().find(x => x.email === b.dataset.email); connectHere(s || { email: b.dataset.email }); }
    else if (k === 'reconnect') reconnect(id);
    else if (k === 'sync') sync(id);
    else if (k === 'remove') remove(id);
    return true;
  }

  // ---------- avisos ----------
  const listeners = new Set();
  function changed() { listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); }
  const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  // «En tu otro dispositivo tienes conectada la cuenta X. ¿Conectarla aquí?» (una vez por cuenta en este dispositivo)
  function hint() {
    if (!has() || !ZC.store.local('welcomed')) return;
    const shown = ZC.store.local('gcal.hinted') || [];
    const s = suggested().find(x => !shown.includes(lc(x.email)));
    if (!s) return;
    ZC.store.local('gcal.hinted', [...shown, lc(s.email)]);
    UI.toast(t('En tu otro dispositivo tienes conectada {x}. ¿La conectas aquí?', { x: s.email }), { icon: 'calendar', ms: 12000, action: { label: t('Conectar'), fn: () => connectHere(s) } });
  }

  // ---------- arranque ----------
  function init() {
    const g = ZC.gcal;
    if (g && typeof g.on === 'function') { try { g.on('state', changed); } catch (e) { console.warn(e); } }
    const ready = () => document.documentElement.classList.contains('ready');
    onChange(() => { if (!ready()) return; try { UI.side && UI.side.render(); } catch {} try { UI.settings && UI.settings.onDrive && UI.settings.onDrive(); } catch {} try { UI.welcome && UI.welcome.refresh && UI.welcome.refresh(); } catch {} });
    let hT = 0; const later = ms => { clearTimeout(hT); hT = setTimeout(() => { if (ready()) hint(); else later(1500); }, ms); };
    onChange(() => later(1500));
    later(2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else setTimeout(init, 0);

  // (web: que la ventanita de Google salga al momento al pulsar)
  function prepare() { const g = G(); try { g && g.prepare && g.prepare(); } catch {} }
  UI.gacc = { prepare, connectHere, has, accounts, suggested, groups, isGoogle, readOnly, readOnlyCal, roToast, googleURL, openURL, section, click, add, useMain, onChange, warnLine, LOGO, hint };
})();
