package com.luckicla.zencalendar;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Workspaces en Android: los enlaces zencalendar://join/#…, las credenciales de Firebase que pasa la página
 * (ZCAndroid.wsCreds, guardadas cifradas con una clave del Android Keystore) y los avisos con la app
 * cerrada: un JobScheduler periódico (cada ~15 min, con red, sobrevive a reinicios) que hace la
 * comprobación de WsSync y saca una notificación por workspace en el canal «Workspaces». Tocarla abre ese
 * workspace (onOpen({ action: 'workspace', wid })); las líneas se van juntando hasta que se toca o se quita.
 */
final class Workspaces {
    static final String CHANNEL = "workspaces";
    static final int JOB_ID = 7301;
    static final String ACTION_DISMISS = "com.luckicla.zencalendar.WS_DISMISS";
    private static final String PREFS = "zc_ws";
    private static final String KEY_ALIAS = "zc_ws";
    private static final int MAX_LINES = 6;
    private static final String TAG = "ZenCalendar";

    // sube cada vez que la página cambia las credenciales: una comprobación que empezó antes no guarda lo suyo encima
    private static int gen;

    private Workspaces() {}

    // ---------- enlaces ----------

    /** zencalendar://join/#<wid>.<token> (o ?code= / ?join= / zencalendar://join/<código>) → el código, o null. */
    static String joinCode(Uri u) {
        if (u == null || !"zencalendar".equalsIgnoreCase(u.getScheme()) || !"join".equalsIgnoreCase(u.getHost())) return null;
        String code = u.getFragment();
        try {
            if (code == null || code.isEmpty()) code = u.getQueryParameter("code");
            if (code == null || code.isEmpty()) code = u.getQueryParameter("join");
        } catch (Exception ignored) {}
        if ((code == null || code.isEmpty()) && u.getLastPathSegment() != null) code = u.getLastPathSegment();
        return WsSync.cleanCode(code);
    }

    // ---------- credenciales ----------

    /** La página: JSON con { apiKey, projectId, uid, refreshToken, … } o vacío/null para olvidarlas (al salir). */
    static void setCreds(Context c, String json) {
        boolean on;
        synchronized (Workspaces.class) {
            gen++;
            JSONObject in = null;
            try { if (json != null && !json.trim().isEmpty() && !"null".equals(json.trim())) in = new JSONObject(json); } catch (Exception ignored) {}
            if (in == null) {
                prefs(c).edit().remove("state").remove("on").apply();
                on = false;
            } else {
                JSONObject st;
                try { st = WsSync.setCreds(load(c), in, System.currentTimeMillis()); } catch (Exception e) { st = null; }
                if (st == null) return; // (no valen: se queda lo que hubiera)
                save(c, st);
                on = true;
            }
        }
        if (on) {
            ensureChannel(c);
            ensureJob(c);
        } else {
            cancelJob(c);
            cancelAll(c);
        }
    }

    static boolean has(Context c) {
        return "1".equals(prefs(c).getString("on", null));
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject load(Context c) {
        String raw = prefs(c).getString("state", null);
        if (raw == null) return null;
        try {
            String json = decrypt(raw);
            return json != null ? new JSONObject(json) : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static void save(Context c, JSONObject st) {
        prefs(c).edit().putString("state", encrypt(st.toString())).putString("on", "1").apply();
    }

    // ---------- cifrado (Android Keystore, AES-GCM; si el aparato no deja, va sin cifrar en los datos privados de la app) ----------
    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            KeyStore.Entry e = ks.getEntry(KEY_ALIAS, null);
            if (e instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) e).getSecretKey();
        }
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return g.generateKey();
    }

    private static String encrypt(String plain) {
        try {
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.ENCRYPT_MODE, key());
            byte[] ct = ci.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return "k1:" + Base64.encodeToString(ci.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
        } catch (Exception e) {
            Log.w(TAG, "workspaces: sin Keystore", e);
            return "p0:" + plain;
        }
    }

    private static String decrypt(String raw) {
        if (raw.startsWith("p0:")) return raw.substring(3);
        if (!raw.startsWith("k1:")) return null;
        try {
            String[] p = raw.split(":", 3);
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(p[1], Base64.NO_WRAP)));
            return new String(ci.doFinal(Base64.decode(p[2], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null; // (la clave se perdió: como si no hubiera credenciales; la página las vuelve a mandar)
        }
    }

    // ---------- el trabajo periódico ----------
    static void ensureJob(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (!has(c)) { js.cancel(JOB_ID); return; }
        if (js.getPendingJob(JOB_ID) != null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, WsJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60_000L)
                .setPersisted(true) // (vuelve tras reiniciar: RECEIVE_BOOT_COMPLETED)
                .build();
        try { js.schedule(job); } catch (Exception e) { Log.w(TAG, "workspaces: job", e); }
    }

    static void cancelJob(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null) js.cancel(JOB_ID);
    }

