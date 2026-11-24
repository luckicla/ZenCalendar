'use strict';
// ZenCalendar para Windows (Electron, como MixUp y Compass Launcher).
//
//  - La interfaz es la misma de Android y de la web (carpeta web/), servida
//    con un protocolo propio: app://zencalendar/index.html (así IndexedDB,
//    fetch y todo lo demás funcionan como en una web segura).
//  - Ventana sin marco: la barra con minimizar/maximizar/cerrar la dibuja la
//    página (IPC 'zc:win').
//  - Al cerrar la ventana se queda en la bandeja del sistema y los avisos
//    siguen saliendo (los programa este proceso con lo que le pasa ZC.reminders).
//  - Widget de escritorio: una ventanita transparente con web/widget.html.
//  - Inicio de sesión de Google para Drive (google.js) y peticiones sin CORS (IPC 'zc:fetch').
//  - Instalada: se actualiza sola desde la release «pc-latest» (electron-updater).
const { app, BrowserWindow, Menu, Tray, Notification, shell, ipcMain, nativeImage, protocol, net, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const google = require('./google');

const APP_ID = 'com.luckicla.zencalendar.desktop';
const ORIGIN = 'app://zencalendar';
const RELEASES = 'https://github.com/luckicla/zencalendar/releases';
const UPDATES = RELEASES + '/download/pc-latest/';
const portableFile = process.env.PORTABLE_EXECUTABLE_FILE || '';
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || '';
const portable = !!portableFile;

// portable: los datos van junto al .exe (en un USB, en el USB)
if (portable) {
  try { app.setPath('userData', path.join(portableDir, 'ZenCalendar-datos')); } catch (e) {}
}
app.setAppUserModelId(APP_ID);
app.commandLine.appendSwitch('disable-features', 'Translate');

// el protocolo propio tiene que registrarse antes de que la app esté lista
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

const first = app.requestSingleInstanceLock();
if (!first) app.quit(); // ya estaba abierta: la otra se pone delante (second-instance)

let win = null, widget = null, tray = null, quitting = false;
const startHidden = process.argv.includes('--hidden');

// ---------- ajustes de esta app (solo de este PC) ----------
const settingsFile = () => path.join(app.getPath('userData'), 'escritorio.json');
let S = {};
function loadSettings() { try { S = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (e) { S = {}; } }
let saveT = null;
function saveSettings() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(S, null, 2)); } catch (e) {} }, 300);
}

// '#abc' / '#aabbcc' → '#aabbcc' (o null si no es un color así)
function hex6(c) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1];
  return '#' + h.toUpperCase();
}

function log(m) {
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'escritorio.log'), new Date().toISOString() + ' ' + m + '\n'); } catch (e) {}
}

// ---------- archivos ----------
function webDir() {
  const packed = path.join(process.resourcesPath || '', 'web');
  if (app.isPackaged && fs.existsSync(packed)) return packed;
  return path.join(__dirname, '..', 'web');
}
function buildFile(...p) {
  const packed = path.join(process.resourcesPath || '', ...p);
  if (app.isPackaged && fs.existsSync(packed)) return packed;
  return path.join(__dirname, 'build', ...p);
}
function iconFile(id) {
  const f = buildFile('icons', (id || 'pastel') + '.ico');
  return fs.existsSync(f) ? f : buildFile('icon.ico');
}
// el icono que toca: el que eligió el usuario; si nunca eligió, el del diseño (Dot → 'dot')
const effIcon = () => S.icon || (S.design === 'dot' ? 'dot' : 'pastel');
// Dot no lleva Mica ni acrílico: ventana opaca, negra o blanca
const effMaterial = () => (S.design === 'dot' ? 'none' : (S.material || 'none'));

