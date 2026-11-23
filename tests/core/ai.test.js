'use strict';
// Pruebas del asistente (ZC.ai): leer respuestas raras, comprobar acciones, el integrado
// y las llamadas a los proveedores (con un servidor de mentira). node tests/core/ai.test.js
const { load, t, report, assert } = require('./_load');

(async () => {
  const calls = [];
  let reply = '{"reply":"Hecho","actions":[]}';
  const fakeFetch = async (url, o) => {
    calls.push({ url, body: o.body ? JSON.parse(o.body) : null, headers: o.headers });
    if (/anthropic/.test(url)) return new Response(JSON.stringify({ content: [{ type: 'text', text: reply }] }), { status: 200 });
    if (/api\/tags/.test(url)) return new Response(JSON.stringify({ models: [{ name: 'llama3.2' }, { name: 'gemma3' }] }), { status: 200 });
    return new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }), { status: 200 });
  };
  const ZC = load(['config', 'util', 'store', 'recur', 'holidays', 'nlp', 'net', 'ics', 'ai'], { console: { warn() {}, log: console.log, error: console.error }, fetch: fakeFetch, Response, AbortController });
  await ZC.store.init();
  const ev = await ZC.store.saveEvent({ title: 'Dentista', start: '2026-11-24T17:00' });
  const tk = await ZC.store.saveEvent({ kind: 'task', title: 'Comprar pan', start: '2026-11-24', allDay: true });

  await t('parseReply: JSON limpio', () => assert.deepStrictEqual(ZC.ai.parseReply('{"reply":"hola","actions":[]}'), { reply: 'hola', actions: [] }));
  await t('parseReply: con ```json y texto alrededor', () => assert.strictEqual(ZC.ai.parseReply('Claro:\n```json\n{"reply":"ok","actions":[{"type":"delete","id":"x"}]}\n```\n¡Listo!').actions.length, 1));
  await t('parseReply: comas de más y comillas raras', () => assert.strictEqual(ZC.ai.parseReply('{“reply”: “vale”, "actions": [{"type":"delete","id":"x",},],}').reply, 'vale'));
  await t('parseReply: cortado a medias', () => assert.strictEqual(ZC.ai.parseReply('{"reply":"vale","actions":[{"type":"delete","id":"x"}').actions.length, 1));
  await t('parseReply: <think> de los modelos que piensan', () => assert.strictEqual(ZC.ai.parseReply('<think>hmm {no}</think>{"reply":"ok","actions":[]}').reply, 'ok'));
  await t('parseReply: texto normal → reply', () => assert.deepStrictEqual(ZC.ai.parseReply('No sé qué quieres'), { reply: 'No sé qué quieres', actions: [] }));
  await t('parseReply: un array suelto → acciones', () => assert.strictEqual(ZC.ai.parseReply('[{"type":"delete","id":"x"}]').actions.length, 1));

  await t('validate: crea con lo mínimo y rellena el final', () => {
    const v = ZC.ai.validate([{ type: 'create', event: { title: 'Cine', start: '2026-11-28T20:00' } }]);
    assert.strictEqual(v.actions[0].event.end, '2026-11-28T21:00');
    assert.strictEqual(v.actions[0].event.allDay, false);
  });
  await t('validate: fechas con zona → locales; todo el día', () => {
    const v = ZC.ai.validate([{ type: 'add', event: { title: 'Viaje', start: '2026-12-03', end: '2026-12-05' } }, { type: 'create', event: { title: 'X', start: '2026-11-28 20:00:00' } }]);
    assert.strictEqual(v.actions[0].event.allDay, true);
    assert.strictEqual(v.actions[1].event.start, '2026-11-28T20:00');
  });
  await t('validate: quita lo que no tiene sentido', () => {
    const v = ZC.ai.validate([
      { type: 'create', event: { title: 'Sin fecha' } },
      { type: 'update', id: 'no-existe', changes: { title: 'x' } },
      { type: 'delete', id: 'tampoco' },
      { type: 'complete', id: ev.id }, // no es una tarea
      { type: 'fly' }, null, 'hola',
    ]);
    assert.strictEqual(v.actions.length, 0);
    assert.strictEqual(v.dropped, 7);
  });
  await t('validate: update conserva la duración al mover', () => {
    const v = ZC.ai.validate([{ type: 'update', id: ev.id + '@2026-11-24', changes: { start: '2026-11-25T10:00', hack: 1 } }]);
    assert.strictEqual(v.actions[0].id, ev.id);
    assert.deepStrictEqual(v.actions[0].changes, { start: '2026-11-25T10:00', allDay: false, end: '2026-11-25T11:00' });
  });
  await t('validate: calendario por nombre, rrule en texto, avisos raros', () => {
    const v = ZC.ai.validate([{ type: 'create', event: { title: 'Curro', start: '2026-11-30T09:00', calendarId: 'Trabajo', rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU', reminders: ['10', -5, 'x'] } }]);
    const e = v.actions[0].event;
    assert.strictEqual(e.calendarId, 'work');
    assert.deepStrictEqual(e.rrule.byDay, ['MO', 'TU']);
    assert.deepStrictEqual(e.reminders, [10]);
  });
  await t('integrado: crear', async () => {
    const r = await ZC.ai.run('mañana a las 5 dentista');
    assert.strictEqual(r.provider, 'rules');
    assert.strictEqual(r.actions[0].type, 'create');
    assert.ok(/Dentista/.test(r.reply));
  });
  await t('integrado: borrar y completar', async () => {
    const d = await ZC.ai.run('borra el dentista');
    assert.deepStrictEqual(d.actions, [{ type: 'delete', id: ev.id }]);
    const c = await ZC.ai.run('he hecho comprar pan');
    assert.deepStrictEqual(c.actions, [{ type: 'complete', id: tk.id }]);
  });
  await t('apply', async () => {
    const out = await ZC.ai.apply([{ type: 'create', event: { title: 'Nuevo', start: '2026-12-01T10:00' } }, { type: 'complete', id: tk.id }]);
    assert.strictEqual(out.length, 2);
    assert.ok(ZC.store.events().some(e => e.title === 'Nuevo'));
    assert.strictEqual(ZC.store.get(tk.id).done, true);
  });
  await t('config: el modelo se recuerda por proveedor', async () => {
    await ZC.ai.setConfig({ provider: 'groq' });
    assert.strictEqual(ZC.ai.getConfig().model, 'llama-3.3-70b-versatile');
    await ZC.ai.setConfig({ model: 'otro-modelo' });
    await ZC.ai.setConfig({ provider: 'gemini' });
    assert.strictEqual(ZC.ai.getConfig().model, 'gemini-2.5-flash');
    await ZC.ai.setConfig({ provider: 'groq' });
    assert.strictEqual(ZC.ai.getConfig().model, 'otro-modelo');
  });
  await t('sin clave: no llama y contesta claro', async () => {
    calls.length = 0;
    await ZC.ai.setConfig({ provider: 'gemini' });
    const r = await ZC.ai.run('cena el viernes');
    assert.strictEqual(calls.length, 0);
    assert.ok(/clave/.test(r.reply));
    assert.ok(r.actions.length === 1, 'el plan B con el integrado');
  });
  await t('Gemini (compatible con OpenAI): petición y respuesta', async () => {
    ZC.ai.setKey('gemini', 'k-123');
    calls.length = 0;
    reply = '{"reply":"Apuntado","actions":[{"type":"create","event":{"title":"Cena","start":"2026-11-27T21:30"}}]}';
    const r = await ZC.ai.run('cena el viernes a las 21:30');
    assert.ok(calls[0].url.startsWith('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'));
    assert.strictEqual(calls[0].headers.Authorization, 'Bearer k-123');
    assert.strictEqual(calls[0].body.model, 'gemini-2.5-flash');
    assert.strictEqual(calls[0].body.messages[0].role, 'system');
    assert.strictEqual(r.reply, 'Apuntado');
    assert.strictEqual(r.actions[0].event.end, '2026-11-27T22:30');
  });
  await t('Anthropic: API Messages con su cabecera y fotos', async () => {
    await ZC.ai.setConfig({ provider: 'anthropic' });
    ZC.ai.setKey('anthropic', 'sk-ant');
    calls.length = 0;
    reply = '{"reply":"Veo un concierto","actions":[{"type":"create","event":{"title":"Concierto","start":"2026-12-12T21:00"}}]}';
    const r = await ZC.ai.run('', { images: [new Blob([Buffer.from('JPEGDATA')], { type: 'image/jpeg' })] });
    const c = calls[0];
    assert.strictEqual(c.url, 'https://api.anthropic.com/v1/messages');
    assert.strictEqual(c.headers['anthropic-version'], '2023-06-01');
    assert.strictEqual(c.headers['x-api-key'], 'sk-ant');
    assert.strictEqual(c.body.model, 'claude-haiku-4-5');
    assert.strictEqual(c.body.messages[0].content[0].type, 'image');
    assert.strictEqual(r.actions.length, 1);
  });
  await t('Ollama: sin modelo elegido usa el primero instalado', async () => {
    await ZC.ai.setConfig({ provider: 'ollama' });
    calls.length = 0;
    reply = '{"reply":"ok","actions":[]}';
    await ZC.ai.run('hola');
    assert.deepStrictEqual(await ZC.ai.ollamaModels(), ['llama3.2', 'gemma3']);
    const chat = calls.find(c => /chat\/completions/.test(c.url));
    assert.strictEqual(chat.url, 'http://localhost:11434/v1/chat/completions');
    assert.strictEqual(chat.body.model, 'llama3.2');
  });
  await t('el modelo del dispositivo dice por qué no hay WebGPU', () => {
    assert.strictEqual(ZC.ai.device.supported(), false);
    assert.ok(/WebGPU/.test(ZC.ai.device.reason));
    assert.strictEqual(ZC.ai.device.models.length, 2);
  });
  await t('el prompt lleva fecha, calendarios y eventos con id', () => {
    const p = ZC.ai.systemPrompt();
    assert.ok(/Calendarios \(id: nombre\): personal: Personal/.test(p));
    assert.ok(p.includes('SOLO con un objeto JSON'));
  });
  await t('integrado: responde en el idioma de la interfaz (en/ca)', async () => {
    await ZC.ai.setConfig({ provider: 'rules' });
    const en = await ZC.ai.run('dinner with Anna friday at 9', { lang: 'en' });
    assert.ok(/^OK: /.test(en.reply) && /at 21:00/.test(en.reply), en.reply);
    const ca = await ZC.ai.run('què tinc demà?', { lang: 'ca' });
    assert.ok(!/tienes/.test(ca.reply), ca.reply);
    const es = await ZC.ai.run('cena con Marta el viernes a las 9', { lang: 'es' });
    assert.ok(/^Vale: /.test(es.reply) && /21:00/.test(es.reply), es.reply);
  });
  report(__filename);
})();
