package com.luckicla.zencalendar;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Workspaces con la app cerrada: la lógica de la comprobación, sin nada de Android (solo org.json), para
 * poder probarla en un ordenador (tests/core/android-ws.test.js la compila y la ejecuta contra un
 * Firestore de mentira). Es la misma que desktop/workspaces.js: si se cambia algo aquí, allí también.
 *
 * Con el refresh token de Firebase que pasa la página (ZCAndroid.wsCreds) renueva el ID token
 * (securetoken.googleapis.com), busca por REST los workspaces del usuario (memberIds array-contains uid)
 * y, en cada uno, los items con `updated` posterior a lo último visto; los que no ha tocado él dan una
 * línea («Ana: Cena el viernes») en el grupo de su workspace.
 *
 * Estado (JSON, lo guarda Workspaces cifrado): { creds: { apiKey, projectId, uid, refreshToken, strings },
 * idToken, idExp, since, seen: { wid: marca de Firestore } }. Las marcas («2026-11-24T10:00:00.123456Z»)
 * se guardan tal cual y se vuelven a mandar como filtro; para compararlas, tsKey.
 */
final class WsSync {
    static final String SECURETOKEN = "https://securetoken.googleapis.com/v1/token";
    static final String FIRESTORE = "https://firestore.googleapis.com/v1";
    static final int LIMIT = 50, MAX_WS = 30;
    private static final Pattern CODE = Pattern.compile("^[A-Za-z0-9_-]{1,64}\\.[A-Za-z0-9_~-]{1,128}$");
    private static final Pattern TS = Pattern.compile("^(\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d)(?:\\.(\\d{1,9}))?Z$");
    private static final Pattern AUTH_ERR = Pattern.compile("TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN|INVALID_GRANT|PROJECT_NUMBER_MISMATCH");
    static final String[] STRING_KEYS = {"added", "changed", "deleted", "assigned", "done", "more", "someone", "untitled", "channel", "channelDesc"};
    static final String[] STRING_DEFAULTS = {
            "{who}: {title}", "{who} ha cambiado «{title}»", "{who} ha borrado «{title}»",
            "{who} te ha asignado «{title}»", "{who} ha completado «{title}»", "y {n} más", "Alguien", "(sin título)",
            "Workspaces", "Lo que cambian los demás en tus workspaces"};

    interface Http {
        /** POST; bearer puede ser null. Errores de red: IOException. */
        Res post(String url, String contentType, String body, String bearer) throws IOException;
    }

    static final class Res {
        final int status;
        final String body;
        Res(int status, String body) { this.status = status; this.body = body != null ? body : ""; }
    }

    static final class Group {
        String wid, name, emoji, color;
        final List<String> lines = new ArrayList<>();
    }

    static final class AuthException extends Exception {
        private static final long serialVersionUID = 1L;
        AuthException(String m) { super(m); }
    }

    static final class HttpException extends IOException {
        private static final long serialVersionUID = 1L;
        final int status;
        HttpException(String m, int status) { super(m); this.status = status; }
    }

    private final Http http;

    WsSync(Http http) { this.http = http; }

    // ---------- enlaces ----------

    /** El código «<wid>.<token>» ya sacado del enlace (fragmento, ?code= o ?join=), o null si no vale. */
    static String cleanCode(String code) {
        if (code == null) return null;
        code = code.trim();
        if (code.startsWith("#")) code = code.substring(1);
        return CODE.matcher(code).matches() ? code : null;
    }

    // ---------- marcas de tiempo ----------
    static String tsKey(String ts) {
        if (ts == null) return "";
        Matcher m = TS.matcher(ts);
        if (!m.matches()) return "";
        StringBuilder frac = new StringBuilder(m.group(2) != null ? m.group(2) : "");
        while (frac.length() < 9) frac.append('0');
        return m.group(1) + "." + frac;
    }

