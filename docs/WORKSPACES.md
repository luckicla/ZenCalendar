# Workspaces compartidos — contrato (versión 1.4.0)

Lo que pide Lluc: «workspaces donde puedas invitar a tus amigos con un enlace o un correo, y así avisar de tareas, de días
que habéis quedado y tal (que se os guarde a todos). Que se pueda cambiar MUY claramente de calendario normal a calendario
workspace de alguien. Crearlo e invitar con enlaces sencillos por WhatsApp, escoger el color del workspace, una foto de fondo
(que se pueda personalizar igual que lo demás, para diferenciarlo). Al estar en un workspace, que diga el nombre (reducido si
es muy grande, sin cargar la interfaz) donde estaba el mes, al lado, arriba o abajo; si no, el mes como siempre.»

Decisiones de Lluc: **Firebase** (Firestore + Firebase Auth con Google) como sitio común; **todos los miembros editan**
(solo el creador cambia nombre/color/fondo, invita y echa); **avisos gratis casi al momento** (comprobación periódica, sin
push de pago ni Cloud Functions, plan Spark gratuito, sin Firebase Storage porque en proyectos nuevos exige el plan de pago).

## Configuración (no escribir valores en el código)
- Firebase se añade al proyecto de Google Cloud que ya existe (`zencalendar-515701`), así los clientes OAuth de Google sirven.
- `web/js/core/config.js` gana: `firebaseApiKey`, `firebaseAppId`, `firebaseProjectId`, `firebaseSenderId` (vacíos en el repo).
  `tools/setconfig.js` los rellena desde variables del repo `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`,
  `FIREBASE_SENDER_ID`, y los workflows (`build.yml`, `pages.yml`) se las pasan. `authDomain` = `<projectId>.firebaseapp.com`.
  Sin esos valores: la sección de workspaces enseña «Esta versión aún no tiene configurados los workspaces» y nada más falla.
- `firestore.rules` en la raíz del repo (lo pega Lluc o su asistente en la consola de Firebase) + explicación en
  `docs/FIREBASE-SETUP.md` (paso a paso y el prompt para el asistente del navegador).

## Datos en Firestore
- `workspaces/{wid}`: `{ name, color: '#hex', emoji, bg: { kind: 'none'|'color'|'image'|'anim', value }, owner: uid,
  members: { uid: { name, email, photo, joined } }, memberIds: [uid…], invitedEmails: [email…], inviteToken, createdAt, updatedAt }`
- `workspaces/{wid}/assets/bg`: `{ data: 'data:image/webp;base64,…' }` (foto de fondo comprimida a ~1600 px y < 600 KB).
- (1.4.3) `icon: '<id>'` en lugar de `emoji`: uno de los 40 iconos propios (`ZC.ws.ICONS`, dibujos en `web/js/ui/ws-icons.js`,
  la lista también en `firestore.rules`). Un workspace con `emoji` de antes sale con `estrella` y el emoji se quita al guardarlo.
- (1.4.3) Foto de perfil: `avatar: '<versión>'` en el workspace y `workspaces/{wid}/assets/avatar` = `{ data: 'data:image/webp;base64,…', updatedAt }`
  (cuadrada, 256 px, < 60 KB; las reglas: < 90 000 letras, solo el dueño escribe, los miembros leen). También va en
  `invite/{token}.avatar` para la pantalla «Te han invitado a…» y la página del enlace. Sustituye al icono en todas partes.
- (1.4.3) `invite/{token}` se puede leer sin sesión (solo con la clave): la página `docs/w/` lo lee por la API REST de Firestore
  con `../app/js/core/config.js` para enseñar nombre, color, icono o foto y quién invita.
- `workspaces/{wid}/items/{id}`: el mismo formato de evento/tarea del contrato (sin `calendarId`; `attachments` no, de momento)
  + `createdBy`, `updatedBy`, `assignee: uid|null` (tareas para alguien), `updated` (serverTimestamp), `deleted` (lápida).
- `workspaces/{wid}/joins/{uid}`: lo crea quien entra con el enlace `{ token, name, email, photo }`; las reglas comprueban
  que `token == get(workspace).inviteToken` y entonces puede añadirse a `members`/`memberIds` (una transacción del cliente).
- Reglas: leer/escribir workspace e items si `request.auth.uid in memberIds`; leer el workspace también si su email está
  en `invitedEmails`; solo el `owner` cambia `name/color/emoji/bg/invitedEmails/inviteToken` y quita miembros; cada uno puede
  salirse; `items` validados (tamaño, campos). Regenerar `inviteToken` invalida enlaces viejos.

## Enlaces de invitación
- Enlace: `https://luckicla.github.io/ZenCalendar/w/#<wid>.<token>` (corto, se ve bien en WhatsApp con su vista previa:
  `docs/w/index.html` con Open Graph «Te han invitado a <nombre> en ZenCalendar» genérico, porque la página es estática).
- La página `docs/w/` intenta abrir la app: Android con `intent://join/<código>#Intent;scheme=zencalendar;package=com.luckicla.zencalendar;S.browser_fallback_url=…;end`,
  Windows con `zencalendar://join/#…`, y si no, botones «Abrir en la app» / «Descargar ZenCalendar» / «Abrir en el navegador»
  (`../app/?join=<wid>.<token>`).
- Compartir: botón «Invitar» → hoja con «Copiar enlace», «WhatsApp» (`https://wa.me/?text=`), «Correo» (`mailto:` con el
  enlace) y «Compartir…» (`navigator.share` / Android share sheet), y «Invitar por correo de Google» (añade a `invitedEmails`:
  esa persona lo ve en su app al conectar esa cuenta, sin enlace).

