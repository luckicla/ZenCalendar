package com.luckicla.zencalendar;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Lo que enseña cada widget (se elige al ponerlo, y después con «mantener pulsado → Configurar»
 * o desde Ajustes → Widgets en Android 12+):
 *   - ALL:      mi calendario y todos los workspaces
 *   - PERSONAL: solo mi calendario (lo de siempre; los widgets que ya estaban se quedan así)
 *   - CURRENT:  lo mismo que esté abierto en la app (mi calendario o el workspace en el que estés)
 *   - PICK:     los que se marquen («» = mi calendario, si no el id del workspace)
 * Se guarda por widget en las prefs: «wcfg_<id>» = { src, pick: [..] }.
 */
final class WidgetConfig {
    static final String ALL = "all", PERSONAL = "personal", CURRENT = "current", PICK = "pick";

    String src = PERSONAL;
    final Set<String> pick = new LinkedHashSet<>();
    private String cur;   // (el workspace abierto en la app, leído una vez)

    /** Un workspace tal como lo manda la página. */
    static final class Ws {
        String id, name, color;
    }

    static WidgetConfig load(Context c, int widgetId) {
        WidgetConfig w = new WidgetConfig();
        try {
            String s = Theme.prefs(c).getString("wcfg_" + widgetId, null);
            if (s == null) return w;
            JSONObject o = new JSONObject(s);
            String src = o.optString("src", PERSONAL);
            if (ALL.equals(src) || CURRENT.equals(src) || PICK.equals(src)) w.src = src;
            JSONArray p = o.optJSONArray("pick");
            if (p != null) for (int i = 0; i < p.length(); i++) w.pick.add(p.optString(i, ""));
            if (PICK.equals(w.src) && w.pick.isEmpty()) w.src = PERSONAL;
        } catch (Exception ignored) {
        }
        return w;
    }

    void save(Context c, int widgetId) {
        try {
            JSONObject o = new JSONObject();
            o.put("src", src);
            JSONArray p = new JSONArray();
            for (String s : pick) p.put(s);
            o.put("pick", p);
            Theme.prefs(c).edit().putString("wcfg_" + widgetId, o.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    static void delete(Context c, int[] ids) {
        android.content.SharedPreferences.Editor e = Theme.prefs(c).edit();
        for (int id : ids) e.remove("wcfg_" + id);
        e.apply();
    }

    /** ¿Este widget enseña lo de este sitio? ws: «» = mi calendario, si no el id del workspace. */
    boolean accepts(Context c, String ws) {
        if (ws == null) ws = "";
        switch (src) {
            case ALL: return true;
            case CURRENT:
                if (cur == null) cur = current(c);
                return ws.equals(cur);
            case PICK: return pick.contains(ws);
            default: return ws.isEmpty();
        }
    }

    /** Si enseña un solo workspace (no mi calendario), cuál: para poner su nombre en la cabecera. Si no, null. */
    Ws single(Context c) {
        String id = null;
        if (CURRENT.equals(src)) id = current(c);
        else if (PICK.equals(src) && pick.size() == 1) id = pick.iterator().next();
        if (id == null || id.isEmpty()) return null;
        for (Ws w : workspaces(c)) if (w.id.equals(id)) return w;
        return null;
    }

    /** ¿Mezcla varios sitios? (entonces cada evento dice de qué workspace es) */
    boolean mixed(Context c) {
        if (ALL.equals(src)) return !workspaces(c).isEmpty();
        return PICK.equals(src) && pick.size() > 1;
    }

    static String current(Context c) {
        return Widgets.data(c).optString("current", "");
    }

    static List<Ws> workspaces(Context c) {
        List<Ws> out = new ArrayList<>();
        JSONArray arr = Widgets.data(c).optJSONArray("workspaces");
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null || o.optString("id").isEmpty()) continue;
            Ws w = new Ws();
            w.id = o.optString("id");
            w.name = o.optString("name");
            w.color = o.optString("color");
            out.add(w);
        }
        return out;
    }

    static String wsName(Context c, String id) {
        if (id == null || id.isEmpty()) return null;
        for (Ws w : workspaces(c)) if (w.id.equals(id)) return w.name;
        return null;
    }
}
