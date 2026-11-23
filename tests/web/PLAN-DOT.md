# Web de ZenCalendar · plan del diseño «Dot»

Inspirado en el estilo de Nothing OS: monocromo, un rojo, matriz de puntos y contornos finos. Mismo HTML y mismas
funciones que «Zen»; todo vive bajo `html[data-design="dot"]` (`docs/css/dot.css` + `docs/js/dot.js`).

## Primera pasada

**Color** (el rojo es el único color y significa «ahora»)
- Negro `#000000`: fondo de Dot oscuro. Puro, sin tinte.
- Blanco `#FFFFFF`: fondo de Dot claro y texto en oscuro.
- Grafito `#141414` / Niebla `#F2F2F2`: superficies (la pantalla de puntos, lo seleccionado), en oscuro y en claro.
- Ceniza `#9A9A9A` (7,5:1 sobre negro) / Plomo `#5C5C5C` (6,7:1 sobre blanco): texto secundario.
- Línea `#2E2E2E` / `#D6D6D6`: contornos de 1 px y rejillas de puntos.
- Rojo señal `#D71921`: hoy, lo que acabas de apuntar, la hora en directo y el foco. En ningún botón.

**Tipografía**
- **ZenDot** (la nuestra, 5×7 puntos redondos) para la pantalla, los titulares, los números del mes y los rótulos técnicos.
  Mientras no esté: `ui-monospace`.
- **Barlow** para el texto. Viene de las señales de carretera (familia DIN): se lee técnica y precisa sin ser fría, y sus
  esquinas un poco redondeadas casan con los puntos redondos. En Windows, sin red, cae en **Bahnschrift**, que es una DIN.
  No Inter ni Space Grotesk (es lo que sale por inercia en cualquier imitación de este estilo).
- Escala: 11 (rótulos de puntos, versales, +0,08 em) · 14 · 16 (texto) · 20 · 28 · 40 · 60 (titulares de sección) y la
  pantalla del héroe, que no es texto sino puntos dibujados (de 12 a 26 px de paso).

**Maquetación**: tres ideas.
1. *Ficha técnica centrada* (página de producto): titulares enormes centrados y tablas de especificaciones. Es lo que sale
   por defecto en cualquier web de este estilo; descartada.
2. *Línea de 24 horas*: cada sección cuelga de una hora del día (09:00 la IA, 10:00 Drive…). Bonita, pero la hora sería
   un dato inventado, igual que la agenda semanal que se descartó en Zen.
3. **La pantalla (elegida)**: la portada es una pantalla de matriz de puntos que enseña la fecha en grande. Escribes en la
   línea de debajo, como en un aparato, y la pantalla te contesta con el día y la hora de lo que has apuntado, mientras el
   punto cae en su casilla del mes. El resto de la web va en una rejilla de 12 columnas con separadores de puntos.

```
● ZenCalendar                 Qué hace  Aspecto  ¿Es seguro?  (Zen|Dot)  (Descargar)
───────────────────────────────────────────────────────────────────────────────────
 · · · · · · · · · · · · ·
 · ● ● ● · · ● ● ● ● ● · ·    LUNES                  Apúntalo como lo dirías.
 · · · · ● · · · · · ● · ·    NOVIEMBRE 2026         Escribe «cena con Marta…» y …
 · · · ● · · · · ● ● · · ·    ● AHORA 19:56          (Descargar para Windows) (Android)
 · · ● · · · · · · · ● · ·                           Probar en el navegador
 · ● ● ● ● · · ● ● ● · · ·
 · · · · · · · · · · · · ·
╭─────────────────────────────────────────────────────────────────────────────────╮
│ APUNTA  cena con Marta el viernes a las 9▌                             (Apuntar) │
╰─────────────────────────────────────────────────────────────────────────────────╯
 O prueba con: (dentista mañana a las 5) (yoga los martes…) (…)
 NOVIEMBRE 2026                                                      ‹  Hoy  ›
 L       M       X       J       V       S       D
 26 ···· 27 ···· 28 ···· 29 ···· 30 ···· 31 ···· 1      ← separadores de puntos
 …                            (23) en un círculo rojo = hoy
· · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
Pídeselo con tus palabras.                         (titular en ZenDot, a todo lo ancho)
[ conversación ]                 [ Gratis | De pago | En tu dispositivo ]
```

**Principios**
- **Una pantalla, no una página**: la fecha en puntos es la imagen de marca. Los puntos apagados se ven (como un panel de
  verdad) y los encendidos dibujan el día. Es el único sitio audaz.
- **La forma distingue, el rojo avisa**: sin colores de calendario. Personal es un punto lleno, Trabajo un aro y
  Cumpleaños medio punto. El rojo solo marca hoy, lo nuevo y la hora en directo.
- **Rayas de puntos en vez de rayas**: las casillas del mes y los separadores de sección son líneas de puntos redondos,
  del mismo paso que la pantalla.
- **Movimiento seco**: al cargar, la pantalla se enciende columna a columna, a pasos y sin curvas. Luego solo se mueve lo
  que tocas, y los cambios de la pantalla también van a pasos.

## Segunda pasada: lo que salía por defecto
- *Fondo con rejilla de puntos en toda la página*: es el tópico de las webs de este estilo y compite con la pantalla. La
  rejilla se queda en la pantalla (sus puntos apagados) y en los planos de los widgets, que imitan la trasera transparente.
- *Botón principal rojo*: sería lo fácil, pero entonces el rojo dejaría de significar «ahora». Los botones son píldoras
  blancas o con contorno.
- *Un rótulo de puntos encima de cada sección* («01 / IA»…): es el eyebrow de siempre con otra fuente. Solo hay rótulos
  donde dan un dato: el día de la semana, el mes y la hora de la pantalla, cuántas funciones hay y la versión.
- *El titular a la izquierda y el contenido a la derecha* (lo de Zen): en Dot el titular va solo en su fila, grande y en
  puntos, y el contenido debajo en 12 columnas; cada sección reparte las columnas a su manera.
- *El logo con degradado* en la barra: en Dot es una «Z» de puntos con un punto rojo.
- *Quitar un adorno*: el «parpadeo» de los dos puntos de la hora se va. La hora cambia sin animación.

## Al revisar las capturas
- La conversación de la IA se estiraba por 7 columnas y el cartel quedaba en medio de la nada: ahora el chat mide como mucho
  540 px y la columna de los modos de IA se aparta.
- Los rótulos de puntos a 11 px apenas se leían (los puntos salen de 1 px): suben a 12 px, y los números del mes a 20 px.
- En «Lo que hace», la última fila de cada columna se estiraba: las celdas van arriba (`align-content: start`).
- En el móvil, la «Z» de puntos de la barra se encogía hasta desaparecer y luego empujaba «Descargar» fuera: tamaño fijo y
  huecos más justos por debajo de 600 px.
- La pantalla decía «todo el día» en días sin nada apuntado: esa línea solo sale cuando hay una hora o un evento de todo el día.
- La transición entre diseños ya la hace web-sistema con View Transitions (una rejilla de puntos que crece desde el
  selector) y queda bien: no dejo `ZCDot.transition` para no pisarla.
