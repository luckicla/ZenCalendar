'use strict';
// ZenCalendar · los iconos propios de los workspaces (en lugar de emojis). Dibujados a mano en 24×24, con el mismo
// trazo fino y redondeado que web/js/ui/icons.js. El id es lo que se guarda en Firestore (workspaces/{wid}.icon):
// la lista de ids está también en web/js/core/ws.js (ZC.ws.ICONS) y en firestore.rules. En el diseño Dot, ws.css
// los dibuja con puntos (trazo punteado) cuando son grandes y con línea finísima cuando son pequeños.
(function () {
  // (también lo usa la página del enlace, docs/w/, sin el resto de la app)
  const ZC = window.ZC = window.ZC || {}, UI = ZC.ui = ZC.ui || {};
  // id: [dibujo, 'es', 'ca', 'en', 'más palabras para buscar']
  const I = {
    casa: ['<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V19a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V9.5"/>', 'Casa', 'Casa', 'Home', 'hogar piso llar house'],
    corazon: ['<path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z"/>', 'Corazón', 'Cor', 'Heart', 'amor pareja love'],
    grupo: ['<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M15.5 14.2c2.6-.3 4.5 1.3 5 4.3"/>', 'Grupo', 'Grup', 'Group', 'amigos familia amics friends family'],
    trabajo: ['<rect x="3.5" y="7.5" width="17" height="12" rx="3"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5"/><path d="M3.5 12.5h17"/>', 'Trabajo', 'Feina', 'Work', 'maletín oficina treball office briefcase'],
    libro: ['<path d="M12 6.5c-2-1.4-4.6-2-8-1.8v13c3.4-.2 6 .4 8 1.8 2-1.4 4.6-2 8-1.8v-13c-3.4-.2-6 .4-8 1.8z"/><path d="M12 6.5v13"/>', 'Estudio', 'Estudi', 'Study', 'libro llibre book clase escuela school'],
    deporte: ['<path d="M6.5 7.5v9M17.5 7.5v9M4 10v4M20 10v4M6.5 12h11"/>', 'Deporte', 'Esport', 'Sport', 'gimnasio pesas gym'],
    balon: ['<circle cx="12" cy="12" r="8.5"/><path d="M12 8.2l3.2 2.3-1.2 3.8h-4l-1.2-3.8z"/><path d="M12 8.2V3.5M15.2 10.5l4.3-1.4M14 14.3l2.6 3.6M10 14.3l-2.6 3.6M8.8 10.5L4.5 9.1"/>', 'Balón', 'Pilota', 'Ball', 'fútbol futbol football soccer partido'],
    avion: ['<path d="M12 3c.9 0 1.5 1 1.5 2.5V10l7 4v2l-7-2v4l2 1.5V21l-3.5-1-3.5 1v-1.5l2-1.5v-4l-7 2v-2l7-4V5.5C10.5 4 11.1 3 12 3z"/>', 'Viaje', 'Viatge', 'Trip', 'avión avió plane travel vacaciones'],
    playa: ['<path d="M4 11.5a8 8 0 0 1 16 0z"/><path d="M12 11.5v8"/><path d="M3.5 20.5c2-1 4-1 6 0s4 1 6 0 3.5-.7 5 0"/>', 'Playa', 'Platja', 'Beach', 'verano estiu summer sombrilla mar'],
    montana: ['<path d="M2.5 19.5l6.5-11 4 6.5 2.5-3.5 6 8z"/><path d="M7.3 11.5l1.7 1.5 1.7-1.5"/>', 'Montaña', 'Muntanya', 'Mountain', 'excursión senderismo hiking'],
    coche: ['<path d="M3.5 16v-3.5l2.2-5a1.5 1.5 0 0 1 1.4-.9h9.8a1.5 1.5 0 0 1 1.4.9l2.2 5V16a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 12.5h17M6 17v2M18 17v2"/><circle cx="7.5" cy="14.8" r=".9"/><circle cx="16.5" cy="14.8" r=".9"/>', 'Coche', 'Cotxe', 'Car', 'auto carretera road'],
    comida: ['<path d="M7 3.5v17M4.5 3.5v4a2.5 2.5 0 0 0 5 0v-4"/><path d="M17 20.5v-17c-2.2 1-3.5 3.5-3.5 7 0 1.5.8 2.5 2 2.5h1.5"/>', 'Comida', 'Menjar', 'Food', 'cena comer restaurante dinner'],
    copa: ['<path d="M7.5 3.5h9l-.5 5a4 4 0 0 1-8 0z"/><path d="M12 12.5v8M8.5 20.5h7M7.8 7h8.4"/>', 'Copa', 'Copa', 'Drinks', 'vino vi wine bar'],
    cafe: ['<path d="M4.5 9.5h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M16.5 11h1.5a2.5 2.5 0 0 1 0 5h-1.8"/><path d="M8.5 3.5c-.8 1 .8 2 0 3M12.5 3.5c-.8 1 .8 2 0 3"/>', 'Café', 'Cafè', 'Coffee', 'desayuno esmorzar'],
    tarta: ['<path d="M4.5 20.5V14a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6.5z"/><path d="M3.5 20.5h17"/><path d="M4.5 15.5c1.2 1.2 2.5 1.2 3.75 0s2.5-1.2 3.75 0 2.5 1.2 3.75 0 2.5-1.2 3.75 0"/><path d="M12 12V8.5"/><path d="M12 4.5c.9.9 1 2 0 2.8-1-.8-.9-1.9 0-2.8z"/>', 'Cumpleaños', 'Aniversari', 'Birthday', 'tarta pastís cake'],
    musica: ['<path d="M9 17.5V6l10-2v11.5M9 9.5l10-2"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>', 'Música', 'Música', 'Music', 'concierto concert banda'],
    juego: ['<path d="M7.5 7.5h9a4.5 4.5 0 0 1 4.4 5.5l-.9 4a2.3 2.3 0 0 1-4 .9L14.5 16h-5L8 17.9a2.3 2.3 0 0 1-4-.9l-.9-4A4.5 4.5 0 0 1 7.5 7.5z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11" r=".7"/><circle cx="17" cy="13" r=".7"/>', 'Juegos', 'Jocs', 'Games', 'videojuegos mando gaming'],
    pata: ['<path d="M12 12.5c-2.5 0-5 2.6-5 5 0 1.6 1.4 2.5 2.8 2 1-.3 1.5-.5 2.2-.5s1.2.2 2.2.5c1.4.5 2.8-.4 2.8-2 0-2.4-2.5-5-5-5z"/><ellipse cx="6" cy="10.5" rx="1.6" ry="2"/><ellipse cx="9.5" cy="6.5" rx="1.6" ry="2.1"/><ellipse cx="14.5" cy="6.5" rx="1.6" ry="2.1"/><ellipse cx="18" cy="10.5" rx="1.6" ry="2"/>', 'Mascota', 'Mascota', 'Pet', 'perro gato gos gat dog cat pata'],
    bebe: ['<circle cx="12" cy="13" r="7"/><path d="M12 6c-1.5 0-2 1.5-1 2.2"/><circle cx="9.5" cy="12.5" r=".7"/><circle cx="14.5" cy="12.5" r=".7"/><path d="M10 15.8c1.2.9 2.8.9 4 0"/>', 'Bebé', 'Nadó', 'Baby', 'niños nens kids'],
    hoja: ['<path d="M5 19c0-8 5-13.5 14.5-14-.5 9.5-6 14.5-14 14z"/><path d="M5 19l8-8"/>', 'Planta', 'Planta', 'Plant', 'hoja fulla leaf jardín huerto garden'],
    estrella: ['<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-3.9 5.6-.8z"/>', 'Estrella', 'Estrella', 'Star', 'favorito'],
    rayo: ['<path d="M13.5 3L5.5 13.5h6L10.5 21l8-10.5h-6z"/>', 'Rayo', 'Llamp', 'Bolt', 'energía urgente energy'],
    luna: ['<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>', 'Luna', 'Lluna', 'Moon', 'noche nit night'],
    sol: ['<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>', 'Sol', 'Sol', 'Sun', 'día dia day'],
    regalo: ['<rect x="4" y="8.5" width="16" height="4" rx="1"/><path d="M5.5 12.5v7a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7M12 8.5v12"/><path d="M12 8.5c-1.5-3.5-5.5-4-5.5-1.8 0 1.3 2 1.8 5.5 1.8zM12 8.5c1.5-3.5 5.5-4 5.5-1.8 0 1.3-2 1.8-5.5 1.8z"/>', 'Regalo', 'Regal', 'Gift', 'navidad nadal christmas'],
    dinero: ['<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>', 'Dinero', 'Diners', 'Money', 'gastos pagos despeses bills'],
    carrito: ['<path d="M3 4.5h2.5l2.2 10.2a1.5 1.5 0 0 0 1.5 1.3h7.6a1.5 1.5 0 0 0 1.4-1.1L20 8H6.3"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="16.5" cy="19.5" r="1.3"/>', 'Compras', 'Compres', 'Shopping', 'carrito súper supermercat'],
    herramienta: ['<path d="M13.5 9.5l-8.8 8.8a1.6 1.6 0 0 0 2.3 2.3l8.8-8.8"/><path d="M11 6.5l3.5-3 6 6-3 3.5z"/>', 'Herramientas', 'Eines', 'Tools', 'martillo martell bricolaje obras'],
    salud: ['<rect x="3.5" y="7" width="17" height="13" rx="3"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M12 10.5v6M9 13.5h6"/>', 'Salud', 'Salut', 'Health', 'médico metge doctor botiquín'],
    fiesta: ['<path d="M4 20l4.5-12 7.5 7.5z"/><path d="M13 4.5c.5 1.5-.5 2.5 0 3.5M19.5 11c-1.5-.5-2.5.5-3.5 0M16 4l.5 1.5M20 8l-1.5.5"/><circle cx="18.5" cy="4" r=".7"/><circle cx="20" cy="15.5" r=".7"/>', 'Fiesta', 'Festa', 'Party', 'celebración confeti'],
    camara: ['<path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>', 'Fotos', 'Fotos', 'Photos', 'cámara càmera camera'],
    codigo: ['<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14"/>', 'Código', 'Codi', 'Code', 'programar proyecto project'],
    pincel: ['<path d="M19.5 4.5c-2 .5-7.5 6-9 8.5l1.5 1.5c2.5-1.5 8-7 8.5-9z"/><path d="M10.5 13C8.5 13 7 14.5 7 16.5c0 1.5-1 2.5-2.5 3 3.5 1 7.5-.5 7.5-5"/>', 'Arte', 'Art', 'Art', 'pincel pinzell dibujo brush'],
    chat: ['<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5v-3.5h.5a2 2 0 0 1-2-2z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>', 'Charla', 'Xerrada', 'Chat', 'mensajes missatges messages'],
    calendario: ['<rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2"/>', 'Calendario', 'Calendari', 'Calendar', 'agenda plan'],
    campana: ['<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0M12 3v2"/>', 'Campana', 'Campana', 'Bell', 'avisos alertas'],
    bandera: ['<path d="M5.5 21V4"/><path d="M5.5 4.5h11l-2 4 2 4h-11"/>', 'Bandera', 'Bandera', 'Flag', 'meta objetivo goal'],
    ubicacion: ['<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', 'Lugar', 'Lloc', 'Place', 'ubicación ubicació mapa location'],
    iglu: ['<path d="M3 19.5a9 9 0 0 1 18 0z"/><path d="M9.5 19.5v-3a2.5 2.5 0 0 1 5 0v3"/><path d="M4.2 15h4.6M15.2 15h4.6M6.4 12.5h11.2M12 10.5v2"/>', 'Iglú', 'Iglú', 'Igloo', 'hogar refugio invierno winter'],
    llave: ['<path d="M14.5 4a4.5 4.5 0 0 0-4.2 6.1L4 16.4a1.9 1.9 0 0 0 2.7 2.7l6.3-6.3A4.5 4.5 0 0 0 19.6 8l-2.8 2.8-2.6-.7-.7-2.6 2.8-2.8A4.5 4.5 0 0 0 14.5 4z"/>', 'Taller', 'Taller', 'Workshop', 'llave inglesa clau anglesa wrench reparar'],
  };
  const IDS = (ZC.ws && ZC.ws.ICONS) || Object.keys(I);
  const LANG = { es: 1, ca: 2, en: 3 };
  const lang = () => (ZC.i18n && ZC.i18n.lang && ZC.i18n.lang()) || 'es';
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /** el SVG del icono (uno que no existe → la estrella) */
  function svg(id, size = 20, cls = '') {
    const d = (I[id] || I.estrella)[0];
    return `<svg class="ic wsi-ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }
  /** el nombre en el idioma de la app */
  const label = id => (I[id] || I.estrella)[LANG[lang()] || 1];
  /** buscar por nombre en ES, CA y EN (y alguna palabra más) */
  function search(q) {
    q = fold(q).trim();
    if (!q) return IDS.slice();
    const words = q.split(/\s+/);
    return IDS.filter(id => { const x = I[id]; const hay = fold([id, x[1], x[2], x[3], x[4]].join(' ')); return words.every(w => hay.includes(w)); });
  }

  UI.wsIcons = { svg, label, search, ids: () => IDS.slice(), has: id => !!I[id] };
})();