    static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    static long parseIso(String ts) {
        String k = tsKey(ts);
        if (k.isEmpty()) return 0;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = f.parse(k.substring(0, 19));
            return d == null ? 0 : d.getTime() + Long.parseLong(k.substring(20, 23));
        } catch (Exception e) {
            return 0;
        }
    }

    // ---------- credenciales ----------

    /**
     * Mezcla las credenciales nuevas de la página con el estado guardado. Devuelve el estado nuevo, o null
     * si no valen. (Para borrar, la página manda null y Workspaces borra el estado sin pasar por aquí.)
     */
    static JSONObject setCreds(JSONObject st, JSONObject c, long now) throws JSONException {
        if (c == null) return null;
        String[] need = {"apiKey", "projectId", "uid", "refreshToken"};
        for (String k : need) {
            String v = c.optString(k, "");
            if (v.isEmpty() || v.length() >= 4096) return null;
        }
        if (st == null) st = new JSONObject();
        JSONObject old = st.optJSONObject("creds");
        boolean same = old != null && old.optString("uid", "").equals(c.optString("uid", ""))
                && old.optString("projectId", "").equals(c.optString("projectId", ""));
        JSONObject strings = new JSONObject();
        JSONObject in = c.optJSONObject("strings");
        if (in != null) {
            for (String k : STRING_KEYS) {
                String v = in.optString(k, "");
                if (!v.isEmpty()) strings.put(k, v.length() > 120 ? v.substring(0, 120) : v);
            }
        }
        JSONObject creds = new JSONObject();
        for (String k : need) creds.put(k, c.optString(k, ""));
        creds.put("strings", strings);
        st.put("creds", creds);
        if (!same) {
            st.put("seen", new JSONObject());
            st.remove("idToken");
            st.put("idExp", 0L);
        }
        String idToken = c.optString("idToken", "");
        long expiresAt = c.optLong("expiresAt", 0L);
        if (!idToken.isEmpty() && expiresAt > now + 120_000L) {
            st.put("idToken", idToken);
            st.put("idExp", expiresAt);
        }
        long since = c.optLong("since", 0L);
        if (since > 0) st.put("since", iso(since));
        else if (!same || st.optString("since", "").isEmpty()) st.put("since", iso(now));
        if (st.optJSONObject("seen") == null) st.put("seen", new JSONObject());
        return st;
    }

    // ---------- la comprobación ----------

    private String token(JSONObject st, boolean force, long now) throws IOException, JSONException, AuthException {
        String cached = st.optString("idToken", "");
        if (!force && !cached.isEmpty() && st.optLong("idExp", 0L) > now + 60_000L) return cached;
        JSONObject creds = st.getJSONObject("creds");
        Res r = http.post(SECURETOKEN + "?key=" + enc(creds.optString("apiKey", "")),
                "application/x-www-form-urlencoded",
                "grant_type=refresh_token&refresh_token=" + enc(creds.optString("refreshToken", "")), null);
        JSONObject j = obj(r.body);
        if (r.status == 400 || r.status == 403) {
            JSONObject err = j.optJSONObject("error");
            String msg = err != null ? err.optString("message", "") : "";
            if (AUTH_ERR.matcher(msg).find()) throw new AuthException(msg);
        }
        String id = j.optString("id_token", "");
        if (r.status != 200 || id.isEmpty()) throw new HttpException("token " + r.status, r.status);
        st.put("idToken", id);
        long secs = 3600;
        try { secs = Long.parseLong(j.optString("expires_in", "3600")); } catch (NumberFormatException ignored) {}
        st.put("idExp", now + secs * 1000L);
        String rt = j.optString("refresh_token", "");
        if (!rt.isEmpty()) creds.put("refreshToken", rt);
        return id;
    }

    private List<JSONObject> runQuery(JSONObject st, String parent, JSONObject query, long now) throws IOException, JSONException, AuthException {
        String url = FIRESTORE + "/projects/" + enc(st.getJSONObject("creds").optString("projectId", ""))
                + "/databases/(default)/documents" + parent + ":runQuery";
        String body = new JSONObject().put("structuredQuery", query).toString();
        for (int i = 0; i < 2; i++) {
            Res r = http.post(url, "application/json", body, token(st, i > 0, now));
            if (r.status == 401 && i == 0) continue;
            if (r.status != 200) throw new HttpException("firestore " + r.status, r.status);
            List<JSONObject> out = new ArrayList<>();
            JSONArray rows = r.body.trim().startsWith("[") ? new JSONArray(r.body) : new JSONArray();
            for (int k = 0; k < rows.length(); k++) {
                JSONObject row = rows.optJSONObject(k);
                JSONObject doc = row != null ? row.optJSONObject("document") : null;
                if (doc != null) out.add(doc);
            }
            return out;
        }
        return new ArrayList<>();
    }

    /** Una vuelta: devuelve los grupos con novedades (y deja en st lo ya visto). AuthException = sesión caducada. */
    List<Group> run(JSONObject st, long now) throws IOException, JSONException, AuthException {
        List<Group> groups = new ArrayList<>();
        JSONObject creds = st.optJSONObject("creds");
        if (creds == null) return groups;
        String uid = creds.optString("uid", "");
        JSONObject strings = strings(creds);

        JSONObject wsQuery = new JSONObject()
                .put("from", new JSONArray().put(new JSONObject().put("collectionId", "workspaces")))
                .put("where", filter("memberIds", "ARRAY_CONTAINS", new JSONObject().put("stringValue", uid)))
                .put("limit", MAX_WS);
        List<JSONObject> wsDocs = runQuery(st, "", wsQuery, now);

        JSONObject oldSeen = st.optJSONObject("seen");
        if (oldSeen == null) oldSeen = new JSONObject();
        JSONObject seen = new JSONObject();
        String since = st.optString("since", "");
        if (since.isEmpty()) since = iso(now);
        for (JSONObject d : wsDocs) {
            String wid = lastPart(d.optString("name", ""));
            JSONObject ws = d.optJSONObject("fields");
            if (ws == null) ws = new JSONObject();
            String from = oldSeen.optString(wid, "");
            if (from.isEmpty()) from = since;
            seen.put(wid, from);
            JSONObject q = new JSONObject()
                    .put("from", new JSONArray().put(new JSONObject().put("collectionId", "items")))
                    .put("where", filter("updated", "GREATER_THAN", new JSONObject().put("timestampValue", from)))
                    .put("orderBy", new JSONArray().put(new JSONObject()
                            .put("field", new JSONObject().put("fieldPath", "updated"))
                            .put("direction", "ASCENDING")))
                    .put("limit", LIMIT);
            List<JSONObject> items;
            try {
                items = runQuery(st, "/workspaces/" + enc(wid), q, now);
            } catch (HttpException e) {
                if (e.status == 403 || e.status == 404) { seen.remove(wid); continue; } // ya no es miembro
                throw e;
            }
            Group g = new Group();
            g.wid = wid;
            g.name = clip(nonEmpty(str(ws, "name"), "Workspace"), 60);
            g.emoji = str(ws, "emoji");
            g.color = str(ws, "color");
            String max = from;
            for (JSONObject doc : items) {
                JSONObject f = doc.optJSONObject("fields");
                if (f == null) continue;
                String upd = ts(f, "updated");
                if (!upd.isEmpty() && tsKey(upd).compareTo(tsKey(max)) > 0) max = upd;
                String by = str(f, "updatedBy");
                if (by.isEmpty() || by.equals(uid)) continue;
                g.lines.add(lineFor(f, doc.optString("createTime", ""), ws, uid, strings));
            }
            seen.put(wid, max);
            if (!g.lines.isEmpty()) groups.add(g);
        }
        st.put("seen", seen);
        return groups;
    }

    // ---------- textos ----------
    static JSONObject strings(JSONObject creds) throws JSONException {
        JSONObject in = creds != null ? creds.optJSONObject("strings") : null;
        JSONObject s = new JSONObject();
        for (int i = 0; i < STRING_KEYS.length; i++) {
            String v = in != null ? in.optString(STRING_KEYS[i], "") : "";
            s.put(STRING_KEYS[i], v.isEmpty() ? STRING_DEFAULTS[i] : v);
        }
        return s;
    }

    static String lineFor(JSONObject f, String createTime, JSONObject ws, String uid, JSONObject s) {
        String by = str(f, "updatedBy");
        JSONObject m = mapField(mapField(ws, "members"), by);
        String email = str(m, "email");
        String who = clip(nonEmpty(nonEmpty(str(m, "name"), email.contains("@") ? email.substring(0, email.indexOf('@')) : email), s.optString("someone", "")), 40);
        String title = clip(nonEmpty(str(f, "title"), s.optString("untitled", "")), 80);
        String upd = ts(f, "updated");
        boolean created = !createTime.isEmpty() && !upd.isEmpty() && Math.abs(parseIso(upd) - parseIso(createTime)) < 3000;
        String k;
        if (bool(f, "deleted")) k = "deleted";
        else if (created && !uid.isEmpty() && uid.equals(str(f, "assignee"))) k = "assigned";
        else if (created) k = "added";
        else if ("task".equals(str(f, "kind")) && bool(f, "done")) k = "done";
        else k = "changed";
        return fill(s.optString(k, ""), who, title, 0);
    }

    static String fill(String tpl, String who, String title, int n) {
        return tpl.replace("{who}", who).replace("{title}", title).replace("{n}", String.valueOf(n));
    }

    /** El texto de un grupo: hasta 4 líneas (las últimas) y «y N más». */
    static String body(List<String> lines, int total, JSONObject s) {
        StringBuilder b = new StringBuilder();
        int from = Math.max(0, lines.size() - 4);
        for (int i = from; i < lines.size(); i++) { if (b.length() > 0) b.append('\n'); b.append(lines.get(i)); }
        int rest = total - (lines.size() - from);
        if (rest > 0) b.append('\n').append(fill(s.optString("more", "y {n} más"), "", "", rest));
        return b.toString();
    }

    // ---------- valores de Firestore ----------
    private static JSONObject filter(String field, String op, JSONObject value) throws JSONException {
        return new JSONObject().put("fieldFilter", new JSONObject()
                .put("field", new JSONObject().put("fieldPath", field)).put("op", op).put("value", value));
    }

    static String str(JSONObject fields, String k) {
        JSONObject v = fields != null ? fields.optJSONObject(k) : null;
        return v != null ? v.optString("stringValue", "") : "";
    }

    static String ts(JSONObject fields, String k) {
        JSONObject v = fields != null ? fields.optJSONObject(k) : null;
        return v != null ? v.optString("timestampValue", "") : "";
    }

    static boolean bool(JSONObject fields, String k) {
        JSONObject v = fields != null ? fields.optJSONObject(k) : null;
        return v != null && v.optBoolean("booleanValue", false);
    }

    static JSONObject mapField(JSONObject fields, String k) {
        JSONObject v = fields != null && k != null ? fields.optJSONObject(k) : null;
        JSONObject m = v != null ? v.optJSONObject("mapValue") : null;
        JSONObject f = m != null ? m.optJSONObject("fields") : null;
        return f != null ? f : new JSONObject();
    }

    static String lastPart(String name) {
        int i = name.lastIndexOf('/');
        return i >= 0 ? name.substring(i + 1) : name;
    }

    static String clip(String s, int n) {
        s = s == null ? "" : s.replaceAll("\\s+", " ").trim();
        return s.length() > n ? s.substring(0, n - 1) + "…" : s;
    }

    private static String nonEmpty(String a, String b) { return a != null && !a.isEmpty() ? a : b; }

    private static JSONObject obj(String s) {
        try { return new JSONObject(s); } catch (Exception e) { return new JSONObject(); }
    }

    static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8").replace("+", "%20"); } catch (Exception e) { return s; }
    }

    /** (para las pruebas) las claves de un objeto. */
    static List<String> keys(JSONObject o) {
        List<String> out = new ArrayList<>();
        for (Iterator<String> it = o.keys(); it.hasNext(); ) out.add(it.next());
        return out;
    }
}
