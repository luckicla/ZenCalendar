package org.json;

import java.util.ArrayList;
import java.util.List;

/** (pruebas) org.json mínimo. */
public class JSONArray {
    final List<Object> list = new ArrayList<>();

    public JSONArray() {}

    public JSONArray(String s) throws JSONException {
        Object v = new JSONObject.Parser(s).value();
        if (!(v instanceof JSONArray)) throw new JSONException("no es una lista");
        list.addAll(((JSONArray) v).list);
    }

    public int length() { return list.size(); }
    public Object opt(int i) { return i >= 0 && i < list.size() ? list.get(i) : null; }
    public JSONArray put(Object o) { list.add(o); return this; }
    public String optString(int i) { return optString(i, ""); }
    public String optString(int i, String d) { Object v = opt(i); return v == null || v == JSONObject.NULL ? d : String.valueOf(v); }
    public JSONObject optJSONObject(int i) { Object v = opt(i); return v instanceof JSONObject ? (JSONObject) v : null; }

    @Override public String toString() {
        StringBuilder b = new StringBuilder("[");
        for (Object v : list) { if (b.length() > 1) b.append(','); b.append(JSONObject.write(v)); }
        return b.append(']').toString();
    }
}