function serveApp() {
  const root = webDir();
  protocol.handle('app', req => {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(root, rel));
    // nada fuera de la carpeta web/
    if (!file.startsWith(path.normalize(root + path.sep)) || !fs.existsSync(file)) {
      return new Response('No encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---------- ventana principal ----------
function createWindow() {
  const b = S.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1180, height: b.height || 780, x: b.x, y: b.y,
    minWidth: 380, minHeight: 520,
    frame: false,
    show: false,
    backgroundColor: S.bg || '#F7F3FF',
    title: 'ZenCalendar',
    icon: iconFile(effIcon()),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      spellcheck: true,
      additionalArguments: ['--zc-role=main'],
    },
  });
  if (S.maximized) win.maximize();
  if (effMaterial() !== 'none') setMaterial(effMaterial());
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  win.loadURL(ORIGIN + '/index.html');
  links(win);
  const state = () => { if (win && !win.isDestroyed()) win.webContents.send('zc:win-state', { max: win.isMaximized(), full: win.isFullScreen() }); };
  win.on('maximize', state); win.on('unmaximize', state);
  win.on('enter-full-screen', state); win.on('leave-full-screen', state);
  const remember = () => {
    if (!win || win.isDestroyed()) return;
    S.maximized = win.isMaximized();
    if (!S.maximized && !win.isMinimized()) S.bounds = win.getBounds();
    saveSettings();
  };
  win.on('resize', remember); win.on('move', remember);
  // cerrar = a la bandeja (los avisos siguen); salir de verdad: bandeja → Salir
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!S.trayTold) {
      S.trayTold = true; saveSettings();
      notify({ title: S.design === 'dot' ? 'ZenCalendar sigue aquí' : 'ZenCalendar sigue aquí ✿', body: 'Está junto al reloj para avisarte de tus eventos. Para cerrarlo del todo: clic derecho en el icono → Salir.' });
    }
  });
  win.on('closed', () => { win = null; });
  // (Windows se apaga o se cierra la sesión: aquí sí se cierra de verdad)
  win.on('session-end', () => { quitting = true; });
  win.webContents.on('did-start-loading', () => { pageReady = false; openListening = false; });
  win.webContents.on('did-finish-load', () => { pageReady = true; flushOpen(); });
  win.webContents.on('render-process-gone', (_e, d) => {
    log('la página se cerró (' + (d && d.reason) + '): se recarga');
    pageReady = false;
    setTimeout(() => { if (win && !win.isDestroyed()) win.loadURL(ORIGIN + '/index.html'); }, 500);
  });
}

function links(w) {
  // enlaces de fuera (mapas, webs, Google…): en el navegador
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(ORIGIN)) shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) { e.preventDefault(); shell.openExternal(url); }
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// Mica/Acrílico de Windows 11 (si la página lo pide; si no, el fondo del tema).
// En el diseño Dot siempre 'none' (lo decide effMaterial()).
function setMaterial(m) {
  if (!win || process.platform !== 'win32' || typeof win.setBackgroundMaterial !== 'function') return false;
  try {
    if (m === 'mica' || m === 'acrylic' || m === 'tabbed') {
      win.setBackgroundColor('#00000000');
      win.setBackgroundMaterial(m);
    } else {
      win.setBackgroundMaterial('none');
      win.setBackgroundColor(S.bg || '#F7F3FF');
    }
    return true;
  } catch (e) { log('material: ' + e.message); return false; }
}

// ---------- «abrir» (notificaciones, bandeja, widget) ----------
let pageReady = false;
const pendingOpen = [];
function open(o) {
  showWindow();
  pendingOpen.push(o);
  flushOpen();
}
function flushOpen() {
  if (!pageReady || !win || win.isDestroyed()) return;
  // (la página recoge lo que haya con 'zc:take-open' al arrancar; si ya está, se le manda)
  if (openListening) while (pendingOpen.length) win.webContents.send('zc:open', pendingOpen.shift());
}
let openListening = false;

// ---------- avisos ----------
// La página manda los avisos de los próximos días; aquí se comprueban cada
// 15 s (así no fallan aunque el PC se duerma) y se guardan por si se reinicia.
let reminders = [];
const remFile = () => path.join(app.getPath('userData'), 'avisos.json');
let fired = new Set();
function loadReminders() {
  try { const j = JSON.parse(fs.readFileSync(remFile(), 'utf8')); reminders = j.items || []; fired = new Set(j.fired || []); } catch (e) {}
}
function saveReminders() {
  try { fs.writeFileSync(remFile(), JSON.stringify({ items: reminders, fired: [...fired].slice(-400) })); } catch (e) {}
}
function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const r of reminders) {
    const key = r.id + '@' + r.at;
    if (fired.has(key) || r.at > now) continue;
    fired.add(key); changed = true;
    if (r.at < now - 60 * 60000) continue; // (con el PC apagado se pasó hace mucho)
    if (r.alarm) { ringAlarm(r); continue; }
    notify({ title: r.title, body: r.body, onClick: () => open({ action: 'open', id: r.eventId, date: r.date, reminder: r }) });
  }
  if (changed) saveReminders();
}

