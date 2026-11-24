# Conectar ZenCalendar con Google Drive (lo que hay que hacer UNA vez)

Esto es para mí (Lluc), no para la gente que usa la app. Para el usuario final es **un solo botón**: «Conectar con Google» → elige su cuenta → «Permitir», y listo. No tiene que configurar nada, ni crear nada, ni copiar claves.

Para que ese botón funcione, Google tiene que saber que la app existe. Eso se hace una vez en Google Cloud (gratis) y luego los «client IDs» se ponen en las variables del repositorio para que GitHub Actions los meta en la app al compilar.

Mientras no esté hecho, la app funciona perfectamente pero sin sincronizar (el botón sale gris con «Falta configurar Google»).

## Qué permisos pide la app

- `https://www.googleapis.com/auth/drive.appdata`: solo la **carpeta oculta de la app** en el Drive del usuario. ZenCalendar no puede ver ni tocar ningún otro archivo de su Drive, y el usuario no ve esta carpeta en drive.google.com (aunque ocupa su espacio, muy poquito). Google lo clasifica como permiso **no sensible**, así que no hace falta la verificación larga de Google.
- `openid email profile`: para enseñar en Ajustes con qué cuenta está conectado (correo, nombre y foto).
- `https://www.googleapis.com/auth/calendar` (solo cuando el usuario pulsa «Añadir cuenta de Google» o «Usar también tus calendarios» en Ajustes → Cuentas de Google, se pide en ese momento y no antes, y por cada cuenta que conecte): para leer y escribir sus calendarios de Google Calendar. Google lo clasifica como **sensible**: mientras Google no verifique la app, al dar permiso sale un aviso de «Google no ha verificado esta app» (se pulsa *Configuración avanzada → Ir a ZenCalendar*) y como mucho 100 personas pueden usar esa parte. Para ti y la gente cercana es suficiente; si algún día la usa mucha gente, se pide la verificación (gratis, con una política de privacidad y un vídeo corto). La sincronización con Drive no se ve afectada.

Lo que se guarda ahí: `zencalendar.json` (eventos, calendarios y ajustes) y un archivo `blob-<id>` por cada imagen adjunta.

## 1. Crear el proyecto

