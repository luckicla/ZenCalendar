'use strict';
// ZenCalendar: configuración general.
//
// Los client IDs de Google los escribe el workflow de GitHub al compilar, a
// partir de las variables del repositorio (GOOGLE_WEB_CLIENT_ID,
// GOOGLE_DESKTOP_CLIENT_ID, GOOGLE_DESKTOP_CLIENT_SECRET). Si están vacíos la
// app funciona igual, solo que sin sincronizar con Google Drive
// (ver docs/GOOGLE-SETUP.md).
//
// En Android no hace falta ningún client ID aquí: Google reconoce la app por
// su paquete y la huella SHA-1 de la firma.
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  ZC.config = {
    app: 'ZenCalendar',
    version: '1.0.0',
    // ↓ no cambiar el formato de estas líneas (ni el de «version»): los workflows
    //   las rellenan con tools/setconfig.js
    googleWebClientId: '',
    googleDesktopClientId: '',
    googleDesktopClientSecret: '',
    // Android: '1' cuando la app ya está registrada en Google Cloud (paquete + SHA-1). Hasta
    // entonces no se enseña el botón de conectar, porque Google la rechazaría. También vale
    // con que haya client ID web: quiere decir que Google ya está configurado.
    googleAndroid: '',
    // Firebase (workspaces compartidos): los rellena el workflow con las variables del repo
    // FIREBASE_API_KEY, FIREBASE_APP_ID, FIREBASE_PROJECT_ID y FIREBASE_SENDER_ID
    // (ver docs/FIREBASE-SETUP.md). Vacíos = sin workspaces, y todo lo demás funciona igual.
    firebaseApiKey: '',
    firebaseAppId: '',
    firebaseProjectId: '',
    firebaseSenderId: '',
    // permisos que se piden a Google: solo la carpeta oculta de la app en tu
    // Drive (no ve el resto de tus archivos) y tu nombre/correo/foto
    googleScopes: 'https://www.googleapis.com/auth/drive.appdata openid email profile',
    // nombre del archivo de datos en la carpeta oculta de Drive
    driveFile: 'zencalendar.json',
    repo: 'luckicla/zencalendar',
    // la página de los enlaces de invitación (docs/w/)
    inviteBase: 'https://luckicla.github.io/ZenCalendar/w/',
  };
})(typeof window !== 'undefined' ? window : globalThis);
