# Diseño «Dot» — contrato para los agentes

ZenCalendar 1.0.0 ya está publicado (repo `luckicla/ZenCalendar`, rama `main`). Ahora añadimos un **segundo diseño completo**,
«Dot», que se puede elegir en la app y en la web. El de ahora se llama «Zen» y se queda tal cual, y sigue siendo el de
por defecto.

Dot se inspira en el estilo de Nothing OS: **monocromo** (negro, blanco y grises), **un solo acento rojo**
(`#D71921`), **tipografía de matriz de puntos** para los números y los titulares, rejillas y fondos de puntos, superficies
planas o translúcidas (como la trasera transparente del teléfono), contornos finos, esquinas muy redondas o círculos
perfectos en los controles, iconos de línea fina, sensación industrial y precisa, movimiento seco y mecánico (pasos,
parpadeo de puntos, barras que se llenan) y mucho espacio. Modo oscuro (negro puro `#000`) y modo claro (blanco `#FFF` o
gris muy claro), los dos de primera.

**Marca**: es un estilo *inspirado en* Nothing, no de Nothing. En la interfaz se llama «Dot». Nada de logos, nombres de
producto ni la fuente NDot de Nothing (es suya). Para los textos se puede decir «inspirado en el estilo de Nothing OS»
como mucho una vez, en Ajustes o en la web.

## Fuente propia: ZenDot (la hace el agente de backend de la app, PRIMERO)
- Fuente de matriz de puntos hecha por nosotros con `fontTools` (instalado): cada glifo es una rejilla de **5×7 puntos
  redondos** (círculos reales en el contorno, no cuadrados), con el espaciado y las métricas bien puestos.
- Cobertura: A–Z, a–z (pueden ser versalitas de 5×5 o minúsculas de verdad), 0–9, á é í ó ú ü ñ ç à è ò ï · y Á É Í Ó Ú
  Ü Ñ Ç, puntuación habitual `. , : ; ! ? ¡ ¿ ' " - – / ( ) + % & @ # * = < > _`, espacio, `°` y `→` (solo por si acaso).
- Licencia propia (© 2026 luckicla, uso libre con la app; se puede poner OFL).
- Archivos: `assets/fonts/ZenDot.ttf` y `assets/fonts/ZenDot.woff` (WOFF con zlib, no hay brotli), el script que la genera
  en `tools/mkfont.py`, y copias en `web/fonts/ZenDot.woff` (app), `docs/fonts/ZenDot.woff` (web) y
  `android/app/src/main/res/font/zendot.ttf` (widgets).
- Mientras no exista, los demás usan `font-family: "ZenDot", ui-monospace, monospace` y siguen trabajando.
- Para el texto normal, Dot usa una sans neutra y técnica del sistema o de Google Fonts con fallback
  (el frontend la elige; que no sea Inter por inercia).

## La app (`web/`)
- Ajuste nuevo `prefs.look.design: 'zen' | 'dot'` (por defecto `'zen'`). En el HTML: `document.documentElement.dataset.design`.
- Con `dot`, la interfaz entera cambia de diseño, no solo de colores: estructura de vistas, controles, tipografía, fondos
  (rejilla de puntos, puntos que se encienden, nada de manchas pastel), animaciones y widgets. Las capas van en
  `web/css/dot.css` (+ `web/js/ui/dot.js` si hace falta JS: por ejemplo, números grandes en matriz de puntos animados,
  la fecha de hoy o un reloj tipo «glyph»).
- Los ajustes de personalización siguen funcionando dentro de Dot cuando tengan sentido: claro/oscuro/sistema,
  transparencias, desenfoque, densidad, tamaño de letra, animaciones, gestos… Los que no tengan sentido (los temas
  pastel, los fondos de manchas) se esconden o se convierten en sus equivalentes de Dot (por ejemplo: acento rojo, blanco
  o un color a elegir; fondos: puntos, rejilla, liso, «glyph» animado).
- En Ajustes → Aspecto, arriba del todo, un selector grande y bonito «Diseño: Zen / Dot», con vista previa. También en la
  bienvenida (paso 1).
- `ZC.platform.setTheme({ ..., design: 'dot' })`: el frontend pasa `design` siempre.

## Plataformas (agente de backend de la app)
- Android: los widgets «Hoy» y «Agenda» con diseño Dot cuando `design === 'dot'` (negro o blanco, rojo de acento, la fecha
  y las horas en ZenDot). En RemoteViews no hay fuentes propias de forma fiable en todas las versiones: dibuja los números
  en un `Bitmap` con el `Typeface` de `res/font/zendot.ttf` o usa `fontFamily` donde se pueda (API 26+ en layouts XML con
  recursos de fuente funciona en TextView de RemoteViews? compruébalo con cuidado y elige lo seguro). Barra de estado y
  de navegación según el diseño.
