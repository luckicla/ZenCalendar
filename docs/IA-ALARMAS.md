# IA que borra y alarmas — contrato (versión 1.2.0)

Lo que pide Lluc: «que la IA pueda quitar cosas también, tipo *quita todo de no sé dónde*, y que también recomiende
poner alarmas para cosas que sean tipo *importante despertarme a x hora*».

## Datos
- Campo nuevo en eventos y tareas: `alarm: false | true` (por defecto `false`; lo que no lo tenga, `false`).
  Una alarma **suena a la hora de inicio** como un despertador (en Android aunque el móvil esté en silencio o en
  «No molestar» si el sistema lo permite, con sonido de alarma que se repite hasta que la paras, botones «Posponer 10 min»
  y «Parar»). Los avisos (`reminders`) siguen siendo notificaciones normales, aparte. En eventos de todo el día la alarma
  suena a las 09:00 (como los avisos) salvo que haya `alarmTime: 'HH:mm'`.
- Se sincroniza por Drive como cualquier campo.

## Núcleo (`web/js/core`) — agente BACK
- `ZC.nlp.parse` devuelve además `alarm: true` cuando la frase lo pide o lo sugiere claramente: «despiértame / despertarme
  / despertador / alarma / pon una alarma / que suene / wake me up / alarm / desperta'm…». Con «importante», «sin falta»,
  «no me lo puedo perder», «urgente»… devuelve `alarmSuggested: true` (no `alarm`). «Despiértame a las 7» = una tarea o
  evento corto a las 07:00 de mañana (o de hoy si aún no ha pasado) con `alarm: true` y título «Despertarse» si no hay otro.
- `ZC.nlp.parseCommand(text, { now, lang })` → orden de borrar o `null`:
  `{ intent: 'delete', filter: { from: Date|null, to: Date|null, calendarId: string|null, text: string|null, kind: 'event'|'task'|null }, all: bool }`.
  Entiende: «quita/borra/elimina/cancela/limpia (todo|todos los eventos|las tareas|lo) (de|del) <fecha | calendario | texto>»,
  «borra la reunión del lunes», «quita lo del gimnasio de esta semana», «vacía el viernes», «delete everything tomorrow»,
  «esborra-ho tot de demà»… Fechas como en `parse` (hoy, mañana, el viernes, esta semana, la semana que viene, este mes,
  el 3 de diciembre, del 3 al 7…), calendarios por nombre (Trabajo, Personal, Cumpleaños o los del usuario).
- `ZC.ai`:
  - Proveedor `rules` (sin internet): si `parseCommand` da una orden de borrar, busca con `ZC.store.occurrences` lo que
    encaja y devuelve una acción `delete` por cada evento (con `mode: 'all'` si es una serie entera dentro del filtro o
    `mode: 'one', date` si es una sola repetición) y una respuesta tipo «He encontrado 5 eventos de mañana para borrar».
    Si no encuentra nada, lo dice. Si la frase crea algo con `alarmSuggested`, añade la sugerencia de alarma (abajo).
  - Proveedores con modelo: el prompt de sistema explica que puede borrar en bloque (varias acciones `delete`, con `mode`
    y `date` para series), que debe poner `alarm: true` cuando el usuario quiere que algo le despierte o suene sí o sí, y
    que **recomiende** una alarma cuando algo parece importante y a una hora concreta (cita médica, vuelo, examen,
    entrevista, despertarse…), sin pasarse.
  - **Sugerencias**: cualquier acción puede llevar `suggest: true` y `why: 'texto corto'` → el frontend la enseña como
    sugerencia, desmarcada, para que el usuario la acepte o no. Para recomendar una alarma: si el evento se crea en la misma
    respuesta, una acción `{ type: 'create', event: {...sin alarma} }` y otra `{ type: 'update', ref: 0, changes: { alarm: true }, suggest: true, why }`
    donde `ref` es el índice de la acción `create` a la que se refiere (o `id` si ya existe).
  - `apply(actions)` entiende `ref`, `mode`/`date` en `delete` y se salta las acciones con `suggest: true` que el frontend
    no haya marcado (el frontend le quita `suggest` a las que el usuario acepta).
  - Seguridad: borrar más de 20 cosas de golpe exige `confirmMany: true` en la respuesta (el frontend pide confirmación).
- `ZC.reminders`: programa también las alarmas (`{ id, at, title, body, alarm: true }`), además de los avisos.

## Plataformas — agente BACK
- **Android**: canal de notificación nuevo «Alarmas» (importancia alta, sonido de alarma del sistema con
  `AudioAttributes.USAGE_ALARM`, vibración larga), `AlarmManager.setAlarmClock` (exacta, sale el reloj en la barra de
  estado y salta el ahorro de batería), notificación de categoría `ALARM`, insistente (el sonido se repite) y que no se
  quita deslizando hasta pulsar «Parar» o «Posponer 10 min»; al tocarla abre el evento. Si es posible sin permisos
  restringidos, pantalla completa encima del bloqueo (`setFullScreenIntent` con `USE_FULL_SCREEN_INTENT`; en Android 14+
  comprueba `canUseFullScreenIntent()` y, si no, solo la notificación). Que sobreviva a reinicios como los avisos.
  Java impecable (no hay SDK aquí; hay stubs de javac en `/tmp/zdot/jc/`: `mkR.py` y `stubs/`, amplíalos si hace falta).
- **Windows**: notificación con sonido que no se va sola (`timeoutType: 'never'`, `urgency: 'critical'`) y, si la ventana
  está oculta, la enseña. **Web**: `Notification` con `requireInteraction: true` y `vibrate`.

## Interfaz (`web/index.html`, `web/css`, `web/js/ui`) — agente FRONT
- Editor: interruptor «Alarma» («Suena como un despertador a la hora del evento, aunque el móvil esté en silencio»), con
  la hora de la alarma en los de todo el día. En el detalle y en las vistas, un iconito de despertador en lo que tiene alarma.
- Añadir rápido: chip «⏰ Alarma» cuando `nlp.parse` da `alarm`, y una sugerencia tocable «¿Le pongo alarma?» cuando da `alarmSuggested`.
- Asistente: la vista previa agrupa los borrados («Borrar 7 eventos de mañana», desplegable con la lista y casillas para
  quitar alguno), enseña las sugerencias (`suggest`) como tarjetas desmarcadas con su `why` y un interruptor para aceptarlas,
  y pide confirmación si `confirmMany`. «Deshacer» devuelve todo lo borrado. Ejemplos nuevos en el asistente: «Quita todo
  lo de mañana», «Despiértame a las 7».
- En los dos diseños (Zen y Dot), ES/CA/EN, móvil y PC, sin solapes (`tests/ui/overlap.js` sigue limpio).

## Pruebas
`node tests/core/run.js` (añadir casos de `parseCommand`, `alarm`/`alarmSuggested`, el proveedor `rules` borrando y
sugiriendo, `apply` con `ref`/`suggest`/`mode`), y `node tests/ui/{interact,regress,gestures,updates,dot,welcome,fab}.js`
+ uno nuevo `tests/ui/ai-alarm.js` (frontend). Nadie hace commits ni push.
