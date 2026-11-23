package com.luckicla.zencalendar;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

import org.json.JSONObject;

import java.util.Locale;

/**
 * El aspecto que elige la página (ZC.platform.setTheme): se guarda para que
 * los widgets y la barra de estado lo usen aunque la app esté cerrada.
 * { bg, surface, fg, muted, a1, a2, a3, light, alpha (0-1), radius (px) }
 */
final class Theme {
    static final String PREFS = "zencalendar";

    int bg = 0xFFF7F3FF;
    int surface = 0xFFFFFFFF;
    int fg = 0xFF3D3355;
    int muted = 0xFF8A7FA3;
    int a1 = 0xFFC9B8FF;
    int a2 = 0xFFFFC8E3;
    int a3 = 0xFFBFF0E4;
    boolean light = true;
    float alpha = 0.88f;
    int radius = 24;

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context c, String json) {
        prefs(c).edit().putString("theme", json).apply();
    }

    static Theme load(Context c) {
        Theme t = new Theme();
        String s = prefs(c).getString("theme", null);
        if (s == null) {
            // sin tema guardado: el de la noche si el móvil va en oscuro
            int ui = c.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
            if (ui == android.content.res.Configuration.UI_MODE_NIGHT_YES) {
                t.bg = 0xFF1E1A2E; t.surface = 0xFF2A2440; t.fg = 0xFFF1ECFF; t.muted = 0xFFA79FC0; t.a1 = 0xFFB9A6FF; t.light = false;
            }
            return t;
        }
        try {
            JSONObject o = new JSONObject(s);
            t.bg = parse(o.optString("bg"), t.bg);
            t.surface = parse(o.optString("surface"), t.surface);
            t.fg = parse(o.optString("fg"), t.fg);
            t.muted = parse(o.optString("muted"), t.muted);
            t.a1 = parse(o.optString("a1"), t.a1);
            t.a2 = parse(o.optString("a2"), t.a2);
            t.a3 = parse(o.optString("a3"), t.a3);
            t.light = o.has("light") ? o.optBoolean("light", true) : luminance(t.bg) > 0.5;
            double a = o.optDouble("alpha", t.alpha);
            if (a > 1) a = a / 100.0; // (por si llega en %)
            t.alpha = (float) Math.max(0.0, Math.min(1.0, a));
            t.radius = (int) Math.round(o.optDouble("radius", t.radius));
        } catch (Exception ignored) {
        }
        return t;
    }

    /** «#rgb», «#rrggbb», «#rrggbbaa», «rgb(…)» o «rgba(…)» → color; si no se entiende, def. */
    static int parse(String s, int def) {
        if (s == null) return def;
        s = s.trim().toLowerCase(Locale.ROOT);
        if (s.isEmpty()) return def;
        try {
            if (s.startsWith("#")) {
                String h = s.substring(1);
                if (h.length() == 3) h = "" + h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
                if (h.length() == 6) return 0xFF000000 | Integer.parseInt(h, 16);
                if (h.length() == 8) { // CSS: #rrggbbaa
                    int rgb = Integer.parseInt(h.substring(0, 6), 16);
                    int a = Integer.parseInt(h.substring(6, 8), 16);
                    return (a << 24) | rgb;
                }
                return def;
            }
            if (s.startsWith("rgb")) {
                String in = s.substring(s.indexOf('(') + 1, s.lastIndexOf(')'));
                String[] p = in.split("[,\\s/]+");
                int r = (int) Float.parseFloat(p[0]), g = (int) Float.parseFloat(p[1]), b = (int) Float.parseFloat(p[2]);
                int a = 255;
                if (p.length > 3) {
                    float f = p[3].endsWith("%") ? Float.parseFloat(p[3].replace("%", "")) / 100f : Float.parseFloat(p[3]);
                    a = Math.round(Math.max(0, Math.min(1, f)) * 255);
                }
                return Color.argb(a, r, g, b);
            }
            return Color.parseColor(s);
        } catch (Exception e) {
            return def;
        }
    }

    static double luminance(int c) {
        return (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255.0;
    }

    /** El fondo de los widgets: la forma redondeada que más se parece al radio del tema. */
    int bgDrawable() {
        int r = radius;
        if (r <= 11) return R.drawable.wbg_8;
        if (r <= 19) return R.drawable.wbg_16;
        if (r <= 27) return R.drawable.wbg_24;
        return R.drawable.wbg_32;
    }

    int bgAlpha() {
        return Math.round(alpha * 255);
    }
}
