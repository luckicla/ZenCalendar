# Pendientes y avisos entre frontend y backend

## Para frontend

Notas del backend sobre `web/js/core/` (todo lo del contrato está; esto son detalles y extras compatibles):

- **`occurrences()` → `end`**: para los eventos con hora es cuando acaban; para los de **todo el día es el último día (incluido) a las 00:00**, igual que en los datos. Cada aparición trae además `endEx` (final exclusivo: en los de todo el día, las 00:00 del día siguiente al último) y `date` (`'YYYY-MM-DD'` del inicio de esa aparición). `from`/`to` van como `[from, to)`.
- **`holidays.between(from, to, country, lang)`** también es `[from, to)`. Países: `ZC.holidays.countries()` → `ES`, `ES-CT`, `ES-IB`, `ES-MD`, `ES-VC`, `ES-AN` (nacionales + las de la comunidad). `lang` = `es`/`ca`/`en` para los nombres.
- **Tareas que se repiten**: `toggleDone(id, date)` con la fecha marca solo ese día (se guarda en `ev.doneDates`); `occurrences()` ya da `done` bien por aparición. Sin `date` marca la tarea entera.
- **`saveEventOccurrence`** guarda en la copia `recurrenceDate` (el día original), para exportar bien a `.ics`.
- **`ZC.nlp.parse`** devuelve `reminders: null` cuando no se dice nada (pon tú los de siempre) y, si lo adivina, `calendarId: 'birthdays'` y `emoji: '🎂'` en los cumpleaños. Si no hay título, `title: ''`.
- **`ZC.recur.describe(rrule, lang, start)`**: con `start` (opcional) dice también el día («el día 15», «el tercer martes») y los días de la semana si no hay `byDay`.
- **`ZC.platform.onOpen(fn)`**: además de `{ action, id, date }` puede traer `text` y `images: [Blob]` (compartir texto/foto a ZenCalendar en Android → `action: 'ai'`), y `reminder` (cuando viene de una notificación). Lo que llega antes de que haya nadie escuchando se guarda y se entrega en cuanto llamas a `onOpen`.
- **Botón atrás de Android** (extra): `ZC.platform.onBack(fn)` → `fn()` devuelve `true` si ha cerrado algo (una hoja, un panel…). Si nadie devuelve `true`, la app se va al fondo. También se lanza el evento DOM cancelable `zc-back` en `window`.
- **Widget de escritorio**: `ZC.platform.isWidget` es `true` dentro de `widget.html` (no programa avisos ni sincroniza; se entera de los cambios por BroadcastChannel). `ZC.platform.desktopWidgetPin('top' | 'bottom' | 'normal')` (extra) lo deja siempre encima, detrás de todo o normal. En `widget.html` haz arrastrable la zona que quieras con `-webkit-app-region: drag` (la ventana no tiene marco y es transparente: usa `background: transparent` en `html, body`).
- **Actualizaciones en Windows** (extra, para Ajustes): `ZC.platform.updates` → `available`, `state()` (`{ state: 'checking'|'available'|'downloading'|'ready'|'none'|'error', version, pct, msg }`), `check()`, `install()`, `on(fn)`.
- **`ZC.platform.on('win' | 'widget' | 'update', fn)`** por si quieres escuchar esos cambios. `ZC.platform.info` → `{ version, portable }`.
- **`ZC.drive.state().error`** ya viene en texto para enseñar tal cual. En la web, si la sesión de Google caduca, el siguiente toque en la página la renueva sola.
- **`ZC.ai.device`**: además de lo del contrato, `device.model()` (el id elegido; se cambia con `ZC.ai.setConfig({ model })` cuando el proveedor es `device`), `device.reason` (por qué no hay WebGPU) y `device.on(fn)` para el progreso. `status()` también trae `name`, `cached`, `supported`, `reason`, `text`.
- **`ZC.ai.run`** devuelve también `error` (texto) cuando algo falló; en ese caso puede traer acciones del parser integrado como plan B.
- **`ZC.store.blobInfo(id)`** → `{ id, name, type, size, w, h }` (putBlob calcula `w`/`h` de las imágenes).
- **Tema**: lo que pases a `setTheme` se usa para la barra de estado de Android (iconos oscuros si `light: true`), los widgets de Android (`bg`, `surface`, `fg`, `muted`, `a1`, `a2`, `a3`, `alpha` 0–1 de opacidad del fondo, `radius` en px) y el fondo de la ventana en Windows.
- **Iconos**: `web/img/icons/<id>.png` (512 px) para `pastel`, `sakura`, `menta`, `noche`, `cielo`, `melocoton`; `web/img/favicon.png`, `web/img/icon-192.png`, `web/img/icon-512.png`. Pon en `index.html`: `<link rel="manifest" href="manifest.webmanifest">`, `<link rel="icon" href="img/favicon.png">` y `<meta name="theme-color" content="#F7F3FF">`. El service worker lo registra `ZC.platform.init()` (solo en la web).
- **Importar `.ics`** (`web/js/ui/data.js`): no borres el `id` que da `ZC.ics.parse` (`ics-…`, sale del UID). Con él, importar dos veces el mismo archivo actualiza en vez de duplicar, y las apariciones cambiadas sueltas (RECURRENCE-ID) siguen enganchadas a su serie (`recurrenceOf` apunta a ese id). El array trae también `.calendarName` (X-WR-CALNAME) por si quieres usarlo como nombre del calendario nuevo.
- **Android, borde a borde**: por defecto Android deja el hueco de la barra de estado y la de navegación (pintado con el `bg` del tema, con los iconos claros/oscuros según `light`), porque en el WebView `env(safe-area-inset-*)` suele dar 0. Si cambias el CSS a `var(--zc-safe-top, env(safe-area-inset-top, 0px))` (y `--zc-safe-bottom/left/right`; Android las pone en `<html>` en px y lanza el evento `zc-insets`) y llamas a **`ZC.platform.setEdgeToEdge(true)`** al arrancar, la página se dibuja también detrás de la barra de estado transparente (con el fondo animado). Con el teclado abierto `--zc-safe-bottom` vale 0 y el WebView se encoge solo.
- **Widget de escritorio → ventana principal**: `ZC.platform.openApp({ action, id, date })` (ya lo usáis en `widget.js`, bien).
- **Windows 11, Mica/Acrílico** (extra, opcional): `ZC.platform.setWindowMaterial('mica' | 'acrylic' | 'none')`. Con mica la ventana se vuelve transparente por detrás: el `body` tiene que ser transparente para que se vea. Por defecto no se usa (fondo del tema).
- **Android**: `window` recibe `zc-resume` al volver a la app.

