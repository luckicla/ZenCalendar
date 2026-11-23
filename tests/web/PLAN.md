# Web de ZenCalendar · plan de diseño (v2)

## Primera pasada

**Color** (papel de agenda, tinta ciruela; el color solo significa «calendario», como las tintas de una agenda)
- Papel `#FCFBFE`: blanco frío, casi sin tinte. En oscuro, Noche `#16131D`
- Tinta `#2B2440`: ciruela muy oscura para el texto (no `#111`). En oscuro `#ECE8F4`
- Lápiz `#665F7A`: texto secundario, 5,9:1 sobre el papel. En oscuro `#A8A1B9`
- Raya `#E3DFEC`: las líneas de la cuadrícula. En oscuro `#2D2839`
- Lavanda `#9F8DFF`: hoy, foco y el calendario Personal. Para texto uso `#5A45D4` (Lavanda tinta)
- Rosa `#F0A6CC` para Cumpleaños y menta `#7DD3B9` (la `#BFF0E4` de la marca con más cuerpo) para Trabajo

**Tipografía**: dos familias, cada una con su trabajo.
- **Bitter** (slab de Huerta Tipográfica) para las fechas y los títulos. Sus cifras con remate recuerdan a los números impresos de los calendarios de pared y de los horarios.
- **Fira Sans** para el texto y la interfaz: humanista, con cifras tabulares de verdad y muy clara en tamaños pequeños.
- Escala clásica (Bringhurst): 12 · 14 · 17 · 21 · 28 · 36 · 48 · 72, y un único tamaño gigante para el mes del héroe (hasta 168 px).
- Interlineado 1,55 en el texto y unos 66 caracteres por línea.

**Conceptos de maquetación**
1. *Hoja de taco*: la fecha de hoy («23») enorme en una hoja que se arranca, y la demo escribe debajo. Es bonita, pero solo enseña un día y no el calendario.
2. *Agenda semanal*: cada sección es un día de una doble página de 7 columnas. Queda forzado, y en móvil las 7 columnas no caben.
3. **Calendario de pared (elegido)**: el héroe es la página del mes a todo lo ancho, con el nombre del mes gigante, rayas finas y los días de verdad. Escribes en la línea de debajo y el evento cae en su casilla. Lo demás de la web son páginas rayadas alineadas con las 7 columnas de esa semana.

```
ZenCalendar                     Qué hace  Aspecto  Descargar  [Descargar para Windows]
────────────────────────────────────────────────────────────────────────────────────
noviembre                                     │ Apúntalo como lo dirías.
           2026                               │ Escribe «cena con Marta el viernes…»
                                              │ [Descargar para Windows] [Android]  Probar…
lun     mar     mié     jue     vie     sáb     dom
────────┼───────┼───────┼───────┼───────┼───────┼───────
26      27      28      29      30      31      1
        ▪Concierto
────────┼───────┼───────┼───────┼───────┼───────┼───────
 …                                     (6 semanas)
────────────────────────────────────────────────────────────────────────────────────
Apunta algo  [cena con Marta el viernes a las 9_____________________]   [Apuntar]
Prueba con:  dentista mañana a las 5   yoga los martes y jueves a las 7   …
════════════════════════════════════════════════════════════════════════════════════
Pídeselo con      │ texto + conversación de ejemplo (cartel → 3 eventos)
tus palabras      │ Gratis / De pago / En tu dispositivo  (filas rayadas)
────────────────────────────────────────────────────────────────────────────────────
(lun–mar: título) │ (mié–dom: contenido)   … y así cada sección
```

**Principios**
- La cuadrícula manda. Hay rayas de 1 px en vez de tarjetas, y todo se alinea con las 7 columnas de la semana del héroe (el título ocupa lun–mar y el contenido mié–dom).
- Las fechas son la tipografía: en Bitter, con cifras tabulares, «hoy» rodeado a mano con un círculo lavanda y los días de otro mes en lápiz.
- El color es información: cuadradito lavanda = Personal, menta = Trabajo, rosa = Cumpleaños. Nada de degradados decorativos; el único que queda es el del logo.
- Un solo momento orquestado: al cargar se trazan las rayas del mes, aparecen los días y se escribe sola la frase de ejemplo, que cae en el viernes. El resto está quieto y solo responde a lo que haces.

## Segunda pasada: revisión contra el encargo
- **Títulos a la izquierda y contenido a la derecha**: así sale en cualquier web de app. Lo ato a la semana: el corte cae justo en las columnas lun–mar / mié–dom del héroe, y la raya de arriba de cada sección es la misma raya de la cuadrícula. Así toda la página se lee como un calendario y no como una plantilla.
- **El héroe con el titular grande a la izquierda y una maqueta a la derecha**: es el esquema de siempre. Lo cambio para que la maqueta *sea* la página: el mes ocupa todo el ancho, y el titular es un pie pequeño junto al nombre del mes, como en un calendario de pared.
- **Widgets y capturas sobre fondos de degradado**: es decoración genérica. Los pongo sobre planos lisos de lavanda y menta muy claros, como el papel de color de una agenda.
- **Pie con el nombre enorme**: sería un segundo sitio audaz y compite con el mes del héroe. Lo quito y dejo un pie de una línea (el consejo de Chanel).
- **Panel de ajustes dentro de una tarjeta de vidrio**: es el kit SaaS. Va como lista rayada con muestras cuadradas, igual que una página de ajustes de una agenda. El vidrio se queda solo dentro de la maqueta de la app, porque es como se ve la app de verdad.
- **Versión inventada**: la versión solo sale si la API de Releases devuelve una de verdad, y sin puntos medios: «Versión 1.0.1, del 30 de noviembre».

## Al revisar las capturas
- La menta de Trabajo se veía demasiado pálida en los cuadraditos. Paso de `#9EDFCB` a `#7DD3B9`.
- Fallo de especificidad: `.demo .ev` fijaba el color y anulaba `.ev--work` y `.ev--birthdays`, así que todo salía lavanda. Ahora el color por defecto va en `.ev` y los modificadores ganan.
- La raya de cada página se metía en los márgenes: ahora mide lo mismo que la cuadrícula del mes.
- Consejo de Chanel: quito el giro del cartel de ejemplo de la conversación.