## Núcleo web (`web/js/core/ws.js` nuevo) — agente WEB
- Carga Firebase JS SDK (modular, v10+) bajo demanda desde `https://www.gstatic.com/firebasejs/…` con `import()`; Firestore con
  caché persistente (funciona sin conexión). Auth: `signInWithCredential(GoogleAuthProvider.credential(idToken?, accessToken))`
  con el token de Google que ya da `ZC.drive`/`ZC.gcal` en cada plataforma (pide `openid email profile`); en la web se puede
  usar también el popup.
- `ZC.ws`: `available()`, `state()`, `list()`, `current()` (null = mi calendario), `await switchTo(wid|null)`, `await create({ name, color, emoji, bg })`,
  `await update(wid, patch)`, `await setBackground(wid, file|null)`, `inviteLink(wid)`, `await regenerateLink(wid)`,
  `await inviteEmail(wid, email)`, `await join(code)`, `await leave(wid)`, `await removeMember(wid, uid)`, `await remove(wid)`,
  `on('change'|'items'|'state', fn)`, `pendingInvites()` (por correo), `unread(wid)`.
- Items del workspace: el store los expone como un calendario virtual `ws:<wid>` para que las vistas, el editor y la IA
  funcionen igual (crear/editar/borrar escribe en Firestore con `onSnapshot` en tiempo real). En modo workspace, el resto
  de calendarios se ocultan (o se ven atenuados si el usuario lo activa).
- Avisos: con la app abierta, `onSnapshot`; cambios de otros → toast «Ana ha añadido “Cena el viernes”» y notificación si la
  app está en segundo plano. Para la app cerrada, el núcleo da a la plataforma lo necesario (abajo).
- `prefs.look` por workspace: `prefs.wsLook[wid]` (tema, fondo, acento… igual que el aspecto normal) — personalizable igual
  que lo demás; el color y el fondo del workspace son los de por defecto para todos, cada uno puede retocarlos para sí.
- Tests en `tests/core/ws.test.js` con un Firestore simulado (crear, invitar con token bueno/malo, unirse, editar, lápidas,
  salir, echar, regenerar enlace).

## Interfaz — agente WEB
- **Cambio de calendario MUY claro**: en la barra de arriba, a la izquierda del título, un selector (chip/botón con el emoji y
  color) «Mi calendario ▾» → menú con «Mi calendario», los workspaces (color, emoji, nombre, miembros en caritas, puntito si hay
  novedades), «Crear workspace», «Unirme con un enlace». En móvil, el mismo chip en la cabecera. Atajo: deslizar el chip.
- **En un workspace**: el título muestra el **nombre del workspace** (con su emoji y color, que se reduce con `font-size` fluido y
  elipsis si es muy largo, nunca empuja ni rompe la barra) y el mes debajo en pequeño (o al lado en PC); fuera, el mes como
  siempre. El fondo y el acento pasan a los del workspace (transición suave), con una franja o borde de su color para saber
  siempre dónde estás.
- Crear/editar workspace: nombre, emoji, color (paleta + a mano), fondo (color, foto propia, fondos animados de la app),
  miembros (caritas, quitar si eres el dueño), «Invitar», «Salir del workspace», «Borrar workspace» (dueño).
- Eventos y tareas del workspace: quién lo creó (carita), «Para: Ana» en tareas (asignar), filtro «Mis tareas».
- Unirse: pantalla bonita «Te han invitado a <nombre>» con sus colores, «Entrar» (si no hay sesión de Google, conectar primero).
- Bienvenida y Ajustes: sección «Workspaces». ES/CA/EN, Zen y Dot, móvil 360 px y PC, sin solapes, sin tics de IA.
- `docs/w/index.html` (página del enlace) con los dos diseños de la web.
- Pruebas `tests/ui/ws.js` (con `ZC.ws` simulado) y que sigan pasando todas las de siempre.

## Nativo — agente ANDROID/WINDOWS
- Android: `intent-filter` para `zencalendar://join` (y abrir `?join=` en la página), `ZC.platform.onOpen({ action: 'join', code })`;
  compartir con la hoja del sistema (`ZCAndroid.share` ya existe: que acepte texto + título y abra WhatsApp si se pide
  `{ app: 'whatsapp' }` con `com.whatsapp` y si no, la hoja); avisos con la app cerrada: `JobScheduler` periódico (~15 min, con
  red) que, con el *refresh token* de Firebase y la API key que le pasa la página (`ZCAndroid.wsCreds(json)` / borrar al salir),
  renueva el ID token (`securetoken.googleapis.com/v1/token`), consulta Firestore por REST (items `updated > último visto` de
  los workspaces del usuario, que no sean suyos) y saca notificaciones agrupadas por workspace («Ana: Cena el viernes»), con
  canal «Workspaces»; tocar abre ese workspace. Sin dependencias nuevas de Gradle. Java impecable (stubs en `/tmp/zdot/jc/`).
- Windows: `app.setAsDefaultProtocolClient('zencalendar')` + `second-instance`/`open-url` → `onOpen({ action:'join', code })`;
  comprobación cada 5 min desde el proceso principal con las mismas credenciales (o dejando viva la página en la bandeja) y
  notificación de Windows; el instalador registra el protocolo (NSIS `protocols` en `package.json`).
- `ZC.platform`: `wsCreds(creds|null)`, `onOpen` con `join`, `share({ title, text, url, app })`. Documentar en `docs/CONTRATO.md`.

Nadie hace commits ni push. Las pruebas de siempre tienen que seguir pasando.
