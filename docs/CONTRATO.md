# ZenCalendar — contrato entre frontend y backend

ZenCalendar (ZCalendar) es un calendario para **Android y Windows** (y, de regalo, la web en GitHub Pages) con la misma
interfaz en todos. Es la primera app de una suite (después vendrán reloj y recordatorios). Autor: **luckicla** (Lluc).
Inspirado en su otra app, MixUp (`github.com/luckicla/zentor`): HTML + CSS + JS sin frameworks, sin build, scripts
clásicos (no módulos ES) y todo colgado de un objeto global. Aquí el global es `window.ZC`.

Idioma de la interfaz, el código comentado y la documentación: **español** (con inglés y catalán como opción de idioma en la interfaz).

Sin WiFi ni servidor propio: la **sincronización entre dispositivos va solo por Google Drive** del usuario
(carpeta oculta `appDataFolder`), con un único botón «Conectar con Google». El usuario no tiene que configurar nada.

## Estructura de carpetas y quién hace qué

```
assets/logo.svg                 logo maestro (ya hecho, no cambiar el diseño)
assets/fonts/ZenDot.*           BACKEND (fuente de puntos del diseño Dot, licencia OFL en OFL.txt; la genera tools/mkfont.py, que deja copias en web/fonts/, docs/fonts/ y android res/font/ y escribe los mismos dibujos en las matrices SVG de web/js/ui/dot.js y docs/js/dot.js)
web/                            la interfaz compartida (Android la lleva dentro, Windows también, y se publica en Pages)
  index.html                    FRONTEND
  widget.html                   FRONTEND  (widget de escritorio de Windows: agenda mini, transparente)
  css/*.css                     FRONTEND
  js/ui/*.js                    FRONTEND
  js/core/*.js                  BACKEND
  img/                          BACKEND (iconos generados por tools/mkicons.py; el FRONTEND puede añadir web/img/ui/)
  fonts/ZenDot.woff             BACKEND (copia de assets/fonts/; la usa el diseño Dot: css/dot.css + js/ui/dot.js)
  manifest.webmanifest, sw.js   BACKEND (PWA para la versión web)
android/                        BACKEND (app Java con WebView, widgets, alarmas, login Google)
desktop/                        BACKEND (Electron: ventana sin marco, bandeja, OAuth, widget de escritorio)
tools/mkicons.py                BACKEND (PNG/ICO/mipmaps a partir de assets/logo.svg + variantes de color)
tools/mkfont.py                 BACKEND (la fuente ZenDot del diseño Dot, con fontTools)
.github/workflows/              BACKEND (APK + instalador/portable de Windows como MixUp, y Pages)
README.md, docs/GOOGLE-SETUP.md BACKEND
tests/                          cada uno los suyos (node para core, playwright para la UI)
```

Nadie escribe en las carpetas del otro. Si necesitas algo del otro lado, déjalo apuntado en `docs/PENDIENTES.md`
(sección «Para frontend» / «Para backend») y sigue con un apaño local en tu propio lado.

## Orden de carga (index.html)

Scripts clásicos, en este orden, sin `type=module`:

```
js/core/config.js util.js i18n-core? (no: i18n es del frontend) store.js recur.js holidays.js nlp.js net.js
js/core/platform.js reminders.js drive.js ai.js core.js
js/ui/...   (los que decida el frontend; el último arranca la app)
```

El frontend arranca con:

```js
await ZC.core.init();   // abre la base de datos, carga la caché, programa recordatorios, arranca la sync si ya estaba conectado
// a partir de aquí ZC.store.* ya responde de forma síncrona con la caché
```

## Formato de los datos

Fechas **locales «flotantes»** en texto (como Google Calendar con eventos sin zona): `'YYYY-MM-DDTHH:mm'`
para eventos con hora y `'YYYY-MM-DD'` para eventos de todo el día. Marcas de tiempo internas en ms (`Date.now()`).

### Evento / tarea

```js
{
  id: 'uuid',
  kind: 'event' | 'task',          // task = recordatorio/tarea con casilla
  title: '', notes: '', location: '',
  calendarId: 'personal',
  color: null | '#rrggbb',         // null = el color del calendario
  emoji: null | '🎂',
  allDay: false,
  start: '2026-11-27T21:30',       // allDay: '2026-11-27'
  end:   '2026-11-27T23:00',       // allDay: último día INCLUSIVO, '2026-11-27'. Tareas: end = start
  rrule: null | { freq: 'daily'|'weekly'|'monthly'|'yearly', interval: 1,
                  byDay: ['MO','WE'] | null,          // weekly
                  monthMode: 'day' | 'weekday',       // monthly: el día 15 / el tercer martes
                  until: 'YYYY-MM-DD' | null, count: null | n },
  exdates: ['YYYY-MM-DD'],         // repeticiones quitadas
  recurrenceOf: null | 'id',       // «solo este» de una serie: copia suelta + exdate en la serie
  reminders: [10, 60],             // minutos antes (0 = a la hora). Todo el día: relativo a las 09:00 de ese día
  attachments: [{ id, name, type, w, h }],   // imágenes: el blob está en ZC.store (putBlob)
  checklist: [{ id, text, done }],
  done: false, doneAt: null,       // tareas
  created: ms, updated: ms, deleted: false   // deleted = lápida para la sync
}
```

### Calendario

```js
{ id, name, color: '#rrggbb', visible: true, order: 0, updated: ms, deleted: false }
```

Por defecto: `personal` (Personal), `work` (Trabajo), `birthdays` (Cumpleaños).

### Preferencias (sincronizadas por Drive)

`ZC.store.getPrefs()` devuelve un objeto con esta forma (cada sección la define su dueño):