## Para backend

(del frontend; nada bloquea, todo tiene apaño en la interfaz)

- **NLP, horas sin «de la tarde»**: «cena con Marta el viernes a las 9» sale a las **09:00**. Estaría bien que con palabras de tarde/noche (cena, cenar, copas, fiesta, concierto…) o con horas 1–7 sin más contexto se entienda pm. La interfaz enseña lo entendido antes de guardar, así que se puede corregir.
- **`ZC.reminders.next(n)`**: la pantalla de Notificaciones lo lee como `[{ at: ms, ev | id }]`. Si el formato es otro, dímelo y lo adapto.
- **Calendarios por defecto**: se crean con el idioma del sistema en el primer arranque; si el usuario cambia el idioma en Ajustes no se renombran (está bien así, solo lo aviso).
- **Botón atrás (Android)**: la interfaz se registra con `ZC.platform.onBack(fn)`: cierra menús, hojas, el editor, los ajustes o el panel lateral, en ese orden; si no hay nada abierto devuelve `false`.

## Hecho por backend

- **`web/js/core/`** completo según el contrato: `config`, `util`, `store` (IndexedDB + caché, lápidas, BroadcastChannel, imágenes aparte, prefs por sección, `local`), `recur`, `holidays` (España + comunidades, Pascua calculada), `ics` (importar Google Calendar / exportar), `nlp` (ES/EN/algo de CA), `net` (fetch nativo en Android/Windows), `platform`, `reminders`, `drive` (appDataFolder, fusión por elemento, imágenes como `blob-<id>`, reintentos, token caducado), `ai` (integrado, WebLLM en el dispositivo, Ollama, Gemini, Groq, OpenRouter, OpenAI, Anthropic, Mistral, custom; fotos → eventos), `core`.
- **Pruebas**: `node tests/core/run.js` (node --check de todo + 142 pruebas: nlp, recur, ics, holidays, IA y la sincronización con un Google Drive de mentira y dos dispositivos, incluidos cambios a la vez, subidas cruzadas, 401, sin conexión e imágenes). Además se probó el core en Chrome de verdad (IndexedDB, blobs, BroadcastChannel entre pestañas).
- **PWA**: `web/manifest.webmanifest` (atajos «Nuevo evento»/«IA», compartir con la app) y `web/sw.js` (sin conexión; nunca guarda nada de fuera; toques y botones de las notificaciones).
- **`android/`**: Gradle (AGP 8.5.2, gradle 8.9, minSdk 24, target/compile 34), `com.luckicla.zencalendar`, keystore `android/app/zencalendar-dev.keystore` (SHA-1 en `docs/GOOGLE-SETUP.md`), WebViewAssetLoader, puente `ZCAndroid`, avisos con AlarmManager (exactos con `USE_EXACT_ALARM`/`SCHEDULE_EXACT_ALARM`, se reprograman al reiniciar/actualizar/cambiar la hora; «Posponer 10 min» y «Hecho»), canal de notificación, permiso de notificaciones, login de Google con AuthorizationClient, widgets «Agenda» (lista) y «Hoy» con fondo redondeado del color/transparencia del tema (se refrescan al cambiar datos, a medianoche y cada 30 min), `requestPinAppWidget`, 6 iconos con activity-alias, selector de imágenes con cámara, compartir texto/foto → IA, atrás que pregunta a la página.
- **`desktop/`**: Electron con `app://zencalendar/`, ventana sin marco, bandeja (abrir, nuevo evento, widget, arranque con Windows, salir), cerrar = a la bandeja con los avisos funcionando, instancia única, widget de escritorio transparente (recuerda posición/tamaño; encima/detrás/normal), OAuth de Google con PKCE + `safeStorage`, `fetch` sin CORS, electron-updater desde `pc-latest`, NSIS + portable.
- **`tools/mkicons.py`** (ya ejecutado): iconos web, mipmaps adaptativos (fg/bg/mono) + legacy de las 6 variantes, icono de notificación, `.ico` de Windows.
- **Workflows**: `build.yml` (pruebas → APK + instalador/portable → releases `android-latest`, `pc-latest` y `v1.x.y`) y `pages.yml` (presentación de `docs/` en la raíz y la app en `/app/`). Los client IDs salen de las variables del repo (`tools/setconfig.js`).
- **`README.md`**, **`LICENSE`** (PolyForm Noncommercial, como MixUp) y **`docs/GOOGLE-SETUP.md`**.

