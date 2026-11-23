package com.luckicla.zencalendar;

import android.Manifest;
import android.app.NotificationManager;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/**
 * window.ZCAndroid: lo que la página puede pedirle a Android.
 * Las que tienen respuesta asíncrona reciben un id y contestan con
 * ZC.native._cb(id, json) (ver web/js/core/net.js).
 */
final class Bridge {
    private final MainActivity a;
    private final Context app;

    Bridge(MainActivity a) {
        this.a = a;
        this.app = a.getApplicationContext();
    }

    // ---------- red ----------
    @JavascriptInterface public void fetch(String id, String req) {
        Net.fetch(req, res -> a.callback(id, res));
    }

    // ---------- avisos ----------
    @JavascriptInterface public void setReminders(String json) {
        Alarms.setAll(app, json);
    }

    @JavascriptInterface public String takeActions() {
        return AlarmReceiver.takePending(app);
    }

    @JavascriptInterface public boolean notificationsAllowed() {
        if (Build.VERSION.SDK_INT >= 33 && a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }

    @JavascriptInterface public void requestNotifications(String id) {
        a.runOnUiThread(() -> a.askNotifications(id));
    }

    @JavascriptInterface public boolean exactAlarmsAllowed() {
        return Alarms.exactAllowed(app);
    }

    @JavascriptInterface public void openAlarmSettings() {
        if (Build.VERSION.SDK_INT < 31) return;
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + app.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            a.startActivity(i);
        } catch (Exception ignored) {}
    }

    // ---------- widgets ----------
    @JavascriptInterface public void setWidgetData(String json) {
        Widgets.save(app, json);
        Widgets.updateAll(app);
        Widgets.scheduleTicks(app);
    }

    @JavascriptInterface public boolean canPinWidget() {
        if (Build.VERSION.SDK_INT < 26) return false;
        AppWidgetManager m = AppWidgetManager.getInstance(app);
        return m != null && m.isRequestPinAppWidgetSupported();
    }

    @JavascriptInterface public void pinWidget(String kind) {
        if (Build.VERSION.SDK_INT < 26) return;
        a.runOnUiThread(() -> {
            try {
                AppWidgetManager m = AppWidgetManager.getInstance(app);
                Class<?> cls = "today".equals(kind) ? TodayWidget.class : AgendaWidget.class;
                m.requestPinAppWidget(new ComponentName(app, cls), null, null);
            } catch (Exception ignored) {}
        });
    }

    // ---------- aspecto ----------
    @JavascriptInterface public void setTheme(String json) {
        Theme.save(app, json);
        a.runOnUiThread(a::applyTheme);
        Widgets.updateAll(app);
    }

    @JavascriptInterface public void setAppIcon(String id) {
        a.runOnUiThread(() -> MainActivity.setAppIcon(app, id));
    }

    // ---------- Google ----------
    @JavascriptInterface public void googleAuth(String id, boolean interactive, String scopes) {
        a.runOnUiThread(() -> GoogleAuth.authorize(a, id, interactive, scopes));
    }

    @JavascriptInterface public void googleClear(String token) {
        if (token != null && !token.isEmpty()) GoogleAuth.clear(a, token);
    }

    // ---------- lo que abrió la app ----------
    @JavascriptInterface public String takeOpen() {
        return a.takeOpen();
    }

    @JavascriptInterface public String takeShared() {
        return a.takeShared();
    }

    // ---------- varios ----------
    @JavascriptInterface public void share(String title, String text) {
        a.runOnUiThread(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                if (title != null && !title.isEmpty()) i.putExtra(Intent.EXTRA_SUBJECT, title);
                i.putExtra(Intent.EXTRA_TEXT, text);
                a.startActivity(Intent.createChooser(i, title));
            } catch (Exception ignored) {}
        });
    }

    @JavascriptInterface public void openExternal(String url) {
        a.runOnUiThread(() -> a.openExternal(Uri.parse(url)));
    }

    @JavascriptInterface public String version() {
        try { return app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }

    // 'tap' | 'select' | 'success' | 'warning' (el ajuste «haptics» lo mira la página)
    @JavascriptInterface public void haptic(String kind) {
        a.runOnUiThread(() -> Haptics.play(app, a.webView(), kind));
    }

    // ---------- actualizaciones (Updater) ----------
    @JavascriptInterface public void updateCheck(boolean download) {
        Updater.check(app, download);
    }

    @JavascriptInterface public void updateInstall() {
        a.runOnUiThread(() -> Updater.install(a));
    }

    @JavascriptInterface public String updateState() {
        return Updater.state(app);
    }

    @JavascriptInterface public String takeUpdated() {
        return Updater.takeUpdated(app);
    }

    @JavascriptInterface public void setEdge(boolean on) {
        a.runOnUiThread(() -> a.setEdge(on));
    }

    @JavascriptInterface public String insets() {
        return a.insetsJson();
    }

    static String quote(String s) {
        return JSONObject.quote(s == null ? "" : s);
    }
}