```js
{
  look: { ... },   // FRONTEND: tema, transparencias, fondo, fuentes, animaciones… (MixUp-style)
                   // design: 'zen' | 'dot' (Zen por defecto); con Dot, dotAccent, dotBg, dotGap, dotGlass, dotBlur, dotColors, dotFont, dotSpeed
  cal:  { firstDay: 1, weekNumbers: false, timeFormat: '24', defaultView: 'month',
          defaultDuration: 60, defaultReminders: [10], holidays: 'ES' | 'none', lang: 'auto' },  // FRONTEND decide valores, BACKEND lee holidays/defaultReminders
  ai:   { provider: 'rules', model: '', baseUrl: '', autoApply: false },  // BACKEND (ZC.ai)
  _updated: ms
}
```

Las claves de API **nunca** se sincronizan: van solo en el dispositivo (`ZC.store.local`).

## API de `ZC` (BACKEND la implementa, FRONTEND la usa)

### `ZC.util`
`uid()`, `pad(n)`, `ymd(date)` → `'YYYY-MM-DD'`, `toLocal(date, allDay)` → texto de arriba, `parse(str)` → `Date`,
`addDays(date, n)`, `addMinutes(date, n)`, `startOfDay(date)`, `startOfWeek(date, firstDay)`, `sameDay(a, b)`,
`daysBetween(a, b)`, `isoWeek(date)`, `esc(str)` (HTML), `debounce(fn, ms)`, `clamp(v, a, b)`.

### `ZC.store`
- `await init()` (lo llama `ZC.core.init`)
- `events()` → eventos y tareas sin borrar · `calendars()` → ordenados · `get(id)` · `calendar(id)`
- `await saveEvent(partial)` → rellena `id/created/updated`, devuelve el evento guardado
- `await deleteEvent(id, { mode: 'all' | 'one' | 'future', date })` (series: solo esta / esta y siguientes / todas)
- `await saveEventOccurrence(id, date, changes)` → «solo esta» de una serie (crea la copia + exdate)
- `await toggleDone(id)` (tareas)
- `await saveCalendar(partial)` · `await deleteCalendar(id)` (borra también sus eventos)
- `occurrences(from: Date, to: Date, { includeHidden=false, includeTasks=true })` → instancias expandidas y ordenadas:
  `{ key: id + '@' + 'YYYY-MM-DD', id, ev, start: Date, end: Date, allDay, color, calendar, isTask, done }`
- `search(text)` → eventos que coinciden (título, notas, lugar)
- `getPrefs()` · `await setPrefs(patch)` (fusión superficial por sección: `setPrefs({ look: {...} })` sustituye `look`)
- `local(key[, value])` → almacenamiento solo de este dispositivo (localStorage con prefijo `zc.`)
- Imágenes: `await putBlob(blob, { name })` → id · `await getBlob(id)` → Blob|null · `await blobURL(id)` → objectURL (cacheado) · `await deleteBlob(id)`
- `on('change', fn)` → `fn({ type: 'events'|'calendars'|'prefs'|'blobs', source: 'local'|'sync'|'window' })`
  (entre ventanas de la misma app se avisa con `BroadcastChannel('zencalendar')`, así el widget de escritorio se entera)
- `exportJSON()` → objeto · `await importJSON(obj, { merge: true })`

### `ZC.recur`
`expand(ev, from, to)` → `[{ start: Date, end: Date }]` · `describe(rrule, lang)` → «Cada semana, lunes y miércoles».

### `ZC.holidays`
`between(from, to, country='ES')` → `[{ date: 'YYYY-MM-DD', name }]` (fiestas nacionales de España, con Semana Santa calculada).

### `ZC.ics`
`parse(text)` → eventos en nuestro formato · `build(events)` → texto `.ics`.

### `ZC.nlp` (sin internet, instantáneo)
`parse(text, { now = new Date(), lang = 'es' })` →
`{ kind, title, start, end, allDay, location, reminders, rrule, confidence }` o `null`.
Entiende español e inglés: «mañana a las 5 dentista», «cena con Marta el viernes 21:30 en Casa Pepe»,
«cada lunes gimnasio a las 7 de la tarde», «recuérdame comprar pan», «del 3 al 7 de diciembre vacaciones»,
«en 2 horas llamar a mamá», «25 dic Navidad», «avísame 30 min antes»…

### `ZC.platform`
- `kind` → `'android' | 'desktop' | 'web'`
- `hasTitlebar` → true en Windows (ventana sin marco: el frontend dibuja su barra con minimizar/maximizar/cerrar y la zona arrastrable `-webkit-app-region: drag`)
- `win.minimize()`, `win.maximize()` (alterna), `win.close()`, `win.onState(fn({ max }))`
- `setTheme({ bg, surface, fg, muted, a1, a2, a3, light, alpha, radius })` → el FRONTEND la llama cada vez que cambia el aspecto;
  el BACKEND la usa para la barra de estado de Android, los widgets y el widget de escritorio
- `openExternal(url)` · `share({ title, text })`
- `appIcons` → `[{ id, name, src }]` (src en `web/img/icons/<id>.png`) · `setAppIcon(id)` (Android: activity-alias; Windows: icono de la ventana/bandeja)
- `desktopWidget(on)` / `desktopWidgetOn()` (solo Windows) · `setAutostart(on)` / `autostart()` (solo Windows)
- `onOpen(fn({ action: 'new' | 'open' | 'day' | 'ai', id, date }))` → al tocar un widget o una notificación
- `notifyPermission()` → pide permiso de notificaciones si hace falta
- `canPinWidget()` / `pinWidget(kind)` (Android 8+: añadir widget a la pantalla de inicio desde la app)
- (diseño Dot) `setTheme({ ..., design: 'zen' | 'dot', accent })`: `design` se reenvía siempre a Android y a Windows
  (si falta o no se entiende, `'zen'`); `accent` (opcional, `#rgb`/`#rrggbb`) es el acento de Dot (en los widgets de
  Android, si falta, el rojo `#D71921`). Con `'dot'`: widgets de Android monocromos (negro/blanco según `light`) con la
  fecha y las horas en ZenDot, barras del sistema opacas con `bg`, y en Windows ventana opaca sin Mica ni acrílico.
  `ZC.platform.design` → el `design` del último `setTheme`.
