'use strict';
// ZenCalendar: peticiones a internet.
//
// ZC.net.fetch(url, opts) funciona como fetch() pero, si la app va dentro de
// Windows (Electron) o de Android, la petición la hace el lado nativo: así no
// hay problemas de CORS con Google Drive ni con las APIs de IA.
//   opts: { method, headers, body (texto, ArrayBuffer, Uint8Array o Blob), timeout (ms, 30 s por defecto), native: false para usar el del navegador, signal }
// Devuelve una Response normal (ok, status, json(), text(), arrayBuffer(), blob()…).
// Si no hay conexión lanza un Error con .network = true.
//
// ZC.native es el puente con Android/Windows: llamadas con respuesta
// asíncrona (call) y el sitio por donde vuelven las respuestas (_cb).
(function (root) {
  const ZC = root.ZC = root.ZC || {};

  // ---------- puente nativo ----------
  const pending = new Map();
  let seq = 0;
  const android = () => root.ZCAndroid || null;
  const desktop = () => root.zcDesktop || null;

  /** Llama a ZCAndroid.<method>(id, ...args); Java contesta con ZC.native._cb(id, json). */
  function call(method, ...args) {
    return new Promise((ok, ko) => {
      const A = android();
      if (!A || typeof A[method] !== 'function') { ko(new Error('Android no tiene ' + method)); return; }
      const id = 'c' + (++seq) + '_' + Date.now().toString(36);
      pending.set(id, { ok, ko });
      try { A[method](id, ...args.map(a => typeof a === 'object' && a !== null ? JSON.stringify(a) : a)); }
      catch (e) { pending.delete(id); ko(e); }
    });
  }
  function _cb(id, data) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    let d = data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) {} }
    p.ok(d);
  }

  ZC.native = {
    get android() { return !!android(); },
    get desktop() { return !!desktop(); },
    call, _cb,
  };

  // ---------- fetch ----------
  function plainHeaders(h) {
    const out = {};
    if (!h) return out;
    if (typeof h.forEach === 'function' && !Array.isArray(h)) { h.forEach((v, k) => { out[k] = v; }); return out; }
    if (Array.isArray(h)) { for (const [k, v] of h) out[k] = v; return out; }
    for (const k of Object.keys(h)) if (h[k] != null) out[k] = String(h[k]);
    return out;
  }

  async function bodyBytes(b) {
    if (b == null) return null;
    if (typeof b === 'string') return b;
    if (b instanceof Uint8Array) return b;
    if (b instanceof ArrayBuffer) return new Uint8Array(b);
    if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    if (typeof Blob !== 'undefined' && b instanceof Blob) return new Uint8Array(await b.arrayBuffer());
    if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) return b.toString();
    return String(b);
  }

  const NULL_BODY = [101, 103, 204, 205, 304];
  function makeResponse(status, statusText, headers, bytes) {
    const body = NULL_BODY.includes(status) ? null : (bytes || new Uint8Array(0));
    if (typeof Response === 'function' && status >= 200 && status <= 599) {
      try { return new Response(body, { status, statusText: statusText || '', headers: headers || {} }); } catch (e) {}
    }
    // (por si acaso: una respuesta hecha a mano)
    const b = body || new Uint8Array(0);
    const text = () => Promise.resolve(new TextDecoder().decode(b));
    const hm = {};
    for (const k of Object.keys(headers || {})) hm[k.toLowerCase()] = headers[k];
    return {
      ok: status >= 200 && status < 300, status, statusText: statusText || '',
      headers: { get: k => hm[String(k).toLowerCase()] || null },
      text, json: () => text().then(JSON.parse),
      arrayBuffer: () => Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)),
      blob: () => Promise.resolve(new Blob([b], { type: hm['content-type'] || '' })),
    };
  }

  function netError(msg, cause) {
    const e = new Error(msg || 'Sin conexión');
    e.network = true;
    if (cause) e.cause = cause;
    return e;
  }

  async function zfetch(url, opts) {
    opts = opts || {};
    const method = String(opts.method || 'GET').toUpperCase();
    const headers = plainHeaders(opts.headers);
    const timeout = opts.timeout || 30000;
    const native = opts.native !== false;
    if (root.navigator && root.navigator.onLine === false && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) throw netError('Sin conexión');

    // Windows (Electron): lo hace el proceso principal
    const D = desktop();
    if (native && D && typeof D.fetch === 'function') {
      const body = await bodyBytes(opts.body);
      let r;
      try { r = await D.fetch({ url, method, headers, body, timeout }); }
      catch (e) { throw netError(e && e.message, e); }
      if (!r || r.error) throw netError(r && r.error);
      return makeResponse(r.status, r.statusText, r.headers, r.body ? new Uint8Array(r.body) : null);
    }

    // Android: lo hace Java en otro hilo y contesta con ZC.native._cb
    const A = android();
    if (native && A && typeof A.fetch === 'function') {
      const body = await bodyBytes(opts.body);
      const req = { url, method, headers, timeout };
      if (typeof body === 'string') req.body = body;
      else if (body) req.bodyB64 = ZC.util.toBase64(body);
      const r = await call('fetch', req);
      if (!r || r.error) throw netError(r && r.error);
      return makeResponse(r.status, r.statusText, r.headers, r.body ? ZC.util.fromBase64(r.body) : null);
    }

    // web: el fetch del navegador (con tiempo máximo)
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
    if (opts.signal && ctl) opts.signal.addEventListener('abort', () => ctl.abort());
    try {
      const body = opts.body instanceof Uint8Array || typeof opts.body === 'string' || opts.body == null ? opts.body : await bodyBytes(opts.body);
      return await fetch(url, { method, headers, body, signal: ctl ? ctl.signal : opts.signal, cache: 'no-store' });
    } catch (e) {
      if (e && e.name === 'AbortError' && opts.signal && opts.signal.aborted) throw e;
      throw netError(e && e.name === 'AbortError' ? 'Tardó demasiado en contestar' : (e && e.message) || 'Sin conexión', e);
    } finally { if (t) clearTimeout(t); }
  }

  const online = () => !(root.navigator && root.navigator.onLine === false);

  ZC.net = { fetch: zfetch, online, _makeResponse: makeResponse };
})(typeof window !== 'undefined' ? window : globalThis);