## Por probar en un dispositivo de verdad (aquí no hay SDK de Android ni Electron)

- **Compilar la APK** (no se ha podido compilar aquí: el Java está escrito con cuidado y revisado, pero puede saltar algún error tonto en el primer `gradle assembleRelease` de GitHub Actions).
- Android: que la hoja de Google salga y devuelva el token (necesita el cliente Android creado en Google Cloud con la SHA-1); avisos a la hora con la app cerrada y tras reiniciar; «Hecho» en una tarea con la app cerrada (se marca al abrirla); widgets (colores, transparencia, redimensionar, toques, «+»); cambiar el icono; cámara en el selector; compartir una foto a ZenCalendar.
- Windows: instalar y que se actualice solo; notificaciones con la ventana en la bandeja (y en la portable, que en algunos Windows no enseña notificaciones si no tiene acceso directo); el login de Google en el navegador; el widget de escritorio en modo «detrás» (Electron no tiene «siempre detrás» de verdad: se queda sin foco y no se pone delante al tocarlo); arranque con Windows (oculto en la bandeja).
- Web: login con Google Identity Services en GitHub Pages con el client ID web.
- IA en el dispositivo (WebLLM): descarga, caché y velocidad en un PC con WebGPU y en un Android reciente (el WebView de Android puede no tener WebGPU todavía; entonces sale el motivo).
- La portable no se actualiza sola (electron-updater no sabe): avisa y «Actualizar» abre la descarga.
- Los avisos se programan para los próximos 21 días: si alguien no abre la app en más de 3 semanas, los de después no saldrán hasta que la abra (en Windows no pasa si se queda en la bandeja).

## Hecho por frontend

- **`web/index.html`**, **`web/widget.html`**, **`web/css/`** (`base`, `app`, `views`, `panels`, `widget`), **`web/js/ui/`** (`i18n`, `i18n-dict`, `icons`, `dom`, `bg`, `look`, `cal`, `view-month`, `view-time`, `view-list`, `side`, `editor`, `quick`, `aipanel`, `data`, `settings`, `welcome`, `app`, `widget`) y **`web/img/ui/logo.svg`** (copia de `assets/logo.svg`). Scripts clásicos colgados de `ZC.ui`, rutas relativas.
- Vistas Mes (barras continuas, «+N», festivos, lista del día debajo en el móvil), Semana y Día (rejilla, línea de la hora, solapados en columnas, arrastrar para mover/crear, estirar), Agenda (infinita), Año (mapa de calor) y Tareas. Editor completo (emoji, todo el día, repetición con `ZC.recur.describe`, avisos, lugar con Google Maps, notas, lista, imágenes con `putBlob`, duplicar, borrar con «solo este / siguientes / todos»), detalle, añadir rápido con chips de `ZC.nlp.parse`, buscador, asistente con vista previa de cambios y fotos, Google Drive, calendarios, importar/exportar `.ics` y `.json` (también arrastrando a la ventana), Ajustes con la personalización de MixUp (estilos ya hechos con vista previa al mantener pulsado, 12 temas claro/oscuro, acentos, colores desde la imagen de fondo, 8 fondos animados en canvas, transparencia por zona, desenfoque, esquinas, sombras, densidad, tamaño, letras, animaciones, logo, icono, calendario, widgets, notificaciones, IA, Drive, datos, actualizaciones), bienvenida en 3 pasos, deshacer en los avisos, widget de escritorio, español/inglés/catalán, barra propia de Windows, atajos de teclado y gestos en el móvil.
- **Pruebas**: `node tests/ui/shots.js` (capturas en `tests/ui/out/`, PC 1366×800 y móvil 390×844, claro y oscuro; falla si hay errores en la consola) y `node tests/ui/interact.js` (añadir rápido, crear arrastrando, mover, estirar, borrar y deshacer, completar tarea, atajos, tema, idioma, deslizar y mantener pulsado en el móvil). Ambas pasan con el core de verdad. `tests/ui/mock-core.js` solo sirve para probar sin `web/js/core/` (`MOCK=1`).


## Revisión de construcción

Revisado a mano (sin SDK de Android ni Electron aquí): `android/`, `desktop/`, `.github/workflows/`, `tools/`, `platform.js`, `net.js`, la parte de autenticación de `drive.js`, `config.js`, `manifest.webmanifest`, `sw.js`, `README.md`, `docs/GOOGLE-SETUP.md`, `LICENSE` y `.gitignore`.