- (diseño Dot) `appIcons` lleva también `design` (`'zen'` | `'dot'`); hay un icono `dot` (`img/icons/dot.png`).
- (diseño Dot) `haptic('glyph')`: dos golpecitos secos y cortos.

### `ZC.reminders`
Lo maneja el backend solo: cuando cambia algo calcula los próximos avisos y se los da a la plataforma
(Android: AlarmManager; Windows: temporizadores en el proceso principal aunque la ventana esté cerrada en la bandeja;
web: Notification mientras la pestaña está abierta). También refresca los widgets.
`snoozeOptions` y `next(n)` → próximos avisos, por si el frontend los quiere enseñar.

### `ZC.drive`
- `available()` → hay client ID para esta plataforma (si no, el botón sale gris con «Falta configurar Google», ver docs/GOOGLE-SETUP.md)
- `state()` → `{ connected, email, name, photo, lastSync: ms|null, syncing, error: null|'texto' }`
- `await connect()` → inicio de sesión de Google (un toque) y primera sync
- `await disconnect()` · `await sync()` · `on('state', fn)`
- La sync es automática: al abrir, al cambiar algo (con 3 s de espera), cada 2 min y al volver a la app.
  Fusión por elemento con `updated` (gana el más nuevo), lápidas para lo borrado, las imágenes como archivos aparte.

### `ZC.ai`
- `providers` → `[{ id, name, free, offline, needsKey, keyUrl, defaultModel, vision, desc }]`:
  `rules` (integrado, sin internet), `device` (modelo abierto privado en el dispositivo con WebGPU, se descarga solo),
  `ollama` (PC), `gemini` (gratis con clave), `groq` (gratis con clave), `openrouter` (modelos gratis), `openai`,
  `anthropic`, `mistral`, `custom` (cualquier URL compatible con OpenAI)
- `getConfig()` → `{ provider, model, baseUrl, autoApply, hasKey }` · `setConfig(patch)` · `setKey(provider, key)` · `hasKey(provider)`
- `await test()` → `{ ok, message }`
- `await run(text, { images: [Blob], history, onToken })` →
  `{ reply: 'texto para enseñar', actions: [...], provider }`, acciones:
  `{ type: 'create', event }`, `{ type: 'update', id, changes }`, `{ type: 'delete', id }`, `{ type: 'complete', id }`
  (no las aplica: el frontend enseña una vista previa)
- `await apply(actions)` → aplica en el store y devuelve los eventos afectados
- Modelo en el dispositivo: `device.supported()` · `device.status()` → `{ ready, downloading, progress, model, sizeMB }` ·
  `await device.download(onProgress)` · `await device.remove()` · `device.models`
- `await ollamaModels()` → nombres de modelos instalados en Ollama (PC)

### `ZC.core`
`await init()` · `version` · `on('open', fn)` (reexporta `platform.onOpen`).

## Lo que el FRONTEND tiene que hacer (resumen)
Interfaz preciosa, con **transparencias (vidrio esmerilado) y animaciones suaves** (transiciones entre vistas y meses,
aparición de tarjetas con muelle, hoja inferior en móvil, respeta `prefers-reduced-motion` y un ajuste de animaciones).
Vistas Mes, Semana, Día, Agenda y Año; arrastrar para mover/crear/redimensionar; deslizar para cambiar de mes en móvil;
editor de eventos y tareas (repetición, avisos, imágenes, lista, emoji, color, lugar con enlace a mapas);
barra de «añadir rápido» con `ZC.nlp` y botón de IA (`ZC.ai`) con vista previa de cambios y foto → eventos;
buscador; calendarios con colores; importar/exportar `.ics` y copia JSON; pantalla de Google Drive;
**Ajustes con tanta personalización como MixUp** (temas, estilos ya hechos, acentos, claro/oscuro/sistema, colores desde la
imagen de fondo, imagen de fondo con desenfoque y atenuado, transparencia de cada panel, desenfoque del vidrio, esquinas,
fuentes, sombras, densidad, animaciones, texto del logo, icono de la app, mantener pulsado = vista previa);
`widget.html` para el widget de escritorio. Llama a `ZC.platform.setTheme(...)` al cambiar el aspecto.

## Lo que el BACKEND tiene que hacer (resumen)
Todo `js/core/` de arriba; `android/` (WebView con WebViewAssetLoader, puente `ZCAndroid`, notificaciones con AlarmManager
que sobreviven a reinicios, login con Google `AuthorizationClient` para Drive, widgets «Agenda» y «Hoy» con transparencia
y colores del tema, iconos alternativos por activity-alias, selector de imágenes del WebView, barra de estado);
`desktop/` (Electron, protocolo propio `app://`, ventana sin marco, bandeja, OAuth de Google en el navegador con PKCE y
token guardado con `safeStorage`, avisos aunque esté en la bandeja, widget de escritorio con `widget.html`, arranque con
Windows, actualización sola desde Releases, instalador + portable); iconos; workflows; README y guía de Google Cloud.

## Estética (MUY IMPORTANTE): cute, pastel, como las últimas apps de Lluc

Referencias en disco (solo lectura, para inspirarse; se puede copiar y adaptar código de ahí porque es del mismo autor):
- `/home/claude/ref/compass-launcher/` → **Compass Launcher**: `theme.css`, `theme.js`, `app.css`, capturas en `docs/img/*.webp`.
  De aquí sale la forma de manejar el fondo y las transparencias: un **fondo animado dibujado en código** (canvas, nada
  descargado) detrás de **paneles de vidrio** (`--glass: color-mix(in srgb, var(--s1) var(--ga), transparent)` +
  `backdrop-filter: blur(var(--gb)) saturate(1.2)`), con ajustes de *cantidad de vidrio*, *desenfoque* y *oscurecer fondo*;
  cada tema tiene versión **clara y oscura** (Como el sistema / Claro / Oscuro); tarjetas de tema con franjas de colores;
  colores de acento en puntitos; los **Ajustes en una hoja flotante** encima de la app con menú a la izquierda;
  transición animada entre zonas; ventana sin marco con la barra propia (logo · navegación · botones de ventana).
