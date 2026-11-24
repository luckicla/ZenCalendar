# Google Calendar con varias cuentas — contrato (versión 1.3.0)

Lluc pide: «que se puedan poner varias cuentas de Google». Y antes: «debería conectarse fácilmente a Google Calendar y al
Drive», «para todo el mundo, todo solo y SUPER sencillo».

## Idea
- **Cuenta principal (Drive)**: la de ahora (`ZC.drive`). Una sola: es el «servidor» que sincroniza ZenCalendar entre
  dispositivos (eventos propios, calendarios, ajustes, cuentas conectadas — sin tokens —). No cambia.
- **Cuentas de Google Calendar**: las que quiera el usuario (la principal también, con un toque). Cada cuenta trae sus
  calendarios de Google como calendarios de ZenCalendar, con su color, y se pueden ocultar uno a uno. **Dos direcciones**:
  crear/editar/borrar en ZenCalendar en un calendario de Google lo hace en Google Calendar, y lo de Google aparece aquí.
- El proyecto de Google Cloud ya está hecho (`zencalendar-515701`): Calendar API activada, permiso
  `https://www.googleapis.com/auth/calendar` declarado, clientes web/escritorio/Android creados. Los ID entran por el workflow
  (`config.js`, no los escribáis a mano en el código).
- Permiso sensible: sale el aviso «Google no ha verificado esta app» hasta que Google la verifique. La interfaz lo explica en
  una línea antes de conectar («Google te enseñará un aviso porque la app aún está en revisión: pulsa *Configuración
  avanzada → Ir a ZenCalendar*»).

## Núcleo (`web/js/core/gcal.js` nuevo + `drive.js`/`platform.js`/`net.js`/`store.js`) — agente BACK
- `ZC.gcal`:
  - `available()` (hay client ID para la plataforma), `accounts()` → `[{ id, email, name, photo, color, calendars: [{ gid, name, color, primary, accessRole, enabled }], lastSync, error }]`
  - `await addAccount()` → inicio de sesión de Google **eligiendo cuenta** (siempre enseña el selector de cuentas) con
    `calendar openid email profile`; trae la lista de calendarios (`calendarList`) y los activa todos menos los de solo
    lectura de festivos/cumpleaños de contactos (esos, desactivados pero visibles en la lista).
  - `await removeAccount(id)` (quita sus calendarios y eventos locales de Google, revoca si se puede)
  - `await setCalendarEnabled(accountId, gid, on)`, `await sync(accountId?)`, `on('state', fn)`
- Cada calendario de Google es un calendario de ZenCalendar con `id: 'g:' + accountId + ':' + gid`, `source: 'google'`,
  `accountId`, `gid`, `readOnly` (si `accessRole` es `reader`/`freeBusyReader`), color de Google.
  Sus eventos: `id: 'g:' + accountId + ':' + googleEventId`, `source: 'google'`, `etag`, `gUpdated`.
- Sincronización incremental con `syncToken` por calendario (y lista completa cuando caduca, 410). Mapeo: título, notas,
  lugar, todo el día (`date` / `dateTime` con zona → hora local flotante), recurrencia (`RRULE`, `EXDATE`; las excepciones
  de Google `recurringEventId` + `originalStartTime` → `recurrenceOf` + exdate), avisos (`reminders.overrides` en minutos;
  `useDefault` → los por defecto del calendario), color de evento (colorId → hex), estado `cancelled` → borrado.
  Cambios locales en un calendario de Google → `events.insert/patch/delete` (con `If-Match` etag; 412 → bajar la versión de
  Google y volver a aplicar si no hay conflicto real, si no gana Google). Las imágenes, la lista de comprobación, el emoji y
  `alarm` se guardan en `extendedProperties.private` (zcAlarm, zcEmoji, zcChecklist) para no perderlos; las imágenes no
  se suben a Google (se quedan en ZenCalendar/Drive).
- Los eventos de Google **no** van al `zencalendar.json` de Drive (se vuelven a bajar de Google en cada dispositivo); lo que
  sí va: la lista de cuentas conectadas (email, calendarios activos, colores) para que en el otro dispositivo salga «Conecta
  también aquí tu cuenta X» con un toque.
- Sincroniza al abrir, al volver a la app, cada 5 min y tras cada cambio (con 2 s de espera). Sin conexión: espera.
- **Tokens por cuenta**:
  - Web: Google Identity Services token client con `hint`/`login_hint` del email y `prompt: 'select_account'` al añadir;
    guarda token por cuenta (caduca 1 h; al caducar, intenta `prompt: ''` con el hint, sin molestar si se puede).
  - Windows (`desktop/google.js`): OAuth con PKCE como ahora, pero con `prompt=select_account consent` al añadir y
    **un refresh token por cuenta** (mapa `{ email: tokenCifrado }` con `safeStorage`). IPC: `google('accounts')`,
    `google('add', cfg)`, `google('token', { ...cfg, account })`, `google('remove', { account })`.
  - Android: `AuthorizationClient` con `AuthorizationRequest.Builder().setAccount(new Account(email, "com.google"))` para
    una cuenta concreta; para añadir, sin `setAccount` (Google enseña el selector). Si hace falta, `AccountManager` no: no
    pidáis permisos de contactos/cuentas. Devuelve `{ token, email }`. Java impecable (sin SDK aquí; stubs en `/tmp/zdot/jc/`).
- La cuenta principal de Drive puede reutilizar su sesión para Calendar pidiendo el permiso extra (incremental) en vez de
  volver a iniciar sesión.
- Tests en `tests/core/gcal.test.js` con un Google Calendar simulado: alta de cuenta, lista, sync inicial e incremental,
  410, crear/editar/borrar en los dos sentidos, recurrencias con excepciones, etag 412, varias cuentas a la vez, quitar cuenta.
- Documentar en `docs/CONTRATO.md` (solo añadir) y en `docs/GOOGLE-SETUP.md` (lo de la verificación y el texto para pedirla).

## Interfaz (`web/js/ui`, `web/css`, `web/index.html`) — agente FRONT
- Ajustes → **Cuentas de Google** (fusiona la tarjeta de Google Drive): arriba la cuenta principal (Drive) con su estado;
  debajo «Google Calendar» con la lista de cuentas (foto, email, estado/última sync, error con «Volver a conectar»), cada una
  desplegable con sus calendarios (casilla, color, «solo lectura»), botón **«Añadir cuenta de Google»** y quitar cuenta. Si la
  cuenta principal no tiene Calendar, un atajo «Usar también tus calendarios de <email>».
- En el panel lateral, los calendarios agrupados por cuenta («ZenCalendar», «ana@gmail.com», «taller@…»), plegables.
- Editor: el selector de calendario agrupa por cuenta; los de solo lectura no se pueden elegir; un evento de Google de solo
  lectura se abre en modo ver (sin editar/borrar), con «Abrir en Google Calendar».
- Bienvenida paso 2: «Conectar con Google» conecta Drive y ofrece en la misma pantalla «¿Traer también tus calendarios de
  Google?» (un interruptor, activado).
- En el otro dispositivo: aviso «En tu otro dispositivo tienes conectada la cuenta X. ¿Conectarla aquí?» (un toque).
- Todo en Zen y en Dot, ES/CA/EN, móvil y PC, sin solapes. Textos cortos, nada de tics de IA.
- Prueba `tests/ui/gcal.js` con `ZC.gcal` simulado (varias cuentas, errores, solo lectura) y que sigan pasando las de siempre
  (`interact regress gestures updates dot welcome fab week ai-alarm` y `QUICK=1 overlap`).

Nadie hace commits ni push.
