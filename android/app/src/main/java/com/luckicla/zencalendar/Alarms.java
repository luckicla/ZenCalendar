package com.luckicla.zencalendar;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
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
 *
 * Las alarmas (item.alarm = true) van aparte: AlarmManager.setAlarmClock (exacta,
 * sale el reloj en la barra de estado y se salta el ahorro de batería) y suenan
 * como un despertador en el canal «Alarmas» (ver AlarmReceiver.showAlarm).
 */
final class Alarms {
    static final String CHANNEL = "avisos";
    static final String ALARM_CHANNEL = "alarmas";
    static final long[] VIBRATE = {0, 900, 500, 900, 500, 900, 1400};
    private static final int MAX = 64;
    private static final int MAX_FIRED = 300;

    /** { items: [{ id, eventId, date, at, title, body, task, color, alarm }], strings: { snooze, done, stop, alarm, alarmChannel } } */
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

    /** Alarma de despertador: setAlarmClock; si Android no deja alarmas exactas, lo más cerca posible. */
    static void setAlarmClock(Context c, long at, PendingIntent pi, PendingIntent show) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            if (exactAllowed(c)) { am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), pi); return; }
        } catch (SecurityException ignored) {}
        setAlarm(c, at, pi);
    }

    /** Programa un aviso o una alarma (según item.alarm). */
    static void arm(Context c, JSONObject it, long at, int code) {
        PendingIntent pi = firePending(c, it, code);
        if (it.optBoolean("alarm")) setAlarmClock(c, at, pi, Widgets.openPending(c, "open", it.optString("eventId"), it.optString("date"), code + 4));
        else setAlarm(c, at, pi);
    }

    // ---- lo que ya ha sonado (para no repetirlo si la página reprograma en el mismo minuto) ----
    static String firedKey(JSONObject it) { return it.optString("id") + "@" + it.optLong("at", 0); }

    static synchronized void markFired(Context c, JSONObject it) {
        try {
            JSONArray arr = new JSONArray(Theme.prefs(c).getString("fired", "[]"));
            arr.put(firedKey(it));
            JSONArray out = new JSONArray();
            for (int k = Math.max(0, arr.length() - MAX_FIRED); k < arr.length(); k++) out.put(arr.optString(k));
            Theme.prefs(c).edit().putString("fired", out.toString()).apply();
        } catch (Exception ignored) {}
    }

    static Set<String> fired(Context c) {
        Set<String> s = new HashSet<>();
        try {
            JSONArray arr = new JSONArray(Theme.prefs(c).getString("fired", "[]"));
            for (int k = 0; k < arr.length(); k++) s.add(arr.optString(k));
        } catch (Exception ignored) {}
        return s;
    }

    // ---- alarmas pospuestas (sobreviven a un reinicio aunque no se abra la app) ----
    static String baseId(String id) { int i = id.indexOf('~'); return i < 0 ? id : id.substring(0, i); }

    static synchronized void addSnoozed(Context c, JSONObject it) {
        try {
            JSONArray arr = new JSONArray(Theme.prefs(c).getString("snoozed", "[]"));
            JSONArray out = new JSONArray();
            String base = baseId(it.optString("id"));
            for (int k = 0; k < arr.length(); k++) {
                JSONObject o = arr.optJSONObject(k);
                if (o != null && !baseId(o.optString("id")).equals(base)) out.put(o);
            }
            out.put(it);
            Theme.prefs(c).edit().putString("snoozed", out.toString()).apply();
        } catch (Exception ignored) {}
    }

    static synchronized void removeSnoozed(Context c, String id) {
        try {
            JSONArray arr = new JSONArray(Theme.prefs(c).getString("snoozed", "[]"));
            JSONArray out = new JSONArray();
            String base = baseId(id);
            for (int k = 0; k < arr.length(); k++) {
                JSONObject o = arr.optJSONObject(k);
                if (o != null && !baseId(o.optString("id")).equals(base)) out.put(o);
            }
            Theme.prefs(c).edit().putString("snoozed", out.toString()).apply();
        } catch (Exception ignored) {}
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
            if (items == null) items = new JSONArray();
            // + las alarmas pospuestas que la página aún no conoce
            Set<String> ids = new HashSet<>();
            for (int k = 0; k < items.length(); k++) { JSONObject it = items.optJSONObject(k); if (it != null) ids.add(it.optString("id")); }
            JSONArray sn = new JSONArray(p.getString("snoozed", "[]"));
            for (int k = 0; k < sn.length(); k++) { JSONObject it = sn.optJSONObject(k); if (it != null && !ids.contains(it.optString("id"))) items.put(it); }
            Set<String> done = fired(c);
            long t = System.currentTimeMillis();
            int n = 0, na = 0;
            for (int k = 0; k < items.length(); k++) {
                JSONObject it = items.optJSONObject(k);
                if (it == null) continue;
                boolean alarm = it.optBoolean("alarm");
                // (las alarmas no se quedan fuera por el límite de los avisos)
                if (alarm ? na >= 32 : n >= MAX) continue;
                long at = it.optLong("at", 0);
                // (con el móvil apagado se pasó la hora: si fue hace poco, sale ya)
                if (at < t - 60 * 60_000L) continue;
                if (done.contains(firedKey(it))) continue;
                if (at < t) at = t + 3000;
                int code = code(it.optString("id"));
                arm(c, it, at, code);
                now.add(String.valueOf(code));
                if (alarm) na++; else n++;
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

    static Uri alarmSound() {
        Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        return u;
    }

    static AudioAttributes alarmAttrs() {
        return new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
    }

    /** El canal «Alarmas»: importancia alta, sonido de alarma (suena aunque el móvil esté en silencio) y vibración larga. */
    static void ensureAlarmChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(ALARM_CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(ALARM_CHANNEL, str(c, "alarmChannel", R.string.channel_alarms), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(c.getString(R.string.channel_alarms_desc));
        ch.setSound(alarmSound(), alarmAttrs());
        ch.enableVibration(true);
        ch.setVibrationPattern(VIBRATE);
        ch.enableLights(true);
        ch.setLightColor(0xFFC9B8FF);
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        // (solo vale si el usuario le da a la app acceso a «No molestar»; si no, Android lo ignora)
        ch.setBypassDnd(true);
        nm.createNotificationChannel(ch);
    }

    /** ¿se puede enseñar la alarma en pantalla completa encima del bloqueo? (Android 14+ lo puede quitar) */
    static boolean fullScreenAllowed(Context c) {
        if (Build.VERSION.SDK_INT < 34) return true;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        try { return nm != null && nm.canUseFullScreenIntent(); } catch (Exception e) { return false; }
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
