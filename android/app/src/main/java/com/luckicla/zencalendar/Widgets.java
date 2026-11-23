package com.luckicla.zencalendar;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Los widgets «Agenda» y «Hoy». La página les pasa lo de los próximos días
 * (ZC.reminders.widgetData → ZCAndroid.setWidgetData) y aquí se pintan con
 * los colores del tema. Se refrescan al cambiar algo, a medianoche y cada 30 min.
 * Con el diseño Dot (Theme.dot) usan sus propios layouts (*_dot.xml): monocromos,
 * con la fecha y las horas en ZenDot (DotText).
 */
final class Widgets {
    static final String ACTION_TICK = "com.luckicla.zencalendar.WIDGET_TICK";

    /** Un evento tal como lo pinta un widget. */
    static final class Item {
        String id, date, title, time, end, color, location;
        boolean allDay, task;
    }

    static void save(Context c, String json) {
        Theme.prefs(c).edit().putString("widgets", json).apply();
    }

    static JSONObject data(Context c) {
        try { return new JSONObject(Theme.prefs(c).getString("widgets", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
    }

    /** Los eventos de hoy en adelante (lo de días ya pasados se quita aquí, por si la app lleva tiempo sin abrirse). */
    static List<Item> items(Context c) {
        List<Item> out = new ArrayList<>();
        String today = today();
        JSONArray arr = data(c).optJSONArray("items");
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            Item it = new Item();
            it.id = o.optString("id");
            it.date = o.optString("date");
            it.title = o.optString("title");
            it.time = o.optString("time");
            it.end = o.optString("end");
            it.color = o.optString("color");
            it.location = o.optString("location");
            it.allDay = o.optBoolean("allDay");
            it.task = o.optBoolean("task");
            if (it.date.compareTo(today) < 0) continue;
            out.add(it);
        }
        return out;
    }

    static String str(Context c, String key, String def) {
        JSONObject s = data(c).optJSONObject("strings");
        String v = s != null ? s.optString(key, "") : "";
        return v.isEmpty() ? def : v;
    }

    /** «Hoy», «Mañana» o «miércoles 26» */
    static String dayLabel(Context c, String ymd) {
        try {
            Date d = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).parse(ymd);
            Calendar t = Calendar.getInstance();
            String today = today();
            t.add(Calendar.DAY_OF_YEAR, 1);
            String tomorrow = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(t.getTime());
            if (ymd.equals(today)) return str(c, "today", "Hoy");
            if (ymd.equals(tomorrow)) return str(c, "tomorrow", "Mañana");
            return new SimpleDateFormat("EEEE d MMM", Locale.getDefault()).format(d);
        } catch (Exception e) {
            return ymd;
        }
    }

    // ---------- abrir la app ----------
    static Intent openIntent(Context c, String action, String id, String date) {
        Intent i = new Intent(c, MainActivity.class);
        i.setAction(MainActivity.ACTION_OPEN);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("action", action);
        if (id != null) i.putExtra("id", id);
        if (date != null) i.putExtra("date", date);
        // (cada intent distinto, para que Android no los junte)
        i.setData(Uri.parse("zencalendar://" + action + "/" + (id != null ? id : "") + "/" + (date != null ? date : "")));
        return i;
    }

    static PendingIntent openPending(Context c, String action, String id, String date, int code) {
        return PendingIntent.getActivity(c, code, openIntent(c, action, id, date), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Plantilla para los toques en la lista: tiene que ser «mutable» para que cada fila ponga lo suyo. */
    static PendingIntent listTemplate(Context c) {
        Intent i = new Intent(c, MainActivity.class);
        i.setAction(MainActivity.ACTION_OPEN);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getActivity(c, 900, i, flags);
    }

    // ---------- pintar ----------
    static void paintBackground(RemoteViews v, Theme t) {
        if (t.dot) {
            // Dot: negro o blanco (con la transparencia del tema), la rejilla de puntos
            // y el «+» en un círculo de línea fina
            v.setImageViewResource(R.id.bg, t.bgDrawable());
            v.setInt(R.id.bg, "setColorFilter", t.wBg());
            v.setInt(R.id.bg, "setImageAlpha", t.bgAlpha());
            v.setInt(R.id.grid, "setColorFilter", t.wFg());
            v.setInt(R.id.grid, "setImageAlpha", t.gridAlpha());
            v.setInt(R.id.add_bg, "setColorFilter", t.wFg());
            v.setTextColor(R.id.add_txt, t.wFg());
            return;
        }
        v.setImageViewResource(R.id.bg, t.bgDrawable());
        v.setInt(R.id.bg, "setColorFilter", t.bg | 0xFF000000);
        v.setInt(R.id.bg, "setImageAlpha", t.bgAlpha());
        v.setInt(R.id.add_bg, "setColorFilter", t.a1 | 0xFF000000);
        v.setTextColor(R.id.add_txt, t.light ? 0xFF3D3355 : 0xFF1E1A2E);
    }

    static void updateAll(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] agenda = m.getAppWidgetIds(new ComponentName(c, AgendaWidget.class));
            for (int id : agenda) AgendaWidget.update(c, m, id);
            if (agenda.length > 0) m.notifyAppWidgetViewDataChanged(agenda, R.id.list);
            int[] today = m.getAppWidgetIds(new ComponentName(c, TodayWidget.class));
            for (int id : today) TodayWidget.update(c, m, id);
        } catch (Exception ignored) {
        }
    }

    /** A medianoche (y cada 30 min, sin despertar el móvil) se repintan: cambia el día. */
    static void scheduleTicks(Context c) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            Intent i = new Intent(c, BootReceiver.class).setAction(ACTION_TICK);
            PendingIntent pi = PendingIntent.getBroadcast(c, 901, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Calendar mid = Calendar.getInstance();
            mid.add(Calendar.DAY_OF_YEAR, 1);
            mid.set(Calendar.HOUR_OF_DAY, 0);
            mid.set(Calendar.MINUTE, 0);
            mid.set(Calendar.SECOND, 5);
            long next = Math.min(mid.getTimeInMillis(), System.currentTimeMillis() + 30 * 60_000L);
            am.set(AlarmManager.RTC, next, pi);
        } catch (Exception ignored) {
        }
    }

    static int color(String s, int def) {
        return Theme.parse(s, def);
    }

    private Widgets() {}
}
