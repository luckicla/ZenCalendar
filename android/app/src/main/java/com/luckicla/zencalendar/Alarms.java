package com.luckicla.zencalendar;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Los avisos con AlarmManager. La página calcula los de los próximos días
 * (ZC.reminders) y los manda aquí; se guardan para volver a programarlos
 * después de reiniciar el móvil (BootReceiver). A la hora exacta si Android
 * deja; si no, lo más cerca posible.
 */
final class Alarms {
    static final String CHANNEL = "avisos";
    private static final int MAX = 64;

    /** { items: [{ id, eventId, date, at, title, body, task, color }], strings: { snooze, done } } */
    static void setAll(Context c, String json) {
        Theme.prefs(c).edit().putString("reminders", json).apply();
        schedule(c);
    }

    static int code(String id) {
        // (los códigos de los widgets y otros están por debajo de 10000)
        return 10000 + (id.hashCode() & 0x3fffffff) % 1_000_000_000;
    }

    static boolean exactAllowed(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    static PendingIntent firePending(Context c, JSONObject item, int code) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.setAction(AlarmReceiver.ACTION_FIRE);
        i.putExtra("item", item.toString());
        i.putExtra("code", code);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void setAlarm(Context c, long at, PendingIntent pi) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            if (exactAllowed(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    /** Quita los avisos de antes y programa los guardados. */
    static synchronized void schedule(Context c) {
        SharedPreferences p = Theme.prefs(c);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        // los de la vez anterior
        Set<String> old = p.getStringSet("alarm_codes", new HashSet<>());
        for (String s : old) {
            try {
                int code = Integer.parseInt(s);
                Intent i = new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.ACTION_FIRE);
                PendingIntent pi = PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pi != null) { am.cancel(pi); pi.cancel(); }
            } catch (Exception ignored) {}
        }
        Set<String> now = new HashSet<>();
        try {
            JSONObject root = new JSONObject(p.getString("reminders", "{}"));
            JSONArray items = root.optJSONArray("items");
            long t = System.currentTimeMillis();
            int n = 0;
            if (items != null) {
                for (int k = 0; k < items.length() && n < MAX; k++) {
                    JSONObject it = items.optJSONObject(k);
                    if (it == null) continue;
                    long at = it.optLong("at", 0);
                    // (con el móvil apagado se pasó la hora: si fue hace poco, sale ya)
                    if (at < t - 60 * 60_000L) continue;
                    if (at < t) at = t + 3000;
                    int code = code(it.optString("id"));
                    setAlarm(c, at, firePending(c, it, code));
                    now.add(String.valueOf(code));
                    n++;
                }
            }
        } catch (Exception ignored) {
        }
        p.edit().putStringSet("alarm_codes", now).apply();
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(c.getString(R.string.channel_reminders_desc));
        ch.enableVibration(true);
        ch.enableLights(true);
        ch.setLightColor(0xFFC9B8FF);
        nm.createNotificationChannel(ch);
    }

    static String str(Context c, String key, int def) {
        try {
            JSONObject s = new JSONObject(Theme.prefs(c).getString("reminders", "{}")).optJSONObject("strings");
            String v = s != null ? s.optString(key, "") : "";
            if (!v.isEmpty()) return v;
        } catch (Exception ignored) {}
        return c.getString(def);
    }

    private Alarms() {}
}