**Cómo se ha comprobado**
- **Java**: compilado con `javac` contra unos *stubs* de las APIs de Android, androidx, Play Services y `org.json` que usa el código (con las excepciones comprobadas de verdad, p. ej. `JSONException`), más un `R.java` sacado de `res/`. Compila sin errores: tipos, imports, lambdas, excepciones, y que cada `R.*` existe. Los *stubs* los he escrito yo, así que no garantizan que cada método de Android exista tal cual: eso se ha revisado a mano (APIs ≤ 34, `if (SDK_INT >= …)` donde hace falta, `FLAG_IMMUTABLE`/`FLAG_MUTABLE`, `canScheduleExactAlarms`, RemoteViews solo con `FrameLayout`/`LinearLayout`/`ImageView`/`TextView`/`ListView`, `setColorFilter`/`setImageAlpha` que se pueden llamar desde RemoteViews, `@JavascriptInterface` en todos los métodos del puente, `Identity.getAuthorizationClient` + `AuthorizationRequest` + `hasResolution` + `startIntentSenderForResult` + `getAuthorizationResultFromIntent`).
- **Recursos y manifest**: todos los XML están bien formados; existen todas las referencias `@string/@mipmap/@xml/@style/@drawable`; los 6 iconos de los `activity-alias` tienen PNG en las 5 densidades + adaptativo (`fg`/`bg`/`mono`); `exported` puesto en todo lo que tiene `intent-filter`; FileProvider con autoridad `${applicationId}.files`, igual que en el código.
- **Gradle**: AGP 8.5.2 (necesita Gradle ≥ 8.7: va con el 8.9 del workflow y Java 17), `compileSdk`/`targetSdk` 34, `minSdk` 24; `androidx.webkit:webkit:1.11.0`, `androidx.core:core:1.13.1` y `play-services-auth:21.2.0` existen y piden como mucho `compileSdk` 34; `android.useAndroidX=true`. La copia de `../web` a los assets es igual que la de MixUp (que ya compila en Actions con estas mismas versiones). La keystore es PKCS12, se abre con la contraseña del `signingConfig`, caduca en 2054 y su SHA-1 es la de `GOOGLE-SETUP.md`.
- **Electron**: `node --check` en todo; versiones que existen (`electron ^31`, `electron-builder ^24.13.3`, `electron-updater ^6.3.9`, `rcedit ^3.1.0`, como MixUp); `app://` registrado como privilegiado antes de `ready`; rutas empaquetado/sin empaquetar (`resources/web`, `resources/icons`, `resources/icon.ico`); NSIS + portable con `ZenCalendar-Instalador.exe` / `ZenCalendar-Portable.exe`; `publish` genérico a `pc-latest`. Se ha probado `platform.js`/`net.js` en Chrome con un `window.zcDesktop` y un `window.ZCAndroid` falsos: la app arranca sin errores y solo llama a métodos que existen en `preload.js` y en `Bridge.java`.
- **Workflows**: YAML válido; `tools/setconfig.js` probado con y sin variables (vacías = deja `config.js` como está; con comillas en el secreto, bien escapado).
- **Web en `/zencalendar/app/`**: probado con un servidor en esa subcarpeta: rutas relativas, el service worker se registra con ámbito `/zencalendar/app/` (no toca la presentación de la raíz), y recargando sin conexión la app arranca entera.
- **Peticiones a `accounts.google.com` y `android.clients.google.com` al cargar**: **no son de ZenCalendar**. Con el registro de red de Chrome se ve que son `accounts.google.com/ListAccounts?source=ChromiumBrowser` y `android.clients.google.com/checkin`: las hace el propio Chrome (cuentas del navegador y GCM), no la página. Desde la página lo único que sale al cargar es Google Fonts (`look.js`). Google Identity Services solo se carga al pulsar «Conectar» (o, si ya estabas conectado, cuando caduca la sesión).