// ---------- alarmas ----------
// Suenan como un despertador: notificación que no se va sola + una ventanita encima de todo
// con el sonido en bucle y «Posponer 10 min» / «Parar». Si la ventana principal estaba
// oculta en la bandeja, se enseña.
const alarmWins = new Map(); // id del aviso → ventana
let alarmStrings = { snooze: 'Posponer 10 min', stop: 'Parar', alarm: 'Alarma' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function alarmHTML(r) {
  const T = alarmStrings;
  const dark = S.design === 'dot' || /^#[0-3]/i.test(S.bg || '');
  return '<!doctype html><html><head><meta charset="utf-8"><title>zc</title><style>' +
    'html,body{margin:0;height:100%;font-family:"Segoe UI",system-ui,sans-serif;user-select:none;overflow:hidden}' +
    'body{display:flex;flex-direction:column;justify-content:center;gap:12px;padding:20px 22px;box-sizing:border-box;' +
    (dark ? 'background:#16131f;color:#f4efff' : 'background:linear-gradient(135deg,#f7f3ff,#ffeef7);color:#3D3355') + ';-webkit-app-region:drag;border-radius:18px}' +
    '.k{font-size:13px;opacity:.75;letter-spacing:.04em}.t{font-size:22px;font-weight:700;line-height:1.2;word-break:break-word}.b{font-size:14px;opacity:.85}' +
    '.row{display:flex;gap:10px;margin-top:6px;-webkit-app-region:no-drag}button{flex:1;font:inherit;font-size:15px;font-weight:600;border:0;border-radius:14px;padding:12px;cursor:pointer}' +
    '#sn{background:' + (dark ? '#2a2438;color:#f4efff' : '#ffffffcc;color:#3D3355') + '}#st{background:' + (/^#[0-9a-f]{3,8}$/i.test(S.a1 || '') ? S.a1 : '#C9B8FF') + ';color:#2b2340}' +
    '@keyframes p{50%{transform:scale(1.12)}}.k span{display:inline-block;animation:p 1s infinite}</style></head><body>' +
    '<div class="k"><span>⏰</span> ' + esc(T.alarm) + '</div><div class="t">' + esc(r.title) + '</div><div class="b">' + esc(r.body) + '</div>' +
    '<div class="row"><button id="sn">' + esc(T.snooze) + '</button><button id="st">' + esc(T.stop) + '</button></div>' +
    '<script>' +
    // pitido de despertador hecho con WebAudio (nada descargado), en bucle hasta que se pare
    'let ctx;function beep(){try{ctx=ctx||new AudioContext();const t=ctx.currentTime;for(let i=0;i<4;i++){const o=ctx.createOscillator(),g=ctx.createGain();' +
    'o.type="square";o.frequency.value=i%2?988:880;g.gain.setValueAtTime(0.0001,t+i*0.22);g.gain.exponentialRampToValueAtTime(0.25,t+i*0.22+0.02);' +
    'g.gain.exponentialRampToValueAtTime(0.0001,t+i*0.22+0.18);o.connect(g).connect(ctx.destination);o.start(t+i*0.22);o.stop(t+i*0.22+0.2);}}catch(e){}}' +
    'beep();const iv=setInterval(beep,1600);' +
    'const done=a=>{clearInterval(iv);document.title="zc:"+a;};' +
    'document.getElementById("sn").onclick=()=>done("snooze");document.getElementById("st").onclick=()=>done("stop");' +
    'addEventListener("keydown",e=>{if(e.key==="Escape")done("stop");});' +
    '</script></body></html>';
}
function ringAlarm(r) {
  const base = String(r.id).split('~')[0];
  if (alarmWins.has(base)) return;
  // la notificación de Windows (con sonido, no se va sola)
  if (Notification.isSupported()) {
    const n = new Notification({
      title: '⏰ ' + (r.title || 'ZenCalendar'), body: r.body || '', icon: path.join(webDir(), 'img', 'icon-192.png'),
      silent: false, timeoutType: 'never', urgency: 'critical',
    });
    n.on('click', () => open({ action: 'open', id: r.eventId, date: r.date, reminder: r }));
    n.on('close', () => { notes = notes.filter(x => x !== n); });
    notes.push(n);
    if (notes.length > 20) notes.shift();
    n.show();
    r._note = n;
  }
  // si la ventana estaba escondida en la bandeja, se enseña (sin quitarle el sitio a la alarma)
  try { if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) showWindow(); } catch (e) {}
  const area = screen.getPrimaryDisplay().workArea;
  const W = 380, H = 230;
  const aw = new BrowserWindow({
    width: W, height: H, x: area.x + area.width - W - 24, y: area.y + area.height - H - 24,
    frame: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: false, show: false, title: 'ZenCalendar', transparent: true, backgroundColor: '#00000000',
    icon: iconFile(effIcon()),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  aw.setAlwaysOnTop(true, 'screen-saver');
  aw.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  aw.webContents.on('will-navigate', e => e.preventDefault());
  aw.webContents.on('page-title-updated', (e, title) => {
    if (title === 'zc:snooze' || title === 'zc:stop') { e.preventDefault(); alarmAct(r, title.slice(3)); }
  });
  aw.on('closed', () => { if (alarmWins.get(base) === aw) alarmWins.delete(base); });
  aw.once('ready-to-show', () => { aw.show(); aw.focus(); try { aw.flashFrame(true); } catch (e) {} });
  aw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(alarmHTML(r)));
  alarmWins.set(base, aw);
  // (si nadie la para, a los 10 minutos se calla sola; la notificación se queda)
  setTimeout(() => { if (alarmWins.get(base) === aw && !aw.isDestroyed()) aw.close(); }, 10 * 60000);
}
function alarmAct(r, act) {
  const base = String(r.id).split('~')[0];
  const aw = alarmWins.get(base);
  alarmWins.delete(base);
  if (aw && !aw.isDestroyed()) aw.close();
  try { if (r._note) r._note.close(); } catch (e) {}
  const clean = Object.assign({}, r); delete clean._note;
  // la página se entera (y es la que guarda lo pospuesto); si no está, se pospone aquí
  if (pageReady && win && !win.isDestroyed()) win.webContents.send('zc:action', { type: act, minutes: 10, reminder: clean });
  else if (act === 'snooze') {
    const at = Date.now() + 10 * 60000;
    reminders.push(Object.assign({}, clean, { id: base + '~' + at, at }));
    saveReminders();
  }
}

let notes = []; // (que el recolector no se coma las notificaciones antes de tocarlas)
function notify({ title, body, onClick }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: title || 'ZenCalendar', body: body || '', icon: path.join(webDir(), 'img', 'icon-192.png'), silent: false });
  n.on('click', () => { if (onClick) onClick(); else showWindow(); });
  n.on('close', () => { notes = notes.filter(x => x !== n); });
  notes.push(n);
  if (notes.length > 20) notes.shift();
  n.show();
}

