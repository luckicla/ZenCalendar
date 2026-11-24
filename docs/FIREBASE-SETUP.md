# Workspaces compartidos: configurar Firebase (una vez)

Los workspaces (calendarios compartidos con amigos) guardan sus eventos en **Firebase** (Firestore), que es de Google y
gratis con el plan **Spark** para lo que usa ZenCalendar. Se añade al **mismo proyecto de Google Cloud** que ya usa la app
(`zencalendar-515701`), así sirven los mismos clientes de Google y nadie tiene que iniciar sesión dos veces.

Mientras esto no esté hecho, la app funciona igual que siempre: en Ajustes → Workspaces sale «Esta versión aún no tiene
configurados los workspaces» y nada más. **No hace falta tocar el código**: los datos entran por variables del repositorio.

Hay dos formas: a mano (unos 10 minutos) o pidiéndoselo al asistente del navegador (abajo hay un texto listo para pegar).

---

## A mano, paso a paso

### 1. Añadir Firebase al proyecto que ya existe
1. Entra en <https://console.firebase.google.com> con la cuenta de Google del proyecto.
2. **Crear un proyecto** → abajo del todo, **«Añadir Firebase a un proyecto de Google Cloud»** (o «Usar un proyecto
   existente») → elige **`zencalendar-515701`**.
3. Google Analytics: **no hace falta** (puedes desactivarlo). Plan: **Spark (gratis)**. No actives la facturación.

### 2. Firestore (la base de datos)
1. Menú de la izquierda → **Compilación → Firestore Database** → **Crear base de datos**.
2. Edición **Standard**, ID `(default)`, ubicación **`europe-west1` (Bélgica)** o cualquier `europe-west*`. *La ubicación no
   se puede cambiar después.*
3. Empieza en **modo de producción** (todo cerrado). En el paso 4 se ponen las reglas buenas.

### 3. Inicio de sesión con Google
1. **Compilación → Authentication** → **Comenzar**.
2. Pestaña **Método de inicio de sesión** → **Google** → **Habilitar**. Correo de asistencia: el tuyo. Guardar.
   (Firebase usa el cliente OAuth web que ya existe en el proyecto; no hay que crear otro.)
3. Pestaña **Configuración → Dominios autorizados** → **Añadir dominio** → `luckicla.github.io`
   (`localhost` ya viene; déjalo para probar).

### 4. Las reglas de seguridad
1. **Firestore Database → Reglas**.
2. Borra lo que haya y pega **entero** el archivo [`firestore.rules`](../firestore.rules) del repositorio.
3. **Publicar**. (Con estas reglas cada workspace solo lo ven sus miembros; nadie puede listar los de otros, y para entrar
   con un enlace hay que saber su clave.)

### 5. Registrar la app web y copiar sus datos
1. **Configuración del proyecto** (rueda dentada arriba a la izquierda) → **General** → abajo, **Tus apps** → icono **`</>`**
   (Web).
2. Apodo: `ZenCalendar`. **No** marques Firebase Hosting. **Registrar app**.
3. Sale un bloque `const firebaseConfig = { … }`. Apunta cuatro valores:
   - `apiKey` → **FIREBASE_API_KEY**
   - `appId` → **FIREBASE_APP_ID**
   - `projectId` → **FIREBASE_PROJECT_ID** (será `zencalendar-515701`)
   - `messagingSenderId` → **FIREBASE_SENDER_ID**

   (La `apiKey` de Firebase no es secreta: identifica el proyecto. Lo que protege los datos son las reglas del paso 4.)

### 6. Las variables del repositorio
En GitHub: **luckicla/ZenCalendar → Settings → Secrets and variables → Actions → pestaña Variables → New repository
variable**, cuatro veces:

| Nombre | Valor |
|---|---|
| `FIREBASE_API_KEY` | el `apiKey` |
| `FIREBASE_APP_ID` | el `appId` |
| `FIREBASE_PROJECT_ID` | el `projectId` |
| `FIREBASE_SENDER_ID` | el `messagingSenderId` |

Son **variables** (no secretos), igual que `GOOGLE_WEB_CLIENT_ID`. La siguiente compilación (APK, Windows y la web) ya
trae los workspaces. Para forzarla: **Actions → ZenCalendar (APK + exe) → Run workflow** y lo mismo con **Web (GitHub Pages)**.

