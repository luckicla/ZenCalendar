'use strict';
// ZenCalendar: el asistente con IA.
//
// run(texto, { images, history, onToken }) → { reply, actions, provider }
//   No aplica nada: el frontend enseña la vista previa y luego llama a apply().
//   Acciones: { type: 'create', event, cid } · { type: 'update', id | ref, changes } ·
//             { type: 'delete', id, mode?, date? } · { type: 'complete', id }
//   Cualquiera puede llevar suggest: true + why: 'texto' (sugerencia: el frontend la
//   enseña desmarcada; apply() se salta las que sigan con suggest). ref = índice de la
//   acción create de la misma respuesta (refId = su cid, por si se quitan acciones).
//   confirmMany: true en la respuesta cuando se borran más de 20 cosas de golpe.
//
// Proveedores:
//   rules      → el parser integrado (ZC.nlp), sin internet
//   device     → un modelo abierto en el propio dispositivo con WebLLM (WebGPU)
//   ollama     → los modelos de Ollama en el PC
//   gemini, groq, openrouter, openai, anthropic, mistral, custom → APIs con clave
// Las claves de API se quedan SOLO en este dispositivo (ZC.store.local), nunca
// van a Drive. Nunca rompe: si la IA falla, contesta con el error y, si puede,
// con lo que entiende el parser integrado.
(function (root) {
  const ZC = root.ZC = root.ZC || {};
  const U = () => ZC.util;

  const PROVIDERS = [
    { id: 'rules', name: 'Integrado', free: true, offline: true, needsKey: false, keyUrl: '', defaultModel: '', vision: false, kind: 'rules',
      desc: 'Entiende frases como «mañana a las 5 dentista» o «cada lunes gimnasio a las 7». Instantáneo, sin internet y sin cuentas. No entiende fotos.' },
    { id: 'device', name: 'En tu dispositivo', free: true, offline: true, needsKey: false, keyUrl: '', defaultModel: '', vision: false, kind: 'device',
      desc: 'Un modelo abierto (Qwen 2.5) que se descarga una vez y funciona sin internet. Lo que escribes no sale de tu dispositivo. Necesita WebGPU.' },
    { id: 'ollama', name: 'Ollama (PC)', free: true, offline: true, needsKey: false, keyUrl: 'https://ollama.com/download', defaultModel: '', vision: true, kind: 'openai',
      baseUrl: 'http://localhost:11434/v1', desc: 'Usa los modelos que tengas instalados en Ollama, en tu PC. Privado y gratis. Para fotos, un modelo con visión (gemma3, llava, qwen2.5vl).' },
    { id: 'gemini', name: 'Google Gemini', free: true, offline: false, needsKey: true, keyUrl: 'https://aistudio.google.com/apikey', defaultModel: 'gemini-2.5-flash', vision: true, kind: 'openai',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', desc: 'Gratis con una clave de Google AI Studio (se saca en un minuto). Muy bueno leyendo fotos de carteles y horarios.' },
    { id: 'groq', name: 'Groq', free: true, offline: false, needsKey: true, keyUrl: 'https://console.groq.com/keys', defaultModel: 'llama-3.3-70b-versatile', visionModel: 'meta-llama/llama-4-scout-17b-16e-instruct', vision: true, kind: 'openai',
      baseUrl: 'https://api.groq.com/openai/v1', desc: 'Gratis con clave y rapidísimo. Modelos abiertos (Llama).' },
    { id: 'openrouter', name: 'OpenRouter', free: true, offline: false, needsKey: true, keyUrl: 'https://openrouter.ai/keys', defaultModel: 'meta-llama/llama-3.3-70b-instruct:free', visionModel: 'google/gemma-3-27b-it:free', vision: true, kind: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1', desc: 'Muchos modelos; los que acaban en «:free» son gratis (con límite diario).' },
    { id: 'openai', name: 'OpenAI', free: false, offline: false, needsKey: true, keyUrl: 'https://platform.openai.com/api-keys', defaultModel: 'gpt-4.1-mini', vision: true, kind: 'openai',
      baseUrl: 'https://api.openai.com/v1', desc: 'Los modelos GPT. De pago por uso.' },
    { id: 'anthropic', name: 'Anthropic (Claude)', free: false, offline: false, needsKey: true, keyUrl: 'https://console.anthropic.com/settings/keys', defaultModel: 'claude-haiku-4-5', vision: true, kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1', desc: 'Los modelos Claude. De pago por uso; Haiku es el más barato y rápido.' },
    { id: 'mistral', name: 'Mistral', free: true, offline: false, needsKey: true, keyUrl: 'https://console.mistral.ai/api-keys', defaultModel: 'mistral-small-latest', vision: true, kind: 'openai',
      baseUrl: 'https://api.mistral.ai/v1', desc: 'IA europea. Tiene un plan gratis para probar.' },
    { id: 'custom', name: 'Otro (compatible con OpenAI)', free: false, offline: false, needsKey: false, keyUrl: '', defaultModel: '', vision: true, kind: 'openai',
      baseUrl: '', desc: 'Cualquier servicio con la API de OpenAI (LM Studio, vLLM, LocalAI…): pon su dirección y, si hace falta, la clave.' },
  ];
  const provider = id => PROVIDERS.find(p => p.id === id) || PROVIDERS[0];

  // ---------- configuración ----------
  function rawConf() {
    try { return Object.assign({ provider: 'rules', model: '', baseUrl: '', autoApply: false, models: {}, urls: {} }, ZC.store.getPrefs().ai); }
    catch (e) { return { provider: 'rules', model: '', baseUrl: '', autoApply: false, models: {}, urls: {} }; }
  }
  function getConfig() {
    const c = rawConf();
    const p = provider(c.provider);
    let model = c.model || '';
    if (p.id === 'device') model = device.model();
    return { provider: p.id, model: model || p.defaultModel || '', baseUrl: c.baseUrl || p.baseUrl || '', autoApply: !!c.autoApply, hasKey: hasKey(p.id) };
  }
  async function setConfig(patch) {
    const c = rawConf();
    const next = Object.assign({}, c);
    next.models = Object.assign({}, c.models); next.urls = Object.assign({}, c.urls);
    if (patch.provider && patch.provider !== c.provider) {
      // cada proveedor recuerda su modelo y su dirección
      next.models[c.provider] = c.model; next.urls[c.provider] = c.baseUrl;
      next.provider = provider(patch.provider).id;
      next.model = next.models[next.provider] || '';
      next.baseUrl = next.urls[next.provider] || '';
    }
    if ('model' in patch) next.model = String(patch.model || '').trim();
    if ('baseUrl' in patch) next.baseUrl = String(patch.baseUrl || '').trim();
    if ('autoApply' in patch) next.autoApply = !!patch.autoApply;
    await ZC.store.setPrefs({ ai: next });
    return getConfig();
  }
  const keyName = id => 'ai.key.' + id;
  function setKey(id, key) { key = String(key || '').trim(); ZC.store.local(keyName(id), key || null); }
  const getKey = id => ZC.store.local(keyName(id)) || '';
  const hasKey = id => !!getKey(id);

  // ---------- lo que sabe la IA del calendario ----------
  function offsetText(d) {
    const off = -d.getTimezoneOffset();
    const s = off >= 0 ? '+' : '-';
    const a = Math.abs(off);
    return s + U().pad(Math.floor(a / 60)) + ':' + U().pad(a % 60);
  }

  function context(maxLines) {
    const u = U();
    const now = new Date();
    const lines = [];
    const seen = new Set();
    let occ = [];
    try { occ = ZC.store.occurrences(u.addDays(u.startOfDay(now), -7), u.addDays(now, 60), { includeHidden: true, includeTasks: true }); } catch (e) {}
    for (const o of occ) {
      const ev = o.ev;
      if (ev.rrule) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        const next = occ.filter(x => x.id === ev.id && x.endEx >= now).slice(0, 3).map(x => u.toLocal(x.start, ev.allDay));
        lines.push([ev.id, ev.start, ev.end, ev.title, ev.calendarId, ev.location || '', 'serie: ' + ZC.recur.describe(ev.rrule, 'es', ev.start) + (next.length ? ' (próximas: ' + next.join(', ') + ')' : ''), (ev.kind === 'task' ? 'tarea' : '') + (ev.alarm ? ' alarma' : '')].join(' | '));
      } else {
        lines.push([ev.id, ev.start, ev.end, ev.title, ev.calendarId, ev.location || '', '', (ev.kind === 'task' ? (ev.done ? 'tarea hecha' : 'tarea') : '') + (ev.alarm ? ' alarma' : '')].join(' | '));
      }
      if (lines.length >= maxLines) break;
    }
    return lines;
  }

  function systemPrompt(opts) {
    opts = opts || {};
    const u = U();
    const now = new Date();
    let fecha = u.ymd(now);
    try { fecha = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now); } catch (e) {}
    const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const days = [];
    for (let i = 0; i < 14; i++) { const d = u.addDays(u.startOfDay(now), i); days.push(WD[d.getDay()] + ' ' + u.ymd(d)); }
    const cals = (ZC.store.calendars() || []).map(c => c.id + ': ' + c.name).join(', ');
    const ev = context(opts.small ? 40 : 160);
    return [
      'Eres el asistente de ZenCalendar, una app de calendario. Ayudas a crear, cambiar, borrar y completar eventos y tareas, y a responder preguntas sobre la agenda.',
      'Ahora es ' + fecha + ', ' + u.hm(now) + ' (zona ' + (u.timeZone() || 'local') + ', UTC' + offsetText(now) + ').',
      'Próximos días: ' + days.join(', ') + '.',
      'Calendarios (id: nombre): ' + cals + '.',
      'Eventos y tareas (de hace 7 días a dentro de 60). Formato: id | inicio | fin | título | calendario | lugar | repetición | tipo (tarea, alarma)',
      ev.length ? ev.join('\n') : '(ninguno)',
      '',
      'Responde SOLO con un objeto JSON, sin nada antes ni después:',
      '{"reply": "frase corta y amable para el usuario, en su idioma", "actions": [ ... ]}',
      'Acciones:',
      '- {"type":"create","event":{"kind":"event","title":"…","start":"YYYY-MM-DDTHH:mm","end":"YYYY-MM-DDTHH:mm","allDay":false,"location":"","notes":"","calendarId":"personal","reminders":[10],"rrule":null,"alarm":false}}',
      '- {"type":"update","id":"<id de la lista>","changes":{solo los campos que cambian}}',
      '- {"type":"update","ref":<índice en "actions" de un create de esta misma respuesta>,"changes":{…}}',
      '- {"type":"delete","id":"<id de la lista>"} · si se repite: "mode":"all" (toda la serie), "mode":"one" con "date":"YYYY-MM-DD" (solo ese día) o "mode":"future" con "date" (ese día y los siguientes)',
      '- {"type":"complete","id":"<id de una tarea>"}',
      'Reglas:',
      '- Fechas locales sin zona. Todo el día: "allDay":true, "start":"YYYY-MM-DD" y "end" = último día incluido.',
      '- kind "task" para recordatorios y cosas por hacer (end = start).',
      '- rrule: {"freq":"daily|weekly|monthly|yearly","interval":1,"byDay":["MO","WE"],"until":"YYYY-MM-DD"|null,"count":null}.',
      '- Sin duración: 1 hora. Con día pero sin hora: todo el día. reminders = minutos antes (todo el día: antes de las 9:00).',
      '- Solo ids de la lista. Cambiar algo que se repite afecta a toda la serie.',
      '- Borrar en bloque: si piden quitar varias cosas («quita todo lo de mañana», «borra las reuniones de esta semana», «vacía el viernes»), una acción delete por cada evento o tarea de la lista que encaje, sin inventar ninguno. Si una serie solo cae una vez en lo que piden, "mode":"one" con esa "date"; si la serie entera está dentro, "mode":"all". En "reply" di cuántas cosas vas a borrar. Si no encaja nada, dilo sin acciones.',
      '- Alarmas: "alarm":true hace que el evento suene como un despertador a su hora de inicio, aunque el móvil esté en silencio (todo el día: a las 09:00 o a "alarmTime":"HH:mm"). Ponla directamente cuando el usuario quiere que algo le despierte o le suene sí o sí. «Despiértame a las 7» = evento «Despertarse» a las 07:00 (de mañana, o de hoy si aún no han dado), de 15 minutos, "alarm":true y "reminders":[].',
      '- Recomendar alarma: si algo parece importante y es a una hora concreta (cita médica, vuelo, tren, examen, entrevista, juicio, levantarse temprano…) y el usuario no la ha pedido, no la pongas en el evento: añade {"type":"update","ref":<índice del create>,"changes":{"alarm":true},"suggest":true,"why":"motivo muy corto"} (o con "id" si el evento ya existe). Sin pasarse: solo para lo importante, nunca para todo.',
      '- Cualquier acción puede llevar "suggest":true y "why":"…" para proponerla sin hacerla: el usuario decide si la acepta.',
      '- Si solo preguntan (¿qué tengo mañana?), contesta en "reply" con "actions": [].',
      '- Si algo no está claro, pregunta en "reply" sin acciones.',
      '- Con fotos (carteles, entradas, horarios, invitaciones): un evento por cada fecha que veas, con lugar y detalles útiles en "notes". Si falta el año, el próximo que encaje.',
    ].join('\n');
  }

  // ---------- imágenes ----------
  async function prepImage(blob) {
    const MAX = 1600;
    try {
      if (root.createImageBitmap && root.document) {
        const bmp = await createImageBitmap(blob);
        const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
        const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(bmp, 0, 0, w, h);
        if (bmp.close) bmp.close();
        const url = c.toDataURL('image/jpeg', 0.85);
        return { type: 'image/jpeg', b64: url.slice(url.indexOf(',') + 1) };
      }
    } catch (e) { console.warn('[ZC] no se pudo reducir la imagen', e); }
    return { type: blob.type || 'image/jpeg', b64: U().toBase64(new Uint8Array(await blob.arrayBuffer())) };
  }

  // ---------- llamadas a los proveedores ----------
  function apiError(status, msg, p, model) {
    let text = msg || ('HTTP ' + status);
    if (status === 401 || status === 403) text = 'La clave de ' + p.name + ' no vale o no tiene permiso';
    else if (status === 429) text = p.name + ' dice que hay demasiadas peticiones (o se acabó el saldo/límite gratis). Espera un poco';
    else if (status === 404) text = 'El modelo «' + model + '» no existe en ' + p.name;
    else if (status >= 500) text = p.name + ' no responde ahora mismo';
    const e = new Error(text); e.status = status;
    return e;
  }

  async function errText(r) {
    try { const j = await r.json(); return (j.error && (j.error.message || j.error)) || j.message || ''; } catch (e) { return ''; }
  }

  async function callOpenAI(p, conf, messages, opts) {
    let base = (conf.baseUrl || p.baseUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Falta la dirección del servicio (Ajustes → IA)');
    if (p.id === 'ollama' && !/\/v1$/.test(base)) base += '/v1';
    let model = conf.model;
    if (opts.images && opts.images.length && p.visionModel && model === p.defaultModel) model = p.visionModel;
    if (p.id === 'ollama' && !model) model = (await ollamaModels())[0] || '';
    if (!model) throw new Error('Falta elegir el modelo (Ajustes → IA)');
    const headers = { 'Content-Type': 'application/json' };
    const key = getKey(p.id);
    if (key) headers.Authorization = 'Bearer ' + key;
    if (p.id === 'openrouter') { headers['HTTP-Referer'] = 'https://luckicla.github.io/zencalendar/'; headers['X-Title'] = 'ZenCalendar'; }
    const body = { model, messages, temperature: 0.2, response_format: { type: 'json_object' } };
    const send = b => ZC.net.fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(b), timeout: 120000 });
    let r = await send(body);
    if (!r.ok && (r.status === 400 || r.status === 422)) {
      // algunos modelos no aceptan response_format: otra vez sin él
      delete body.response_format;
      r = await send(body);
    }
    if (!r.ok) throw apiError(r.status, await errText(r), p, model);
    const j = await r.json();
    const msg = j.choices && j.choices[0] && j.choices[0].message;
    return (msg && (typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map(c => c.text || '').join('') : '')) || '';
  }

  async function callAnthropic(p, conf, system, history, userContent) {
    const key = getKey(p.id);
    const base = (conf.baseUrl || p.baseUrl).replace(/\/+$/, '');
    const r = await ZC.net.fetch(base + '/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
        // (desde el navegador, sin el puente nativo)
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: conf.model, max_tokens: 2048, temperature: 0.2, system, messages: history.concat([{ role: 'user', content: userContent }]) }),
      timeout: 120000,
    });
    if (!r.ok) throw apiError(r.status, await errText(r), p, conf.model);
    const j = await r.json();
    return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  }

  // ---------- modelo en el dispositivo (WebLLM) ----------
  const DEVICE_MODELS = [
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 · 1.5B', sizeMB: 1000, vramMB: 1650, for: 'pc', desc: 'Mejor, para PC o móviles potentes' },
    { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 · 0.5B (ligero)', sizeMB: 400, vramMB: 950, for: 'mobile', desc: 'Más pequeño y rápido, para móviles' },
  ];
  const WEBLLM = 'https://esm.run/@mlc-ai/web-llm';
  let engine = null, engineModel = '', libP = null, dev = { downloading: false, progress: 0, text: '' };
  const isMobile = () => {
    try {
      if (ZC.platform && ZC.platform.kind === 'android') return true;
      if (/Android|iPhone|iPad/i.test(navigator.userAgent)) return true;
      if (navigator.deviceMemory && navigator.deviceMemory <= 4) return true;
    } catch (e) {}
    return false;
  };
  // (import() dentro de una función: así este archivo sigue siendo un script normal)
  const dynImport = u => (new Function('u', 'return import(u)'))(u);
  function loadLib() {
    if (!libP) libP = dynImport(WEBLLM).catch(e => { libP = null; const er = new Error('No se pudo descargar WebLLM (¿sin internet?)'); er.network = true; er.cause = e; throw er; });
    return libP;
  }
  let devBus = null;
  const DE = () => (devBus = devBus || U().emitter());

  const device = {
    models: DEVICE_MODELS,
    reason: '',
    model() {
      const c = rawConf();
      const want = c.provider === 'device' ? c.model : (c.models && c.models.device);
      if (DEVICE_MODELS.some(m => m.id === want)) return want;
      return isMobile() ? DEVICE_MODELS[1].id : DEVICE_MODELS[0].id;
    },
    supported() {
      if (!root.navigator || !navigator.gpu) {
        device.reason = 'Este dispositivo o navegador no tiene WebGPU, que hace falta para la IA en el dispositivo. En el PC funciona en la app de Windows, Chrome o Edge; en el móvil, con un Android y un WebView/Chrome recientes. Mientras, usa «Integrado» u otro proveedor.';
        return false;
      }
      if (root.isSecureContext === false) { device.reason = 'Solo funciona en una página segura (https).'; return false; }
      device.reason = '';
      return true;
    },
    status() {
      const id = device.model();
      const m = DEVICE_MODELS.find(x => x.id === id) || DEVICE_MODELS[0];
      return {
        ready: !!engine && engineModel === id, downloading: dev.downloading, progress: dev.progress, text: dev.text,
        model: id, name: m.name, sizeMB: m.sizeMB, cached: ZC.store.local('ai.device.cached') === id,
        supported: device.supported(), reason: device.reason,
      };
    },
    on: fn => DE().on('status', fn),
    async download(onProgress) {
      if (!device.supported()) throw new Error(device.reason);
      const id = device.model();
      if (engine && engineModel === id) return device.status();
      if (dev.downloading) throw new Error('Ya se está descargando');
      const adapter = await navigator.gpu.requestAdapter().catch(() => null);
      if (!adapter) throw new Error('WebGPU no encuentra una tarjeta gráfica que se pueda usar');
      dev = { downloading: true, progress: 0, text: '' };
      DE().emit('status', device.status());
      try {
        const lib = await loadLib();
        if (engine) { try { await engine.unload(); } catch (e) {} engine = null; }
        engine = await lib.CreateMLCEngine(id, {
          initProgressCallback: r => {
            dev.progress = Math.max(0, Math.min(1, +r.progress || 0));
            dev.text = r.text || '';
            try { if (onProgress) onProgress({ progress: dev.progress, text: dev.text }); } catch (e) {}
            DE().emit('status', device.status());
          },
        });
        engineModel = id;
        ZC.store.local('ai.device.cached', id);
      } catch (e) {
        engine = null; engineModel = '';
        throw e.network ? e : new Error('No se pudo preparar el modelo: ' + (e && e.message || e));
      } finally {
        dev.downloading = false;
        DE().emit('status', device.status());
      }
      return device.status();
    },
    async remove() {
      const id = device.model();
      try { if (engine) await engine.unload(); } catch (e) {}
      engine = null; engineModel = '';
      try { const lib = await loadLib(); if (lib.deleteModelAllInfoInCache) await lib.deleteModelAllInfoInCache(id); } catch (e) { console.warn('[ZC] no se pudo borrar el modelo', e); }
      ZC.store.local('ai.device.cached', null);
      DE().emit('status', device.status());
      return device.status();
    },
    async _chat(messages, onToken) {
      if (!engine || engineModel !== device.model()) {
        if (!device.status().cached) throw new Error('Primero hay que descargar el modelo (Ajustes → IA)');
        await device.download();
      }
      const req = { messages, temperature: 0.2, max_tokens: 1024, response_format: { type: 'json_object' } };
      if (onToken) {
        const chunks = await engine.chat.completions.create(Object.assign({ stream: true }, req));
        let acc = '';
        for await (const ch of chunks) {
          acc += (ch.choices && ch.choices[0] && ch.choices[0].delta && ch.choices[0].delta.content) || '';
          try { onToken(acc); } catch (e) {}
        }
        return acc;
      }
      const r = await engine.chat.completions.create(req);
      return (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '';
    },
  };

  // ---------- Ollama ----------
  async function ollamaModels() {
    const c = rawConf();
    let base = (c.provider === 'ollama' && c.baseUrl) || (c.urls && c.urls.ollama) || 'http://localhost:11434';
    base = base.replace(/\/+$/, '').replace(/\/v1$/, '');
    try {
      const r = await ZC.net.fetch(base + '/api/tags', { timeout: 5000 });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.models || []).map(m => m.name || m.model).filter(Boolean);
    } catch (e) { return []; }
  }

  // ---------- leer lo que contesta la IA ----------
  function repair(t) {
    let s = t.replace(/[“”„«»]/g, '"').replace(/[‘’]/g, "'")
      .replace(/\/\/[^\n"]*$/gm, '')      // comentarios // al final de la línea
      .replace(/,\s*([}\]])/g, '$1');     // comas de más
    // llaves/corchetes sin cerrar (respuesta cortada)
    let curly = 0, square = 0, inStr = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { i++; continue; }
      if (c === '"') inStr = !inStr;
      if (inStr) continue;
      if (c === '{') curly++; else if (c === '}') curly--;
      else if (c === '[') square++; else if (c === ']') square--;
    }
    if (inStr) s += '"';
    s = s.replace(/,\s*$/, '');
    while (square-- > 0) s += ']';
    while (curly-- > 0) s += '}';
    return s;
  }
  const tryJSON = t => { try { return JSON.parse(t); } catch (e) { return undefined; } };

  function parseReply(text) {
    if (!text) return { reply: '', actions: [] };
    let s = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
    if (fence) s = fence[1].trim();
    let obj = tryJSON(s);
    if (obj === undefined) {
      const a = s.indexOf('{'), b = s.lastIndexOf('}');
      if (a >= 0) {
        const core = b > a ? s.slice(a, b + 1) : s.slice(a);
        obj = tryJSON(core);
        if (obj === undefined) obj = tryJSON(repair(core));
        if (obj === undefined) obj = tryJSON(repair(s.slice(a)));
        if (obj === undefined && !/"/.test(core)) obj = tryJSON(repair(core.replace(/'/g, '"')));
      }
    }
    if (obj === undefined) {
      const a = s.indexOf('['), b = s.lastIndexOf(']');
      if (a >= 0 && b > a) obj = tryJSON(repair(s.slice(a, b + 1)));
    }
    if (obj === undefined || obj === null || typeof obj !== 'object') return { reply: s.replace(/[{}[\]]/g, '').trim().slice(0, 1000), actions: [] };
    if (Array.isArray(obj)) return { reply: '', actions: obj };
    let actions = obj.actions || obj.acciones || obj.action || [];
    if (!Array.isArray(actions)) actions = [actions];
    return { reply: String(obj.reply || obj.respuesta || obj.message || obj.text || ''), actions };
  }

  // ---------- comprobar cada acción ----------
  function fixDate(v) {
    const u = U();
    if (v == null || v === '') return null;
    const s = String(v).trim();
    let m = /^(\d{4}-\d{2}-\d{2})$/.exec(s);
    if (m) return u.parse(m[1]) ? m[1] : null;
    m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s);
    if (m) { const d = u.parse(m[1] + 'T' + u.pad(+m[2]) + ':' + m[3]); return d ? u.toLocal(d, false) : null; }
    // con zona (Z o +01:00): a hora local
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) { const d = new Date(s); return isNaN(d) ? null : u.toLocal(d, false); }
    return null;
  }

  const KEYS = ['kind', 'title', 'notes', 'location', 'calendarId', 'color', 'emoji', 'allDay', 'start', 'end', 'rrule', 'reminders', 'checklist', 'done', 'alarm', 'alarmTime'];
  function cleanEvent(e, isUpdate, prev) {
    const u = U();
    if (!e || typeof e !== 'object') return null;
    const out = {};
    for (const k of KEYS) if (k in e && e[k] !== undefined) out[k] = e[k];
    if ('title' in out) out.title = String(out.title || '').trim().slice(0, 300);
    if ('notes' in out) out.notes = String(out.notes || '').slice(0, 5000);
    if ('location' in out) out.location = String(out.location || '').trim().slice(0, 300);
    if ('kind' in out) out.kind = /task|tarea|todo|recordatorio|reminder/i.test(String(out.kind)) ? 'task' : 'event';
    if ('calendarId' in out) {
      const c = ZC.store.calendar(out.calendarId) || ZC.store.calendars().find(x => U().fold(x.name) === U().fold(out.calendarId));
      if (c) out.calendarId = c.id; else if (isUpdate) delete out.calendarId; else out.calendarId = 'personal';
    }
    if ('color' in out && !/^#[0-9a-f]{6}$/i.test(String(out.color || ''))) delete out.color;
    if ('emoji' in out && (typeof out.emoji !== 'string' || out.emoji.length > 8)) delete out.emoji;
    for (const k of ['start', 'end']) {
      if (k in out) { const f = fixDate(out[k]); if (f) out[k] = f; else delete out[k]; }
    }
    if ('allDay' in out) out.allDay = out.allDay === true || out.allDay === 'true';
    else if (out.start) out.allDay = out.start.length === 10;
    if (out.allDay) { if (out.start) out.start = out.start.slice(0, 10); if (out.end) out.end = out.end.slice(0, 10); }
    else if (out.allDay === false) {
      if (out.start && out.start.length === 10) out.start += 'T09:00';
      if (out.end && out.end.length === 10) delete out.end;
    }
    if ('reminders' in out) {
      const r = Array.isArray(out.reminders) ? out.reminders : [out.reminders];
      out.reminders = [...new Set(r.map(x => parseInt(x, 10)).filter(x => isFinite(x) && x >= 0 && x <= 40320))].sort((a, b) => a - b);
    }
    if ('rrule' in out) out.rrule = out.rrule ? ZC.recur.normRule(typeof out.rrule === 'string' ? (ZC.ics ? ZC.ics.parseRRule(out.rrule.replace(/^RRULE:/i, '')) : null) : out.rrule) : null;
    if ('checklist' in out) out.checklist = Array.isArray(out.checklist) ? out.checklist.filter(Boolean).map(x => ({ id: u.uid(), text: String(x.text || x), done: !!x.done })) : [];
    if ('done' in out) out.done = !!out.done;
    if ('alarm' in out) out.alarm = out.alarm === true || out.alarm === 'true';
    if ('alarmTime' in out) {
      const m = /^(\d{1,2}):(\d{2})/.exec(String(out.alarmTime || ''));
      if (m && +m[1] < 24 && +m[2] < 60) out.alarmTime = u.pad(+m[1]) + ':' + m[2]; else if (out.alarmTime === null) out.alarmTime = null; else delete out.alarmTime;
    }
    if (!isUpdate) {
      if (!out.start) return null;
      if (!out.title) out.title = out.kind === 'task' ? 'Tarea' : 'Evento';
      const kind = out.kind || 'event';
      if (kind === 'task') out.end = out.start;
      else if (!out.end || out.end < out.start) {
        let dur = 60;
        try { dur = ZC.store.getPrefs().cal.defaultDuration || 60; } catch (e) {}
        out.end = out.allDay ? out.start : u.toLocal(u.addMinutes(u.parse(out.start), dur), false);
      }
    } else if (prev) {
      // si cambian el inicio y no el final, se mueve conservando la duración
      if (out.start && !out.end && prev.kind !== 'task') {
        const allDay = 'allDay' in out ? out.allDay : prev.allDay;
        const ps = u.parse(prev.start), pe = u.parse(prev.end), ns = u.parse(out.start);
        out.end = allDay ? u.ymd(u.addDays(ns, Math.max(0, u.daysBetween(ps, pe)))) : u.toLocal(new Date(ns.getTime() + Math.max(0, pe - ps)), false);
      }
    }
    return out;
  }

  const TYPES = { create: 'create', add: 'create', new: 'create', crear: 'create', insert: 'create',
    update: 'update', edit: 'update', modify: 'update', change: 'update', move: 'update', reschedule: 'update', cambiar: 'update', mover: 'update',
    delete: 'delete', remove: 'delete', cancel: 'delete', borrar: 'delete', eliminar: 'delete',
    complete: 'complete', done: 'complete', check: 'complete', completar: 'complete', finish: 'complete' };

  function findId(id) {
    if (!id) return null;
    id = String(id).trim();
    if (ZC.store.get(id)) return id;
    const base = id.split('@')[0];
    return ZC.store.get(base) ? base : null;
  }
  const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MODES = ['all', 'one', 'future'];

  /** Comprueba y limpia las acciones (de la IA o del frontend). Devuelve { actions, dropped }. */
  function validate(actions) {
    const out = [];
    const at = new Map(); // índice original → índice en out
    let dropped = 0;
    const list = Array.isArray(actions) ? actions : [];
    list.forEach((a, i) => {
      if (!a || typeof a !== 'object') { dropped++; return; }
      const type = TYPES[String(a.type || a.action || '').toLowerCase()];
      let item = null;
      if (type === 'create') {
        const ev = cleanEvent(a.event || a.data || a.evento || a, false);
        if (ev) item = { type, event: ev, cid: typeof a.cid === 'string' && a.cid ? a.cid.slice(0, 40) : 'c' + i };
      } else if (type === 'update' && (a.ref != null || a.refId) && !a.id) {
        // cambia algo que se crea en esta misma respuesta (p. ej. la alarma sugerida)
        let target = null;
        if (a.refId) target = out.find(x => x.type === 'create' && x.cid === a.refId);
        if (!target && a.ref != null && at.has(+a.ref)) target = out[at.get(+a.ref)];
        const ch = target && target.type === 'create' ? cleanEvent(a.changes || a.event || a.data || {}, true, null) : null;
        if (ch && Object.keys(ch).length) item = { type, ref: -1, refId: target.cid, changes: ch };
      } else if (type === 'update') {
        const id = findId(a.id || (a.event && a.event.id));
        const prev = id && ZC.store.get(id);
        const ch = prev ? cleanEvent(a.changes || a.event || a.data || {}, true, prev) : null;
        if (prev && ch && Object.keys(ch).length) item = { type, id, changes: ch };
      } else if (type === 'delete') {
        const id = findId(a.id);
        const ev = id && ZC.store.get(id);
        if (ev) {
          let mode = MODES.includes(a.mode) ? a.mode : null;
          let date = a.date != null ? String(a.date).slice(0, 10) : null;
          if (date && (!YMD_RE.test(date) || !U().parse(date))) date = null;
          // «id@YYYY-MM-DD» (una aparición) sin modo: solo esa
          const at2 = /@(\d{4}-\d{2}-\d{2})$/.exec(String(a.id));
          if (!mode && at2 && ev.rrule) { mode = 'one'; date = at2[1]; }
          if (!ev.rrule) { mode = null; date = null; }
          else if (!mode) mode = 'all';
          if (mode && mode !== 'all' && !date) mode = null; // «solo una» sin fecha: no se sabe cuál
          if (!ev.rrule || mode) {
            item = { type, id };
            if (mode) item.mode = mode;
            if (mode && mode !== 'all') item.date = date;
            // repetidos: si ya se borra la serie entera, lo demás de esa serie sobra
            const same = out.filter(x => x.type === 'delete' && x.id === id && !x._skip);
            if (same.some(x => !x.mode || x.mode === 'all' || (x.mode === item.mode && x.date === item.date))) item = 'skip';
            else if (item.mode === 'all') same.forEach(x => { x._skip = true; });
          }
        }
      } else if (type === 'complete') {
        const id = findId(a.id);
        const ev = id && ZC.store.get(id);
        if (ev && ev.kind === 'task') item = { type, id };
      }
      if (item === 'skip') return;
      if (!item) { dropped++; return; }
      if (a.suggest === true || a.suggest === 'true') item.suggest = true;
      if (a.why != null && String(a.why).trim()) item.why = String(a.why).trim().slice(0, 160);
      at.set(i, out.length);
      out.push(item);
    });
    const res = out.filter(x => !x._skip);
    for (const x of res) if (x.refId) x.ref = res.findIndex(y => y.type === 'create' && y.cid === x.refId);
    return { actions: res, dropped };
  }

  /** ¿hace falta pedir confirmación? (más de 20 borrados de golpe) */
  const MANY = 20;
  const manyDeletes = actions => (actions || []).filter(a => a && a.type === 'delete' && !a.suggest).length > MANY;

  // ---------- frases de respuesta (en el idioma de la interfaz) ----------
  const SAY = {
    es: { loc: 'es-ES', at: ' a las ', on: ' el ', ok: 'Vale: ', change: 'cambiar «%s»', del: 'borrar «%s»', done: 'marcar «%s» como hecha',
      empty: 'Escribe qué quieres apuntar, por ejemplo «mañana a las 5 dentista».', askDel: '¿Borro «%s» (%w)?', noEv: 'No encuentro ese evento.',
      markDone: 'Marco «%s» como hecha.', noTask: 'No encuentro esa tarea.', free: 'El %d no tienes nada. ✿', day: 'El %d: ',
      what: 'No lo he entendido. Prueba con algo como «cena con Marta el viernes a las 21:30».', noPhotos: 'El integrado no entiende fotos: para eso elige Gemini (gratis) u otro con visión en Ajustes → IA. ',
      unsure: 'No he sabido qué hacer con eso. ¿Me lo dices de otra forma?', dropped: ' (La IA propuso cambios que no tenían sentido y los he quitado.)',
      found: 'He encontrado %n %k%w para borrar: %l.', none: 'No encuentro nada%w para borrar.', more: ' y %n más',
      whatDel: '¿Qué borro? Dime, por ejemplo, «quita todo lo de mañana» o «borra la reunión del lunes».',
      many: ' Son muchas: confírmalo antes de borrar.', delOne: 'borrar «%s» del %d', alarmOn: ' (con alarma)',
      alarmAsk: ' ¿Le pongo alarma?', alarmWhy: 'Parece importante: la alarma suena como un despertador aunque el móvil esté en silencio.',
      k: { event: ['evento', 'eventos'], task: ['tarea', 'tareas'], any: ['cosa', 'cosas'] },
      r: { today: ' de hoy', tomorrow: ' de mañana', week: ' de esta semana', nextWeek: ' de la semana que viene', month: ' de %m', day: ' del %d', range: ' del %a al %b', cal: ' del calendario %c' } },
    en: { loc: 'en-GB', at: ' at ', on: ' on ', ok: 'OK: ', change: 'change “%s”', del: 'delete “%s”', done: 'mark “%s” as done',
      empty: 'Type what you want to add, for example “dentist tomorrow at 5”.', askDel: 'Delete “%s” (%w)?', noEv: "I can't find that event.",
      markDone: 'Marking “%s” as done.', noTask: "I can't find that task.", free: 'Nothing on %d. ✿', day: '%d: ',
      what: "I didn't get that. Try something like “dinner with Marta on Friday at 9:30pm”.", noPhotos: "The built-in assistant can't read photos: choose Gemini (free) or another one with vision in Settings → AI. ",
      unsure: "I didn't know what to do with that. Could you say it another way?", dropped: ' (The AI suggested changes that made no sense and I removed them.)',
      found: 'I found %n %k%w to delete: %l.', none: 'I found nothing%w to delete.', more: ' and %n more',
      whatDel: 'What should I delete? Try “delete everything tomorrow” or “delete the meeting on Monday”.',
      many: " That's a lot: please confirm before deleting.", delOne: 'delete “%s” on %d', alarmOn: ' (with alarm)',
      alarmAsk: ' Shall I set an alarm?', alarmWhy: 'Looks important: the alarm rings like an alarm clock even if your phone is on silent.',
      k: { event: ['event', 'events'], task: ['task', 'tasks'], any: ['item', 'items'] },
      r: { today: ' today', tomorrow: ' tomorrow', week: ' this week', nextWeek: ' next week', month: ' in %m', day: ' on %d', range: ' from %a to %b', cal: ' in the %c calendar' } },
    ca: { loc: 'ca-ES', at: ' a les ', on: ' el ', ok: "D'acord: ", change: 'canviar «%s»', del: 'esborrar «%s»', done: 'marcar «%s» com a feta',
      empty: 'Escriu què vols apuntar, per exemple «demà a les 5 dentista».', askDel: 'Esborro «%s» (%w)?', noEv: 'No trobo aquest esdeveniment.',
      markDone: 'Marco «%s» com a feta.', noTask: 'No trobo aquesta tasca.', free: 'El %d no tens res. ✿', day: 'El %d: ',
      what: 'No ho he entès. Prova amb alguna cosa com «sopar amb la Marta divendres a les 21:30».', noPhotos: "L'integrat no entén fotos: per a això tria Gemini (gratis) o un altre amb visió a Ajustos → IA. ",
      unsure: "No he sabut què fer-ne. M'ho dius d'una altra manera?", dropped: " (La IA va proposar canvis que no tenien sentit i els he tret.)",
      found: 'He trobat %n %k%w per esborrar: %l.', none: 'No trobo res%w per esborrar.', more: ' i %n més',
      whatDel: "Què esborro? Digues, per exemple, «esborra-ho tot de demà» o «esborra la reunió de dilluns».",
      many: ' Són moltes: confirma-ho abans d\'esborrar.', delOne: 'esborrar «%s» del %d', alarmOn: ' (amb alarma)',
      alarmAsk: ' Hi poso alarma?', alarmWhy: "Sembla important: l'alarma sona com un despertador encara que el mòbil estigui en silenci.",
      k: { event: ['esdeveniment', 'esdeveniments'], task: ['tasca', 'tasques'], any: ['cosa', 'coses'] },
      r: { today: " d'avui", tomorrow: ' de demà', week: " d'aquesta setmana", nextWeek: ' de la setmana que ve', month: ' de %m', day: ' del %d', range: ' del %a al %b', cal: ' del calendari %c' } },
  };
  let sayLang = 'es';
  const say = () => SAY[sayLang] || SAY.es;
  function langOf(l) {
    let x = l;
    if (!x || x === 'auto') { try { x = ZC.store.getPrefs().cal.lang; } catch (e) {} }
    if (!x || x === 'auto') x = (root.navigator && navigator.language) || 'es';
    x = String(x).slice(0, 2).toLowerCase();
    return SAY[x] ? x : 'es';
  }
  function when(ev) {
    const u = U();
    const d = u.parse(ev.start);
    if (!d) return '';
    let txt = u.ymd(d);
    try {
      txt = new Intl.DateTimeFormat(say().loc, { weekday: 'long', day: 'numeric', month: 'short' }).format(d);
      if (!ev.allDay) txt += say().at + u.hm(d);
    } catch (e) {}
    return txt;
  }
  function describeActions(actions) {
    const S = say(), parts = [];
    for (const a of actions) {
      if (a.suggest) continue;
      if (a.type === 'create') parts.push('«' + a.event.title + '»' + S.on + when(a.event) + (a.event.rrule ? ' (' + ZC.recur.describe(a.event.rrule, sayLang, a.event.start).toLowerCase() + ')' : '') + (a.event.alarm ? S.alarmOn : ''));
      else if (a.type === 'update') { const e = a.id ? ZC.store.get(a.id) : null; if (e) parts.push(S.change.replace('%s', e.title)); }
      else if (a.type === 'delete') {
        const e = ZC.store.get(a.id);
        if (a.date && a.mode === 'one') parts.push(S.delOne.replace('%s', e ? e.title : '').replace('%d', when({ start: a.date, allDay: true })));
        else parts.push(S.del.replace('%s', e ? e.title : ''));
      }
      else if (a.type === 'complete') { const e = ZC.store.get(a.id); parts.push(S.done.replace('%s', e ? e.title : '')); }
    }
    return parts.length ? S.ok + parts.join('; ') + '.' : '';
  }

  // ---------- proveedor «integrado» ----------
  function bestMatch(text, onlyTasks) {
    const u = U();
    const p = ZC.nlp.parse(text, { lang: sayLang }) || {};
    const words = (p.title || text).trim();
    let list = ZC.store.search(words);
    if (!list.length) list = ZC.store.search(u.fold(words).split(/\s+/).filter(w => w.length > 3).slice(0, 2).join(' '));
    if (onlyTasks) list = list.filter(e => e.kind === 'task');
    if (p.start && p.confidence >= 0.6 && list.length > 1) {
      const day = p.start.slice(0, 10);
      const same = list.filter(e => e.start.slice(0, 10) === day);
      if (same.length) list = same;
    }
    return list[0] || null;
  }

  // ---- borrar en bloque (integrado) ----
  function textMatches(ev, text) {
    const u = U();
    if (!text) return true;
    const hay = u.fold((ev.title || '') + ' ' + (ev.location || ''));
    const words = u.fold(text).replace(/[,.;:!?¿¡"«»“”()]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !/^(de|del|la|el|los|las|lo|en|the|of|on|at|a|al|y|and|i|les|els|con|with|amb)$/.test(w));
    if (!words.length) return true;
    return words.every(w => hay.includes(w) || (w.length > 4 && /es$/.test(w) && hay.includes(w.slice(0, -2))) || (w.length > 3 && /s$/.test(w) && hay.includes(w.slice(0, -1))));
  }
  /** ¿toda la serie cae dentro de [from, to)? */
  function seriesInside(ev, from, to) {
    const u = U();
    const r = ev.rrule;
    if (!r) return true;
    if (!r.until && !r.count) return false;
    const s = u.parse(ev.start);
    if (!s || s < from) return false;
    const lim = r.until ? u.addDays(u.parse(r.until), 2) : u.addDays(s, 3660);
    const list = ZC.recur.expand(ev, u.startOfDay(s), lim);
    return list.every(o => o.start >= from && o.start < to);
  }
  function rangeText(F) {
    const u = U(), S = say(), R = S.r;
    if (!F.from || !F.to) return '';
    const today = u.startOfDay(new Date());
    const days = u.daysBetween(F.from, F.to);
    let firstDay = 1;
    try { firstDay = ZC.store.getPrefs().cal.firstDay; } catch (e) {}
    const sow = u.startOfWeek(today, firstDay == null ? 1 : firstDay);
    if (days === 1 && u.sameDay(F.from, today)) return R.today;
    if (days === 1 && u.sameDay(F.from, u.addDays(today, 1))) return R.tomorrow;
    if (days === 7 && u.sameDay(F.from, sow)) return R.week;
    if (days === 7 && u.sameDay(F.from, u.addDays(sow, 7))) return R.nextWeek;
    if (F.from.getDate() === 1 && F.to.getDate() === 1 && (F.to.getMonth() - F.from.getMonth() + 12) % 12 === 1) {
      let m = '';
      try { m = new Intl.DateTimeFormat(S.loc, { month: 'long' }).format(F.from); } catch (e) { m = String(F.from.getMonth() + 1); }
      if (F.from.getFullYear() !== today.getFullYear()) m += ' ' + F.from.getFullYear();
      return sayLang === 'ca' && /^[aeiouàèéíòóú]/i.test(m) ? " d'" + m : R.month.replace('%m', m);
    }
    const d = x => when({ start: u.ymd(x), allDay: true });
    if (days === 1) return R.day.replace('%d', d(F.from));
    return R.range.replace('%a', d(F.from)).replace('%b', d(u.addDays(F.to, -1)));
  }
  function filterText(F) {
    const S = say();
    let w = '';
    if (F.text) w += ' «' + F.text + '»';
    w += rangeText(F);
    if (F.calendarId) { const c = ZC.store.calendar(F.calendarId); if (c) w += S.r.cal.replace('%c', c.name); }
    return w;
  }

  /** La orden de borrar → acciones delete (o null si no hay que hacer nada y es una tarea). */
  function rulesDelete(cmd) {
    const u = U(), S = say(), F = cmd.filter;
    const now = new Date();
    if (!F.from && !F.calendarId && !F.text && !F.kind) return cmd.weak ? null : { reply: S.whatDel, actions: [] };
    const okEv = ev => (!F.calendarId || ev.calendarId === F.calendarId) && (!F.kind || ev.kind === F.kind) && textMatches(ev, F.text);
    const actions = [];
    const seen = new Set();
    if (F.from && F.to) {
      let occ = [];
      try { occ = ZC.store.occurrences(F.from, F.to, { includeHidden: !!F.calendarId, includeTasks: true }); } catch (e) {}
      for (const o of occ) {
        if (o.start < F.from || o.start >= F.to || !okEv(o.ev)) continue;
        if (o.ev.rrule) {
          if (seriesInside(o.ev, F.from, F.to)) { if (!seen.has(o.id)) { seen.add(o.id); actions.push({ type: 'delete', id: o.id, mode: 'all' }); } }
          else actions.push({ type: 'delete', id: o.id, mode: 'one', date: o.date });
        } else if (!seen.has(o.id)) { seen.add(o.id); actions.push({ type: 'delete', id: o.id }); }
      }
    } else {
      const dist = ev => {
        if (ev.rrule && (!ev.rrule.until || u.parse(ev.rrule.until) >= u.startOfDay(now))) return 0;
        return Math.abs(u.parse(ev.start) - now);
      };
      let list = ZC.store.events().filter(okEv);
      if (!F.calendarId) list = list.filter(ev => { const c = ZC.store.calendar(ev.calendarId); return !c || c.visible !== false; });
      list.sort((a, b) => dist(a) - dist(b));
      // «borra el dentista»: el que más se acerca a hoy; «borra todas las reuniones»: todas
      if (!cmd.all && F.text) list = list.slice(0, 1);
      for (const ev of list) actions.push(ev.rrule ? { type: 'delete', id: ev.id, mode: 'all' } : { type: 'delete', id: ev.id });
    }
    if (!actions.length) return cmd.weak ? null : { reply: S.none.replace('%w', filterText(F)), actions: [] };
    if (actions.length === 1) {
      const a = actions[0], ev = ZC.store.get(a.id);
      const w = a.date ? when(Object.assign({}, ev, { start: a.date + (ev.allDay ? '' : ev.start.slice(10)) }))
        : ev.rrule ? ZC.recur.describe(ev.rrule, sayLang, ev.start).toLowerCase() : when(ev);
      return { reply: S.askDel.replace('%s', ev.title).replace('%w', w), actions };
    }
    const evs = actions.map(a => ZC.store.get(a.id));
    const tasks = evs.filter(e => e && e.kind === 'task').length;
    const k = tasks === evs.length ? S.k.task : tasks === 0 ? S.k.event : S.k.any;
    // los nombres, sin repetir («Gimnasio ×5»)
    const count = new Map();
    for (const e of evs) { const n = (e && e.title) || '·'; count.set(n, (count.get(n) || 0) + 1); }
    const names = [...count].map(([n, c]) => c > 1 ? n + ' ×' + c : n);
    const l = names.slice(0, 5).join(', ') + (names.length > 5 ? S.more.replace('%n', names.length - 5) : '');
    let reply = S.found.replace('%n', actions.length).replace('%k', k[actions.length === 1 ? 0 : 1]).replace('%w', filterText(F)).replace('%l', l);
    const out = { reply, actions };
    if (manyDeletes(actions)) { out.confirmMany = true; out.reply += S.many; }
    return out;
  }

  function runRules(text) {
    const u = U();
    const t = String(text || '').trim();
    const f = u.fold(t);
    const S = say();
    if (!t) return { reply: S.empty, actions: [] };
    const cmd = ZC.nlp.parseCommand ? ZC.nlp.parseCommand(t, { lang: sayLang }) : null;
    if (cmd && cmd.intent === 'delete') {
      const r = rulesDelete(cmd);
      if (r) return r;
    }
    let m = /^(?:he\s+hecho|ya\s+he|hecho:?|completa|completar|marca(?:r)?(?:\s+como\s+hecha?)?|tacha(?:r)?|done:?|complete|finished|i\s+did)\s+(?:el\s+|la\s+|lo\s+de\s+|the\s+)?(.+)$/.exec(f);
    if (m) {
      const ev = bestMatch(t.slice(t.length - m[1].length), true);
      return ev ? { reply: S.markDone.replace('%s', ev.title), actions: [{ type: 'complete', id: ev.id }] } : { reply: S.noTask, actions: [] };
    }
    if (/^(?:que|cual|cuales|what|do\s+i|tengo\s+algo|hay\s+algo)\b.*\b(?:tengo|hay|have|got|toca)\b|\?$/.test(f)) {
      const p = ZC.nlp.parse(t, { lang: sayLang }) || {};
      const d = u.parse(p.start && p.confidence >= 0.6 ? p.start.slice(0, 10) : u.ymd(new Date()));
      const occ = ZC.store.occurrences(d, u.addDays(d, 1));
      const day = when({ start: u.ymd(d), allDay: true });
      if (!occ.length) return { reply: S.free.replace('%d', day), actions: [] };
      return { reply: S.day.replace('%d', day) + occ.map(o => (o.allDay ? '' : u.hm(o.start) + ' ') + o.ev.title).join(', ') + '.', actions: [] };
    }
    const p = ZC.nlp.parse(t, { lang: sayLang });
    if (!p || (!p.title && p.confidence < 0.5)) return { reply: S.what, actions: [] };
    const ev = { kind: p.kind, title: p.title || (p.kind === 'task' ? 'Tarea' : 'Evento'), start: p.start, end: p.end, allDay: p.allDay, location: p.location || '', rrule: p.rrule };
    if (p.reminders) ev.reminders = p.reminders;
    if (p.calendarId && ZC.store.calendar(p.calendarId)) ev.calendarId = p.calendarId;
    if (p.emoji) ev.emoji = p.emoji;
    if (p.alarm) ev.alarm = true;
    const actions = [{ type: 'create', event: ev, cid: 'c0' }];
    let reply = describeActions(actions);
    if (p.alarmSuggested && !p.alarm) {
      actions.push({ type: 'update', ref: 0, refId: 'c0', changes: { alarm: true }, suggest: true, why: S.alarmWhy });
      reply += S.alarmAsk;
    }
    return { reply, actions, confidence: p.confidence };
  }

  // ---------- run ----------
  async function run(text, opts) {
    opts = opts || {};
    const conf = getConfig();
    const p = provider(conf.provider);
    sayLang = langOf(opts.lang);
    const images = (opts.images || []).filter(Boolean);
    const fallback = why => {
      const fb = text ? runRules(text) : { actions: [] };
      const has = fb.actions && fb.actions.length;
      const res = { reply: why + (has ? ' Mientras, con el integrado lo he entendido así: ' + (fb.reply || '') : ''), actions: has ? fb.actions : [], provider: p.id, error: why };
      if (fb.confirmMany) res.confirmMany = true;
      return res;
    };
    try {
      if (p.id === 'rules') {
        const r = runRules(text);
        if (images.length) r.reply = say().noPhotos + (text ? r.reply : '');
        return Object.assign(r, { provider: 'rules' });
      }
      if (images.length && !p.vision) return fallback('«' + p.name + '» no entiende fotos; elige Gemini, Groq, OpenRouter, OpenAI, Anthropic o Mistral.');
      if (p.needsKey && !hasKey(p.id)) return fallback('Falta la clave de ' + p.name + ' (Ajustes → IA).');
      if (p.id === 'device' && !device.supported()) return fallback(device.reason);

      const system = systemPrompt({ small: p.id === 'device' });
      const history = (opts.history || []).slice(-10)
        .filter(h => h && (h.role === 'user' || h.role === 'assistant') && h.content)
        .map(h => ({ role: h.role, content: String(h.content).slice(0, 4000) }));
      while (history.length && history[0].role === 'assistant') history.shift(); // (Claude quiere empezar por el usuario)
      const prompt = String(text || (images.length ? 'Crea los eventos de esta imagen.' : ''));
      const imgs = [];
      for (const b of images) imgs.push(await prepImage(b));

      let raw;
      if (p.kind === 'anthropic') {
        const content = imgs.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.type, data: i.b64 } })).concat([{ type: 'text', text: prompt }]);
        raw = await callAnthropic(p, conf, system, history, content);
      } else {
        const user = imgs.length
          ? { role: 'user', content: [{ type: 'text', text: prompt }].concat(imgs.map(i => ({ type: 'image_url', image_url: { url: 'data:' + i.type + ';base64,' + i.b64 } }))) }
          : { role: 'user', content: prompt };
        const messages = [{ role: 'system', content: system }].concat(history, [user]);
        raw = p.id === 'device' ? await device._chat(messages, opts.onToken) : await callOpenAI(p, conf, messages, { images: imgs });
      }
      const parsed = parseReply(raw);
      const v = validate(parsed.actions);
      let reply = parsed.reply.trim();
      if (!reply) reply = v.actions.length ? describeActions(v.actions) : say().unsure;
      if (v.dropped && !v.actions.length && !parsed.reply) reply += say().dropped;
      const res = { reply, actions: v.actions, provider: p.id, dropped: v.dropped };
      if (manyDeletes(v.actions)) { res.confirmMany = true; res.reply += say().many; }
      return res;
    } catch (e) {
      console.warn('[ZC] IA', e);
      return fallback(e && e.network ? 'Sin conexión con ' + p.name + '.' : (e && e.message) || 'La IA ha fallado.');
    }
  }

  // ---------- aplicar ----------
  // Devuelve lo afectado: lo creado/cambiado como queda, y lo borrado como estaba antes
  // (deleted: true si se fue entero, con sus copias sueltas de «solo esta»; removedDate/removedMode
  // si solo se quitó una repetición o de ahí en adelante). Se salta las sugerencias (suggest: true).
  async function apply(actions) {
    const out = [];
    const made = new Map(); // cid → id del evento creado
    const touched = new Set(); // series a las que ya se les ha quitado alguna repetición
    for (const a of validate(actions).actions) {
      if (a.suggest) continue;
      try {
        if (a.type === 'create') { const e = await ZC.store.saveEvent(a.event); made.set(a.cid, e.id); out.push(e); }
        else if (a.type === 'update' && a.refId) { const id = made.get(a.refId); if (id) out.push(await ZC.store.saveEvent(Object.assign({}, a.changes, { id }))); }
        else if (a.type === 'update') out.push(await ZC.store.saveEvent(Object.assign({}, a.changes, { id: a.id })));
        else if (a.type === 'delete') {
          const e = ZC.store.get(a.id);
          if (!e) continue; // (ya se fue con su serie)
          if (e.rrule && (a.mode === 'one' || a.mode === 'future') && a.date) {
            await ZC.store.deleteEvent(a.id, { mode: a.mode, date: a.date });
            // (una vez por serie, como estaba antes del primer cambio: así «Deshacer» la deja igual)
            if (!touched.has(a.id)) { touched.add(a.id); out.push(Object.assign({}, e, { removedDate: a.date, removedMode: a.mode })); }
          } else {
            const copies = e.rrule ? ZC.store.events().filter(x => x.recurrenceOf === e.id) : [];
            await ZC.store.deleteEvent(a.id, { mode: 'all' });
            out.push(Object.assign({}, e, { deleted: true }));
            for (const x of copies) out.push(Object.assign({}, x, { deleted: true }));
          }
        }
        else if (a.type === 'complete') { const e = ZC.store.get(a.id); out.push(e && e.done ? e : await ZC.store.toggleDone(a.id)); }
      } catch (e) { console.warn('[ZC] no se pudo aplicar', a, e); }
    }
    return out;
  }

  // ---------- probar ----------
  async function test() {
    const conf = getConfig();
    const p = provider(conf.provider);
    try {
      if (p.id === 'rules') return { ok: true, message: 'Listo: funciona sin internet.' };
      if (p.id === 'device') {
        if (!device.supported()) return { ok: false, message: device.reason };
        const s = device.status();
        return s.ready || s.cached ? { ok: true, message: 'El modelo ' + s.name + ' está en el dispositivo.' } : { ok: false, message: 'Falta descargar el modelo (unos ' + s.sizeMB + ' MB, solo una vez).' };
      }
      if (p.id === 'ollama') {
        const ms = await ollamaModels();
        if (!ms.length) return { ok: false, message: 'No encuentro Ollama en ' + (conf.baseUrl || 'http://localhost:11434') + ' o no tiene modelos (ollama pull llama3.2).' };
        if (conf.model && !ms.includes(conf.model)) return { ok: false, message: 'Ollama no tiene «' + conf.model + '». Tiene: ' + ms.join(', ') };
      }
      if (p.needsKey && !hasKey(p.id)) return { ok: false, message: 'Falta la clave.' };
      const messages = [{ role: 'system', content: 'Responde solo con JSON.' }, { role: 'user', content: 'Devuelve exactamente {"reply":"ok","actions":[]}' }];
      const raw = p.kind === 'anthropic'
        ? await callAnthropic(p, conf, 'Responde solo con JSON.', [], [{ type: 'text', text: 'Devuelve exactamente {"reply":"ok","actions":[]}' }])
        : await callOpenAI(p, conf, messages, {});
      const r = parseReply(raw);
      return { ok: true, message: 'Conectado con ' + p.name + (conf.model ? ' (' + conf.model + ')' : '') + (r.reply ? '' : ', aunque la respuesta fue rara') + '.' };
    } catch (e) {
      return { ok: false, message: e && e.network ? 'Sin conexión con ' + p.name + '.' : (e && e.message) || String(e) };
    }
  }

  ZC.ai = {
    providers: PROVIDERS, provider, getConfig, setConfig, setKey, hasKey, test, run, apply, device, ollamaModels,
    // para las pruebas y por si el frontend lo quiere
    parseReply, validate, systemPrompt, runRules, describeActions, MANY_DELETES: MANY,
  };
})(typeof window !== 'undefined' ? window : globalThis);