- `/home/claude/ref/zentor/` → **MixUp**: `web/settings.js` (temas, estilos ya hechos, acentos a1/a2/a3, colores sacados
  de una imagen con `paletteFromImage`, transparencia por panel `sideAlpha/mainAlpha`, desenfoque y atenuado del fondo,
  esquinas, fuentes, sombras, mantener pulsado = vista previa), `web/style.css`, `android/` (WebView + puente Java),
  `desktop/` (Electron) y `.github/workflows/android.yml` (cómo compila APK + exe + instalador y publica en Releases).

ZenCalendar coge esa base pero con identidad propia **«zen», cute y pastel**: lavanda `#C9B8FF`, rosa `#FFC8E3`,
menta `#BFF0E4`, melocotón, amarillo mantequilla, cielo; texto oscuro ciruela `#3D3355` en claro. Esquinas muy redondas,
sombras suaves y coloreadas, nada agresivo. Fondos animados suaves (no pixel art): manchas de color que flotan (aurora
pastel), pétalos de sakura, nubes, burbujas, estrellitas de noche, olas, liso. Temas sugeridos: Nube (por defecto, pastel
claro), Sakura, Menta, Lavanda, Melocotón, Cielo, Noche pastel (oscuro), Aurora, Algodón de azúcar, Matcha… cada uno con
claro y oscuro. El logo (`assets/logo.svg`) es minimalista y profesional: squircle con degradado lavanda → rosa, una página de
calendario blanca con dos pestañas y una «Z» en degradado. Úsalo tal cual en la barra y en la bienvenida (el frontend puede
copiarlo a `web/img/ui/logo.svg`). La interfaz es pastel y suave, pero elegante, no infantil.

La web de presentación va en `docs/` (la hace un tercer agente) y se publica en `https://luckicla.github.io/ZenCalendar/`;
la app web en `https://luckicla.github.io/ZenCalendar/app/` (copia de `web/`).

## IA que borra y alarmas (1.2.0)

Encargo completo en `docs/IA-ALARMAS.md`. Lo que añade el núcleo:

### Datos
- Evento / tarea: `alarm: false | true` (por defecto `false`) y `alarmTime: null | 'HH:mm'` (solo en los de todo el día;
  `null` = 09:00). Una alarma suena **a la hora de inicio** como un despertador; los `reminders` siguen aparte (si un aviso
  cae a la misma hora que la alarma, solo suena la alarma). `ZC.store` los normaliza y viajan por Drive como cualquier campo.

### `ZC.nlp`
- `parse(...)` devuelve además `alarm` y `alarmSuggested` (booleanos). `alarm` con «despiértame / despertador / pon una alarma /
  con alarma / que suene / wake me up / alarm / desperta'm…»; `alarmSuggested` con «importante, urgente, sin falta, no me lo
  puedo perder, can't miss, sense falta…» o con un vuelo/examen/entrevista… a una hora concreta. «Despiértame a las 7» →
  «Despertarse» («Wake up», «Despertar-se») a las 07:00 de mañana (o de hoy si aún no han dado), 15 min, `reminders: []`.
- `parseCommand(text, { now, lang, calendars?, firstDay? })` → `null` o
  `{ intent: 'delete', filter: { from: Date|null, to: Date|null (exclusivo), calendarId, text, kind: 'event'|'task'|null }, all, weak }`.
  `weak`: la frase empieza por un infinitivo («borrar el disco duro el lunes» puede ser una tarea): el integrado, si no
  encuentra nada que borrar, la apunta como tarea. «Limpia/vacía…» solo vale para días o calendarios («limpia la cocina» → `null`).

### `ZC.ai`
- Acciones: `{ type: 'create', event, cid }` · `{ type: 'update', id, changes }` · `{ type: 'update', ref, refId, changes }`
  (`ref` = índice del `create` de la misma respuesta, `refId` = su `cid`; `apply` usa `refId`, así se pueden quitar acciones
  de la lista) · `{ type: 'delete', id, mode?: 'all'|'one'|'future', date?: 'YYYY-MM-DD' }` (`mode`/`date` solo en series;
  en una serie sin `mode`, `'all'`) · `{ type: 'complete', id }`.
- Cualquier acción puede llevar `suggest: true` y `why: 'texto corto'`: es una sugerencia (desmarcada en la vista previa).
  `apply` se salta las que sigan con `suggest: true`; el frontend se lo quita a las que el usuario acepta.
- `run` devuelve `confirmMany: true` cuando hay más de 20 borrados (`ZC.ai.MANY_DELETES`).
- Integrado (`rules`): «quita todo lo de mañana», «borra la reunión del lunes», «quita lo del gimnasio de esta semana»,
  «vacía el viernes», «delete everything tomorrow», «esborra-ho tot de demà»… → un `delete` por cosa (en una serie, `mode: 'one'`
  + `date` por repetición, o `mode: 'all'` si la serie entera cae dentro). Sin fechas, «borra el dentista» = el más cercano a
  hoy y «borra todas las reuniones» = todas. Si crea algo con `alarmSuggested`, añade la sugerencia de alarma.
- `apply(actions)` → lo creado/cambiado como queda y lo borrado como estaba antes: `deleted: true` (entero, con las copias
  sueltas de la serie) o `removedDate` + `removedMode` (una vez por serie, como estaba antes del primer cambio).

### `ZC.reminders`
- `compute()` / `next(n)` incluyen las alarmas: `{ id: '<id>@<día>#alarm', eventId, date, at, minutes: 0, alarm: true, title, body, task, color }`.
- `_action({ type: 'stop', reminder })`: «Parar» una alarma (no vuelve a sonar). `'snooze'` y `'done'` como siempre.
- Textos para la plataforma (`strings`): además `stop`, `alarm`, `alarmChannel`.

