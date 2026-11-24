package com.luckicla.zencalendar;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Suena un aviso: la notificación con «Posponer 10 min» y «Hecho».
 * Tocarla abre el evento en la app.
 *
 * Las alarmas (item.alarm) suenan como un despertador: canal «Alarmas», sonido de
 * alarma que se repite (FLAG_INSISTENT), fija hasta «Parar» o «Posponer 10 min»,
 * y en pantalla completa encima del bloqueo (AlarmActivity) si Android lo deja.
 */
public class AlarmReceiver extends BroadcastReceiver {
    static final String ACTION_FIRE = "com.luckicla.zencalendar.FIRE";
    static final String ACTION_SNOOZE = "com.luckicla.zencalendar.SNOOZE";
    static final String ACTION_DONE = "com.luckicla.zencalendar.DONE";
    static final String ACTION_STOP = "com.luckicla.zencalendar.STOP";
    static final long ALARM_RING_MS = 10 * 60_000L;

    @Override public void onReceive(Context c, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        JSONObject item;
        try { item = new JSONObject(intent.getStringExtra("item")); } catch (Exception e) { return; }
        int code = intent.getIntExtra("code", Alarms.code(item.optString("id")));
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        switch (action) {
            case ACTION_FIRE:
                Alarms.markFired(c, item);
                if (item.optBoolean("alarm")) { Alarms.removeSnoozed(c, item.optString("id")); showAlarm(c, item, code); }
                else show(c, item, code);
                break;
            case ACTION_STOP:
                stop(c, item, code);
                break;
            case ACTION_SNOOZE: {
                if (item.optBoolean("alarm")) { snooze(c, item, code); break; }
                if (nm != null) nm.cancel(code);
                long at = System.currentTimeMillis() + 10 * 60_000L;
                try { item.put("at", at); item.put("id", item.optString("id").split("~")[0] + "~" + at); } catch (Exception ignored) {}
                int c2 = Alarms.code(item.optString("id"));
                Alarms.setAlarm(c, at, Alarms.firePending(c, item, c2));
                break;
            }
            case ACTION_DONE: {
                if (nm != null) nm.cancel(code);
                if (item.optBoolean("task")) {
                    // la tarea se marca en la página: ahora si está abierta, o al abrirla
                    try {
                        JSONObject a = new JSONObject();
                        a.put("type", "done");
                        a.put("eventId", item.optString("eventId"));
                        a.put("date", item.optString("date"));
                        a.put("id", item.optString("id"));
                        addPending(c, a);
                    } catch (Exception ignored) {}
                    MainActivity.pokeActions();
                }
                break;
            }
        }
    }

    // ---------- alarmas ----------