**Arreglado**
- `.github/workflows/build.yml`: `concurrency` para que dos cambios seguidos no se pisen subiendo a las releases; lista la carpeta de la APK antes de copiarla (si cambia el nombre, el error se entiende). (Lo de las releases oficiales se rehízo después con `VERSION`: ver abajo.)
- `android/app/build.gradle`: `lint { checkReleaseBuilds false; abortOnError false }`, para que un aviso de lint no pare la APK de Actions (no hay Play Store; se puede pasar a mano con `gradle lintRelease`).
- `MainActivity.java`: lo que llegaba (widget, notificación, compartir) entre que la página miraba `takeOpen()` y terminaba de cargar se perdía; ahora se entrega en `onPageFinished`. Los campos `pendingOpen`/`pendingShared` se escriben con el mismo candado con el que se leen desde el hilo del puente.
- `web/manifest.webmanifest`: quitado `display_override: window-controls-overlay` (la interfaz web no dibuja barra propia y, con la PWA instalada en el PC, los botones de la ventana tapaban la parte de arriba a la derecha); `theme_color` igual que el `<meta>` (`#F7F3FF`).
- `web/sw.js`: primero la red para todo lo de la app (antes, los js/css salían de la caché y se actualizaban por detrás: después de publicar, la primera carga podía mezclar un `index.html` nuevo con scripts viejos). Sin conexión sigue funcionando igual. Caché `zencalendar-v2` (se borra la vieja).
- `web/js/core/drive.js` (autenticación): ya no carga Google Identity Services al arrancar aunque estés conectado (solo al pulsar «Conectar» o cuando caduca la sesión); al desconectar en la web revoca con `google.accounts.oauth2.revoke` (el `fetch` directo al endpoint de Google puede fallar por CORS); nuevo `ZC.drive.prepare()` opcional (ver abajo).
- `web/js/core/config.js`: el comentario decía que lo rellenaba `sed`; es `tools/setconfig.js`.
- `README.md`: cómo publica cada workflow (las releases `android-latest`, `pc-latest` y `v1.x.y` *latest*), **Settings → Pages → Source: GitHub Actions** antes de la primera vez, qué hace falta para compilar Android (Java 17, Gradle 8.9 sin *wrapper*, SDK 34) y dónde sale cada archivo; en «¿Es seguro?» faltaba Google Fonts entre las conexiones (y que GitHub solo lo mira la de Windows); el widget de Windows ya no promete «detrás de todo» (Electron no puede: se queda quieto sin ponerse delante).
- `docs/GOOGLE-SETUP.md`: el cliente de escritorio no lleva URIs de redirección y por qué (loopback `http://127.0.0.1:<puerto>`, por eso tiene que ser «App de escritorio»); política de privacidad en `luckicla.github.io/zencalendar/#privacidad` (dominio autorizado) en vez del README de GitHub; qué pasa si faltan las variables; un error más de Windows (`redirect_uri_mismatch`/`invalid_client`).
- `.gitignore`: quitada la línea `desktop/web/` (ya no se copia nada ahí).
- **Nuevo (encargo del coordinador): `ZC.platform.haptic(kind)`** con `kind` = `'tap' | 'select' | 'success' | 'warning'` (otro valor = `'tap'`). Si `ZC.store.getPrefs().look.haptics === false` no hace nada (por defecto, sí vibra). Android: `ZCAndroid.haptic(kind)` → `Haptics.java` (patrones cortos con `VibrationEffect` en Android 8+, con fuerza si el móvil la controla; si no, `performHapticFeedback` del WebView; el permiso `VIBRATE` ya estaba). Web: `navigator.vibrate` corto, solo si el navegador lo tiene y después del primer toque (si no, Chrome lo bloquea y lo avisa en la consola). Windows: nada. Probado en Chrome con los tres puentes (web, Android falso y escritorio falso) y `javac` contra los *stubs*.

**Solo se podrá comprobar en GitHub Actions o en un aparato**
- El primer `gradle assembleRelease` de verdad (la revisión con *stubs* no ve, por ejemplo, un método de Android mal escrito que yo también haya escrito mal en el *stub*). Si falla, el error saldrá en el paso «Compilar» del trabajo `apk`.
- `electron-builder` en `windows-latest`: que `extraResources` con `from: "../web"` (fuera de `desktop/`) copie la web (es lo esperado; si no, la ventana sale con «No encontrado») y que `afterPack.js` ponga el icono con `rcedit`.
- GitHub Pages: hay que activar **Settings → Pages → Source: GitHub Actions** una vez; si no, `actions/configure-pages` falla.
- Android: subir a Drive con la APK. `HttpURLConnection` no sabe hacer `PATCH`, así que `Net.java` manda `POST` + `X-HTTP-Method-Override: PATCH` (Google lo acepta en sus APIs; comprobar que la segunda sincronización, la que actualiza `zencalendar.json`, va bien).
- Windows: el widget transparente redimensionable (en algunos Windows las ventanas transparentes no se dejan estirar desde el borde).
- Lo que ya estaba en «Por probar en un dispositivo de verdad».

### Versiones y actualizaciones (encargos del coordinador)

- **Archivo `VERSION`** (raíz, ahora `1.0.0`). El trabajo `version` de `build.yml` lo lee (tiene que ser `X.Y.Z`) y mira con `gh release view v<VERSION>` si la release oficial ya existe.
  - `android-latest` y `pc-latest` se actualizan en **cada** compilación.
  - La release oficial `v<VERSION>` (*latest*, con la APK, el instalador, la portable, el texto de siempre y las notas automáticas de GitHub) se crea **solo si no existe** y solo si han salido bien Android y Windows; si algo falla, la siguiente compilación lo vuelve a intentar con la misma versión. Para sacar otra: cambiar `VERSION`. `VERSION` está en los `paths` de los dos workflows.
  - Android: `versionName` = `VERSION` (lo lee `build.gradle`), `versionCode` = `run_number` (siempre sube). Windows: `npm version` = `VERSION`, así que electron-updater solo actualiza cuando cambia `VERSION`. Web: `config.js` lleva `VERSION` y `pages.yml` pone en `sw.js` el número de cada publicación (`const BUILD = '…'`), para que el navegador detecte la versión nueva.
  - La release `v1.x.y` por compilación de antes ya no existe (la sustituye esto).