### Plataformas
- Android: canal «Alarmas» (`alarmas`, importancia alta, sonido de alarma con `USAGE_ALARM`, vibración larga),
  `AlarmManager.setAlarmClock`, notificación de categoría `ALARM`, insistente y fija con «Posponer 10 min» y «Parar»,
  pantalla completa encima del bloqueo (`AlarmActivity`) si `canUseFullScreenIntent()`, y vuelve a programarse al reiniciar.
- Windows: `zcDesktop.setReminders` recibe también las alarmas: notificación con sonido que no se va sola
  (`timeoutType: 'never'`, `urgency: 'critical'`) y, si la ventana está oculta, la enseña. Botones «Posponer 10 min» y «Parar».
- Web: `Notification` con `requireInteraction: true` y `vibrate`; botones «Posponer» y «Parar» (acción `stop`).

## Google Calendar con varias cuentas (1.3.0)

Encargo completo en `docs/GOOGLE-CALENDAR.md`. Núcleo en `web/js/core/gcal.js` (se carga después de `drive.js`);
`web/js/core/gcal-mock.js` es un Google Calendar simulado que solo se carga con `ZC.gcal._mock()` (y en las pruebas).

### `ZC.gcal`
- `available()` → hay client ID para esta plataforma (en la web, además, https o localhost).
- `accounts()` → `[{ id, email, name, photo, color, calendars: [{ gid, id, name, color, primary, accessRole, readOnly, enabled }],
  connected, lastSync: ms|null, error: null|'texto', reauth, syncing, isDrive, added }]`
  - `connected: false`: la cuenta está conectada en otro dispositivo (la lista llega por Drive) y aquí aún no → `reconnect(id)`.
  - `reauth: true`: hay que volver a iniciar sesión (`error` trae el texto) → `reconnect(id)`.
  - `isDrive`: es la misma cuenta que la principal de Drive. `calendars[].id` es el id del calendario en `ZC.store`.
- `await addAccount()` → selector de cuentas de Google, permiso `calendar openid email profile`, trae `calendarList` (todos
  activados menos los de solo lectura de `group.v.calendar.google.com`: festivos, cumpleaños de contactos, números de
  semana) y hace la primera sync. `await addAccount({ email })` → esa cuenta sin selector (la de Drive: permiso incremental;
  «Volver a conectar»). Devuelve la cuenta. Errores con `message` para enseñar (cancelado, sin permiso, «Has elegido otra cuenta»).
- `await reconnect(id)` · `await removeAccount(id)` (quita aquí sus calendarios y eventos, no toca nada en Google; revoca el
  permiso salvo si es la cuenta de Drive, porque revocar cortaría también Drive; y como la lista viaja por Drive, se quita en
  todos los dispositivos) · `await setCalendarEnabled(id, gid, on)` · `await sync(id?)` · `on('state', fn(accounts))` ·
  `state()` → `{ available, syncing, accounts }` · `prepare()` (web: carga ya Google Identity Services).
- Sincroniza al abrir, al volver a la app (`visibilitychange`/`zc-resume`, si hace más de 1 min), cada 5 min, 2 s después de
  cada cambio en un calendario de Google, y al volver la conexión. Sin conexión espera (y reintenta al minuto).

### Datos
- Calendario de Google en `ZC.store`: `{ id: 'g:<cuenta>:<gid>', name, color, visible, order (≥ 100), source: 'google',
  accountId, gid, gkey, email, readOnly, primary, accessRole }`. `visible` es de cada dispositivo; el color que se cambie aquí
  se guarda en la cuenta (`customColor`) y viaja por Drive. `deleteCalendar('g:…')` = `setCalendarEnabled(…, false)`.
- Evento de Google: los campos de siempre + `source: 'google'`, `accountId`, `gid`, `gEventId`, `etag`, `gUpdated`,
  `htmlLink`, `readOnly`, y la contabilidad de la sync (`gBase` = cómo estaba en Google la última vez, `gSynced`,
  `gInstEx`, `gSeries`, `gError`). El id es `'g:<cuenta>:<calendario>:<id de Google>'` (o `…:z<uuid>` si se creó aquí):
  **no se parsea**; se usan los campos. Desviación del encargo: lleva también el calendario porque un mismo evento de Google
  (una invitación) puede estar en dos calendarios de la misma cuenta con el mismo id.
- `saveEvent({ calendarId: 'g:…' })` sin id pone el id y la ficha de Google; algo nuevo nunca hereda la ficha de otro evento
  (duplicar es seguro). Mover entre calendarios con `saveEvent({ id, calendarId })`: entre calendarios de la misma cuenta
  usa `events.move`; entre cuentas, alta en una y baja en la otra; de ZenCalendar a Google (y al revés) el evento se rehace con
  otro id (el viejo queda como lápida para Drive).
- Nada de Google va al `zencalendar.json` de Drive (`ZC.store.snapshot({ drive: true })`, `driveOnly()`), ni a
  `exportJSON()`. Por Drive viaja `prefs.gcal = { accounts: { [id]: { id, email, name, photo, color, calendars: [{ gid, name,
  color, customColor, primary, accessRole, enabled }], added, updated, removed } } }` (sin tokens), que se junta cuenta a
  cuenta (gana el `updated` más nuevo; quitar = `removed: true`).
- Lo de este dispositivo: `ZC.store.local('gcal')` (syncTokens por calendario, última sync, error) y, en la web,
  `local('gcal.tok')` (tokens de 1 hora por cuenta).

### Correspondencia con Google Calendar (API v3)
- Título ↔ `summary`; notas ↔ `description` (el HTML de Google se lee como texto); lugar ↔ `location`.
- Con hora: `dateTime` (cualquier zona) → hora local flotante; al subir `dateTime` sin desfase + `timeZone` del dispositivo.
  Todo el día: `date` con fin exclusivo ↔ `end` inclusivo.