// ---------- bandeja ----------
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Abrir ZenCalendar', click: showWindow },
    { label: 'Nuevo evento', click: () => open({ action: 'new' }) },
    { type: 'separator' },
    { label: 'Widget de escritorio', type: 'checkbox', checked: !!(widget && !widget.isDestroyed()), click: m => setWidget(m.checked) },
    { label: 'Abrir al iniciar Windows', type: 'checkbox', checked: autostart(), click: m => setAutostart(m.checked) },
    { type: 'separator' },
    { label: 'Salir', click: () => { quitting = true; app.quit(); } },
  ]);
}
function makeTray() {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(iconFile(effIcon())));
  tray.setToolTip('ZenCalendar');
  tray.setContextMenu(trayMenu());
  tray.on('click', showWindow);
}
const refreshTray = () => { if (tray) tray.setContextMenu(trayMenu()); };

// ---------- widget de escritorio ----------
function setWidget(on) {
  S.widget = Object.assign({ pin: 'normal' }, S.widget, { on: !!on });
  saveSettings();
  if (on && (!widget || widget.isDestroyed())) createWidget();
  else if (!on && widget && !widget.isDestroyed()) { widget.destroy(); widget = null; }
  refreshTray();
  if (win && !win.isDestroyed()) win.webContents.send('zc:widget', !!on);
  return !!on;
}

