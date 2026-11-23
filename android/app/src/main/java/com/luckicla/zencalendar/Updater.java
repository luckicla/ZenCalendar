package com.luckicla.zencalendar;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Actualizaciones de ZenCalendar desde GitHub (como MixUp). Cada compilación
 * de GitHub Actions sube a la release «android-latest» la APK y un
 * version.txt con «<versionCode> <sha256> <versionName>» (versionCode = el
 * número de compilación, siempre sube). Si el de ahí es mayor que el de esta
 * APK: se descarga a la caché, se comprueba el sha256 y se abre el instalador
 * de Android. Al terminar, Android avisa con MY_PACKAGE_REPLACED
 * (BootReceiver → onUpdated): la app se vuelve a abrir y dice a qué versión.
 *
 * El estado va a la página con ZC.platform._update({ status, current,
 * currentBuild, latest, build, progress, error }).
 */
final class Updater {
    static final String BASE = "https://github.com/luckicla/zencalendar/releases/download/android-latest/";
    private static final int NOTICE = 9301;

    private static volatile String status = "idle", error = "", latest = "";
    private static volatile long build = 0;
    private static volatile int progress = 0;
    private static volatile File ready;
    private static volatile boolean busy, installWhenReady, installAfterPermission;

    // ---------- esta APK ----------
    @SuppressWarnings("deprecation")
    static long myBuild(Context c) {
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) { return 0; }
    }

    static String myName(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }

    static String state(Context c) {
        try {
            JSONObject o = new JSONObject();
            o.put("status", status);
            o.put("current", myName(c));
            o.put("currentBuild", myBuild(c));
            o.put("latest", latest);
            o.put("build", build);
            o.put("progress", progress);
            o.put("error", error);
            return o.toString();
        } catch (Exception e) { return "{\"status\":\"error\"}"; }
    }

    private static void set(Context c, String st) {
        status = st;
        MainActivity.sendUpdate(state(c));
    }

    // ---------- comprobar (y descargar) ----------
    /** En otro hilo: mira version.txt y, si hay una nueva y download, la descarga. */
    static void check(Context ctx, boolean download) {
        final Context c = ctx.getApplicationContext();
        if (busy) { MainActivity.sendUpdate(state(c)); return; }
        busy = true;
        new Thread(() -> {
            try {
                error = "";
                set(c, "checking");
                String txt = new String(get(BASE + "version.txt?t=" + System.currentTimeMillis(), 64 * 1024), StandardCharsets.UTF_8).trim();
                String[] p = txt.split("\\s+");
                long n = Long.parseLong(p[0]);
                String sha = p.length > 1 ? p[1].toLowerCase(Locale.ROOT) : "";
                build = n;
                latest = p.length > 2 ? p[2] : "";
                if (n <= myBuild(c)) { ready = null; progress = 0; installWhenReady = false; set(c, "none"); return; }
                set(c, "available");
                if (download || installWhenReady) fetchApk(c, n, sha);
            } catch (Exception e) {
                Log.w(MainActivity.TAG, "actualizar", e);
                error = e.getMessage() != null ? e.getMessage() : "Sin conexión";
                set(c, "error");
            } finally {
                busy = false;
            }
        }).start();
    }

    private static void fetchApk(Context c, long n, String sha) throws Exception {
        File dir = new File(c.getCacheDir(), "update");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new java.io.IOException("Sin espacio");
        File f = new File(dir, "ZenCalendar-" + n + ".apk");
        // las de antes ya no hacen falta
        File[] old = dir.listFiles();
        if (old != null) for (File o : old) if (!o.getName().equals(f.getName())) //noinspection ResultOfMethodCallIgnored
            o.delete();
        if (!(f.isFile() && f.length() > 0 && (sha.isEmpty() || sha.equals(sha256(f))))) {
            progress = 0;
            set(c, "downloading");
            File part = new File(dir, f.getName() + ".part");
            HttpURLConnection h = open(BASE + "ZenCalendar.apk?t=" + n);
            try (InputStream in = h.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                long total = h.getContentLengthLong(), got = 0;
                byte[] buf = new byte[65536];
                int k, last = -1;
                while ((k = in.read(buf)) > 0) {
                    out.write(buf, 0, k);
                    got += k;
                    if (total > 0) {
                        int pct = (int) (got * 100 / total);
                        if (pct != last && pct % 5 == 0) { last = pct; progress = pct; set(c, "downloading"); }
                    }
                }
            } finally { h.disconnect(); }
            if (!sha.isEmpty() && !sha.equals(sha256(part))) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                throw new java.io.IOException("La descarga no está bien (sha256): vuelve a intentarlo");
            }
            if (!part.renameTo(f)) throw new java.io.IOException("No se pudo guardar la actualización");
        }
        ready = f;
        progress = 100;
        set(c, "ready");
        if (installWhenReady) {
            installWhenReady = false;
            MainActivity a = MainActivity.current();
            if (a != null) a.runOnUiThread(() -> install(a));
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(20000);
        h.setReadTimeout(60000);
        h.setInstanceFollowRedirects(true); // github.com → objects.githubusercontent.com
        h.setUseCaches(false);
        int code = h.getResponseCode();
        if (code != 200) { h.disconnect(); throw new java.io.IOException("GitHub respondió " + code); }
        return h;
    }

    private static byte[] get(String url, int max) throws Exception {
        HttpURLConnection h = open(url);
        try (InputStream in = h.getInputStream(); java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int k, total = 0;
            while ((k = in.read(buf)) > 0) { total += k; if (total > max) break; out.write(buf, 0, k); }
            return out.toByteArray();
        } finally { h.disconnect(); }
    }

    static String sha256(File f) {
        try (InputStream in = new FileInputStream(f)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[65536];
            for (int k; (k = in.read(buf)) > 0; ) md.update(buf, 0, k);
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format(Locale.ROOT, "%02x", b));
            return sb.toString();
        } catch (Exception e) { return ""; }
    }

    // ---------- instalar ----------
    /** En el hilo principal. Si aún no está descargada, la descarga y luego instala. */
    static void install(Activity a) {
        File f = ready;
        if (f == null || !f.isFile()) {
            installWhenReady = true;
            check(a, true);
            return;
        }
        // la primera vez Android tiene que dejar a ZenCalendar instalar apps
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            installAfterPermission = true;
            try {
                a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
            } catch (Exception e) {
                error = "Permite instalar apps desconocidas a ZenCalendar en Ajustes";
                set(a, "error");
            }
            return;
        }
        try {
            Uri u = FileProvider.getUriForFile(a, a.getPackageName() + ".files", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(u, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            a.startActivity(i);
        } catch (Exception e) {
            Log.w(MainActivity.TAG, "instalar", e);
            error = "No se pudo abrir el instalador";
            set(a, "error");
        }
    }

    /** Al volver de Ajustes con el permiso dado: sigue con la instalación. */
    static void resume(Activity a) {
        if (!installAfterPermission) return;
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) return;
        installAfterPermission = false;
        install(a);
    }

    // ---------- ya actualizada (MY_PACKAGE_REPLACED) ----------
    static void onUpdated(Context c) {
        String v = myName(c);
        Theme.prefs(c).edit().putString("updatedTo", v).apply();
        File dir = new File(c.getCacheDir(), "update");
        File[] old = dir.listFiles();
        if (old != null) for (File o : old) //noinspection ResultOfMethodCallIgnored
            o.delete();
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // primero el aviso (si la app llega a abrirse, lo quita); Android 10+ no
        // siempre deja abrir una app desde aquí
        try {
            Alarms.ensureChannel(c);
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            PendingIntent pi = PendingIntent.getActivity(c, NOTICE, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, Alarms.CHANNEL) : legacyBuilder(c);
            b.setSmallIcon(R.drawable.ic_stat_zc)
                    .setContentTitle(c.getString(R.string.updated_title))
                    .setContentText(c.getString(R.string.updated_text, v))
                    .setContentIntent(pi)
                    .setAutoCancel(true);
            if (nm != null) nm.notify(NOTICE, b.build());
        } catch (Exception ignored) {}
        try { c.startActivity(open); } catch (Exception ignored) {}
    }

    @SuppressWarnings("deprecation")
    private static Notification.Builder legacyBuilder(Context c) { return new Notification.Builder(c); }

    /** La versión a la que se acaba de actualizar, una sola vez ("" si no). */
    static String takeUpdated(Context c) {
        SharedPreferences p = Theme.prefs(c);
        String v = p.getString("updatedTo", "");
        if (v != null && !v.isEmpty()) {
            p.edit().remove("updatedTo").apply();
            try {
                NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.cancel(NOTICE);
            } catch (Exception ignored) {}
            return v;
        }
        return "";
    }

    private Updater() {}
}