- Repetición: una `RRULE` que ZenCalendar sabe repetir (diaria, semanal con días, mensual por día o por «el tercer martes»,
  anual, `INTERVAL`, `COUNT`, `UNTIL`) + `EXDATE` ↔ `rrule` + `exdates`. Al subir, `UNTIL` en UTC y `EXDATE;TZID=…`.
  Las series que ZenCalendar no sabe repetir (varias `RRULE`, `RDATE`, `BYMONTHDAY=1,15`…) llegan como apariciones sueltas
  (de hace un año a dentro de dos, con `gSeries`), que se pueden editar o borrar una a una.
- Excepciones de Google (`recurringEventId` + `originalStartTime`) ↔ «solo esta» (`recurrenceOf` + `recurrenceDate`, y exdate
  en la serie). Una aparición cancelada ↔ exdate. Al subir: «solo esta» → `instances?originalStart=` + `PATCH` de esa
  aparición; quitar una repetición → `DELETE` de esa aparición; «esta y siguientes» → `UNTIL`.
- Avisos ↔ `reminders.overrides` (popup, máx. 5; `useDefault` → los del calendario). En los de todo el día Google cuenta desde
  las 00:00 y ZenCalendar desde las 09:00 (se convierte; los exactos se guardan en `zcRem`).
- Color ↔ `colorId` (el más cercano; el exacto se guarda en `zcColor`).
- `extendedProperties.private`: `zcKind`, `zcDone`, `zcDoneDates`, `zcEmoji`, `zcAlarm`, `zcAlarmTime`, `zcRem`, `zcColor`,
  `zcChecklist*` y `zcAtt*` (en trozos de 1000 letras). Las imágenes no se suben a Google: `zcAtt` lleva solo su id/nombre/medidas
  y el archivo va por Drive como las demás.
- Subida: primero lo de aquí y luego lo de Google. Se manda solo lo cambiado (respecto a `gBase`) con `If-Match`; si Google
  contesta 412 se baja su versión y se junta campo a campo: lo nuestro que Google no tocó se vuelve a subir, en un choque
  gana Google. Borrado aquí y cambiado en Google → vuelve lo de Google. Cambiado aquí y borrado en Google → borrado.
  Un cambio en un calendario de solo lectura se deshace. Lo que Google rechaza (400/403) se queda aquí, no se reintenta en
  bucle y sale en `error` de la cuenta. 401 → token nuevo una vez; 429/5xx → reintentos con espera.
- Bajada: `events.list` con `syncToken` por calendario (`showDeleted`, `singleEvents=false`, páginas de 2500); 410 → lista
  completa y fuera lo que ya no está.

### Plataformas
- Web: Google Identity Services (token client), `prompt: 'select_account'` al añadir, `login_hint`/`hint` con el correo y
  `include_granted_scopes`. El token (1 h) se guarda por cuenta; al caducar, el siguiente toque en la página lo renueva
  (una cuenta por toque: el navegador solo deja abrir una ventana por toque).
- Windows: `zcDesktop.google('add', { clientId, clientSecret, scopes, loginHint })` → `{ access_token, expires_at, email }`
  (navegador con PKCE, `prompt=select_account consent`, o `consent` + `login_hint`), `google('token', { …cfg, account })`,
  `google('remove', { account, revoke })`, `google('accounts')` → `[email]`. Un refresh token por cuenta, cifrado con
  `safeStorage`, en `google-calendar.bin` (el de Drive sigue aparte en `google.bin`).
- Android: `ZCAndroid.googleAccount(id, email, interactive, scopes)` → `{ token, email }`. Con `email` vacío, primero el
  selector de cuentas del sistema (`AccountManager.newChooseAccountIntent`, que no pide ningún permiso) y luego
  `AuthorizationClient` con `setAccount(new Account(email, "com.google"))`.

### Modo simulado
`const g = await ZC.gcal._mock(cuentas?, { delay, pageSize, pick })` (después de `ZC.core.init()`): `ZC.gcal` pasa a hablar
con un Google Calendar de mentira en memoria (y `available()` da `true`). Sin cuentas, unas de ejemplo (dos conectadas, con
un calendario de solo lectura y festivos/cumpleaños desactivados, y una tercera para «Añadir cuenta»). Formato de cuentas y
lo que se puede simular (`setAuthError`, `offline`, `delay`, `addEvent`, `updateEvent`, `deleteEvent`, `denyAdd`, `pick`,
`expireSyncTokens`, `fail`…) en la cabecera de `web/js/core/gcal-mock.js`. `ZC.gcal._mock(false)` lo apaga.

## Workspaces: lo nativo (1.4.0)

El diseño completo está en `docs/WORKSPACES.md`. Aquí, lo que Android y Windows le dan a la página.

### Abrir la app con un enlace de invitación
- Enlace: `zencalendar://join/#<wid>.<token>`. También vale `zencalendar://join?code=<wid>.<token>` (o `?join=`).
  El código tiene que cumplir `^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_~-]{1,128}$` (si no, se ignora el enlace).
- Llega como `ZC.platform.onOpen({ action: 'join', code: '<wid>.<token>' })`, también si la app estaba cerrada
  (se guarda hasta que la página escucha, como lo de las notificaciones).