function createWidget() {
  const W = S.widget || {};
  const wa = screen.getPrimaryDisplay().workArea;
  const b = W.bounds || { width: 340, height: 420, x: wa.x + wa.width - 360, y: wa.y + 40 };
  widget = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, minWidth: 220, minHeight: 160,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: true, skipTaskbar: true, show: false, title: 'ZenCalendar · widget',
    focusable: W.pin !== 'bottom', alwaysOnTop: W.pin === 'top',
    icon: iconFile(effIcon()),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, additionalArguments: ['--zc-role=widget'] },
  });
  applyPin(W.pin);
  widget.loadURL(ORIGIN + '/widget.html');
  links(widget);
  widget.once('ready-to-show', () => { if (W.pin === 'bottom') widget.showInactive(); else widget.show(); });
  const remember = () => {
    if (!widget || widget.isDestroyed()) return;
    S.widget = Object.assign({}, S.widget, { bounds: widget.getBounds() });
    saveSettings();
  };
  widget.on('moved', remember); widget.on('resized', remember);
  widget.on('closed', () => {
    widget = null;
    // cerrado desde el propio widget (no al salir de la app): se queda apagado
    if (!quitting && S.widget && S.widget.on) {
      S.widget.on = false; saveSettings(); refreshTray();
      if (win && !win.isDestroyed()) win.webContents.send('zc:widget', false);
    }
  });
}

// 'top' siempre encima · 'bottom' detrás (no se pone delante al tocarlo) · 'normal'
function applyPin(pin) {
  if (!widget || widget.isDestroyed()) return;
  pin = ['top', 'bottom', 'normal'].includes(pin) ? pin : 'normal';
  S.widget = Object.assign({}, S.widget, { pin });
  saveSettings();
  widget.setAlwaysOnTop(pin === 'top', 'floating');
  widget.setFocusable(pin !== 'bottom');
  if (pin === 'bottom') { try { widget.blur(); } catch (e) {} }
}

// ---------- arranque con Windows ----------
function loginOpts() {
  return portable ? { path: portableFile, args: ['--hidden'] } : { args: ['--hidden'] };
}
function autostart() {
  try { return !!app.getLoginItemSettings(loginOpts()).openAtLogin; } catch (e) { return false; }
}
function setAutostart(on) {
  try { app.setLoginItemSettings(Object.assign({ openAtLogin: !!on }, loginOpts())); } catch (e) { log('autostart: ' + e.message); }
  refreshTray();
  return autostart();
}

// ---------- icono ----------
function setIcon(id) {
  if (!/^[a-z]+$/.test(String(id || ''))) return false;
  S.icon = id; saveSettings();
  return applyIcon(id, true);
}
// shortcuts: cambiar también los accesos directos (solo cuando lo elige el usuario)
function applyIcon(id, shortcuts) {
  const f = iconFile(id);
  const img = nativeImage.createFromPath(f);
  if (img.isEmpty()) return false;
  if (win && !win.isDestroyed()) win.setIcon(img);
  if (widget && !widget.isDestroyed()) widget.setIcon(img);
  if (tray) tray.setImage(img);
  // los accesos directos del menú Inicio y del escritorio (instalada)
  if (shortcuts && process.platform === 'win32' && !portable) {
    const lnks = [
      path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ZenCalendar.lnk'),
      path.join(app.getPath('desktop'), 'ZenCalendar.lnk'),
    ];
    for (const l of lnks) if (fs.existsSync(l)) { try { shell.writeShortcutLink(l, 'update', { icon: f, iconIndex: 0 }); } catch (e) {} }
  }
  return true;
}