- **Android se actualiza solo** (`Updater.java`, como MixUp): lee `android-latest/version.txt` («`<versionCode> <sha256> <versionName>`», lo escribe el workflow), y si su número es mayor que el `versionCode` de la APK, descarga `ZenCalendar.apk` a la caché (con progreso), comprueba el sha256 y abre el instalador de Android con `FileProvider` (`cache-path update/`) + `ACTION_VIEW`. Necesita `REQUEST_INSTALL_PACKAGES`; si falta el permiso de «instalar apps desconocidas», abre ese ajuste y, al volver con el permiso dado, sigue sola (`onResume`). Tras instalar, `BootReceiver` recibe `MY_PACKAGE_REPLACED` → `Updater.onUpdated`: aviso «ZenCalendar actualizado · Actualizado a la versión X» y se intenta abrir la app (Android 10+ no siempre deja; el aviso la abre con un toque). Comprueba al abrir la app (como mucho cada 6 h, `ZC.store.local('updates.lastCheck')`) y a mano con `updates.check()`.
- Probado: `javac` contra los *stubs* (con las APIs nuevas: `canRequestPackageInstalls`, `ACTION_MANAGE_UNKNOWN_APP_SOURCES`, `getLongVersionCode`…) y en Chrome la API única con un Android falso, un escritorio falso y la web con un `sw.js` que cambia de verdad (sale `ready`, `install()` recarga y la caché vieja se borra). **Queda por probar en un móvil** la descarga real (redirección de GitHub a `objects.githubusercontent.com`), el instalador, el ajuste de apps desconocidas y la reapertura tras `MY_PACKAGE_REPLACED`.

### Para el frontend: `ZC.platform.updates` (la misma en Android, Windows y la web)

```js
ZC.platform.updates.available   // true: esta app se actualiza sola (Android; Windows instalado o portable).
                                // En la web es false, pero igualmente puede emitir status 'ready'.
await ZC.platform.updates.check()    // comprueba (en Android, si hay, también la descarga); devuelve state()
await ZC.platform.updates.install()  // Android: instala (si no estaba descargada, la descarga y luego instala;
                                     //   la primera vez abre el ajuste «instalar apps desconocidas»)
                                     // Windows instalado: reinicia y actualiza · portable: abre la descarga
                                     // web: si status es 'ready', recarga la página
ZC.platform.updates.state()          // el estado de abajo (copia)
ZC.platform.updates.on(fn)           // fn(state) en cada cambio; devuelve la función para dejar de escuchar
                                     // (es lo mismo que ZC.platform.on('update', fn))

// state:
{ status: 'idle'|'checking'|'none'|'available'|'downloading'|'ready'|'error',
  current: '1.0.0',      // la versión instalada
  latest: '1.0.1',       // la nueva ('' si no se sabe)
  progress: 0..100,      // descargando
  notes: '…',            // texto de la release en GitHub (markdown; '' si no hay o sin internet). Llega un poco
                         //   después de 'available', en otro evento
  error: null | 'texto para enseñar',
  build, currentBuild,   // solo Android: números de compilación (la misma versión puede tener una compilación nueva)
  state, version, pct, msg }  // los nombres de antes (status, latest||current, progress, error): Ajustes sigue
                              //   funcionando tal cual, pero mejor pasar a los nuevos
```

- **«Actualizado a la versión X»**: `ZC.platform.justUpdated` vale `'X'` (o `''`) después de `ZC.core.init()`, y además se lanza `ZC.platform.on('updated', v => …)` (en Android al abrir tras instalar; en Windows si la versión cambió desde la última vez que se abrió). Como el evento sale durante el arranque, lo seguro es mirar `justUpdated` después de `init()` y enseñar un aviso.
- En Ajustes → Actualizaciones, con `status === 'ready'` el botón dice «Reiniciar y actualizar»: en Android sería mejor «Instalar» y en la web «Recargar» (`ZC.platform.kind`). En la web, como `available` es false, la tarjeta no sale: si se quiere avisar, escuchar `updates.on` y enseñar «Hay una versión nueva · Recargar» cuando llegue `ready`.
- Si `status === 'available'` en Android (comprobado sin descargar, no pasa con `check()`), el botón «Instalar» también vale: descarga y luego instala.

### Para el otro revisor

- (`web/js/ui/settings.js`, pantalla de Google Drive) Si al abrir la pantalla de Drive se llama a `ZC.drive.prepare()` (nuevo, opcional, no hace nada fuera de la web), la ventanita de Google sale al instante al pulsar «Conectar». Sin eso, la primera vez el script de Google se descarga al pulsar y, si tarda más de unos 5 s, el navegador puede bloquear la ventanita (sale el error «El navegador bloqueó la ventana de Google» y basta con volver a pulsar).
- (`web/js/ui/look.js` + `web/index.html`) Las letras salen de Google Fonts al arrancar (y el `preconnect`). Funciona sin internet (usa las del sistema), pero es la única petición de fuera que hace la app sin que el usuario haga nada; ahora el README lo dice. Si se quiere quitar, habría que llevar las fuentes dentro de `web/`.
- (`docs/js/site.js`) Pide `releases?per_page=6` y quita las *prerelease* (`android-latest` y `pc-latest`), así que enseña como mucho 4 versiones. Si se quieren 6, subir `per_page` a 8.

## Revisión de errores

Revisión de QA de `web/` (interfaz y núcleo, menos lo de construcción), la web de `docs/` y `tests/`. Pruebas nuevas:
`node tests/ui/regress.js` (12 casos de interfaz, PC y móvil) y casos nuevos en `tests/core/` (nlp 9, sync 3, ics 1, IA 1).

### Arreglado

