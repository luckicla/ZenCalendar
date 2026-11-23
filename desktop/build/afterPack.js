// Pone nombre, descripción, versión e icono de ZenCalendar dentro del .exe
// (si no, Windows lo enseña como «Electron» en el administrador de tareas y
// en la barra de tareas). Con rcedit, como en MixUp y Compass Launcher.
const path = require('path');
module.exports = async ctx => {
  if (ctx.electronPlatformName !== 'win32') return;
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe');
  const m = require('rcedit'), rcedit = m.rcedit || m.default || m;
  const v = ctx.packager.appInfo.version;
  await rcedit(exe, {
    icon: path.join(__dirname, 'icon.ico'),
    'file-version': v, 'product-version': v,
    'version-string': { CompanyName: 'luckicla', FileDescription: 'ZenCalendar', ProductName: 'ZenCalendar', InternalName: 'ZenCalendar',
      OriginalFilename: 'ZenCalendar.exe', LegalCopyright: '© 2026 luckicla' },
  });
  console.log('  • ZenCalendar: nombre e icono puestos en ' + path.basename(exe));
};