    /** Una comprobación (en un hilo de fondo: hace peticiones). */
    static void check(Context c) {
        JSONObject st;
        int g;
        synchronized (Workspaces.class) {
            st = load(c);
            g = gen;
        }
        if (st == null || st.optJSONObject("creds") == null) return;
        List<WsSync.Group> groups;
        try {
            groups = new WsSync(Workspaces::post).run(st, System.currentTimeMillis());
        } catch (WsSync.AuthException e) {
            // sesión de Firebase caducada o revocada: se olvida hasta que la página mande otra
            Log.w(TAG, "workspaces: sesión caducada (" + e.getMessage() + ")");
            synchronized (Workspaces.class) {
                if (g != gen) return;
                prefs(c).edit().remove("state").remove("on").apply();
            }
            cancelJob(c);
            return;
        } catch (Exception e) {
            Log.w(TAG, "workspaces: " + e.getMessage());
            return;
        }
        JSONObject strings;
        List<JSONObject> show = new ArrayList<>();
        synchronized (Workspaces.class) {
            if (g != gen) return;
            JSONObject cur = load(c);
            if (cur == null) return;
            try {
                // lo de esta vuelta (lo visto, el token) encima de lo guardado; las líneas pendientes se juntan
                cur.put("seen", st.optJSONObject("seen"));
                if (!st.optString("idToken", "").isEmpty()) { cur.put("idToken", st.optString("idToken", "")); cur.put("idExp", st.optLong("idExp", 0L)); }
                JSONObject cc = cur.optJSONObject("creds"), sc = st.optJSONObject("creds");
                if (cc != null && sc != null) cc.put("refreshToken", sc.optString("refreshToken", cc.optString("refreshToken", "")));
                strings = WsSync.strings(cur.optJSONObject("creds"));
                JSONObject pend = cur.optJSONObject("lines");
                if (pend == null) pend = new JSONObject();
                // con la app a la vista avisa la página (onSnapshot): aquí solo se apunta lo visto
                if (!MainActivity.visible) {
                    for (WsSync.Group gr : groups) {
                        JSONObject p = pend.optJSONObject(gr.wid);
                        if (p == null) p = new JSONObject().put("lines", new JSONArray()).put("total", 0);
                        JSONArray old = p.optJSONArray("lines");
                        JSONArray lines = new JSONArray();
                        List<String> all = new ArrayList<>();
                        if (old != null) for (int i = 0; i < old.length(); i++) all.add(old.optString(i, ""));
                        all.addAll(gr.lines);
                        for (int i = Math.max(0, all.size() - MAX_LINES); i < all.size(); i++) lines.put(all.get(i));
                        p.put("lines", lines).put("total", p.optInt("total", 0) + gr.lines.size())
                                .put("name", gr.name).put("emoji", gr.emoji).put("color", gr.color).put("wid", gr.wid);
                        pend.put(gr.wid, p);
                        show.add(p);
                    }
                }
                cur.put("lines", pend);
                save(c, cur);
            } catch (Exception e) {
                Log.w(TAG, "workspaces: guardar", e);
                return;
            }
        }
        if (!show.isEmpty()) {
            ensureChannel(c);
            for (JSONObject p : show) notifyGroup(c, p, strings);
        }
    }

    // ---------- notificaciones ----------
    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String name = c.getString(R.string.channel_ws), desc = c.getString(R.string.channel_ws_desc);
        synchronized (Workspaces.class) {
            JSONObject st = load(c);
            JSONObject s = st != null ? st.optJSONObject("creds") : null;
            s = s != null ? s.optJSONObject("strings") : null;
            if (s != null) {
                name = s.optString("channel", name).isEmpty() ? name : s.optString("channel", name);
                desc = s.optString("channelDesc", desc).isEmpty() ? desc : s.optString("channelDesc", desc);
            }
        }
        // (crearlo otra vez con el mismo id solo le cambia el nombre y la descripción: el idioma de la app)
        NotificationChannel ch = new NotificationChannel(CHANNEL, name, NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription(desc);
        ch.enableLights(true);
        ch.setLightColor(0xFFC9B8FF);
        nm.createNotificationChannel(ch);
    }

