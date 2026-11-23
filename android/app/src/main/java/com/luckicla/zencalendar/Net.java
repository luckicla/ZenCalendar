package com.luckicla.zencalendar;

import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ZC.net.fetch hecho en Java: sin CORS (Google Drive, las APIs de IA).
 * Petición: { url, method, headers, body | bodyB64, timeout }
 * Respuesta: { status, statusText, headers, body (base64) } o { error, network: true }
 */
final class Net {
    private static final ExecutorService POOL = Executors.newFixedThreadPool(4);
    private static final int MAX_BODY = 40 * 1024 * 1024;

    interface Done { void done(String json); }

    static void fetch(String reqJson, Done cb) {
        POOL.execute(() -> cb.done(run(reqJson)));
    }

    private static String run(String reqJson) {
        HttpURLConnection c = null;
        try {
            JSONObject req = new JSONObject(reqJson);
            String method = req.optString("method", "GET").toUpperCase();
            int timeout = req.optInt("timeout", 30000);
            c = (HttpURLConnection) new URL(req.getString("url")).openConnection();
            c.setConnectTimeout(Math.min(timeout, 20000));
            c.setReadTimeout(timeout);
            c.setUseCaches(false);
            c.setInstanceFollowRedirects(true);
            // HttpURLConnection no sabe hacer PATCH: las APIs de Google aceptan la cabecera de «override»
            if ("PATCH".equals(method)) {
                c.setRequestMethod("POST");
                c.setRequestProperty("X-HTTP-Method-Override", "PATCH");
            } else {
                c.setRequestMethod(method);
            }
            JSONObject h = req.optJSONObject("headers");
            if (h != null) {
                for (Iterator<String> it = h.keys(); it.hasNext(); ) {
                    String k = it.next();
                    c.setRequestProperty(k, h.optString(k));
                }
            }
            byte[] body = null;
            if (req.has("bodyB64")) body = Base64.decode(req.getString("bodyB64"), Base64.DEFAULT);
            else if (req.has("body") && !req.isNull("body")) body = req.getString("body").getBytes(StandardCharsets.UTF_8);
            if (body != null && !"GET".equals(method) && !"HEAD".equals(method)) {
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = c.getOutputStream()) { os.write(body); }
            }
            int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            byte[] data = new byte[0];
            if (in != null) {
                try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[16384];
                    int n, total = 0;
                    while ((n = is.read(buf)) > 0) {
                        total += n;
                        if (total > MAX_BODY) throw new java.io.IOException("Respuesta demasiado grande");
                        out.write(buf, 0, n);
                    }
                    data = out.toByteArray();
                }
            }
            JSONObject headers = new JSONObject();
            for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                if (e.getKey() == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                headers.put(e.getKey().toLowerCase(), e.getValue().get(0));
            }
            JSONObject res = new JSONObject();
            res.put("status", status);
            res.put("statusText", c.getResponseMessage() != null ? c.getResponseMessage() : "");
            res.put("headers", headers);
            res.put("body", Base64.encodeToString(data, Base64.NO_WRAP));
            return res.toString();
        } catch (Exception e) {
            try {
                JSONObject res = new JSONObject();
                res.put("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
                res.put("network", true);
                return res.toString();
            } catch (Exception ignored) {
                return "{\"error\":\"fallo\",\"network\":true}";
            }
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private Net() {}
}