- **Graves**
  - Arrastrar una serie semanal a otro día con «Todos» no hacía nada visible: se movía el inicio pero no `byDay` (seguía saliendo el lunes). Ahora la serie se mueve entera: días de la semana, `until`, repeticiones quitadas y tareas hechas (`cal.js`: `seriesShifted`).
  - «Deshacer» tras mover o editar «solo este» / «este y los siguientes» dejaba la copia o la serie nueva: salían duplicados. Ahora deshace también lo creado (`cal.js`: `snapshotSeries`, también en el editor).
  - Mover o editar toda una serie un número de días que cruza el cambio de hora le cambiaba la hora (10:00 → 09:00): se sumaban milisegundos. Ahora se suma en días y minutos de reloj (`shiftOf`/`applyShift`).
  - «Este y los siguientes» con `count` creaba una serie nueva con el total otra vez (6 → 8 veces), perdía las repeticiones quitadas y dejaba las apariciones sueltas de después duplicadas. Ahora conserva lo que queda de `count`, las `exdates` y engancha las sueltas a la serie nueva (`splitSeries`, también desde el editor).
  - Tareas que se repiten: en «Tareas» y en el panel lateral salían siempre con la primera aparición (atrasada para siempre) y la casilla marcaba solo ese primer día. Ahora sale la primera sin hacer de hoy en adelante y al marcarla pasa a la siguiente (`cal.js`: `taskOcc`).
  - XSS: el nombre de un calendario se pintaba sin escapar en un `aria-label` del panel lateral (`"><img onerror>` se ejecutaba); el color de un evento (que puede venir de una copia, de Drive o de la IA) acababa sin filtrar dentro de `style="…"`. Arreglado en `side.js`, `cal.js` (`evVars` solo acepta `#rgb`/`#rrggbb`), `dom.js` (`menu` → `dot`) y en el núcleo (`store.normEvent`/`saveCalendar` validan el color).
  - Deshacer el borrado de un evento con imágenes (o de quitar una imagen en el editor) dejaba las imágenes rotas: el núcleo borra el blob al momento. Ahora la interfaz las guarda en memoria hasta que pasa el aviso y las vuelve a poner; además, quitar una imagen en «solo este» ya no borra la de la serie (`holdBlobs`/`dropUnusedBlobs`).
  - Móvil: arrastrar un evento en la vista Mes no funcionaba (el deslizar de mes lo cancelaba) y, si se soltaba encima de otra barra, no encontraba el día. Ahora marca `dragging-ev` como Semana/Día y busca el día por coordenadas (`view-month.js`). Tras un arrastre cancelado el siguiente toque se perdía: arreglado.
- **Medios**
  - NLP: «cena con Marta el viernes a las 9» → 09:00. Ahora las horas ambiguas de 1 a 7 son por la tarde (también con minutos, «5:30»), con planes de tarde/noche (cena, concierto, copas, fiesta, sopar, dinner, drinks…) de 1 a 11 también, con «desayuno» por la mañana, «07:30» (cero delante) es de 24 h, «hoy a las 9» si ya pasó → 21:00 y los rangos «de 10 a 2» → 22:00–02:00 (antes salía 22:00 → 14:00 del día siguiente). Lo mismo en la demo de la web (`docs/js/nlp.js`).
  - Notificaciones enseñaba «Sin título» en todos los próximos avisos: `ZC.reminders.next(n)` no traía el evento. Ahora devuelve `[{ at, ev, id, eventId, title, … }]`.
  - «Personalizado…» en la repetición no abría su panel si la regla coincidía con un preset (lo normal en un evento nuevo): no se podían poner «hasta» ni «veces».
  - La agenda infinita se paraba con pocos eventos (el observador no vuelve a avisar si el final sigue a la vista): un evento a 4 meses no salía nunca. Ahora carga trozos mientras el final esté cerca (hasta ~2 años de golpe) y el «Todo despejado» sale de verdad. Al ver días anteriores ya no se repite el título del mes.
  - Asistente: con dos vistas previas abiertas, quitar una acción quitaba la de la última; el error de la IA salía repetido; el integrado contestaba siempre en español (ahora en/ca/es según la interfaz).
  - Al cambiar de idioma, la barra de añadir rápido se quedaba en el idioma anterior; faltaban traducciones de las descripciones de los proveedores de IA.
  - Reimportar un `.ics` exportado por ZenCalendar duplicaba todo (los ids salían del UID con hash). Ahora se exporta `X-ZC-ID` y se respeta al importar. Reimportar un `.ics` ya no ofrece crear otro calendario con el mismo nombre (y usa `X-WR-CALNAME`).
  - El nombre de la copia `.json`/`.ics` usaba `toISOString` (fecha UTC: después de medianoche salía el día anterior).
- **Leves**
  - Duplicar una aparición suelta copiaba `recurrenceOf` (al borrar la serie se borraba el duplicado).
  - Ajustes añadía dos escuchas a `window` cada vez que se abría (nunca se quitaban); la barra de Windows enganchaba otra vez el doble clic al cambiar de idioma (con dos, maximizar no hacía nada).
  - Cambiar de vista muy deprisa daba `pageerror: Transition was skipped` (promesas de `startViewTransition` sin recoger).
  - Una pulsación a medias en Semana/Día (soltar fuera de la ventana) bloqueaba la rejilla y el siguiente toque creaba un evento en el sitio viejo.
  - Fondo «Estrellas»: en pantallas grandes dibujaba miles de estrellas por fotograma; ahora como mucho 260. (CPU medida en el navegador sin GPU, 3 s: aurora 2 %, nubes 5 %, olas 8 %, burbujas 10 %, sakura 11 %, estrellas 17 % → menos tras el arreglo.)
  - `ZC.drive.prepare()` se llama al abrir la pantalla de Drive y la bienvenida (nota del otro revisor); la web pide 8 versiones para enseñar 4.