    static int notifId(String wid) {
        // (negativos: los de los avisos son positivos, de 10000 en adelante)
        return -1 - (wid.hashCode() & 0x3fffffff);
    }

    @SuppressWarnings("deprecation")
    private static void notifyGroup(Context c, JSONObject p, JSONObject strings) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String wid = p.optString("wid", "");
        JSONArray arr = p.optJSONArray("lines");
        List<String> lines = new ArrayList<>();
        if (arr != null) for (int i = 0; i < arr.length(); i++) lines.add(arr.optString(i, ""));
        if (lines.isEmpty()) return;
        int total = Math.max(p.optInt("total", lines.size()), lines.size());
        String emoji = p.optString("emoji", "");
        String title = (emoji.isEmpty() ? "" : emoji + " ") + p.optString("name", "Workspace");
        int id = notifId(wid);

        Notification.InboxStyle inbox = new Notification.InboxStyle().setBigContentTitle(title);
        for (String l : lines) inbox.addLine(l);
        if (total > lines.size()) inbox.setSummaryText(WsSync.fill(strings.optString("more", "y {n} más"), "", "", total - lines.size()));

        Intent dismiss = new Intent(c, AlarmReceiver.class).setAction(ACTION_DISMISS).putExtra("wid", wid);
        dismiss.setData(Uri.parse("zencalendar://ws-dismiss/" + wid));
        PendingIntent del = PendingIntent.getBroadcast(c, id, dismiss, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_zc)
                .setContentTitle(title)
                .setContentText(lines.get(lines.size() - 1))
                .setStyle(inbox)
                .setNumber(total)
                .setColor(Theme.parse(p.optString("color", ""), 0xFFC9B8FF))
                .setContentIntent(Widgets.openPending(c, "workspace", wid, null, id))
                .setDeleteIntent(del)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_SOCIAL)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE);
        if (Build.VERSION.SDK_INT < 26) b.setDefaults(Notification.DEFAULT_ALL);
        try { nm.notify(id, b.build()); } catch (SecurityException ignored) { /* sin permiso de notificaciones */ }
    }

    /** Se ha abierto (o quitado) el aviso de un workspace: se empieza de cero. cancel = quitar la notificación. */
    static void opened(Context c, String wid, boolean cancel) {
        if (wid == null || wid.isEmpty()) return;
        synchronized (Workspaces.class) {
            JSONObject st = load(c);
            JSONObject pend = st != null ? st.optJSONObject("lines") : null;
            if (pend != null && pend.has(wid)) {
                pend.remove(wid);
                save(c, st);
            }
        }
        if (cancel) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(notifId(wid));
        }
    }

    private static void cancelAll(Context c) {
        // (al salir de la cuenta: fuera los avisos que queden de los workspaces)
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        try {
            for (android.service.notification.StatusBarNotification n : nm.getActiveNotifications()) {
                if (n.getId() < 0 && n.getTag() == null) nm.cancel(n.getId());
            }
        } catch (Exception ignored) {}
    }

    // ---------- red ----------
    private static WsSync.Res post(String url, String type, String body, String bearer) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        try {
            con.setConnectTimeout(20000);
            con.setReadTimeout(30000);
            con.setUseCaches(false);
            con.setRequestMethod("POST");
            con.setRequestProperty("Content-Type", type);
            con.setRequestProperty("Accept", "application/json");
            if (bearer != null) con.setRequestProperty("Authorization", "Bearer " + bearer);
            byte[] data = body.getBytes(StandardCharsets.UTF_8);
            con.setDoOutput(true);
            con.setFixedLengthStreamingMode(data.length);
            try (OutputStream os = con.getOutputStream()) { os.write(data); }
            int status = con.getResponseCode();
            InputStream in = status >= 400 ? con.getErrorStream() : con.getInputStream();
            String text = "";
            if (in != null) {
                try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[8192];
                    int n, total = 0;
                    while ((n = is.read(buf)) > 0) {
                        total += n;
                        if (total > 4 * 1024 * 1024) throw new IOException("Respuesta demasiado grande");
                        out.write(buf, 0, n);
                    }
                    text = new String(out.toByteArray(), StandardCharsets.UTF_8);
                }
            }
            return new WsSync.Res(status, text);
        } finally {
            con.disconnect();
        }
    }
}