// ---------- actualizaciones ----------
let updState = null, au = null, checking = false;
function tellUpdate(s) {
  updState = s;
  for (const w of [win]) if (w && !w.isDestroyed()) w.webContents.send('zc:update', s);
}
const newer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
async function checkUpdates() {
  if (!app.isPackaged || checking) return updState;
  checking = true;
  try {
    if (portable) {
      // la portable no se puede cambiar sola: avisa y «Actualizar» abre la descarga
      const r = await net.fetch(UPDATES + 'version.txt?t=' + Date.now());
      if (r.ok) {
        const v = (await r.text()).trim().split(/\s+/)[0];
        tellUpdate(newer(v, app.getVersion()) ? { state: 'available', version: v } : { state: 'none', version: app.getVersion() });
      }
      return updState;
    }
    if (!au) {
      au = require('electron-updater').autoUpdater;
      au.logger = { info: m => log('updater: ' + m), warn: m => log('updater: ' + m), error: m => log('updater: ' + m), debug: () => {} };
      au.autoDownload = true;
      au.autoInstallOnAppQuit = true;
      au.on('checking-for-update', () => tellUpdate({ state: 'checking' }));
      au.on('update-available', i => tellUpdate({ state: 'downloading', version: i.version, pct: 0 }));
      au.on('update-not-available', () => tellUpdate({ state: 'none', version: app.getVersion() }));
      au.on('download-progress', p => tellUpdate({ state: 'downloading', version: updState && updState.version, pct: Math.round(p.percent || 0) }));
      au.on('update-downloaded', i => tellUpdate({ state: 'ready', version: i.version }));
      au.on('error', e => tellUpdate({ state: 'error', msg: e && e.message }));
    }
    await au.checkForUpdates();
  } catch (e) {
    log('actualizar: ' + e.message);
    tellUpdate({ state: 'error', msg: e.message });
  } finally { checking = false; }
  return updState;
}
function installUpdate() {
  if (portable) { shell.openExternal(UPDATES + 'ZenCalendar-Portable.exe'); return true; }
  if (!au || !updState || updState.state !== 'ready') { checkUpdates(); return false; }
  quitting = true;
  // en silencio y se vuelve a abrir sola
  setImmediate(() => au.quitAndInstall(true, true));
  return true;
}

