package org.json;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/** (pruebas) org.json mínimo, con el mismo comportamiento que el de Android en lo que usa WsSync.java. */
public class JSONObject {
    public static final Object NULL = new Object() { @Override public String toString() { return "null"; } };
    final Map<String, Object> map = new LinkedHashMap<>();

    public JSONObject() {}

    public JSONObject(String s) throws JSONException {
        Object v = new Parser(s).value();
        if (!(v instanceof JSONObject)) throw new JSONException("no es un objeto");
        map.putAll(((JSONObject) v).map);
    }

    public JSONObject put(String k, Object v) throws JSONException { if (v == null) map.remove(k); else map.put(k, v); return this; }
    public JSONObject put(String k, boolean v) throws JSONException { map.put(k, v); return this; }
    public JSONObject put(String k, int v) throws JSONException { map.put(k, v); return this; }
    public JSONObject put(String k, long v) throws JSONException { map.put(k, v); return this; }
    public JSONObject put(String k, double v) throws JSONException { map.put(k, v); return this; }
    public Object opt(String k) { return map.get(k); }
    public Object remove(String k) { return map.remove(k); }
    public boolean has(String k) { return map.containsKey(k); }
    public boolean isNull(String k) { Object v = map.get(k); return v == null || v == NULL; }
    public int length() { return map.size(); }
    public Iterator<String> keys() { return map.keySet().iterator(); }

    public String optString(String k) { return optString(k, ""); }
    public String optString(String k, String d) { Object v = map.get(k); return v == null || v == NULL ? d : String.valueOf(v); }
    public boolean optBoolean(String k) { return optBoolean(k, false); }
    public boolean optBoolean(String k, boolean d) {
        Object v = map.get(k);
        if (v instanceof Boolean) return (Boolean) v;
        if (v instanceof String && ("true".equalsIgnoreCase((String) v) || "false".equalsIgnoreCase((String) v))) return Boolean.parseBoolean((String) v);
        return d;
    }
    public long optLong(String k, long d) {
        Object v = map.get(k);
        if (v instanceof Number) return ((Number) v).longValue();
        if (v instanceof String) { try { return (long) Double.parseDouble((String) v); } catch (NumberFormatException ignored) {} }
        return d;
    }
    public int optInt(String k, int d) { return (int) optLong(k, d); }
    public double optDouble(String k, double d) {
        Object v = map.get(k);
        if (v instanceof Number) return ((Number) v).doubleValue();
        return d;
    }
    public JSONObject optJSONObject(String k) { Object v = map.get(k); return v instanceof JSONObject ? (JSONObject) v : null; }
    public JSONArray optJSONArray(String k) { Object v = map.get(k); return v instanceof JSONArray ? (JSONArray) v : null; }
    public JSONObject getJSONObject(String k) throws JSONException { JSONObject o = optJSONObject(k); if (o == null) throw new JSONException("falta " + k); return o; }
    public String getString(String k) throws JSONException { Object v = map.get(k); if (v == null) throw new JSONException("falta " + k); return String.valueOf(v); }

    public static String quote(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : (s == null ? "" : s).toCharArray()) {
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default: if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    static String write(Object v) {
        if (v == null || v == NULL) return "null";
        if (v instanceof String) return quote((String) v);
        return v.toString();
    }

    @Override public String toString() {
        StringBuilder b = new StringBuilder("{");
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (b.length() > 1) b.append(',');
            b.append(quote(e.getKey())).append(':').append(write(e.getValue()));
        }
        return b.append('}').toString();
    }

    static final class Parser {
        private final String s;
        private int i;
        Parser(String s) { this.s = s == null ? "" : s; }

        private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }

        Object value() throws JSONException {
            ws();
            if (i >= s.length()) throw new JSONException("fin inesperado");
            char c = s.charAt(i);
            if (c == '{') {
                i++;
                JSONObject o = new JSONObject();
                ws();
                if (s.charAt(i) == '}') { i++; return o; }
                while (true) {
                    ws();
                    String k = string();
                    ws();
                    if (s.charAt(i++) != ':') throw new JSONException("falta :");
                    o.map.put(k, value());
                    ws();
                    char d = s.charAt(i++);
                    if (d == '}') return o;
                    if (d != ',') throw new JSONException("falta ,");
                }
            }
            if (c == '[') {
                i++;
                JSONArray a = new JSONArray();
                ws();
                if (s.charAt(i) == ']') { i++; return a; }
                while (true) {
                    a.list.add(value());
                    ws();
                    char d = s.charAt(i++);
                    if (d == ']') return a;
                    if (d != ',') throw new JSONException("falta ,");
                }
            }
            if (c == '"') return string();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return NULL; }
            int st = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            String n = s.substring(st, i);
            if (n.isEmpty()) throw new JSONException("valor raro en " + st);
            if (n.contains(".") || n.contains("e") || n.contains("E")) return Double.parseDouble(n);
            long l = Long.parseLong(n);
            return l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE ? (Object) (int) l : (Object) l;
        }

        private String string() throws JSONException {
            if (s.charAt(i) != '"') throw new JSONException("falta \"");
            i++;
            StringBuilder b = new StringBuilder();
            while (true) {
                char c = s.charAt(i++);
                if (c == '"') return b.toString();
                if (c == '\\') {
                    char e = s.charAt(i++);
                    switch (e) {
                        case 'n': b.append('\n'); break;
                        case 'r': b.append('\r'); break;
                        case 't': b.append('\t'); break;
                        case 'b': b.append('\b'); break;
                        case 'f': b.append('\f'); break;
                        case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                        default: b.append(e);
                    }
                } else b.append(c);
            }
        }
    }
}