### Probado y bien

Bienvenida, crear/editar/mover/estirar (PC y móvil), todo el día y varios días, «solo este / siguientes / todos» desde el editor y arrastrando, borrar con deshacer, `until`/`count`, «tercer martes», día 31 (se salta los meses cortos), 29 de febrero (cada 4 años), eventos el 29 de marzo y el 25 de octubre, semana en domingo, 12 h, imágenes (añadir con `setInputFiles`, ver, visor, quitar, cancelar el editor borra la subida), añadir rápido con frases difíciles, buscador, calendarios (crear, ocultar, borrar con sus eventos), `.ics` real (TZID de otra zona, todo el día, RRULE con UNTIL en UTC, EXDATE, RECURRENCE-ID, BYDAY=3TU, VALARM) importado dos veces sin duplicar, copia JSON exportada y reimportada, cada opción de Ajustes se aplica y sigue tras recargar, vista previa al mantener pulsado, claro/oscuro/sistema, fondo con imagen propia y colores desde la imagen, ES/EN/CA (sin textos sin traducir en las pantallas recorridas), asistente integrado y con un proveedor simulado (respuestas buenas, cortadas, solo texto, basura, 500), Drive sin configurar, `widget.html`, atajos, la web de `docs/` (demo, personalizador, enlaces, sin desbordes en 390 px, sin errores).

### Queda

- El asistente con proveedores de API: los mensajes de error y de plan B («Falta la clave…», «Sin conexión…») siguen solo en español.
- Añadir rápido sin título («mañana») guarda el evento con la frase como título.
- Importar `.ics` de otra zona horaria con repetición: se pasa a la hora de aquí una vez, así que las semanas en que EE. UU. y Europa cambian de hora en fechas distintas sale una hora movido.
- Si un dispositivo borra un calendario mientras otro le añade un evento, el evento queda sin calendario (se ve con el color por defecto).
- Restaurar una copia `.json` «junta»: lo borrado después de hacer la copia no vuelve (gana lo más nuevo, como dice el aviso).
- Las lápidas de más de un año se ignoran al sincronizar pero no se quitan de IndexedDB.
- `.ics` exportado: las tareas que se repiten pierden qué días se marcaron (`doneDates`).

### Para el otro revisor

- Nada concreto encontrado en `android/`, `desktop/`, workflows ni `tools/` (no los he revisado a fondo). Lo que tocaba la interfaz de tus notas está hecho (`ZC.drive.prepare()`, `per_page`). Las fuentes de Google al arrancar las dejo como están (decisión de diseño, ya está en el README).
- Para el agente de gestos: el arrastre de eventos en Mes ahora pone `html.dragging-ev` mientras dura (lo que `gestures.js` ya mira para no empezar a deslizar).
- **Gestos** (`web/js/ui/gestures.js` + `web/css/gestures.css`; pruebas `node tests/ui/gestures.js`): deslizar a los lados con el periodo de al lado asomando y muelle; pellizcar = alto de las horas en Semana/Día y Mes ⇄ Año (Ctrl+rueda en el PC); arrastrar la cabecera de Semana hacia abajo = Mes y el mes hacia arriba = Semana; filas de Agenda/Tareas: derecha completa, izquierda «Mañana»/«Borrar» (del todo, borra) con deshacer; tirar hacia abajo en Agenda/Tareas = sincronizar con Drive; doble toque en un día o hueco = crear, en la cabecera = hoy; borde izquierdo = panel lateral; arrastrar la hoja hacia arriba = expandir; visor de fotos con pellizco, doble toque y deslizar para cambiar o cerrar; Mayús+rueda/trackpad = cambiar de periodo; clic derecho = menú (ver, editar, completar, duplicar, pasar a mañana, Maps, color, borrar) y clic central = editar. Interruptores por grupos en Ajustes → Gestos (`prefs.cal.gestures`), el alto de las horas se guarda en `ZC.store.local('hourZoom')` y la vibración usa `ZC.platform.haptic` si existe. Enganches mínimos: `index.html` (css y script), `app.js` (no arranca su deslizar si hay `UI.gestures`) y `settings.js` (`UI.settings.addSection`).
- **Actualizaciones** (`web/js/ui/updates.js` + `web/css/updates.css`; pruebas con una API de mentira `node tests/ui/updates.js`): aviso discreto con «Actualizar» / «Ver novedades» y barra de progreso, Ajustes → Actualizaciones (versión, buscar, estado, novedades en markdown, «Actualizar sola» en `prefs.look.autoUpdate`, por defecto encendido) y el aviso «Actualizado a la versión X» una sola vez (`ZC.platform.justUpdated` / evento `updated`). El botón dice «Instalar» en Android, «Reiniciar y actualizar» en Windows y «Recargar» en la web.

