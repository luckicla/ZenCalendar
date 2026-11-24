'use strict';
// ZenCalendar: el arranque del «backend».
//
//   await ZC.core.init();
// abre la base de datos, carga la caché, prepara la plataforma, programa los
// avisos y arranca la sincronización si ya estaba conectado a Google (Drive y Google Calendar). A partir
// de ahí ZC.store.* responde al momento. Nunca deja la app en blanco: si algo
// de lo de después de la base de datos falla, se apunta en la consola y sigue.
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  let initP = null;

  function init() {
    if (initP) return initP;
    initP = (async () => {
      await ZC.store.init();
      const steps = [
        ['platform', () => ZC.platform.init()],
        ['reminders', () => ZC.reminders.init()],
        ['drive', () => ZC.drive.init()],
        ['gcal', () => ZC.gcal && ZC.gcal.init()],
        ['ws', () => ZC.ws && ZC.ws.init()],
      ];
      for (const [name, fn] of steps) {
        try { await fn(); } catch (e) { console.error('[ZC] falló el arranque de ' + name, e); }
      }
      return ZC;
    })();
    return initP;
  }

  ZC.core = {
    init,
    get version() { return (ZC.platform && ZC.platform.info && ZC.platform.info.version) || (ZC.config && ZC.config.version) || ''; },
    on(type, fn) { if (type === 'open') return ZC.platform.onOpen(fn); return () => {}; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
