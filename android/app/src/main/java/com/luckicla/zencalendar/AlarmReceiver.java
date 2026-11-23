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
 */
public class AlarmReceiver extends BroadcastReceiver {
    static final String ACTION_FIRE = "com.luckicla.zencalendar.FIRE";
    static final String ACTION_SNOOZE = "com.luckicla.zencalendar.SNOOZE";
    static final String ACTION_DONE = "com.luckicla.zencalendar.DONE";

    @Override public void onReceive(Context c, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        JSONObject item;
        try { item = new JSONObject(intent.getStringExtra("item")); } catch (Exception e) { return; }
        int code = intent.getIntExtra("code", Alarms.code(item.optString("id")));
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        switch (action) {
            case ACTION_FIRE:
                show(c, item, code);
                break;
            case ACTION_SNOOZE: {
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
