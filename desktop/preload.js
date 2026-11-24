'use strict';
// Lo que la página de ZenCalendar puede pedirle a la app de Windows: window.zcDesktop
// (lo usa web/js/core: platform.js, net.js, drive.js, reminders.js)
const { contextBridge, ipcRenderer } = require('electron');

const roleArg = process.argv.find(a => a.startsWith('--zc-role='));
const role = roleArg ? roleArg.split('=')[1] : 'main';
const listen = (channel, cb) => {
  const f = (_e, data) => cb(data);
  ipcRenderer.on(channel, f);
  return () => ipcRenderer.removeListener(channel, f);
};

contextBridge.exposeInMainWorld('zcDesktop', {
  role,
  info: () => ipcRenderer.invoke('zc:info'),
  // ventana: 'min' | 'max' (alterna) | 'close' | '' (solo el estado) → { max, full }
  win: what => ipcRenderer.invoke('zc:win', what || ''),
  onWin: cb => listen('zc:win-state', cb),
  // petición sin CORS: { url, method, headers, body (texto o Uint8Array), timeout } → { status, statusText, headers, body } | { error }
  fetch: req => ipcRenderer.invoke('zc:fetch', req),
  setReminders: (list, strings) => ipcRenderer.send('zc:reminders', list, strings),
  setTheme: t => ipcRenderer.send('zc:theme', t),
  // 'mica' | 'acrylic' | 'none' (Windows 11)
  material: m => ipcRenderer.invoke('zc:material', m),
  setIcon: id => ipcRenderer.invoke('zc:icon', id),
  widget: on => ipcRenderer.invoke('zc:widget', on),
  widgetPin: pin => ipcRenderer.invoke('zc:widget-pin', pin),
  onWidget: cb => listen('zc:widget', cb),
  autostart: on => ipcRenderer.invoke('zc:autostart', on),
  openExternal: url => ipcRenderer.send('zc:external', url),
  // notificación / bandeja → abrir algo; lo que llegó antes de escuchar se entrega al empezar
  onOpen: cb => {
    const off = listen('zc:open', cb);
    ipcRenderer.invoke('zc:take-open').then(list => { for (const o of list || []) cb(o); }).catch(() => {});
    return off;
  },
  // (desde el widget) abrir algo en la ventana principal
  openMain: o => ipcRenderer.send('zc:open-main', o),
  onAction: cb => listen('zc:action', cb),
  // Google: Drive → 'connect' | 'token' | 'disconnect' | 'status'
  //         Google Calendar → 'add' (cfg.loginHint) | 'token' (cfg.account) | 'remove' ({ account, revoke }) | 'accounts'
  google: (cmd, cfg) => ipcRenderer.invoke('zc:google', cmd, cfg),
  // workspaces: credenciales de Firebase para los avisos con la ventana cerrada (null = olvidarlas).
  // { apiKey, projectId, uid, refreshToken, idToken?, expiresAt?, since?, strings? } (ver docs/CONTRATO.md)
  wsCreds: c => ipcRenderer.send('zc:ws-creds', c && typeof c === 'object' ? JSON.parse(JSON.stringify(c)) : null),
  // compartir: { title, text, url, app: 'whatsapp' | 'email' } → 'whatsapp' | 'email' | 'copied' | false
  share: o => ipcRenderer.invoke('zc:share', o && typeof o === 'object' ? JSON.parse(JSON.stringify(o)) : {}),
  // actualizaciones: 'check' | 'install' | 'state'
  update: cmd => ipcRenderer.invoke('zc:update', cmd),
  onUpdate: cb => listen('zc:update', cb),
});
