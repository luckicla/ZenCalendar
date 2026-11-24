'use strict';
// ZenCalendar · bienvenida (primera vez): elige estilo → conecta Google (opcional) → listo.
(function () {
  const ZC = window.ZC, UI = ZC.ui, t = (...a) => ZC.t(...a);
  const esc = s => UI.esc(s);
  const PICK = ['zen', 'cristal', 'algodon', 'sakura', 'brisa', 'noche'];

  function open() {
    let step = 0, bring = true;
    const L = UI.openLayer({ kind: 'full', cls: 'welcome', panelCls: 'wl-panel', dismissable: false, label: t('Bienvenida'), html: '<div class="wl"></div>' });
    const box = L.body.querySelector('.wl');
    function paint() {
      const dots = `<div class="wl-dots">${[0, 1, 2].map(i => `<i class="${i === step ? 'on' : ''} ${i < step ? 'done' : ''}"></i>`).join('')}</div>`;
      let html = '';
      if (step === 0) {
        const look = UI.look.get();
        html = `<div class="wl-card" data-step="0">
          <img class="wl-logo" src="img/ui/logo.svg" alt="" width="88" height="88">${UI.dot ? UI.dot.logo(88, 'wl-dotlogo') : ''}
          <h1>${t('Hola, esto es ZenCalendar')}</h1>
          <p class="lead">${t('Un calendario tranquilo, bonito y tuyo. Empieza eligiendo un estilo (luego puedes cambiar cada detalle en Ajustes).')}</p>
          ${UI.dot ? UI.dot.designPicker('wl') : ''}
          <div class="wl-presets" ${look.design === 'dot' ? 'hidden' : ''}>${UI.look.PRESETS.filter(p => PICK.includes(p.id)).map(p => {
            const th = UI.look.themeIn(p.set.theme, p.set.scheme === 'dark' ? 'dark' : p.set.scheme === 'light' ? 'light' : UI.look.scheme());
            return `<button class="wl-p ${look.preset === p.id ? 'on' : ''}" data-p="${p.id}" style="--pv-bg:${th.bg};--pv-a1:${th.a1};--pv-a2:${th.a2};--pv-b1:${th.b[0]};--pv-b2:${th.b[1]};--pv-fg:${th.fg}"><span class="wl-sw"><i></i><i></i><i></i></span><b>${esc(t(p.name))}</b><small>${esc(t(p.sub))}</small></button>`;
          }).join('')}</div>
          <div class="seg" id="wlScheme"><button data-v="system" class="${look.scheme === 'system' ? 'on' : ''}">${UI.icon('monitor', 16)}${t('Como el sistema')}</button><button data-v="light" class="${look.scheme === 'light' ? 'on' : ''}">${UI.icon('sun', 16)}${t('Claro')}</button><button data-v="dark" class="${look.scheme === 'dark' ? 'on' : ''}">${UI.icon('moon', 16)}${t('Oscuro')}</button></div>
          <div class="wl-acts"><span></span><button class="btn pri lg" data-go="1">${t('Siguiente')}</button></div></div>`;
      } else if (step === 1) {
        let av = false, s = {}; try { av = ZC.drive.available(); s = ZC.drive.state() || {}; if (av && ZC.drive.prepare) ZC.drive.prepare(); } catch {}
        try { UI.gacc && UI.gacc.prepare(); } catch {}
        const GA = UI.gacc, gc = !!(GA && GA.has());
        const lc = x => String(x || '').toLowerCase();
        const calsIn = gc && s.connected && GA.accounts().some(a => !s.email || lc(a.email) === lc(s.email));
        // «¿Traer también tus calendarios de Google?»: un interruptor, activado
        const calRow = gc && !calsIn ? `<div class="wl-gcal"><label class="wl-gsw"><span class="wl-gtx">${UI.icon('calendar', 20)}<span><b>${t('¿Traer también tus calendarios de Google?')}</b><small>${t('Los verás aquí y lo que cambies se cambia en los dos sitios.')}</small></span></span><button type="button" class="sw" role="switch" data-a="bring" aria-checked="${bring}" aria-label="${t('¿Traer también tus calendarios de Google?')}"></button></label>${bring ? GA.warnLine() : ''}</div>` : '';
        html = `<div class="wl-card" data-step="1">
          <div class="wl-art">${UI.icon('cloudSync', 46)}</div>
          <h1>${t('¿Lo quieres en todos tus dispositivos?')}</h1>
          <p class="lead">${t('Conecta tu Google Drive y tu calendario estará igual en el móvil y en el PC. Se guarda en una carpeta privada de tu Drive, sin servidores de nadie.')}</p>
          ${s.connected ? `<div class="sync-st">${UI.icon('check', 16)}${t('Conectado como {x}', { x: esc(s.email || s.name || '') })}</div>`
              + (calsIn ? `<div class="sync-st">${UI.icon('calendar', 16)}${t('Tus calendarios de Google ya están aquí')}</div>` : gc ? `<button class="btn soft" data-a="cals">${UI.icon('calendar', 18)}${t('Traer también mis calendarios')}</button>${GA.warnLine()}` : '')
            : av ? `<button class="btn lg gbtn" data-a="conn" ${s.syncing ? 'disabled' : ''}>${s.syncing ? '<span class="spin"></span>' : (GA ? GA.LOGO : '')}${t('Conectar con Google')}</button>${calRow}`
            : gc ? `<button class="btn lg gbtn" data-a="cals">${GA.LOGO}${t('Traer mis calendarios de Google')}</button>${GA.warnLine()}`
            : `<p class="note">${UI.icon('info', 15)}${t('Esta versión aún no tiene configurado Google. No pasa nada: todo se guarda en este dispositivo.')}</p>`}
          <div class="wl-acts"><button class="btn ghost" data-go="0">${t('Atrás')}</button><button class="btn ${s.connected ? 'pri' : 'soft'} lg" data-go="2">${s.connected ? t('Siguiente') : t('Seguir sin conectar')}</button></div></div>`;
      } else {
        const mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl';
        html = `<div class="wl-card" data-step="2">
          <div class="wl-art ok">${UI.icon('check', 46)}</div>
          <h1>${t('¡Todo listo!')}</h1>
          <p class="lead">${t('Tres cosas para sacarle partido:')}</p>
          <div class="wl-tips stagger">
            <div style="--i:0">${UI.icon('sparkles', 22)}<span><b>${t('Escribe como hablas')}</b><small>${t('«Dentista el martes a las 5» y se apunta solo, con fecha y hora.')}</small></span></div>
            <div style="--i:1">${UI.icon('bolt', 22)}<span><b>${t('Pídeselo al asistente')}</b><small>${UI.touchy() ? t('Toca los destellos de arriba: «¿qué tengo mañana?», o hazle una foto a un cartel.') : t('{m} + K: «¿qué tengo mañana?», «mueve la reunión al jueves»…', { m: mod })}</small></span></div>
            <div style="--i:2">${UI.icon('palette', 22)}<span><b>${t('Hazlo tuyo')}</b><small>${t('Temas, fondos animados, transparencias, letras… todo en Ajustes.')}</small></span></div>
          </div>
          <div class="wl-acts"><button class="btn ghost" data-go="1">${t('Atrás')}</button><button class="btn pri lg" data-a="done">${t('Empezar a usarlo')}</button></div></div>`;
      }
      box.innerHTML = dots + html;
      requestAnimationFrame(() => box.querySelectorAll('.seg').forEach(UI.paintSeg));
    }
    box.addEventListener('click', async e => {
      const p = e.target.closest('[data-p]'); if (p) { UI.look.applyPreset(p.dataset.p); box.querySelectorAll('.wl-p').forEach(b => b.classList.toggle('on', b === p)); UI.haptic('tick'); return; }
      // (solo las tarjetas del selector: <html> también lleva data-design y lo cogería en cualquier toque)
      const ds = e.target.closest('.dz-card[data-design]'); if (ds && box.contains(ds)) { UI.dot.pick(ds.dataset.design); paint(); UI.haptic('tick'); return; }
      const sc = e.target.closest('#wlScheme [data-v]'); if (sc) { UI.look.set({ scheme: sc.dataset.v }); paint(); return; }
      const g = e.target.closest('[data-go]'); if (g) { step = +g.dataset.go; paint(); return; }
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'bring') { bring = !bring; UI.haptic('tick'); paint(); return; }
      if (a.dataset.a === 'conn') {
        a.disabled = true; a.innerHTML = `<span class="spin"></span>${t('Conectando…')}`;
        let ok = false;
        try { await ZC.drive.connect(); ok = true; } catch (err) { UI.toast(t('No se ha podido conectar: {x}', { x: err.message || err })); }
        // misma cuenta: Google solo pide el permiso del calendario
        if (ok && bring && UI.gacc && UI.gacc.has()) await UI.gacc.useMain();
        paint();
      }
      if (a.dataset.a === 'cals') { a.disabled = true; if (UI.gacc) await UI.gacc.useMain(); paint(); }
      if (a.dataset.a === 'done') {
        ZC.store.local('welcomed', true);
        const r = a.getBoundingClientRect(); UI.confetti(r.left + r.width / 2, r.top + r.height / 2, 30);
        L.close();
        // (el aviso del icono de Dot se guardó para ahora, para no tapar la bienvenida)
        if (UI.dot && UI.dot.on && UI.dot.on()) setTimeout(() => UI.dot.offerIcon(), 900);
      }
    });
    paint();
    cur = { L, repaint: () => { if (!L.closed && step === 1) paint(); } };
  }
  let cur = null;
  UI.welcome = { open, refresh: () => cur && cur.repaint() };
})();