1. Entra en [console.cloud.google.com](https://console.cloud.google.com/) con tu cuenta de Google.
2. Arriba, en el selector de proyectos → **Proyecto nuevo** → nombre `ZenCalendar` → **Crear**. Asegúrate de que queda seleccionado.

## 2. Activar las APIs de Google Drive y Google Calendar

1. Menú ☰ → **APIs y servicios → Biblioteca**.
2. Busca **Google Drive API** → **Habilitar**.
3. Vuelve a la biblioteca, busca **Google Calendar API** → **Habilitar**. (Es para traer y sincronizar tus calendarios de Google Calendar. Actívala ya aunque esa parte llegue en una versión siguiente: así no tienes que volver a la consola.)

## 3. Pantalla de consentimiento (lo que ve el usuario al pulsar el botón)

Menú ☰ → **APIs y servicios → Pantalla de consentimiento de OAuth** (en la consola nueva se llama **Google Auth Platform**). Si te pide empezar, dale a **Comenzar**:

1. **Información de la app**: nombre `ZenCalendar` y tu correo como correo de asistencia.
2. **Público**: **Externo** (cualquiera con una cuenta de Google).
3. **Información de contacto**: tu correo.
4. Acepta la política de datos de usuario y **Crear**.

Luego, en las secciones de la izquierda:

- **Desarrollo de la marca** (Branding):
  - Página principal de la app: `https://luckicla.github.io/zencalendar/`
  - Política de privacidad: `https://luckicla.github.io/zencalendar/#privacidad` (el apartado «Privacidad» de la web; Google prefiere que esté en un dominio autorizado, como este).
  - Dominios autorizados: `luckicla.github.io`
  - El logo es opcional. Si lo subes, Google tiene que revisar la marca (unos días) antes de enseñarlo; se puede dejar para después.
- **Acceso a los datos** (Data Access) → **Añadir o quitar permisos**: marca `.../auth/drive.appdata`, `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` y `.../auth/calendar` (sale en la tabla de «permisos sensibles») → **Actualizar** → **Guardar**.

## 4. Los tres «clientes» (uno por plataforma)

Menú ☰ → **APIs y servicios → Credenciales** (o **Google Auth Platform → Clientes**) → **Crear credenciales → ID de cliente de OAuth**. Hay que crear tres:

### a) Web (para la app en GitHub Pages)

- Tipo: **Aplicación web**. Nombre: `ZenCalendar web`.
- **Orígenes de JavaScript autorizados**: `https://luckicla.github.io`
  (la app web está en `https://luckicla.github.io/zencalendar/app/`, pero aquí solo va el origen, sin ruta).
  Si quieres probar en tu ordenador, añade también `http://localhost:8000`.
- **URIs de redireccionamiento**: ninguna (no hace falta).
- Crear → copia el **ID de cliente** (acaba en `.apps.googleusercontent.com`).

### b) Windows (la app de escritorio)

- Tipo: **App de escritorio**. Nombre: `ZenCalendar Windows`.
- Crear → copia el **ID de cliente** y el **secreto del cliente**.
- **URIs de redireccionamiento: ninguna** (este tipo de cliente ni siquiera lo pide). La app abre el navegador con la página de Google y la respuesta vuelve a `http://127.0.0.1:<puerto>`, un servidor pequeñito que la app abre solo durante el inicio de sesión (el método «loopback» que Google permite a las apps de escritorio, con cualquier puerto). Por eso tiene que ser de tipo **App de escritorio**: con uno de tipo «Aplicación web» Google contesta `redirect_uri_mismatch`.
- (En las apps de escritorio Google sabe que el «secreto» no es secreto de verdad, porque va dentro del programa; por eso además se usa PKCE. Va en una *variable* del repo, no hace falta que sea un *secret*.)

### c) Android

- Tipo: **Android**. Nombre: `ZenCalendar Android`.
- **Nombre del paquete**: `com.luckicla.zencalendar`
- **Huella digital del certificado SHA-1** (la de la clave de desarrollo del repo, `android/app/zencalendar-dev.keystore`):

  ```
  4C:8B:68:31:6E:B9:5A:9C:5D:6C:94:A3:9B:2A:07:89:63:FE:57:E9
  ```

  (por si la necesitas, la SHA-256 es `56:21:E7:8A:B7:A2:E2:6E:53:C4:26:F2:2A:83:6E:16:EA:25:A7:01:86:42:13:E5:DC:56:CC:AA:85:DE:94:F1`)
- Crear. **No hay que copiar nada**: en Android no se pone ningún ID en la app; Google la reconoce por el paquete y la firma.

Si algún día cambias la clave con la que se firma la APK, hay que cambiar aquí la huella. Para verla:

```sh
keytool -list -v -keystore android/app/zencalendar-dev.keystore -storepass zencalendardev -alias zencalendar
```

## 5. Ponerlos en el repositorio

En GitHub: **luckicla/zencalendar → Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**, y crea estas tres:

| Variable | Valor |
| --- | --- |
| `GOOGLE_WEB_CLIENT_ID` | el ID del cliente **web** |
| `GOOGLE_DESKTOP_CLIENT_ID` | el ID del cliente de **escritorio** |
| `GOOGLE_DESKTOP_CLIENT_SECRET` | el secreto del cliente de **escritorio**. Mejor como **secreto** (pestaña *Secrets → New repository secret*, mismo nombre) que como variable |
| `GOOGLE_ANDROID_ENABLED` | `1` cuando ya hayas creado el cliente de **Android** (paquete + SHA-1). Si pones `GOOGLE_WEB_CLIENT_ID` no hace falta: se da por hecho. Hasta entonces, la app de Android no enseña el botón «Conectar con Google» (Google la rechazaría) |

Los workflows (`build.yml` y `pages.yml`) los escriben en `web/js/core/config.js` al compilar (con `tools/setconfig.js`). En el repo `config.js` se queda vacío, que así no hay nada de esto en el código.

Después, en la pestaña **Actions**, vuelve a lanzar «ZenCalendar (APK + exe)» y «Web (GitHub Pages)» (botón **Run workflow**), o haz cualquier cambio en `main`.

Para GitHub Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions** (una vez, antes de la primera publicación).

Si las variables no están, los workflows compilan igual (la app sale sin Drive, con el botón en gris). En Android no hace falta ninguna variable.

## 6. Pasar la app a «En producción»

Mientras la app está «En pruebas», solo pueden conectarse los correos que pongas como usuarios de prueba (como mucho 100) y Google desconecta a todo el mundo cada 7 días. Para que funcione para cualquiera y para siempre:

**Google Auth Platform → Público → Publicar app → Confirmar.**

Drive solo usa permisos no sensibles, así que esa parte funciona para todo el mundo sin la verificación de Google. Si Google pide verificar la marca (nombre/logo), es gratis: sigue los pasos que te diga (normalmente demostrar que `luckicla.github.io` es tuyo con Google Search Console).

Google Calendar sí usa un permiso **sensible** (`auth/calendar`): mira el paso 7.

## 7. Google Calendar y la verificación de Google

Ya está hecho: Calendar API activada, el permiso `.../auth/calendar` declarado y los tres clientes creados. **No hay que tocar
nada más ni poner variables nuevas**: Google Calendar usa los mismos client IDs que Drive (los mete el workflow en `config.js`).

Mientras Google no verifique la app pasa esto, solo en la parte de Google Calendar (Drive sigue igual):

- Al dar permiso sale la pantalla **«Google no ha verificado esta app»**. Se pulsa **Configuración avanzada → Ir a ZenCalendar (no seguro)** y luego se marca la casilla de Google Calendar. La app lo explica en una línea antes de abrir Google.
- Como mucho **100 cuentas** distintas pueden dar ese permiso en total (Google lo cuenta para siempre, aunque luego lo quiten). Para ti, tu familia y amigos sobra.
- Si la app está «En pruebas» (no publicada), solo pueden los usuarios de prueba y el permiso caduca cada 7 días. Publícala (paso 6) aunque no esté verificada.

### Pedir la verificación (gratis, cuando la quiera usar más gente)

**Google Auth Platform → Centro de verificación (Verification Center) → Preparar para la verificación**. Hace falta:

1. **Página principal** (`https://luckicla.github.io/zencalendar/`) que diga qué hace la app y enlace a la política de privacidad, en el dominio verificado (`luckicla.github.io`: se demuestra que es tuyo con Google Search Console, añadiendo la propiedad con la etiqueta HTML o el archivo que te den, en `docs/`).
2. **Política de privacidad** (`https://luckicla.github.io/zencalendar/#privacidad`) que diga, con estas palabras o parecidas, qué se hace con los datos de Google Calendar: que se leen y escriben solo para enseñarlos y editarlos en la app, que se guardan solo en el dispositivo del usuario (y nada en servidores de ZenCalendar, que no tiene), que no se comparten con nadie ni se usan para publicidad ni para entrenar modelos de IA, y que cumple la [Política de datos de usuario de los servicios de API de Google](https://developers.google.com/terms/api-services-user-data-policy), incluidos los requisitos de **uso limitado** (Limited Use). Que se pueda quitar el permiso desde la app (Quitar cuenta) o desde `myaccount.google.com/permissions`.
3. **Justificación del permiso** (el cuadro de texto para `.../auth/calendar`). Se puede pegar esto:

   > ZenCalendar es un calendario para Android, Windows y web. El usuario puede conectar una o varias cuentas de Google para ver sus calendarios de Google Calendar dentro de la app y crear, editar y borrar eventos en ellos (sincronización en las dos direcciones, incluidas las repeticiones, los avisos y los colores). Necesitamos `calendar` (y no `calendar.readonly` ni `calendar.events`) porque la app lista los calendarios del usuario (calendarList) para que elija cuáles ver y escribe eventos en ellos. Los datos se quedan en el dispositivo del usuario; ZenCalendar no tiene servidores y no comparte ni vende datos.

4. **Vídeo de demostración** (de 1 a 3 minutos, subido a YouTube como «oculto»): se ve la pantalla de permiso de Google en inglés o español con el **client ID en la barra de direcciones** (en la web se ve en la ventanita de Google; en Windows en el navegador), el usuario da permiso, y luego en la app: sus calendarios de Google, crear un evento y verlo aparecer en `calendar.google.com`, editarlo y borrarlo, y cómo quitar la cuenta. Graba la versión web (`https://luckicla.github.io/zencalendar/app/`) y, si puedes, también la de Windows y la de Android, porque cada cliente se revisa.
5. **Correo de contacto** que mires: Google escribe allí con preguntas; contestar rápido acorta la revisión (suele tardar de unos días a unas semanas).

Con `auth/calendar` no hace falta la auditoría de seguridad de pago (eso es solo para permisos «restringidos», como el Drive completo o Gmail).

## Cómo comprobar que va

- **Web**: abre `https://luckicla.github.io/zencalendar/app/` → Ajustes → Google Drive → «Conectar con Google». Sale la ventanita de Google, eliges la cuenta y vuelve con tu correo y tu foto.
- **Windows**: el mismo botón abre el navegador con la página de Google; al terminar dice «¡Conectado! ✿» y puedes cerrar la pestaña.
- **Android**: el mismo botón enseña la hoja de Google para elegir la cuenta y dar permiso.
- Crea un evento en un sitio y en 2–3 segundos (o al pulsar «Sincronizar») aparece en el otro.
- **Google Calendar**: Ajustes → Cuentas de Google → «Añadir cuenta de Google» → eliges la cuenta → aviso de «no verificada» (paso 7) → marcas Google Calendar. Salen tus calendarios; crea un evento en uno de ellos y en unos segundos está en `calendar.google.com` (y lo que cambies allí llega a la app en la siguiente sincronización, como mucho en 5 minutos o al volver a la app).

## Si algo falla

- **«Falta configurar Google»**: la variable de esa plataforma no está puesta o la app se compiló antes de ponerla. Vuelve a lanzar el workflow.
- **Web: «Error 400: redirect_uri_mismatch» o «origin_mismatch»**: el origen autorizado del cliente web no es exactamente `https://luckicla.github.io`.
- **Android: «Error 10» (DEVELOPER_ERROR) o no sale la hoja de Google**: el paquete o la huella SHA-1 del cliente Android no coinciden con la APK. También tarda unos minutos en funcionar después de crear el cliente.
- **«Acceso bloqueado: la app no se ha verificado» / solo funciona para ti**: la app sigue «En pruebas» (paso 6).
- **Google Calendar: «Google no ha verificado esta app»**: normal mientras no esté verificada (paso 7): *Configuración avanzada → Ir a ZenCalendar*. Si sale «Hace falta marcar el permiso de Google Calendar», en esa pantalla no se marcó la casilla: vuelve a intentarlo y márcala.
- **Google Calendar: «Error 403: access_denied» con el permiso de Calendar**: falta añadir `.../auth/calendar` en *Acceso a los datos* (paso 3), o ya se llegó a las 100 cuentas sin verificar.
- **Windows: el navegador dice que no puede conectar con 127.0.0.1**: es normal si se tardó más de 5 minutos; vuelve a pulsar el botón.
- **Windows: «Error 400: redirect_uri_mismatch» o «invalid_client»**: el cliente de `GOOGLE_DESKTOP_CLIENT_ID` no es de tipo «App de escritorio», o el secreto (`GOOGLE_DESKTOP_CLIENT_SECRET`) no es el de ese mismo cliente.
