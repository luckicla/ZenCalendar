# Conectar ZenCalendar con Google Drive (lo que hay que hacer UNA vez)

Esto es para mí (Lluc), no para la gente que usa la app. Para el usuario final es **un solo botón**: «Conectar con Google» → elige su cuenta → «Permitir», y listo. No tiene que configurar nada, ni crear nada, ni copiar claves.

Para que ese botón funcione, Google tiene que saber que la app existe. Eso se hace una vez en Google Cloud (gratis) y luego los «client IDs» se ponen en las variables del repositorio para que GitHub Actions los meta en la app al compilar.

Mientras no esté hecho, la app funciona perfectamente pero sin sincronizar (el botón sale gris con «Falta configurar Google»).

## Qué permisos pide la app

- `https://www.googleapis.com/auth/drive.appdata`: solo la **carpeta oculta de la app** en el Drive del usuario. ZenCalendar no puede ver ni tocar ningún otro archivo de su Drive, y el usuario no ve esta carpeta en drive.google.com (aunque ocupa su espacio, muy poquito). Google lo clasifica como permiso **no sensible**, así que no hace falta la verificación larga de Google.
- `openid email profile`: para enseñar en Ajustes con qué cuenta está conectado (correo, nombre y foto).

Lo que se guarda ahí: `zencalendar.json` (eventos, calendarios y ajustes) y un archivo `blob-<id>` por cada imagen adjunta.

## 1. Crear el proyecto

1. Entra en [console.cloud.google.com](https://console.cloud.google.com/) con tu cuenta de Google.
2. Arriba, en el selector de proyectos → **Proyecto nuevo** → nombre `ZenCalendar` → **Crear**. Asegúrate de que queda seleccionado.

## 2. Activar la API de Google Drive

1. Menú ☰ → **APIs y servicios → Biblioteca**.
2. Busca **Google Drive API** → **Habilitar**.

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
- **Acceso a los datos** (Data Access) → **Añadir o quitar permisos**: marca `.../auth/drive.appdata`, `openid`, `.../auth/userinfo.email` y `.../auth/userinfo.profile` → **Actualizar** → **Guardar**.

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
| `GOOGLE_DESKTOP_CLIENT_SECRET` | el secreto del cliente de **escritorio** |

Los workflows (`build.yml` y `pages.yml`) los escriben en `web/js/core/config.js` al compilar (con `tools/setconfig.js`). En el repo `config.js` se queda vacío, que así no hay nada de esto en el código.

Después, en la pestaña **Actions**, vuelve a lanzar «ZenCalendar (APK + exe)» y «Web (GitHub Pages)» (botón **Run workflow**), o haz cualquier cambio en `main`.

Para GitHub Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions** (una vez, antes de la primera publicación).

Si las variables no están, los workflows compilan igual (la app sale sin Drive, con el botón en gris). En Android no hace falta ninguna variable.

## 6. Pasar la app a «En producción»

Mientras la app está «En pruebas», solo pueden conectarse los correos que pongas como usuarios de prueba (como mucho 100) y Google desconecta a todo el mundo cada 7 días. Para que funcione para cualquiera y para siempre:

**Google Auth Platform → Público → Publicar app → Confirmar.**

Como solo usa permisos no sensibles, no hace falta la verificación de Google (la que pide vídeos y revisiones). Si Google pide verificar la marca (nombre/logo), es gratis: sigue los pasos que te diga (normalmente demostrar que `luckicla.github.io` es tuyo con Google Search Console).

## Cómo comprobar que va

- **Web**: abre `https://luckicla.github.io/zencalendar/app/` → Ajustes → Google Drive → «Conectar con Google». Sale la ventanita de Google, eliges la cuenta y vuelve con tu correo y tu foto.
- **Windows**: el mismo botón abre el navegador con la página de Google; al terminar dice «¡Conectado! ✿» y puedes cerrar la pestaña.
- **Android**: el mismo botón enseña la hoja de Google para elegir la cuenta y dar permiso.
- Crea un evento en un sitio y en 2–3 segundos (o al pulsar «Sincronizar») aparece en el otro.

## Si algo falla

- **«Falta configurar Google»**: la variable de esa plataforma no está puesta o la app se compiló antes de ponerla. Vuelve a lanzar el workflow.
- **Web: «Error 400: redirect_uri_mismatch» o «origin_mismatch»**: el origen autorizado del cliente web no es exactamente `https://luckicla.github.io`.
- **Android: «Error 10» (DEVELOPER_ERROR) o no sale la hoja de Google**: el paquete o la huella SHA-1 del cliente Android no coinciden con la APK. También tarda unos minutos en funcionar después de crear el cliente.
- **«Acceso bloqueado: la app no se ha verificado» / solo funciona para ti**: la app sigue «En pruebas» (paso 6).
- **Windows: el navegador dice que no puede conectar con 127.0.0.1**: es normal si se tardó más de 5 minutos; vuelve a pulsar el botón.
- **Windows: «Error 400: redirect_uri_mismatch» o «invalid_client»**: el cliente de `GOOGLE_DESKTOP_CLIENT_ID` no es de tipo «App de escritorio», o el secreto (`GOOGLE_DESKTOP_CLIENT_SECRET`) no es el de ese mismo cliente.