    /** «Parar»: se calla y no vuelve a sonar. */
    static void stop(Context c, JSONObject item, int code) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(code);
        AlarmActivity.closeFor(code);
        Alarms.removeSnoozed(c, item.optString("id"));
        tellPage(c, "stop", item, 0);
    }

    /** «Posponer 10 min»: vuelve a sonar dentro de 10 minutos (aunque se reinicie el móvil). */
    static void snooze(Context c, JSONObject item, int code) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(code);
        AlarmActivity.closeFor(code);
        long at = System.currentTimeMillis() + 10 * 60_000L;
        JSONObject next;
        try {
            next = new JSONObject(item.toString());
            next.put("at", at);
            next.put("id", Alarms.baseId(item.optString("id")) + "~" + at);
        } catch (Exception e) { return; }
        Alarms.addSnoozed(c, next);
        int c2 = Alarms.code(next.optString("id"));
        Alarms.arm(c, next, at, c2);
        tellPage(c, "snooze", next, at);
    }

    /** La página se entera (ahora si está abierta, o al abrirla) para guardarlo en ZC.reminders. */
    private static void tellPage(Context c, String type, JSONObject item, long at) {
        try {
            JSONObject a = new JSONObject();
            a.put("type", type);
            a.put("minutes", 10);
            if (at > 0) a.put("at", at);
            a.put("reminder", item);
            addPending(c, a);
        } catch (Exception ignored) {}
        MainActivity.pokeActions();
    }

    private static PendingIntent broadcast(Context c, String action, JSONObject item, int code, int req) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(action);
        i.putExtra("item", item.toString()).putExtra("code", code);
        return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void showAlarm(Context c, JSONObject item, int code) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Alarms.ensureAlarmChannel(c);
        String title = item.optString("title", "ZenCalendar");
        String body = item.optString("body", "");
        PendingIntent open = Widgets.openPending(c, "open", item.optString("eventId"), item.optString("date"), code);
        PendingIntent snooze = broadcast(c, ACTION_SNOOZE, item, code, code + 1);
        PendingIntent stop = broadcast(c, ACTION_STOP, item, code, code + 2);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, Alarms.ALARM_CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_zc)
                .setContentTitle("\u23F0 " + title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setColor(Theme.parse(item.optString("color"), 0xFFC9B8FF))
                // tocarla abre el evento (y la calla); deslizarla (Android 14 deja) = «Parar»
                .setContentIntent(open)
                .setDeleteIntent(stop)
                .setAutoCancel(true)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_ALARM)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_MAX);
            b.setSound(Alarms.alarmSound(), Alarms.alarmAttrs());
            b.setVibrate(Alarms.VIBRATE);
            b.setDefaults(Notification.DEFAULT_LIGHTS);
        } else {
            // si nadie la para, a los 10 minutos se calla sola
            b.setTimeoutAfter(ALARM_RING_MS);
        }
        // pantalla completa encima del bloqueo (si Android lo deja; si no, solo la notificación)
        if (Alarms.fullScreenAllowed(c)) {
            Intent fi = new Intent(c, AlarmActivity.class);
            fi.putExtra("item", item.toString()).putExtra("code", code);
            fi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
            PendingIntent full = PendingIntent.getActivity(c, code + 3, fi, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.setFullScreenIntent(full, true);
        }
        b.addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, Alarms.str(c, "snooze", R.string.snooze), snooze).build());
        b.addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, Alarms.str(c, "stop", R.string.stop), stop).build());
        Notification n = b.build();
        // el sonido se repite hasta que se pare, y «Borrar todo» no la quita
        n.flags |= Notification.FLAG_INSISTENT | Notification.FLAG_NO_CLEAR;
        try { nm.notify(code, n); } catch (SecurityException ignored) { /* sin permiso de notificaciones */ }
    }

    static synchronized void addPending(Context c, JSONObject a) {
        try {
            JSONArray arr = new JSONArray(Theme.prefs(c).getString("pending_actions", "[]"));
            arr.put(a);
            Theme.prefs(c).edit().putString("pending_actions", arr.toString()).commit();
        } catch (Exception ignored) {}
    }

    static synchronized String takePending(Context c) {
        String s = Theme.prefs(c).getString("pending_actions", "[]");
        Theme.prefs(c).edit().remove("pending_actions").commit();
        return s;
    }

    static void show(Context c, JSONObject item, int code) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Alarms.ensureChannel(c);
        String eventId = item.optString("eventId");
        String date = item.optString("date");
        PendingIntent open = Widgets.openPending(c, "open", eventId, date, code);

        Intent sn = new Intent(c, AlarmReceiver.class).setAction(ACTION_SNOOZE);
        sn.putExtra("item", item.toString()).putExtra("code", code);
        PendingIntent snooze = PendingIntent.getBroadcast(c, code + 1, sn, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent dn = new Intent(c, AlarmReceiver.class).setAction(ACTION_DONE);
        dn.putExtra("item", item.toString()).putExtra("code", code);
        PendingIntent done = PendingIntent.getBroadcast(c, code + 2, dn, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, Alarms.CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_zc)
                .setContentTitle(item.optString("title", "ZenCalendar"))
                .setContentText(item.optString("body", ""))
                .setStyle(new Notification.BigTextStyle().bigText(item.optString("body", "")))
                .setColor(Theme.parse(item.optString("color"), 0xFFC9B8FF))
                .setContentIntent(open)
                .setAutoCancel(true)
                .setCategory(item.optBoolean("task") ? Notification.CATEGORY_REMINDER : Notification.CATEGORY_EVENT)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_HIGH);
            b.setDefaults(Notification.DEFAULT_ALL);
        }
        b.addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, Alarms.str(c, "snooze", R.string.snooze), snooze).build());
        b.addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, Alarms.str(c, "done", R.string.done), done).build());
        try { nm.notify(code, b.build()); } catch (SecurityException ignored) { /* sin permiso de notificaciones */ }
    }
}
