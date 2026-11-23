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
web/                            la interfaz compartida (Android la lleva dentro, Windows también, y se publica en Pages)
  index.html                    FRONTEND
  widget.html                   FRONTEND  (widget de escritorio de Windows: agenda mini, transparente)
  css/*.css                     FRONTEND
  js/ui/*.js                    FRONTEND
  js/core/*.js                  BACKEND
  img/                          BACKEND (iconos generados por tools/mkicons.py; el FRONTEND puede añadir web/img/ui/)
  manifest.webmanifest, sw.js   BACKEND (PWA para la versión web)
android/                        BACKEND (app Java con WebView, widgets, alarmas, login Google)
desktop/                        BACKEND (Electron: ventana sin marco, bandeja, OAuth, widget de escritorio)
tools/mkicons.py                BACKEND (PNG/ICO/mipmaps a partir de assets/logo.svg + variantes de color)
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

La web de presentación va en `docs/` (la hace un tercer agente) y se publica en `https://luckicla.github.io/zencalendar/`;
la app web en `https://luckicla.github.io/zencalendar/app/` (copia de `web/`).