- Windows: el widget de escritorio con diseño Dot (lo pinta `web/widget.html`, que es del frontend, pero el material de la
  ventana —sin Mica en Dot—, la bandeja y el icono son del backend).
- Icono de la app: variante nueva `dot` en `tools/mkicons.py` (squircle negro con la «Z» y las dos pestañas del calendario
  hechas de puntos blancos y un punto rojo) + su `activity-alias` y su `.png` en `web/img/icons/dot.png`. Al elegir el
  diseño Dot se sugiere (no se impone) ese icono.
- Vibración: un patrón `'glyph'` corto y seco en `haptic()` para Dot si te parece.

## La web (`docs/`)
- Dos diseños: el actual («Zen», calendario de pared) y «Dot». Se cambia con un selector visible en la barra de navegación
  (y con `?design=dot` en la URL), se recuerda en `localStorage` (`zc.site.design`) y respeta lo que eligió el visitante.
  Por defecto: Zen. El cambio entre los dos tiene que ser una pequeña maravilla (una transición en matriz de puntos), pero
  sin marear y respetando `prefers-reduced-motion`.
- Mismo contenido y las mismas funciones (demo, personalizador, descarga, QR, novedades, ¿es seguro?, privacidad), pero en
  Dot con su propio diseño de verdad: no es «el mismo diseño en negro».
- `html[data-design="dot"]` + `docs/css/dot.css` (+ `docs/js/dot.js`). El agente «web-diseño» hace el diseño Dot de la
  página; el agente «web-sistema» hace el selector y la persistencia, el diseño Dot de las maquetas de la app que salen en
  la web (`docs/css/mock.css`, `docs/js/mock.js`, `docs/js/custom.js`: que el personalizador tenga también «Diseño: Zen /
  Dot»), la imagen OG en Dot, las pruebas y que nada de lo de Zen se rompa.

## Reparto (no toquéis lo de otro; si necesitáis algo, apuntadlo en `docs/PENDIENTES.md` bajo «Dot → para X»)
- **app-front**: `web/index.html`, `web/widget.html`, `web/css/*` (sobre todo `dot.css`), `web/js/ui/*`, `tests/ui/`.
- **app-back**: `assets/fonts/`, `tools/mkfont.py`, `tools/mkicons.py`, `web/fonts/`, `web/img/icons/`, `docs/fonts/`,
  `android/`, `desktop/`, `web/js/core/*`, workflows si hace falta.
- **web-diseño**: `docs/index.html`, `docs/tokens.css`, `docs/css/site.css`, `docs/css/dot.css`, `docs/js/dot.js`, `docs/js/demo.js`, `docs/img/` (salvo og.png).
- **web-sistema**: `docs/js/site.js`, `docs/js/custom.js`, `docs/js/mock.js`, `docs/css/mock.css`, `docs/img/og*.png`,
  `tests/web/`. El selector de la barra lo maqueta web-diseño en `index.html` (botón con `id="designToggle"`), y lo hace
  funcionar web-sistema desde `site.js` (cambiando `html[data-design]` y emitiendo un evento `zc:design` en `document`).
- Nadie hace commits ni push. Las pruebas de siempre tienen que seguir pasando:
  `node tests/core/run.js` y `node tests/ui/{interact,regress,gestures,updates}.js`.

## Cómo ha quedado (1.1.0)
- Todo lo de arriba está hecho; el detalle de cada parte está en `docs/PENDIENTES.md` («Dot: hecho por…» y «Dot: verificación»).
- Las matrices de puntos pintadas con SVG (el titular y la fecha de la app en `web/js/ui/dot.js`, la pantalla de la portada en
  `docs/js/dot.js`) usan los mismos dibujos que ZenDot: `tools/mkfont.py` los escribe entre las marcas `<zendot>` de esos
  archivos cada vez que genera la fuente (no se tocan a mano). Lo único que no copian es el interletrado (`kern`).
- En Dot, `setTheme` lleva `design: 'dot'` y `accent` (el acento elegido); los widgets de Android lo usan.
- Al elegir el fondo «glyph», si la transparencia de los paneles sigue en la de siempre (22 %), sube a 40 % para que se vea
  (y vuelve al dejarlo); si el usuario ya la había movido, no se toca.
- En la web, el personalizador cambia también sus textos (y «Vidrio» pasa a «Transparencia») cuando la maqueta está en Dot,
  y la maqueta del mes del móvil es la rejilla de puntos de la app.