### 7. (Si la clave de API está restringida)
Si en Google Cloud → **APIs y servicios → Credenciales** la clave de API («Browser key», la que creó Firebase) tiene
restricciones de sitio web, añade `https://luckicla.github.io/*` y `http://localhost/*`. Si tiene restricciones de API,
que incluyan **Cloud Firestore API**, **Identity Toolkit API** y **Token Service API**. Si no tiene restricciones, no toques nada.

### Comprobar que va
1. Abre <https://luckicla.github.io/zencalendar/app/> → arriba, **Mi calendario ▾** → **Conectar con Google**.
2. **Crear workspace** → ponle nombre → **Invitar** → **Copiar** y abre el enlace en otro navegador o en el móvil.
3. En la consola de Firebase → Firestore verás `workspaces/…` con sus `items`.

### Lo que cuesta
Nada con el plan Spark: 50 000 lecturas y 20 000 escrituras al día, 1 GB guardado. Un grupo de amigos usa una parte
pequeñísima. Si algún día se llegara al límite, Firestore deja de contestar hasta el día siguiente (no cobra nada: el plan
Spark no tiene tarjeta).

### Problemas típicos
- **«Google no ha aceptado el inicio de sesión»**: falta habilitar Google en Authentication (paso 3) o la clave de API
  está restringida (paso 7).
- **«No tienes permiso…» al crear**: las reglas no están publicadas (paso 4).
- **La ventanita de Google no sale en la web**: falta `luckicla.github.io` en Dominios autorizados (paso 3).
- **Sale «aún no tiene configurados los workspaces»**: faltan variables (paso 6) o la compilación es de antes.

---

## Con el asistente del navegador

Abre la consola de Firebase con tu cuenta de Google iniciada y pega esto al asistente (Claude en Chrome, por ejemplo).
Te pedirá confirmación antes de los pasos importantes.

```text
Necesito configurar Firebase para mi app ZenCalendar. Hazlo paso a paso en el navegador y pídeme confirmación antes de
crear o publicar nada. No actives la facturación ni Google Analytics.

1. En https://console.firebase.google.com añade Firebase al proyecto de Google Cloud que YA EXISTE "zencalendar-515701"
   («Añadir Firebase a un proyecto de Google Cloud»). Plan Spark (gratis). Sin Google Analytics.
2. Crea la base de datos Cloud Firestore: edición Standard, ID "(default)", ubicación "europe-west1", modo de producción.
3. En Authentication → Método de inicio de sesión, habilita el proveedor "Google" (correo de asistencia: el mío).
   En Authentication → Configuración → Dominios autorizados, añade "luckicla.github.io" (deja "localhost").
4. En Firestore Database → Reglas, sustituye todo por el contenido EXACTO del archivo firestore.rules de
   https://github.com/luckicla/ZenCalendar/blob/main/firestore.rules (ábrelo en "Raw" y cópialo entero) y publícalo.
5. En Configuración del proyecto → General → Tus apps, registra una app Web llamada "ZenCalendar" (sin Firebase Hosting).
   Copia de su firebaseConfig: apiKey, appId, projectId y messagingSenderId.
6. En https://github.com/luckicla/ZenCalendar/settings/variables/actions crea cuatro "Repository variables" (Variables,
   no Secrets): FIREBASE_API_KEY = apiKey, FIREBASE_APP_ID = appId, FIREBASE_PROJECT_ID = projectId,
   FIREBASE_SENDER_ID = messagingSenderId.
7. En https://console.cloud.google.com/apis/credentials?project=zencalendar-515701 mira la clave de API que creó Firebase
   ("Browser key"): si tiene restricciones de sitio web, que incluyan https://luckicla.github.io/* y http://localhost/*;
   si tiene restricciones de API, que incluyan Cloud Firestore API, Identity Toolkit API y Token Service API.
   Si no tiene restricciones, no la cambies.
8. En https://github.com/luckicla/ZenCalendar/actions lanza "Run workflow" en "ZenCalendar (APK + exe)" y en
   "Web (GitHub Pages)".
Al acabar, dime qué valores has puesto en las variables (la apiKey puedes enseñarla: no es secreta) y si algo ha fallado.
```