- Android: `intent-filter` `VIEW` + `BROWSABLE` con `scheme="zencalendar" host="join"` en `MainActivity`; la página
  `docs/w/` lo abre con `intent://join/<código>#Intent;scheme=zencalendar;package=com.luckicla.zencalendar;S.browser_fallback_url=…;end` (lo que va tras «#» tiene que empezar por «Intent;»).
  Al volver desde «Recientes» no se repite.
- Windows: el instalador registra el protocolo (`build.protocols` en `desktop/package.json`) y la app también al
  arrancar (`app.setAsDefaultProtocolClient`, que en la portable apunta al `.exe` de verdad). El enlace llega por la
  línea de órdenes: al arrancar o, con la app ya abierta, por `second-instance`.

### Aviso de un workspace tocado
- `ZC.platform.onOpen({ action: 'workspace', wid, id: wid })` → la página cambia a ese workspace (`ZC.ws.switchTo(wid)`).

### `ZC.platform.wsCreds(creds | null)` → credenciales para los avisos con la app cerrada
La página las manda al conectarse a Firebase y cada vez que cambien (otra cuenta, idioma); `null` al salir de la cuenta
o al desconectar Google (entonces se borran y se quitan los avisos de workspaces que queden).
```js
{
  apiKey, projectId,            // los de ZC.config (firebaseApiKey, firebaseProjectId)
  uid,                          // auth.currentUser.uid
  refreshToken,                 // auth.currentUser.refreshToken
  idToken, expiresAt,           // (opcional) el ID token que ya tiene y cuándo caduca, en ms: ahorra una renovación
  since,                        // (opcional) ms: avisar de lo cambiado desde entonces en los workspaces aún no vistos
                                //   (por defecto, desde que llegan las credenciales)
  strings: {                    // (opcional) textos en el idioma de la app; {who} = quién, {title} = título, {n} = número
    added: '{who}: {title}', changed: '{who} ha cambiado «{title}»', deleted: '{who} ha borrado «{title}»',
    assigned: '{who} te ha asignado «{title}»', done: '{who} ha completado «{title}»', more: 'y {n} más',
    someone: 'Alguien', untitled: '(sin título)',
    channel: 'Workspaces', channelDesc: 'Lo que cambian los demás en tus workspaces',   // (Android: el canal)
  },
}
```
- Android: `ZCAndroid.wsCreds(JSON.stringify(creds))` / `ZCAndroid.wsCreds('')`. Se guardan cifradas (AES-GCM con una
  clave del Android Keystore) en las preferencias privadas de la app (sin copia de seguridad: `allowBackup="false"`).
- Windows: `zcDesktop.wsCreds(creds)` / `zcDesktop.wsCreds(null)`. Cifradas con `safeStorage` en `workspaces.bin`.
- Lo que hace el nativo con ellas (Android: `JobScheduler` cada ~15 min con red, persistente tras reiniciar; Windows:
  cada 5 min desde el proceso principal, y a los 30 s de arrancar): renueva el ID token
  (`POST securetoken.googleapis.com/v1/token?key=…`), busca los workspaces con `memberIds array-contains uid`
  (`runQuery` en `workspaces`, como mucho 30) y en cada uno `runQuery` de `items` con `updated > lo último visto`, en
  orden, de 50 en 50. Los que tienen `updatedBy` distinto de `uid` dan una línea; el nombre sale de
  `members[updatedBy].name` (o la parte del correo antes de la @). Una notificación por workspace (título: emoji +
  nombre; Android: canal «Workspaces», estilo bandeja de entrada con las últimas 6 líneas, que se van juntando hasta
  que se toca o se quita; Windows: las últimas 4 líneas y «y N más»).
  Qué texto: `deleted: true` → `deleted`; recién creado (fecha de creación del documento ≈ `updated`) con
  `assignee == uid` → `assigned`; recién creado → `added`; tarea con `done: true` → `done`; si no, `changed`.
- **Con la app a la vista no avisa el nativo** (solo apunta lo visto): avisa la página con sus toasts. En Android y
  Windows la página **no** debe sacar notificaciones del sistema por cambios de workspaces (las saca el nativo, también
  con la ventana de Windows escondida en la bandeja aunque la página siga viva).
- Sesión de Firebase caducada o revocada (`TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `USER_DISABLED`…): se olvidan
  las credenciales y se para la comprobación hasta que la página mande otras.
- Lo necesario en las reglas: que un miembro pueda hacer esa consulta de `workspaces` (`memberIds array-contains`) y leer
  `items`. `updated` tiene que ser un `serverTimestamp()` (las consultas filtran y ordenan por él: índice de un solo
  campo, el que Firestore crea solo).

### `ZC.platform.share({ title, text, url, app })`
- `app: 'whatsapp'`: Android abre WhatsApp directamente (`com.whatsapp`, si no `com.whatsapp.w4b`, si no `wa.me` en el
  navegador); Windows abre `https://wa.me/?text=…`. `app: 'email'` (Windows): `mailto:`. Sin `app`: Android, la hoja de
  compartir del sistema; Windows, copia al portapapeles y devuelve `'copied'`.
- Android: `ZCAndroid.shareTo(JSON.stringify({ title, text, url, app }))` (el `ZCAndroid.share(title, text)` de antes
  sigue igual). El `url` se añade al final de `text` si no está ya.
- Windows: `await zcDesktop.share({ title, text, url, app })` → `'whatsapp' | 'email' | 'copied' | false`.

## Workspaces: el núcleo web (1.4.0)

Encargo en `docs/WORKSPACES.md`; reglas en `firestore.rules`; configuración en `docs/FIREBASE-SETUP.md`.
Núcleo en `web/js/core/ws.js` (se carga después de `gcal.js`); `web/js/core/ws-mock.js` es un Firebase simulado
(Auth + Firestore en memoria, con las mismas reglas portadas a JS) que solo carga `ZC.ws._mock()` y las pruebas.

### `ZC.ws`
- `available()` → hay `firebaseApiKey/AppId/ProjectId` en `ZC.config` (y no es el widget). Si no, no hace nada.
- `state()` → `{ available, signedIn, user: { uid, name, email, photo }, connecting, error, current, count, invites }`.
- `await connect()` → carga el SDK (v10, `import()` de gstatic) y entra en Firebase con el token de Google de `ZC.drive`
  (`ZC.drive._token(interactive)`, nuevo); en la web, si Drive no está conectado, con la ventanita de Firebase. En Android
  y Windows, sin Drive conectado, conecta primero Google (`ZC.drive.connect()`). `await signOut()`.
- `list()` · `get(wid)` · `current()` (null = mi calendario) · `await switchTo(wid | null)` · `setDim(on)` / `dim()`
  (ver también lo tuyo atenuado) · `members(wid)` · `isOwner(wid)` · `user()`.
  Cada workspace: `{ id, name, color, emoji, bg: { kind: 'none'|'color'|'image'|'anim', value }, owner, isOwner,
  members: [{ uid, name, email, photo, joined, owner }], memberIds, invitedEmails, inviteToken, createdAt, updatedAt }`.
- `await create({ name, color, emoji, bg })` · `await update(wid, patch)` (dueño) · `await setBackground(wid, file | dataURL | null)`
  (la reduce a 1600 px y < 600 KB) · `bgURL(wid)` (dataURL o null; si no está, la baja y avisa con `change`) · `await bgData(wid)`.
- `inviteLink(wid)` → `https://luckicla.github.io/ZenCalendar/w/#<wid>.<token>` · `await regenerateLink(wid)` ·
  `await inviteEmail(wid, email)` · `await uninviteEmail(wid, email)` · `parseCode(texto)` → `{ wid, token } | null`
  (vale el enlace entero, `#…`, `?join=…` o `zencalendar://join/#…`) · `await peek(code)` (lo que se ve antes de entrar) ·
  `await join(code)` · `pendingInvites()` · `await acceptInvite(wid)` · `await declineInvite(wid)`.
- Extra en Firestore (además de lo de `docs/WORKSPACES.md`): `workspaces/{wid}/invite/{token}` = `{ name, color, emoji, bg,
  ownerName, count }`, lo que ve quien abre un enlace antes de entrar (solo se puede leer con la clave buena); el dueño lo
  cambia con el nombre/color/fondo y al cambiar el enlace. La lápida de un item lleva `title` (para el aviso).
- `await leave(wid)` (el dueño no) · `await removeMember(wid, uid)` (y cambia el enlace) · `await remove(wid)` (dueño: borra todo).
- `unread(wid?)` · `markSeen(wid)` · `on('change' | 'state' | 'items' | 'notice', fn)`.
  `notice`: `{ kind: 'add'|'edit'|'delete'|'assign'|'done'|'invite'|'removed'|'error', wid, id, who, whoId, title, ws, here, hidden }`
  (solo lo que cambian los demás; la interfaz enseña el toast y, solo en la web y con la pestaña escondida, una notificación).
- Errores con `message` ya escrito para enseñar (en español; la interfaz lo pasa por `t()`).
- Las credenciales para los avisos nativos (`ZC.platform.wsCreds`, con `strings` traducidos) se mandan al entrar y al
  cambiar de idioma (`ZC.ws.refreshCreds()`), y `null` al salir.

### `ZC.store` con workspaces
- Los items de los workspaces viven en una capa en memoria (nunca en IndexedDB, Drive ni `exportJSON()`); cada workspace es
  un calendario `{ id: 'ws:<wid>', name, color, emoji, wsId, source: 'ws', order < 0 }` y cada item lleva
  `calendarId: 'ws:<wid>'`, `createdBy`, `updatedBy`, `assignee`.
- `events(scope)`, `calendars(scope)`, `occurrences(from, to, { scope })`: `'view'` (por defecto: en un workspace, solo él, y
  con `dim` también lo tuyo, con `dim: true` en las apariciones), `'personal'` y `'all'` (lo tuyo y todos los workspaces).
  Los avisos (`ZC.reminders`) usan `'all'`; los widgets, `'personal'`; `ZC.gcal` mira `calendars('personal')`.
- `saveEvent/deleteEvent/saveEventOccurrence/toggleDone` funcionan igual: lo de un calendario `ws:` va a Firestore
  (`ZC.ws._write`) y se ve al momento (sin conexión se manda al volver). Pasar algo de lo tuyo a un workspace (o al revés)
  lo rehace con otro id y deja lápida donde estaba. `saveCalendar({ id: 'ws:…' })` cambia nombre/color si eres el dueño;
  `deleteCalendar('ws:…')` no hace nada.
- `defaultCalendarId()` (en un workspace, el workspace) · `inWorkspace()` → wid | null · `isWsId(id)` · `_wsSet(…)` (de ZC.ws).
- `ZC.ai`: en un workspace, lo que crea va al workspace.

### `ZC.platform` (web)
- `share({ title, text, url, app })` → Android `ZCAndroid.shareTo(json)`, Windows `zcDesktop.share(o)`; en la web,
  `app: 'whatsapp'` → `wa.me`, `'email'` → `mailto:`, si no `navigator.share` o copiar.
- `wsCreds(c | null)` → `ZCAndroid.wsCreds(json | '')` / `zcDesktop.wsCreds(c | null)` (en la web no hace nada).
- `notify({ title, body, tag, data })` → solo en la web (Notification / service worker).
- Web: `app/?join=<código>` (o `#join=`) → `onOpen({ action: 'join', code })`. La interfaz atiende también
  `{ action: 'workspace', wid }`.

### Workspaces 1.4.3: iconos, foto de perfil y ajustes
- `ZC.ws`: cada workspace trae `icon` (id de `ZC.ws.ICONS`; nunca `emoji`) y `avatar` (versión, '' = sin foto).
  `await setAvatar(wid, file | dataURL | null, crop?)` (solo el dueño; recorta en cuadrado, 256 px, webp < 60 KB),
  `avatarURL(wid)` (dataURL o null; si no está bajada la baja y avisa con `change`), `avatarData(wid)`, `compressAvatar(canvas)`.
  `create`/`update` aceptan `icon`. La foto queda en la copia sin conexión (`ws.cache`).
- Al crear, los eventos del workspace se escuchan cuando el servidor confirma la escritura; un `permission-denied` al escuchar
  se reintenta en silencio hasta 3 veces.
- Interfaz (`UI.wsui`): «Ajustes del workspace» (`editDialog(wid)`) desde el engranaje `#wsGear`, el nombre del título, el menú
  y el panel lateral; deslizar o la rueda sobre el selector cambia de calendario (interruptor `prefs.cal.gestures.wsswipe`).
- Android y Windows siguen leyendo `emoji` para el título de sus avisos: con la 1.4.3 deja de existir (sale solo el nombre).