// ---------- lo que la página puede pedir (preload.js → window.zcDesktop) ----------
function setupIPC() {
  ipcMain.handle('zc:info', () => ({ version: app.getVersion(), portable, packaged: app.isPackaged }));

  ipcMain.handle('zc:win', (e, what) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return null;
    if (what === 'min') w.minimize();
    else if (what === 'max') { if (w.isMaximized()) w.unmaximize(); else w.maximize(); }
    else if (what === 'close') w.close();
    return { max: w.isMaximized(), full: w.isFullScreen() };
  });

  // peticiones a internet sin CORS (Drive, IA, Ollama)
  ipcMain.handle('zc:fetch', async (_e, req) => {
    try {
      const opts = { method: req.method || 'GET', headers: req.headers || {} };
      if (req.body != null && opts.method !== 'GET' && opts.method !== 'HEAD') opts.body = typeof req.body === 'string' ? req.body : Buffer.from(req.body);
      if (req.timeout && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) opts.signal = AbortSignal.timeout(req.timeout);
      const r = await net.fetch(req.url, opts);
      const headers = {};
      r.headers.forEach((v, k) => { headers[k] = v; });
      const body = new Uint8Array(await r.arrayBuffer());
      return { status: r.status, statusText: r.statusText, headers, body };
    } catch (e) {
      return { error: (e && e.name === 'TimeoutError') ? 'Tardó demasiado en contestar' : (e && e.message) || 'Sin conexión' };
    }
  });

  ipcMain.on('zc:reminders', (_e, list, strings) => {
    reminders = Array.isArray(list) ? list.filter(r => r && r.id && r.at) : [];
    if (strings && typeof strings === 'object') for (const k of ['snooze', 'stop', 'alarm']) if (typeof strings[k] === 'string' && strings[k]) alarmStrings[k] = strings[k].slice(0, 40);
    saveReminders();
    checkReminders();
  });

  ipcMain.on('zc:theme', (_e, t) => {
    if (!t || typeof t !== 'object') return;
    const design = t.design === 'dot' ? 'dot' : 'zen';
    const changed = design !== (S.design || 'zen');
    S.design = design;
    let bg = hex6(t.bg);
    // Dot: ventana opaca, negra o blanca (aunque la página mande un fondo con transparencia)
    if (design === 'dot' && !bg) bg = t.light === false ? '#000000' : '#FFFFFF';
    if (bg) S.bg = bg;
    saveSettings();
    if (win && !win.isDestroyed()) {
      if (changed) setMaterial(effMaterial());           // al pasar a Dot se quita la Mica (y vuelve al volver a Zen)
      if (bg && effMaterial() === 'none') win.setBackgroundColor(bg);
    }
    // el icono sigue al diseño mientras el usuario no haya elegido uno
    if (changed && !S.icon) applyIcon(effIcon(), false);
  });
  // (en Dot se guarda lo pedido para cuando se vuelva a Zen, pero no se aplica: devuelve false)
  ipcMain.handle('zc:material', (_e, m) => {
    S.material = ['mica', 'acrylic', 'tabbed'].includes(m) ? m : 'none'; saveSettings();
    if (S.design === 'dot' && S.material !== 'none') { setMaterial('none'); return false; }
    return setMaterial(S.material);
  });

  ipcMain.handle('zc:icon', (_e, id) => setIcon(id));
  ipcMain.handle('zc:widget', (_e, on) => (on === undefined || on === null) ? !!(widget && !widget.isDestroyed()) : setWidget(on));
  ipcMain.handle('zc:widget-pin', (_e, pin) => { applyPin(pin); return (S.widget || {}).pin || 'normal'; });
  ipcMain.handle('zc:autostart', (_e, on) => (on === undefined || on === null) ? autostart() : setAutostart(on));
  ipcMain.on('zc:external', (_e, url) => { if (/^(https?|mailto|geo):/i.test(String(url))) shell.openExternal(String(url)); });

  // lo que abrió la app antes de que la página escuchara
  ipcMain.handle('zc:take-open', () => { openListening = true; const out = pendingOpen.splice(0); return out; });
  // el widget pide abrir algo en la ventana principal
  ipcMain.on('zc:open-main', (_e, o) => open(o && o.action ? o : { action: 'open' }));

  ipcMain.handle('zc:google', async (_e, cmd, cfg) => {
    if (cmd === 'connect') {
      const r = await google.connect(cfg);
      showWindow();
      return r;
    }
    // Google Calendar (varias cuentas): 'add' | 'token' con cfg.account | 'remove' | 'accounts'
    if (cmd === 'add') {
      const r = await google.calAdd(cfg || {});
      showWindow();
      return r;
    }
    if (cmd === 'remove') return google.calRemove(cfg || {});
    if (cmd === 'accounts') return google.calAccounts();
    if (cmd === 'token') return google.token(cfg);
    if (cmd === 'disconnect') return google.disconnect();
    if (cmd === 'status') return { connected: google.connected() };
    return null;
  });

  ipcMain.handle('zc:update', (_e, cmd) => {
    if (cmd === 'check') return checkUpdates();
    if (cmd === 'install') return installUpdate();
    return updState;
  });
}

// ---------- arranque ----------
app.on('second-instance', (_e, argv) => {
  if (argv.includes('--new')) open({ action: 'new' }); else showWindow();
});

app.whenReady().then(() => {
  if (!first) return;
  loadSettings();
  Menu.setApplicationMenu(null);
  serveApp();
  setupIPC();
  createWindow();
  makeTray();
  if (S.widget && S.widget.on) createWidget();
  loadReminders();
  setInterval(checkReminders, 15000);
  setTimeout(checkReminders, 3000);
  setTimeout(checkUpdates, 20000);
  setInterval(checkUpdates, 6 * 3600e3);
  if (process.argv.includes('--new')) open({ action: 'new' });
});

// con la ventana cerrada sigue en la bandeja
app.on('window-all-closed', () => { /* nada: se sale desde la bandeja */ });
app.on('before-quit', () => { quitting = true; });
