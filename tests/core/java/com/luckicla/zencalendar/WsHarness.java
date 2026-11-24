package com.luckicla.zencalendar;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

/**
 * (pruebas) Ejecuta WsSync.java de Android en un ordenador contra el Firestore de mentira de
 * tests/core/_fake-firestore.js. Lo usa tests/core/android-ws.test.js:
 *   java WsHarness <base http> <archivo de estado> creds <json> <ahora ms>
 *   java WsHarness <base http> <archivo de estado> run <ahora ms>
 * Escribe { groups: [{ wid, name, emoji, color, lines }], error, auth, body } y guarda el estado.
 */
public final class WsHarness {
    public static void main(String[] a) throws Exception {
        String base = a[0], file = a[1], cmd = a[2];
        JSONObject st = Files.exists(Paths.get(file)) ? new JSONObject(new String(Files.readAllBytes(Paths.get(file)), StandardCharsets.UTF_8)) : null;
        JSONObject out = new JSONObject();
        if ("creds".equals(cmd)) {
            JSONObject s2 = WsSync.setCreds(st, new JSONObject(a[3]), Long.parseLong(a[4]));
            out.put("ok", s2 != null);
            if (s2 != null) st = s2;
        } else if ("code".equals(cmd)) {
            out.put("code", WsSync.cleanCode(a[3]) == null ? JSONObject.NULL : WsSync.cleanCode(a[3]));
        } else if ("tskey".equals(cmd)) {
            out.put("key", WsSync.tsKey(a[3]));
        } else {
            WsSync sync = new WsSync((url, type, body, bearer) -> post(base, url, type, body, bearer));
            JSONArray groups = new JSONArray();
            try {
                List<WsSync.Group> gs = sync.run(st, Long.parseLong(a[3]));
                JSONObject strings = WsSync.strings(st.optJSONObject("creds"));
                for (WsSync.Group g : gs) {
                    JSONArray lines = new JSONArray();
                    for (String l : g.lines) lines.put(l);
                    groups.put(new JSONObject().put("wid", g.wid).put("name", g.name).put("emoji", g.emoji).put("color", g.color)
                            .put("lines", lines).put("body", WsSync.body(g.lines, g.lines.size(), strings)));
                }
            } catch (WsSync.AuthException e) {
                out.put("auth", true);
                out.put("error", e.getMessage());
                st = null;
            } catch (Exception e) {
                out.put("error", String.valueOf(e.getMessage()));
            }
            out.put("groups", groups);
        }
        if (st != null) Files.write(Paths.get(file), st.toString().getBytes(StandardCharsets.UTF_8));
        else Files.deleteIfExists(Paths.get(file));
        System.out.println(out);
    }

    private static WsSync.Res post(String base, String url, String type, String body, String bearer) throws java.io.IOException {
        // las URLs de Google → el servidor de mentira (la misma ruta)
        String u = url.replace("https://securetoken.googleapis.com", base).replace("https://firestore.googleapis.com", base);
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        c.setRequestMethod("POST");
        c.setRequestProperty("Content-Type", type);
        if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
        byte[] data = body.getBytes(StandardCharsets.UTF_8);
        c.setDoOutput(true);
        try (OutputStream os = c.getOutputStream()) { os.write(data); }
        int status = c.getResponseCode();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (in != null) { byte[] buf = new byte[8192]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n); in.close(); }
        return new WsSync.Res(status, new String(out.toByteArray(), StandardCharsets.UTF_8));
    }
}
