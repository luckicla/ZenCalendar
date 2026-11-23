'use strict';
// Pruebas del diseño «Dot» en el núcleo: setTheme reenvía `design` (y `accent`) a
// Android y a Windows, el icono `dot`, la vibración 'glyph', los textos de los
// widgets y que la fuente ZenDot y los iconos generados existen.
// node tests/core/dot.test.js
const fs = require('fs');
const path = require('path');
const { load, t, report, assert } = require('./_load');

const ROOT = path.join(__dirname, '..', '..');

(async () => {
  // ---------- Android (un ZCAndroid de mentira) ----------
  const sent = { theme: [], haptic: [], widgets: [] };
  const ZCAndroid = {
    setTheme: j => sent.theme.push(JSON.parse(j)),
    haptic: k => sent.haptic.push(k),
    setWidgetData: j => sent.widgets.push(JSON.parse(j)),
    setReminders() {},
  };
  const quiet = { warn() {}, log: console.log, error: console.error };
  const ZC = load(['config', 'util', 'store', 'recur', 'holidays', 'platform', 'reminders'], { console: quiet, ZCAndroid });
  await ZC.store.init();

  await t('setTheme: design «dot» llega a Android', () => {
    ZC.platform.setTheme({ bg: '#000000', fg: '#FFFFFF', light: false, design: 'dot', accent: '#D71921' });
    const last = sent.theme[sent.theme.length - 1];
    assert.strictEqual(last.design, 'dot');
    assert.strictEqual(last.accent, '#D71921');
    assert.strictEqual(last.bg, '#000000');
  });
  await t('setTheme: sin design (o con uno raro) → «zen»', () => {
    ZC.platform.setTheme({ bg: '#F7F3FF' });
    assert.strictEqual(sent.theme[sent.theme.length - 1].design, 'zen');
    ZC.platform.setTheme({ bg: '#F7F3FF', design: 'nothing' });
    assert.strictEqual(sent.theme[sent.theme.length - 1].design, 'zen');
  });
  await t('setTheme: «DOT » en mayúsculas y con espacios también vale', () => {
    ZC.platform.setTheme({ bg: '#FFFFFF', design: 'DOT ' });
    assert.strictEqual(sent.theme[sent.theme.length - 1].design, 'dot');
  });
  await t('setTheme: un accent que no es un color se quita', () => {
    ZC.platform.setTheme({ bg: '#000', design: 'dot', accent: 'url(javascript:1)' });
    assert.strictEqual('accent' in sent.theme[sent.theme.length - 1], false);
  });
  await t('setTheme: no cambia el objeto de la página', () => {
    const th = { bg: '#000000', design: 'Dot' };
    ZC.platform.setTheme(th);
    assert.strictEqual(th.design, 'Dot');
  });
  await t('platform.design: el del último setTheme', () => {
    ZC.platform.setTheme({ bg: '#000000', design: 'dot' });
    assert.strictEqual(ZC.platform.design, 'dot');
    ZC.platform.setTheme({ bg: '#F7F3FF', design: 'zen' });
    assert.strictEqual(ZC.platform.design, 'zen');
  });

  await t('haptic: «glyph» llega tal cual; uno desconocido → «tap»', () => {
    ZC.platform.haptic('glyph');
    ZC.platform.haptic('lo-que-sea');
    assert.deepStrictEqual(sent.haptic.slice(-2), ['glyph', 'tap']);
  });

  await t('appIcons: está «dot» (diseño dot) y los de siempre son «zen»', () => {
    const dot = ZC.platform.appIcons.find(x => x.id === 'dot');
    assert.ok(dot, 'falta el icono dot');
    assert.strictEqual(dot.design, 'dot');
    assert.strictEqual(dot.src, 'img/icons/dot.png');
    assert.ok(ZC.platform.appIcons.filter(x => x.id !== 'dot').every(x => x.design === 'zen'));
  });
  await t('appIcons: cada icono tiene su PNG, su .ico y su activity-alias', () => {
    const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    const java = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/com/luckicla/zencalendar/MainActivity.java'), 'utf8');
    for (const ic of ZC.platform.appIcons) {
      assert.ok(fs.existsSync(path.join(ROOT, 'web', ic.src)), 'falta web/' + ic.src);
      assert.ok(fs.existsSync(path.join(ROOT, 'desktop/build/icons', ic.id + '.ico')), 'falta el .ico de ' + ic.id);
      assert.ok(manifest.includes('android:name=".Icon_' + ic.id + '"'), 'falta el activity-alias de ' + ic.id);
      assert.ok(java.includes('"' + ic.id + '"'), 'MainActivity.ICONS no tiene ' + ic.id);
      for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
        for (const suf of ['', '_fg', '_bg', '_mono']) {
          const f = path.join(ROOT, 'android/app/src/main/res/mipmap-' + d, 'ic_zc_' + ic.id + suf + '.png');
          assert.ok(fs.existsSync(f), 'falta ' + path.relative(ROOT, f));
        }
      }
    }
  });

  await t('widgets: en Dot el «Nada a la vista» va sin la florecita', () => {
    ZC.platform.setTheme({ bg: '#000000', design: 'dot' });
    const w = ZC.reminders.widgetData();
    assert.strictEqual(w.theme.design, 'dot');
    assert.ok(!/✿/.test(w.strings.empty), w.strings.empty);
    assert.ok(w.strings.empty.length > 3);
    ZC.platform.setTheme({ bg: '#F7F3FF', design: 'zen' });
    assert.ok(/✿/.test(ZC.reminders.widgetData().strings.empty));
  });

  // ---------- Windows (un zcDesktop de mentira) ----------
  const dsent = [];
  const zcDesktop = { role: 'main', setTheme: x => dsent.push(x), win: async () => ({ max: false }) };
  const ZD = load(['config', 'util', 'store', 'platform'], { console: quiet, zcDesktop });
  await ZD.store.init();
  await t('setTheme: design llega también a Windows', () => {
    ZD.platform.setTheme({ bg: '#FFFFFF', light: true, design: 'dot' });
    assert.strictEqual(dsent[dsent.length - 1].design, 'dot');
    assert.strictEqual(ZD.platform.kind, 'desktop');
  });

  // ---------- la fuente ----------
  await t('ZenDot: el .ttf y los .woff existen y son de verdad', () => {
    const ttf = fs.readFileSync(path.join(ROOT, 'assets/fonts/ZenDot.ttf'));
    assert.strictEqual(ttf.readUInt32BE(0), 0x00010000, 'no es un TrueType');
    for (const f of ['assets/fonts/ZenDot.woff', 'web/fonts/ZenDot.woff', 'docs/fonts/ZenDot.woff']) {
      const b = fs.readFileSync(path.join(ROOT, f));
      assert.strictEqual(b.toString('latin1', 0, 4), 'wOFF', f + ' no es WOFF');
    }
    const android = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/font/zendot.ttf'));
    assert.ok(android.equals(ttf), 'la copia de Android no es la misma que assets/fonts/ZenDot.ttf');
    const web = fs.readFileSync(path.join(ROOT, 'web/fonts/ZenDot.woff'));
    assert.ok(web.equals(fs.readFileSync(path.join(ROOT, 'assets/fonts/ZenDot.woff'))), 'web/fonts no es la misma que assets/fonts');
  });

  report(__filename);
})();
