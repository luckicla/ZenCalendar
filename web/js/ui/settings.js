'use strict';
// ZenCalendar · Ajustes: hoja flotante con menú lateral (en el móvil, lista y luego detalle).
// Todo se guarda al momento. Mantener pulsada una opción de aspecto = verla sin guardarla.
(function () {
  const ZC = window.ZC, UI = ZC.ui, C = UI.cal, t = (...a) => ZC.t(...a);
  const esc = s => UI.esc(s);
  let L = null, cur = 'look', unwire = null;

  const SECS = [
    ['look', 'Aspecto', 'palette', 'Estilos, tema, claro u oscuro y colores'],
    ['bg', 'Fondo', 'wallpaper', 'Animado, imagen propia o liso'],
    ['glass', 'Transparencias', 'glass', 'Vidrio de cada panel y desenfoque'],
    ['shape', 'Forma', 'shape', 'Esquinas, sombras, densidad y tamaño'],
    ['type', 'Letras', 'type', 'Tipo de letra de la interfaz y los títulos'],
    ['anim', 'Animaciones', 'wave', 'Cuánto se mueve todo'],
    ['logo', 'Logo', 'star', 'Texto y colores del logo'],
    ['icon', 'Icono de la app', 'grid', 'El icono en tu móvil o en Windows'],
    ['cal', 'Calendario', 'calendar', 'Semana, horas, festivos, avisos e idioma'],
    ['widgets', 'Widgets', 'widget', 'Pantalla de inicio y escritorio'],
    ['notif', 'Notificaciones', 'bell', 'Permiso y próximos avisos'],
    ['ai', 'Asistente', 'sparkles', 'Qué inteligencia usa y cómo'],
    ['drive', 'Cuentas de Google', 'cloud', 'Drive y Google Calendar'],
    ['data', 'Datos', 'database', 'Importar, exportar y copias'],
    ['about', 'Acerca de', 'info', 'Versión, atajos y créditos'],
  ];
  const LK = () => UI.look.get();
  const CL = () => C.prefsCal();

  // ---------- piezas ----------
  const row = (label, sub, ctrl, cls = '') => `<div class="srow ${cls}"><div class="sl"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="sc">${ctrl}</div></div>`;
  const seg = (k, opts, extra = '') => `<div class="seg" data-k="${k}" ${extra}>${opts.map(([v, l, ic]) => `<button type="button" data-v="${esc(String(v))}">${ic ? UI.icon(ic, 16) : ''}${l}</button>`).join('')}</div>`;
  const sw = k => `<button type="button" class="sw" role="switch" data-k="${k}" aria-checked="false"></button>`;
  const rng = (k, min, max, step, unit = '') => `<div class="rng"><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" data-unit="${unit}"><output></output></div>`;
  const h3 = (s, sub) => `<div class="s-h"><h3>${s}</h3>${sub ? `<p>${sub}</p>` : ''}</div>`;
  const card = inner => `<section class="scard">${inner}</section>`;

  function get(k) {
    const [scope, key] = k.split('.');
    if (scope === 'look') return LK()[key];
    if (scope === 'cal') return CL()[key];
    if (scope === 'ai') { try { return ZC.ai.getConfig()[key]; } catch { return null; } }
    return null;
  }
  const parseV = v => v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? +v : v;
  async function set(k, v) {
    const [scope, key] = k.split('.');
    if (scope === 'look') {
      if (key === 'preset') { UI.look.applyPreset(v); }
      else if (key === 'theme') { const L0 = LK(); UI.look.set({ theme: v, accent: null, a2: null, a3: null, bgImgColors: L0.bg === 'imagen' && L0.bgImgColors === 'all' ? 'accents' : L0.bgImgColors }); }
      else if (key === 'dotBg' && UI.dot) UI.look.set(UI.dot.bgPatch(v));
      else if (key === 'appIcon') { UI.look.set({ appIcon: v }); try { ZC.platform.setAppIcon(v); } catch {} }
      else UI.look.set({ [key]: v });
    } else if (scope === 'cal') {
      const cal = { ...CL(), [key]: v };
      await ZC.store.setPrefs({ cal });
      if (key === 'lang') { ZC.i18n.setLang(v); UI.app.rebuild(); refresh(true); return; }
    } else if (scope === 'ai') { try { ZC.ai.setConfig({ [key]: v }); } catch (e) { console.error(e); } }
    refresh();
  }

  // ---------- secciones ----------
  function presetCard(p) {
    const th = UI.look.themeIn(p.set.theme, p.set.scheme === 'dark' ? 'dark' : p.set.scheme === 'light' ? 'light' : UI.look.scheme());
    const ft = (UI.look.FONTS_TITLE[p.set.fontTitle] || UI.look.FONTS_TITLE.nunito)[2];
    const r = Math.min(14, p.set.radius * .5);
    return `<button type="button" class="preset" data-k="look.preset" data-v="${p.id}" data-peek style="--pv-bg:${th.bg};--pv-s:${th.s1};--pv-fg:${th.fg};--pv-a1:${th.a1};--pv-a2:${th.a2};--pv-a3:${th.a3};--pv-b1:${th.b[0]};--pv-b2:${th.b[1]};--pv-b3:${th.b[2]};--pv-r:${r}px;--pv-o:${100 - p.set.tMain}%">
      <span class="pv"><i class="pv-blob a"></i><i class="pv-blob b"></i><span class="pv-win"><b style="font-family:${esc(ft)}">${esc(t('Hoy'))}</b><span class="pv-grid">${'<i></i>'.repeat(14)}</span><span class="pv-ev"></span><span class="pv-ev two"></span></span></span>
      <span class="pv-name">${esc(t(p.name))}</span><small>${esc(t(p.sub))}</small></button>`;
  }
  function themeCard(id, th) {
    const sc = UI.look.scheme(), p = th[sc];
    return `<button type="button" class="tcard" data-k="look.theme" data-v="${id}" data-peek style="--tc-bg:${p.bg};--tc-fg:${p.fg}">
      <span class="tc-strip">${[p.b[0], p.b[1], p.b[2], p.a1, p.a2, p.a3].map(c => `<i style="background:${c}"></i>`).join('')}</span>
      <span class="tc-nm"><b>${esc(t(th.name))}</b><small>${esc(t(th.desc))}</small></span></button>`;
  }
  const S = {
    look: () => card(h3(t('Estilos ya hechos'), t('Un toque y cambia todo el aspecto. Mantén pulsado para verlo sin quedártelo.')) + `<div class="presets">${UI.look.PRESETS.map(presetCard).join('')}</div>`)
      + card(h3(t('Tema'), t('Cada tema tiene versión clara y oscura.')) + `<div class="themes">${Object.entries(UI.look.THEMES).map(([id, th]) => themeCard(id, th)).join('')}</div>`
        + row(t('Claro u oscuro'), t('«Como el sistema» cambia solo cuando tu móvil o Windows lo hacen.'), seg('look.scheme', [['system', t('Como el sistema'), 'monitor'], ['light', t('Claro'), 'sun'], ['dark', t('Oscuro'), 'moon']], 'data-peek'), 'stack'))
      + card(h3(t('Color de acento'), t('El color de los botones, del día de hoy y de lo seleccionado.')) + `<div class="dots" data-k="look.accent"><button type="button" class="adot theme" data-v="null" data-peek title="${t('El del tema')}" aria-label="${t('El del tema')}"></button>${UI.look.ACCENTS.map(([id, n, c]) => `<button type="button" class="adot" data-v="${c}" data-peek style="--c:${c}" title="${esc(t(n))}" aria-label="${esc(t(n))}"></button>`).join('')}</div>`
        + row(t('Colores a mano'), t('Principal, secundario y tercero.'), `<div class="color-ins"><input type="color" data-color="accent" aria-label="${t('Color principal')}"><input type="color" data-color="a2" aria-label="${t('Color secundario')}"><input type="color" data-color="a3" aria-label="${t('Tercer color')}"><button type="button" class="btn sm ghost" data-act="resetColors">${t('Los del tema')}</button></div>`, 'stack')),
    bg: () => card(h3(t('Fondo animado'), t('Se dibuja en tu dispositivo, sin descargar nada, y se para cuando no se ve.')) + `<div class="bgs">${['theme', 'aurora', 'sakura', 'nubes', 'burbujas', 'estrellas', 'olas', 'degradado', 'liso'].map(k => `<button type="button" class="bgc" data-k="look.bg" data-v="${k}" data-peek><span class="bgc-th" data-bg="${k === 'theme' ? UI.look.THEMES[LK().theme].bg : k}"></span><b>${esc(t(UI.look.BGS[k]))}</b></button>`).join('')}</div>`
        + row(t('Velocidad'), '', rng('look.bgSpeed', .2, 2.5, .1, '×'))
        + row(t('Cantidad'), t('Pétalos, burbujas, estrellas, manchas…'), rng('look.bgAmount', .3, 2, .1, '×')))
      + card(h3(t('Imagen propia')) + `<div class="bgimg"><div class="bgimg-prev" id="bgPrev"></div><div class="bgimg-act"><button type="button" class="btn soft" data-act="bgimg">${UI.icon('image', 18)}<span id="bgImgLbl">${t('Elegir imagen…')}</span></button><button type="button" class="btn ghost" data-act="bgimgdel" id="bgImgDel">${UI.icon('trash', 18)}${t('Quitar')}</button></div></div>`
        + row(t('Colores desde la imagen'), t('La app saca su paleta de tu foto.'), seg('look.bgImgColors', [['none', t('No')], ['accents', t('Acentos')], ['all', t('Todo')]], 'data-peek'), 'stack needs-img'))
      + card(h3(t('Ajustes del fondo')) + row(t('Desenfoque'), '', rng('look.bgBlur', 0, 40, 1, 'px')) + row(t('Atenuar'), t('Lo acerca al color base para que se lea mejor.'), rng('look.bgDim', 0, .85, .05, '%'))),
    glass: () => card(h3(t('Vidrio de cada zona'), t('Más a la derecha = más transparente. Mueve uno y verás el resultado detrás.'))
      + row(t('Panel lateral'), '', rng('look.tSide', 0, 92, 1, '%'))
      + row(t('Vista principal'), '', rng('look.tMain', 0, 92, 1, '%'))
      + row(t('Barra de arriba y de abajo'), '', rng('look.tBar', 0, 92, 1, '%'))
      + row(t('Ventanas, menús y tarjetas'), '', rng('look.tCard', 0, 80, 1, '%'))
      + row(t('Desenfoque del vidrio'), t('0 = sin desenfoque (gasta menos batería).'), rng('look.blur', 0, 40, 1, 'px'))),
    shape: () => card(h3(t('Esquinas'))
      + row(t('Redondeo'), '', `${seg('look.radius', [[8, t('Poco')], [14, t('Medio')], [22, t('Redondo')], [30, t('Muy redondo')]], 'data-peek')}${rng('look.radius', 0, 36, 1, 'px')}`, 'stack'))
      + card(h3(t('Sombras y relieve'))
        + row(t('Sombras'), '', seg('look.shadows', [['none', t('Sin sombras')], ['soft', t('Suaves')], ['strong', t('Marcadas')]], 'data-peek'))
        + row(t('Sombras de color'), t('Teñidas con el color del tema en lugar de grises.'), sw('look.colorShadows'))
        + row(t('Halo en el día de hoy'), t('Un brillo suave y lento alrededor de la fecha de hoy.'), sw('look.todayGlow')))
      + card(h3(t('Tamaño'))
        + row(t('Densidad'), t('Cuánto aire hay entre las cosas.'), seg('look.density', [['compact', t('Compacta')], ['normal', t('Normal')], ['wide', t('Amplia')]], 'data-peek'))
        + row(t('Tamaño de letra'), '', rng('look.zoom', 80, 130, 5, '%'))
        + row(t('Estilo de los eventos'), '', seg('look.eventStyle', [['soft', t('Suave')], ['solid', t('Sólido')], ['line', t('Línea')]], 'data-peek'))),
    type: () => card(h3(t('Letra de la interfaz')) + `<div class="fonts" data-k="look.fontUI">${Object.entries(UI.look.FONTS_UI).map(([id, f]) => `<button type="button" class="fcard" data-v="${id}" data-peek style="font-family:${esc(f[2])},system-ui"><b>Aa</b><span>${esc(t(f[0]))}</span></button>`).join('')}</div>`)
      + card(h3(t('Letra de los títulos')) + `<div class="fonts" data-k="look.fontTitle">${Object.entries(UI.look.FONTS_TITLE).map(([id, f]) => `<button type="button" class="fcard" data-v="${id}" data-peek style="font-family:${esc(f[2])},system-ui"><b>${esc(t('Noviembre'))}</b><span>${esc(t(f[0]))}</span></button>`).join('')}</div><p class="note">${UI.icon('wifiOff', 15)}${t('Sin internet se usa la letra del sistema hasta que se pueda descargar la elegida.')}</p>`),
    anim: () => card(h3(t('Animaciones'), t('Al cambiar de mes o de vista, al abrir el editor y al completar una tarea.'))
      + seg('look.anim', [['none', t('Ninguna')], ['soft', t('Suaves')], ['normal', t('Normales')], ['lots', t('Muchas')]], 'data-peek class="wide"')
      + `<p class="note" id="redNote" hidden>${UI.icon('info', 15)}${t('Tu sistema pide reducir el movimiento: como mucho se usan animaciones suaves.')}</p>`
      + `<div class="anim-demo"><span class="ad-dot"></span><span class="ad-dot"></span><span class="ad-dot"></span></div>`),
    logo: () => card(h3(t('Logo de la barra'))
      + row(t('Qué se ve'), '', seg('look.logoMode', [['both', t('Logo y nombre')], ['logo', t('Solo logo')], ['text', t('Solo nombre')], ['none', t('Nada')]]), 'stack')
      + row(t('Texto'), t('Tu propio nombre para la app.'), `<input class="in" id="logoText" maxlength="24" placeholder="ZenCalendar" value="${esc(LK().logoText || '')}">`, 'stack')
      + row(t('Color del texto'), '', seg('look.logoColor', [['theme', t('Normal')], ['accent', t('Color de acento')], ['mono', t('Gris')]]), 'stack')
      + `<div class="logo-prev brand"><img class="brand-logo" src="img/ui/logo.svg" alt="" width="40" height="40"><span class="brand-text"></span></div>`),
    icon: () => {
      const icons = (ZC.platform && ZC.platform.appIcons) || [];
      return card(h3(t('Icono de la app'), ZC.platform && ZC.platform.kind === 'web' ? t('En la versión web el icono lo pone el navegador; esto se aplica en Android y Windows.') : t('El icono de ZenCalendar en tu pantalla de inicio o en la barra de tareas.'))
        + (icons.length ? `<div class="icons" data-k="look.appIcon">${icons.map(i => `<button type="button" class="icard" data-v="${esc(i.id)}"><img src="${esc(i.src)}" alt="" width="64" height="64" loading="lazy"><span>${esc(t(i.name))}</span></button>`).join('')}</div>` : `<p class="note">${t('No hay iconos alternativos en esta versión.')}</p>`));
    },
    cal: () => card(h3(t('Semana y horas'))
      + row(t('La semana empieza en'), '', seg('cal.firstDay', [[1, t('Lunes')], [0, t('Domingo')], [6, t('Sábado')]]))
      + row(t('Formato de hora'), '', seg('cal.timeFormat', [['24', '13:00'], ['12', '1:00 pm']]))
      + row(t('Números de semana'), '', sw('cal.weekNumbers'))
      + row(t('Días de otros meses'), t('En la vista Mes, enseñar en clarito los del mes anterior y el siguiente'), sw('cal.otherMonthDays'))
      + row(t('Vista al abrir'), '', `<select class="in" data-k="cal.defaultView">${['month', 'week', 'day', 'agenda', 'year'].map(v => `<option value="${v}">${t(UI.views[v].label)}</option>`).join('')}</select>`))
      + card(h3(t('Eventos nuevos'))
        + row(t('Duración'), '', `<select class="in" data-k="cal.defaultDuration">${[15, 30, 45, 60, 90, 120].map(m => `<option value="${m}">${C.durText(m)}</option>`).join('')}</select>`)
        + row(t('Avisos por defecto'), '', `<div class="def-rems" id="defRems"></div>`, 'stack'))
      + card(h3(t('Festivos e idioma'))
        + row(t('Festivos'), t('Nacionales y, si quieres, los de tu comunidad.'), `<select class="in" data-k="cal.holidays">${(() => { let cs = []; try { cs = ZC.holidays.countries ? ZC.holidays.countries() : []; } catch {} if (!cs.length) cs = [{ id: 'ES', name: 'España' }]; return cs.map(c => `<option value="${esc(c.id)}">${esc(t(c.name))}</option>`).join('') + `<option value="none">${t('Ninguno')}</option>`; })()}</select>`)
        + row(t('Idioma'), '', seg('cal.lang', [['auto', t('El del sistema')], ['es', 'Español'], ['en', 'English'], ['ca', 'Català']]), 'stack')),
    widgets: () => {
      const P = ZC.platform || {}, k = P.kind;
      let html = '';
      if (k === 'android' || (P.canPinWidget && P.canPinWidget())) html += card(h3(t('Widgets en la pantalla de inicio'), t('Tu agenda de un vistazo, con los colores del tema.')) + `<div class="wid-btns"><button type="button" class="btn soft" data-act="pin" data-w="agenda">${UI.icon('agenda', 18)}${t('Añadir widget «Agenda»')}</button><button type="button" class="btn soft" data-act="pin" data-w="today">${UI.icon('today', 18)}${t('Añadir widget «Hoy»')}</button></div>`);
      if (k === 'desktop') html += card(h3(t('Windows')) + row(t('Widget en el escritorio'), t('Una tarjeta de vidrio con lo de hoy y mañana.'), `<button type="button" class="sw" role="switch" data-act="dwidget" aria-checked="${!!(P.desktopWidgetOn && P.desktopWidgetOn())}"></button>`) + (P.desktopWidgetPin ? row(t('Posición del widget'), '', `<div class="seg" id="wPin"><button type="button" data-pin="normal" class="on">${t('Normal')}</button><button type="button" data-pin="top">${t('Siempre encima')}</button><button type="button" data-pin="bottom">${t('Detrás de todo')}</button></div>`) : '') + row(t('Abrir al encender el PC'), t('Para que los avisos lleguen aunque no lo abras.'), `<button type="button" class="sw" role="switch" data-act="autostart" aria-checked="${!!(P.autostart && P.autostart())}"></button>`));
      html += card(h3(t('Aspecto de los widgets')) + row(t('Opacidad del fondo'), '', rng('look.widgetAlpha', 20, 100, 1, '%')));
      if (k === 'web') html = card(`<p class="note">${UI.icon('info', 15)}${t('Los widgets están en las apps de Android y Windows.')}</p>`) + html;
      return html;
    },
    notif: () => {
      let perm = 'default'; try { perm = typeof Notification !== 'undefined' ? Notification.permission : 'default'; } catch {}
      let next = []; try { next = (ZC.reminders && ZC.reminders.next && ZC.reminders.next(6)) || []; } catch {}
      return card(h3(t('Avisos'), t('ZenCalendar te avisa de tus eventos y tareas aunque esté cerrado.'))
        + row(t('Permiso de notificaciones'), perm === 'granted' ? t('Concedido') : perm === 'denied' ? t('Bloqueado: actívalo en los ajustes del sistema o del navegador.') : t('Aún no lo has concedido.'), `<button type="button" class="btn ${perm === 'granted' ? 'soft' : 'pri'} sm" data-act="perm">${perm === 'granted' ? UI.icon('check', 16) + t('Permitido') : t('Permitir avisos')}</button>`))
        + card(h3(t('Próximos avisos')) + (next.length ? `<div class="next-rem">${next.map(r => { const ev = r.ev || (r.eventId && ZC.store.get(r.eventId)) || (r.id && ZC.store.get(r.id)) || null; const at = r.at ? new Date(r.at) : null; return `<div class="nr ${r.alarm ? 'al' : ''}" ${r.alarm ? `title="${esc(t('Alarma'))}"` : ''}>${UI.icon(r.alarm ? 'alarm' : 'bell', 16)}<b>${esc(ev ? C.titleOf(ev) : (r.title || t('Sin título')))}</b><small>${at ? esc(ZC.i18n.D.short(at) + ', ' + C.fmtT(at)) : ''}</small></div>`; }).join('')}</div>` : `<p class="note">${t('No hay avisos programados.')}</p>`));
    },
    ai: aiSection,
    drive: driveSection,
    data: () => card(h3(t('Importar'), t('Archivos .ics de Google Calendar, Outlook, Apple… o una copia .json de ZenCalendar. También puedes arrastrarlos a la ventana.')) + `<button type="button" class="btn pri" data-act="import">${UI.icon('upload', 18)}${t('Importar archivo…')}</button>`)
      + card(h3(t('Exportar')) + `<div class="wid-btns"><button type="button" class="btn soft" data-act="exportIcs">${UI.icon('download', 18)}${t('Todo en .ics')}</button><button type="button" class="btn soft" data-act="exportJson">${UI.icon('database', 18)}${t('Copia de seguridad (.json)')}</button></div>`)
      + card(h3(t('Zona delicada')) + row(t('Restablecer el aspecto'), t('Vuelve al estilo Zen de siempre.'), `<button type="button" class="btn sm ghost" data-act="resetLook">${t('Restablecer')}</button>`) + row(t('Borrar todos los eventos'), t('En todos tus dispositivos sincronizados.'), `<button type="button" class="btn sm danger" data-act="wipe">${UI.icon('trash', 16)}${t('Borrar todo')}</button>`)),
    about: () => card(`<div class="about"><img src="img/ui/logo.svg" alt="" width="84" height="84"><h2>ZenCalendar</h2><p class="mut">${t('Versión {v}', { v: esc((ZC.core && ZC.core.version) || '1.0') })}</p><p>${t('Un calendario tranquilo y bonito para Android y Windows. Sin servidores: tus datos están en tu dispositivo y, si quieres, en tu Google Drive.')}</p><p class="mut">${t('Hecho con cariño por')} <b>luckicla</b> (Lluc)</p>
      <div class="wid-btns" style="justify-content:center"><button type="button" class="btn soft" data-act="keys">${UI.icon('keyboard', 18)}${t('Atajos de teclado')}</button><button type="button" class="btn soft" data-act="welcome">${UI.icon('sparkles', 18)}${t('Ver la bienvenida')}</button><button type="button" class="btn ghost" data-act="gh">${UI.icon('external', 18)}GitHub</button></div></div>`) + updCard(),
  };

  // ---------- actualizaciones (Windows) ----------
  function updCard() {
    if (UI.updates) return '';   // tiene su propia sección (updates.js)
    const U = ZC.platform && ZC.platform.updates;
    if (!U || !U.available) return '';
    let s = {}; try { s = U.state() || {}; } catch {}
    const msg = { checking: t('Buscando…'), available: t('Hay una versión nueva: {v}', { v: esc(s.version || '') }), downloading: t('Descargando… {n} %', { n: Math.round(s.pct || 0) }), ready: t('Lista para instalar ({v})', { v: esc(s.version || '') }), none: t('Tienes la última versión'), error: esc(s.msg || t('No se ha podido comprobar')) }[s.state] || '';
    return card(h3(t('Actualizaciones')) + `<div class="test-row">${s.state === 'ready' ? `<button type="button" class="btn pri" data-act="updInstall">${UI.icon('download', 18)}${t('Reiniciar y actualizar')}</button>` : `<button type="button" class="btn soft" data-act="updCheck" ${s.state === 'checking' || s.state === 'downloading' ? 'disabled' : ''}>${UI.icon('refresh', 18)}${t('Buscar actualizaciones')}</button>`}<span class="mut">${msg}</span></div>`);
  }

  // ---------- asistente ----------
  function aiSection() {
    let cfg = {}, provs = [];
    try { cfg = ZC.ai.getConfig() || {}; provs = ZC.ai.providers || []; } catch {}
    const p = provs.find(x => x.id === cfg.provider) || provs[0] || {};
    const badges = x => [x.offline ? `<i class="bd priv">${UI.icon('lock', 12)}${t('Privado, sin internet')}</i>` : '', x.free ? `<i class="bd free">${t('Gratis')}</i>` : `<i class="bd paid">${t('De pago')}</i>`, x.needsKey ? `<i class="bd key">${t('Con clave')}</i>` : `<i class="bd ok">${t('Sin configurar nada')}</i>`, x.vision ? `<i class="bd">${UI.icon('image', 12)}${t('Entiende fotos')}</i>` : ''].join('');
    let dev = '';
    if (p.id === 'device' && ZC.ai.device) {
      let st = {}, sup = false; try { st = ZC.ai.device.status() || {}; sup = ZC.ai.device.supported(); } catch {}
      dev = !sup ? `<p class="note warn">${UI.icon('info', 15)}${t('Este dispositivo no puede ejecutar el modelo privado (necesita WebGPU). Prueba otro proveedor.')}</p>`
        : `<div class="dev-model"><div class="dm-top">${UI.icon('lock', 20)}<div><b>${esc(st.model || t('Modelo privado'))}</b><small>${st.sizeMB ? t('{n} MB, se descarga una vez', { n: Math.round(st.sizeMB) }) : ''}</small></div></div>
          ${st.ready ? `<div class="dm-ok">${UI.icon('check', 16)}${t('Descargado y listo. Funciona sin internet.')}</div><button type="button" class="btn sm ghost" data-act="devdel">${UI.icon('trash', 16)}${t('Borrar modelo')}</button>`
          : st.downloading ? `<div class="prog"><i style="width:${Math.round((st.progress || 0) * 100)}%"></i></div><small class="mut">${Math.round((st.progress || 0) * 100)}%</small>`
          : `<button type="button" class="btn pri" data-act="devdl">${UI.icon('download', 18)}${t('Descargar modelo privado')}</button>`}</div>`;
    }
    const needsUrl = p.id === 'custom' || p.id === 'ollama';
    return card(h3(t('¿Qué inteligencia uso?'), t('Por defecto funciona sin configurar nada. Si quieres que entienda frases más difíciles o fotos, elige otra.'))
      + `<div class="provs">${provs.map(x => `<button type="button" class="prov ${x.id === p.id ? 'on' : ''}" data-prov="${esc(x.id)}"><span class="prov-top"><b>${esc(t(x.name))}</b>${x.id === p.id ? UI.icon('check', 18) : ''}</span><span class="badges">${badges(x)}</span><small>${esc(t(x.desc || ''))}</small></button>`).join('')}</div>`)
      + card(h3(esc(t(p.name || ''))) + dev
        + (p.needsKey ? row(t('Clave de API'), t('Se guarda solo en este dispositivo, nunca se sincroniza.'), `<div class="keyrow"><input class="in" type="password" id="aiKey" autocomplete="off" placeholder="${esc(ZC.ai.hasKey && ZC.ai.hasKey(p.id) ? t('Clave guardada ••••••••') : t('Pega aquí tu clave'))}"><button type="button" class="btn sm soft" data-act="saveKey">${t('Guardar')}</button></div>${p.keyUrl ? `<button type="button" class="link" data-act="keyUrl" data-url="${esc(p.keyUrl)}">${UI.icon('external', 14)}${p.free ? t('Conseguir una clave gratis') : t('Conseguir una clave')}</button>` : ''}`, 'stack') : '')
        + (needsUrl ? row(t('Dirección'), p.id === 'ollama' ? t('Normalmente http://localhost:11434') : t('Una URL compatible con la API de OpenAI'), `<input class="in" id="aiUrl" value="${esc(cfg.baseUrl || '')}" placeholder="${p.id === 'ollama' ? 'http://localhost:11434' : 'https://…/v1'}">`, 'stack') : '')
        + (p.id !== 'rules' && p.id !== 'device' ? row(t('Modelo'), p.defaultModel ? t('Si lo dejas vacío: {x}', { x: esc(p.defaultModel) }) : '', `<input class="in" id="aiModel" list="aiModels" value="${esc(cfg.model || '')}" placeholder="${esc(p.defaultModel || '')}"><datalist id="aiModels"></datalist>`, 'stack') : '')
        + row(t('Aplicar los cambios sin preguntar'), t('Si está apagado, siempre verás una vista previa antes.'), sw('ai.autoApply'))
        + `<div class="test-row"><button type="button" class="btn soft" data-act="aiTest">${UI.icon('bolt', 18)}${t('Probar conexión')}</button><span id="aiTestRes" class="mut"></span></div>`);
  }

  // ---------- Google Drive ----------
  function driveSection() {
    let av = false, s = {};
    try { av = ZC.drive.available(); s = ZC.drive.state() || {}; } catch {}
    const G = UI.gacc ? UI.gacc.LOGO : '';
    const gc = UI.gacc ? UI.gacc.section() : '';
    let body;
    if (!av) body = gc ? `<p class="note">${UI.icon('info', 15)}${t('La sincronización con Drive no está disponible en esta versión. Tus datos se guardan en este dispositivo.')}</p>` : `<p class="note warn">${UI.icon('info', 15)}${t('Esta versión aún no tiene configurado el acceso a Google, así que la sincronización no está disponible. Tus datos se guardan igualmente en este dispositivo y puedes hacer copias en «Datos».')}</p><button type="button" class="btn lg gbtn" disabled>${G}${t('Falta configurar Google')}</button>`;
    else if (s.connected) {
      const ini = (s.name || s.email || '?').trim().charAt(0).toUpperCase();
      body = `<div class="acct">${s.photo ? `<img src="${esc(s.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="av">${esc(ini)}</span>`}<div><b>${esc(s.name || t('Tu cuenta'))}</b><small>${esc(s.email || '')}</small></div></div>
        <div class="sync-st ${s.syncing ? 'busy' : ''} ${s.error ? 'err' : ''}">${s.syncing ? `<span class="spin"></span>${t('Sincronizando…')}` : s.error ? `${UI.icon('info', 16)}${esc(s.error)}` : `${UI.icon('check', 16)}${s.lastSync ? t('Sincronizado {x}', { x: ZC.i18n.D.rel(s.lastSync) }) : t('Conectado')}`}</div>
        <div class="wid-btns"><button type="button" class="btn soft" data-act="dsync" ${s.syncing ? 'disabled' : ''}>${UI.icon('refresh', 18)}${s.error ? t('Reintentar') : t('Sincronizar ahora')}</button><button type="button" class="btn ghost" data-act="ddisc">${UI.icon('logout', 18)}${t('Desconectar')}</button></div>`;
    } else body = `${s.error ? `<p class="note warn">${UI.icon('info', 15)}${esc(s.error)}</p>` : ''}<button type="button" class="btn lg gbtn" data-act="dconn" ${s.syncing ? 'disabled' : ''}>${s.syncing ? '<span class="spin"></span>' : G}${s.syncing ? t('Conectando…') : t('Conectar con Google')}</button><small class="mut">${t('Solo te pedirá permiso para una carpeta privada de la app.')}</small>`;
    return card(`<div class="drive ${s.connected ? 'on' : ''}"><div class="drive-art">${UI.icon('cloudSync', 40)}</div><span class="drive-tag">${t('Cuenta principal · Google Drive')}</span><h2>${t('Sincroniza con tu Google Drive')}</h2><p>${t('Tus calendarios iguales en el móvil y en el PC. Se guardan en una carpeta oculta de tu propio Drive: nadie más los ve y no hay servidores de por medio.')}</p>${body}</div>`)
      + gc
      + card(h3(t('Cómo funciona')) + `<ul class="howto"><li>${t('Se sincroniza solo: al abrir, al cambiar algo y cada pocos minutos.')}</li><li>${t('Si cambias lo mismo en dos sitios, gana lo más reciente.')}</li><li>${t('Las imágenes de los eventos también viajan.')}</li>${gc ? `<li>${t('Los eventos de Google Calendar se quedan en Google: cada dispositivo los baja de allí.')}</li>` : ''}<li>${t('Las claves del asistente nunca salen de tu dispositivo.')}</li></ul>`);
  }

  // ---------- pintar ----------
  function paintSection(id) {
    cur = id;
    const box = L.body.querySelector('.set-content');
    const sec = SECS.find(s => s[0] === id) || SECS[0];
    // (si se vuelve a pintar la misma sección —una opción que lo cambia todo, una sincronización…— se queda
    //  donde estabas y sin la animación de entrada; antes saltaba arriba del todo con cada toque)
    const prevSec = box.querySelector('.set-sec'), same = !!prevSec && prevSec.dataset.sec === id, keepY = box.scrollTop;
    box.innerHTML = `<div class="set-sec ${same ? '' : 'stagger'}" data-sec="${id}"><header class="set-sec-h"><button type="button" class="ibtn set-back" data-act="back" aria-label="${t('Volver')}">${UI.icon('chevL', 22)}</button><h2>${esc(t(sec[1]))}</h2></header>${S[id]()}</div>`;
    box.querySelectorAll('.set-sec > *').forEach((el, i) => el.style.setProperty('--i', i));
    box.scrollTop = same ? keepY : 0;
    L.body.querySelectorAll('.set-nav button').forEach(b => b.classList.toggle('on', b.dataset.sec === id));
    L.body.classList.remove('at-list');
    // miniaturas de los fondos
    box.querySelectorAll('.bgc-th').forEach(el => { try { const cv = UI.bg.thumb(el.dataset.bg, 132, 84); el.appendChild(cv); } catch (e) { console.warn(e); } });
    if (id === 'ai') aiExtras();
    // (en la web baja ya el script de Google: así la ventanita sale al instante al pulsar «Conectar»)
    if (id === 'drive') { try { ZC.drive.prepare && ZC.drive.prepare(); } catch {} try { UI.gacc && UI.gacc.prepare(); } catch {} }
    refresh();
  }
  // vuelve a pintar la sección sin animación y sin perder por dónde ibas (cambios que llegan solos: sincronizar…)
  function repaintKeep() {
    const box = L.body.querySelector('.set-content'), sec = box.querySelector('.set-sec');
    if (!sec || sec.dataset.sec !== cur) { paintSection(cur); return; }
    const y = box.scrollTop, f = document.activeElement, fk = f && box.contains(f) ? (f.dataset.ga ? `[data-ga="${f.dataset.ga}"]` + (f.dataset.gid ? `[data-gid="${CSS.escape(f.dataset.gid)}"]` : '') : f.dataset.act ? `[data-act="${f.dataset.act}"]` : '') : '';
    const fb = fk && f.closest('[data-gacc]') ? `[data-gacc="${CSS.escape(f.closest('[data-gacc]').dataset.gacc)}"] ` : '';
    const tmp = document.createElement('div'); tmp.innerHTML = S[cur]();
    [...sec.children].forEach((el, i) => { if (i) el.remove(); });
    sec.append(...tmp.children);
    box.scrollTop = y;
    if (fk) { const n = box.querySelector(fb + fk); if (n) n.focus({ preventScroll: true }); }
    refresh();
  }
  async function aiExtras() {
    let cfg = {}; try { cfg = ZC.ai.getConfig(); } catch {}
    const dl = L.body.querySelector('#aiModels'); if (!dl) return;
    const p = (ZC.ai.providers || []).find(x => x.id === cfg.provider) || {};
    const opts = new Set(p.defaultModel ? [p.defaultModel] : []);
    if (cfg.provider === 'ollama' && ZC.ai.ollamaModels) { try { (await ZC.ai.ollamaModels() || []).forEach(m => opts.add(m)); } catch {} }
    dl.innerHTML = [...opts].map(m => `<option value="${esc(m)}">`).join('');
  }
  function refresh(full) {
    if (!L || L.closed) return;
    if (full) { L.body.querySelector('.set-nav').innerHTML = navHTML(); L.body.querySelector('.set-top h2').textContent = t('Ajustes'); paintSection(cur); return; }
    const box = L.body.querySelector('.set-content');
    box.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k, v = get(k);
      if (el.classList.contains('seg') || el.classList.contains('dots') || el.classList.contains('fonts') || el.classList.contains('icons')) {
        el.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', String(parseV(b.dataset.v)) === String(v ?? null) || (b.dataset.v === 'null' && (v == null))));
        if (el.classList.contains('seg')) UI.paintSeg(el);
      } else if (el.classList.contains('sw')) el.setAttribute('aria-checked', String(!!v));
      else if (el.type === 'range') { if (document.activeElement !== el || !el._drag) el.value = v ?? el.min; const pct = (el.value - el.min) / (el.max - el.min) * 100; el.style.setProperty('--p', pct + '%'); const o = el.parentElement.querySelector('output'); if (o) o.textContent = fmtRange(el); }
      else if (el.tagName === 'SELECT') el.value = String(v);
      else if (el.matches('[data-k="look.preset"], [data-k="look.theme"], [data-k="look.bg"]')) el.classList.toggle('on', String(v) === el.dataset.v);
    });
    const Lk = LK(), pal = UI.look.palette();
    box.querySelectorAll('input[data-color]').forEach(i => { const k = i.dataset.color; i.value = toHex(k === 'accent' ? pal.a1 : pal[k]); });
    const prev = box.querySelector('#bgPrev');
    if (prev) { const u = UI.look.imageURL(); prev.style.backgroundImage = u ? `url("${u}")` : ''; prev.classList.toggle('has', !!u); prev.innerHTML = u ? '' : `${UI.icon('image', 26)}<span>${t('Sin imagen')}</span>`; box.querySelector('#bgImgDel').hidden = !Lk.bgImage; box.querySelector('#bgImgLbl').textContent = Lk.bgImage ? t('Cambiar imagen…') : t('Elegir imagen…'); box.querySelectorAll('.needs-img').forEach(r => r.hidden = !Lk.bgImage); }
    const rn = box.querySelector('#redNote'); if (rn) rn.hidden = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dr = box.querySelector('#defRems'); if (dr) paintDefRems(dr);
    const lp = box.querySelector('.logo-prev .brand-text'); if (lp) { lp.textContent = (Lk.logoText || '').trim() || 'ZenCalendar'; lp.dataset.color = Lk.logoColor; }
  }
  const toHex = c => { const x = String(c || '#000000'); return /^#[0-9a-f]{6}$/i.test(x) ? x : '#9f8dff'; };
  function fmtRange(el) {
    const v = +el.value, u = el.dataset.unit;
    if (u === '%' && +el.max <= 1) return Math.round(v * 100) + ' %';
    if (u === '×') return v.toFixed(1).replace('.', ',') + '×';
    return v + (u ? ' ' + u : '');
  }
  function paintDefRems(box) {
    const cur = CL().defaultReminders || [];
    const opts = [0, 5, 10, 15, 30, 60, 120, 1440];
    box.innerHTML = opts.map(m => `<button type="button" class="chip ${cur.includes(m) ? 'on' : ''}" data-defrem="${m}">${esc(C.remText(m))}</button>`).join('');
  }
  const GROUPS = [['look', 'bg', 'glass', 'shape', 'type', 'anim', 'logo', 'icon'], ['cal', 'widgets', 'notif'], ['ai', 'drive'], ['data', 'about']];
  const navSub = (id, sub) => (UI.dot && UI.dot.on() && UI.dot.navSub[id]) || sub;   // en Dot algunas secciones son otras
  const navHTML = () => GROUPS.map(g => `<div class="sn-grp">${g.map(id => SECS.find(s => s[0] === id)).map(([id, name, ic, sub0]) => [id, name, ic, navSub(id, sub0)]).map(([id, name, ic, sub]) => `<button type="button" data-sec="${id}" class="${id === cur ? 'on' : ''}"><span class="sn-ic">${UI.icon(ic, 19)}</span><span class="sn-tx"><b>${esc(t(name))}</b><small>${esc(t(sub))}</small></span>${UI.dot && UI.dot.on() ? `<span class="sn-val">${esc(UI.dot.navVal(id))}</span>` : ''}${UI.icon('chevR', 16, 'sn-go')}</button>`).join('')}</div>`).join('');

  // ---------- abrir ----------
  function open(sec) {
    if (L && !L.closed) { paintSection(sec || cur); return; }
    cur = sec || 'look';
    L = UI.openLayer({ kind: 'modal', cls: 'set-layer', panelCls: 'set-panel', label: t('Ajustes'), html: `
      <div class="set-top sheet-head"><h2>${t('Ajustes')}</h2><span class="mut set-saved">${UI.icon('check', 15)}${t('Todo se guarda al momento')}</span><button type="button" class="ibtn" data-act="close" aria-label="${t('Cerrar')}">${UI.icon('x', 20)}</button></div>
      <div class="set-wrap"><nav class="set-nav">${navHTML()}</nav><div class="set-content layer-scroll"></div></div>`, onClose: () => { UI.look.endPreview(); if (unwire) unwire(); unwire = null; L = null; } });
    paintSection(cur);
    if (UI.isMobile() && !sec) L.body.classList.add('at-list');
    wire();
  }

  function wire() {
    const body = L.body;
    body.addEventListener('click', async e => {
      if (body._peeked) { body._peeked = false; e.preventDefault(); e.stopPropagation(); return; }
      const nav = e.target.closest('.set-nav [data-sec]'); if (nav) { paintSection(nav.dataset.sec); return; }
      const kv = e.target.closest('[data-v]');
      const host = kv && kv.closest('[data-k]');
      if (kv && (host || kv.dataset.k)) { const k = kv.dataset.k || host.dataset.k; set(k, parseV(kv.dataset.v)); UI.haptic('tick'); return; }
      const swb = e.target.closest('.sw[data-k]'); if (swb) { set(swb.dataset.k, !get(swb.dataset.k)); UI.haptic('tick'); return; }
      const prov = e.target.closest('[data-prov]');
      if (prov) { const p = (ZC.ai.providers || []).find(x => x.id === prov.dataset.prov) || {}; try { ZC.ai.setConfig({ provider: p.id, model: '', baseUrl: p.id === 'ollama' ? 'http://localhost:11434' : '' }); } catch {} paintSection('ai'); return; }
      const pin = e.target.closest('[data-pin]'); if (pin) { try { ZC.platform.desktopWidgetPin(pin.dataset.pin); } catch {} pin.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === pin)); UI.paintSeg(pin.parentElement); return; }
      const dr = e.target.closest('[data-defrem]');
      if (dr) { const m = +dr.dataset.defrem, curR = new Set(CL().defaultReminders || []); curR.has(m) ? curR.delete(m) : curR.add(m); set('cal.defaultReminders', [...curR].sort((a, b) => a - b)); return; }
      if (UI.gacc && UI.gacc.click(e)) return;
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act, P = ZC.platform || {};
      switch (act) {
        case 'close': L.close(); break;
        case 'back': body.classList.add('at-list'); break;
        case 'resetColors': UI.look.set({ accent: null, a2: null, a3: null }); refresh(); break;
        case 'bgimg': { const f = await UI.pickFile({ accept: 'image/*' }); if (f[0]) { a.disabled = true; try { await UI.look.setImage(f[0]); } catch (err) { UI.toast(t('No se ha podido usar la imagen')); } a.disabled = false; refresh(); } break; }
        case 'bgimgdel': await UI.look.removeImage(); refresh(); break;
        case 'pin': try { P.pinWidget(a.dataset.w); } catch { UI.toast(t('Tu móvil no deja añadir widgets desde la app: mantén pulsada la pantalla de inicio y busca ZenCalendar.')); } break;
        case 'dwidget': { const on = a.getAttribute('aria-checked') !== 'true'; try { P.desktopWidget(on); a.setAttribute('aria-checked', String(on)); } catch {} break; }
        case 'autostart': { const on = a.getAttribute('aria-checked') !== 'true'; try { P.setAutostart(on); a.setAttribute('aria-checked', String(on)); } catch {} break; }
        case 'perm': try { await P.notifyPermission(); } catch {} paintSection('notif'); break;
        case 'saveKey': { const v = body.querySelector('#aiKey').value.trim(); if (!v) return; try { ZC.ai.setKey(ZC.ai.getConfig().provider, v); UI.toast(t('Clave guardada en este dispositivo'), { icon: 'lock' }); } catch (err) { UI.toast(err.message); } paintSection('ai'); break; }
        case 'keyUrl': try { P.openExternal(a.dataset.url); } catch { window.open(a.dataset.url, '_blank', 'noopener'); } break;
        case 'aiTest': { const out = body.querySelector('#aiTestRes'); out.innerHTML = `<span class="spin"></span>`; saveAiFields(); try { const r = await ZC.ai.test(); out.innerHTML = r && r.ok ? `<span class="ok">${UI.icon('check', 15)}${esc(r.message || t('Funciona'))}</span>` : `<span class="bad">${esc((r && r.message) || t('No responde'))}</span>`; } catch (err) { out.innerHTML = `<span class="bad">${esc(err.message || err)}</span>`; } break; }
        case 'devdl': { try { const p = ZC.ai.device.download(pr => { const bar = body.querySelector('.dev-model .prog i'); if (bar) bar.style.width = Math.round(pr * 100) + '%'; else paintSection('ai'); const sm = body.querySelector('.dev-model small.mut'); if (sm) sm.textContent = Math.round(pr * 100) + '%'; }); paintSection('ai'); await p; UI.toast(t('Modelo privado listo'), { icon: 'check' }); } catch (err) { UI.toast(t('No se ha podido descargar: {x}', { x: err.message || err })); } paintSection('ai'); break; }
        case 'devdel': if (await UI.confirm(t('¿Borrar el modelo privado?'), t('Liberarás espacio. Podrás volver a descargarlo cuando quieras.'), { ok: t('Borrar'), danger: true })) { try { await ZC.ai.device.remove(); } catch {} paintSection('ai'); } break;
        case 'dconn': try { a.disabled = true; await ZC.drive.connect(); UI.toast(t('Conectado con Google Drive'), { icon: 'cloudSync' }); } catch (err) { UI.toast(t('No se ha podido conectar: {x}', { x: err.message || err })); } paintSection('drive'); break;
        case 'dsync': try { await ZC.drive.sync(); } catch (err) { UI.toast(err.message || String(err)); } paintSection('drive'); break;
        case 'ddisc': if (await UI.confirm(t('¿Desconectar Google Drive?'), t('Tus datos se quedan en este dispositivo y en tu Drive; solo dejarán de sincronizarse.'), { ok: t('Desconectar') })) { try { await ZC.drive.disconnect(); } catch {} paintSection('drive'); } break;
        case 'import': UI.data.pickImport(); break;
        case 'exportIcs': UI.data.exportICS(); break;
        case 'exportJson': UI.data.exportJSON(); break;
        case 'wipe': UI.data.wipe(); break;
        case 'resetLook': if (await UI.confirm(t('¿Restablecer el aspecto?'), t('Vuelve el estilo Zen con sus colores y transparencias.'), { ok: t('Restablecer') })) { UI.look.set({ ...UI.look.LOOK0 }); paintSection(cur); } break;
        case 'keys': L.close(); setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })), 200); break;
        case 'welcome': L.close(); UI.welcome.open(); break;
        case 'updCheck': try { await ZC.platform.updates.check(); } catch {} paintSection('about'); break;
        case 'updInstall': try { await ZC.platform.updates.install(); } catch {} break;
        case 'gh': try { P.openExternal('https://github.com/luckicla'); } catch { window.open('https://github.com/luckicla', '_blank', 'noopener'); } break;
      }
    });
    body.addEventListener('change', e => {
      const el = e.target;
      if (el.tagName === 'SELECT' && el.dataset.k) set(el.dataset.k, parseV(el.value));
      if (el.matches('#aiModel, #aiUrl')) saveAiFields();
    });
    body.addEventListener('input', e => {
      const el = e.target;
      if (el.type === 'range' && el.dataset.k) { el._drag = true; set(el.dataset.k, +el.value); }
      if (el.id === 'logoText') UI.look.set({ logoText: el.value });
      if (el.dataset.color) { const k = el.dataset.color; UI.look.set({ [k]: el.value }); }
    });
    body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'aiKey') body.querySelector('[data-act=saveKey]').click(); });
    // mantener pulsado = vista previa sin guardar; al mover un deslizador de aspecto, la hoja se aparta
    let holdT = 0, held = null;
    body.addEventListener('pointerdown', e => {
      const el = e.target.closest('[data-peek], [data-peek] > button, .set-sec[data-sec=look] input[type=range], .set-sec[data-sec=bg] input[type=range], .set-sec[data-sec=glass] input[type=range], .set-sec[data-sec=shape] input[type=range]');
      if (!el) return;
      const range = el.matches('input[type=range]');
      const btn = range ? null : (e.target.closest('[data-v]') || el);
      clearTimeout(holdT);
      holdT = setTimeout(() => {
        if (!range) {
          const host = btn.closest('[data-k]'), k = btn.dataset.k || (host && host.dataset.k); if (!k || !k.startsWith('look.')) return;
          UI.look.preview({});
          const key = k.split('.')[1], v = parseV(btn.dataset.v);
          if (key === 'preset') { const p = UI.look.PRESETS.find(x => x.id === v); if (p) UI.look.preview({ ...p.set }); }
          else if (key === 'theme') UI.look.preview({ theme: v, accent: null, a2: null, a3: null });
          else UI.look.preview({ [key]: v });
          body._peeked = true;
        }
        held = (range ? el.closest('.srow') : btn) || el;
        held.classList.add('peeking');
        L.el.classList.add('peek');
        UI.haptic('tick');
      }, range ? 160 : 380);
    });
    const end = () => {
      clearTimeout(holdT);
      if (!held) return;
      held.classList.remove('peeking'); held = null;
      L && L.el.classList.remove('peek');
      if (UI.look.previewing()) { UI.look.endPreview(); setTimeout(() => { body._peeked = false; }, 400); }
      body.querySelectorAll('input[type=range]').forEach(r => r._drag = false);
      refresh();
    };
    // (en la ventana: se quitan al cerrar los ajustes, si no se acumulaban cada vez que se abrían)
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    unwire = () => { removeEventListener('pointerup', end); removeEventListener('pointercancel', end); clearTimeout(holdT); };
    body.addEventListener('contextmenu', e => { if (e.target.closest('[data-peek]')) e.preventDefault(); });
  }
  function saveAiFields() {
    if (!L) return;
    const m = L.body.querySelector('#aiModel'), u = L.body.querySelector('#aiUrl');
    const patch = {}; if (m) patch.model = m.value.trim(); if (u) patch.baseUrl = u.value.trim();
    try { ZC.ai.setConfig(patch); } catch {}
  }
  UI.look.onChange(() => { if (L && !L.closed) refresh(); });
  try { ZC.platform.on && ZC.platform.on('update', () => { if (L && !L.closed && cur === 'about') paintSection('about'); }); } catch {}

  // otras partes (gestures.js, updates.js) añaden su propia sección: render() devuelve el HTML
  function addSection(id, name, ic, sub, render, after) {
    if (SECS.some(s => s[0] === id)) return;
    SECS.push([id, name, ic, sub]); S[id] = render;
    const g = GROUPS.find(x => x.includes(after)) || GROUPS[GROUPS.length - 1];
    g.splice(after && g.includes(after) ? g.indexOf(after) + 1 : g.length, 0, id);
  }
  // dot.js cambia algunas secciones cuando el diseño es «Dot» (y pone el selector de diseño arriba de Aspecto)
  UI.settings = { sections: S, parts: { row, seg, sw, rng, h3, card }, current: () => cur, addSection, open, refresh: () => refresh(true), isOpen: () => !!(L && !L.closed), onDrive: () => { if (L && !L.closed && cur === 'drive') repaintKeep(); } };
})();
