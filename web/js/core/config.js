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
    // permisos que se piden a Google: solo la carpeta oculta de la app en tu
    // Drive (no ve el resto de tus archivos) y tu nombre/correo/foto
    googleScopes: 'https://www.googleapis.com/auth/drive.appdata openid email profile',
    // nombre del archivo de datos en la carpeta oculta de Drive
    driveFile: 'zencalendar.json',
    repo: 'luckicla/zencalendar',
  };
})(typeof window !== 'undefined' ? window : globalThis);
