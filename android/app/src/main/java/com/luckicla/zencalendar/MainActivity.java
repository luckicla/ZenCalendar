package com.luckicla.zencalendar;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.lang.ref.WeakReference;

/**
 * ZenCalendar para Android: la misma interfaz de Windows y de la web (web/)
 * dentro de un WebView, servida con WebViewAssetLoader desde
 * https://appassets.androidplatform.net/assets/web/index.html, y un puente
 * (window.ZCAndroid, Bridge.java) para lo que la web sola no puede: avisos,
 * widgets, Google, peticiones sin CORS, iconos…
 */
public class MainActivity extends Activity {
    static final String TAG = "ZenCalendar";
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final String START = ORIGIN + "/assets/web/index.html";
    static final String ACTION_OPEN = "com.luckicla.zencalendar.OPEN";
    static final int REQ_FILE = 7201, REQ_NOTIF = 7202;

    private static WeakReference<MainActivity> current = new WeakReference<>(null);
    // la app está a la vista (los avisos de workspaces los da entonces la página, no Workspaces)
    static volatile boolean visible;
    private final Handler main = new Handler(Looper.getMainLooper());

    private FrameLayout box;
    private WebView web;
    private WebViewAssetLoader loader;
    private boolean pageReady;
    private ValueCallback<Uri[]> fileCb;
    private Uri photoUri;
    private String notifCbId;
    // lo que abrió la app (notificación, widget, compartir) hasta que la página lo recoge
    private String pendingOpen, pendingShared;
    // márgenes del sistema (barra de estado y de navegación) en px CSS
    private int insetTop, insetBottom, insetLeft, insetRight;
    // false: el WebView deja sitio a las barras (el hueco se pinta del color del tema);
    // true: la página llega hasta los bordes y usa --zc-safe-* (ZC.platform.setEdgeToEdge)
    private boolean edge = false;

    // ---------- ciclo de vida ----------
    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        current = new WeakReference<>(this);
        Alarms.ensureChannel(this);
        Alarms.ensureAlarmChannel(this);
        edgeToEdge();

        box = new FrameLayout(this);
        web = new WebView(this);
        box.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(box);
        setupInsets();
        setupWeb();
        applyTheme();
        handleIntent(getIntent());
        web.loadUrl(START);
        // los avisos y los widgets, por si la app llevaba tiempo cerrada
        Alarms.schedule(this);
        Widgets.scheduleTicks(this);
        Workspaces.ensureJob(this);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override protected void onResume() {
        super.onResume();
        visible = true;
        // (vuelta de Ajustes → «Instalar apps desconocidas»: sigue la actualización)
        Updater.resume(this);
        js("window.dispatchEvent(new Event('zc-resume'))");
    }

    @Override protected void onPause() {
        visible = false;
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (fileCb != null) { fileCb.onReceiveValue(null); fileCb = null; }
        if (current.get() == this) current = new WeakReference<>(null);
        if (web != null) {
            box.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // El botón atrás primero pregunta a la página (cerrar una hoja, un panel…);
    // si no tiene nada que cerrar, la app se va al fondo (no se cierra).
    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() {
        if (web == null || !pageReady) { moveTaskToBack(true); return; }
        web.evaluateJavascript("(window.ZC&&ZC.platform&&ZC.platform._back)?String(ZC.platform._back()):'false'", v -> {
            if (v == null || !v.contains("true")) moveTaskToBack(true);
        });
    }

    @Override public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        // claro/oscuro del sistema: la página puede seguirlo (matchMedia ya avisa), y los widgets
        Widgets.updateAll(this);
    }

    // ---------- el WebView ----------
    private void setupWeb() {
        loader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        // Las peticiones de un service worker no pasan por el WebViewClient: sin esto, uno que se
        // quedó registrado (las versiones 1.0.0–1.1.2 lo registraban también aquí) iba a buscar la
        // app a internet, a appassets.androidplatform.net, que no existe, y la página salía «sin
        // conexión». Así las atiende el mismo cargador y la página lo da de baja al arrancar.
        try {
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest r) {
                    return loader.shouldInterceptRequest(r.getUrl());
                }
            });
        } catch (Throwable t) { Log.w(TAG, "service worker", t); }
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        web.setBackgroundColor(Theme.load(this).bg);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " ZenCalendarAndroid");
        web.addJavascriptInterface(new Bridge(this), "ZCAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }

            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                // enlaces de fuera (mapas, webs, correo…): en su app
                openExternal(u);
                return true;
            }

            @Override public void onPageFinished(WebView v, String url) {
                pageReady = true;
                pushInsets();
                // lo que llegó mientras cargaba (después de que la página mirase takeOpen):
                // ZC.platform._open lo guarda hasta que alguien escuche
                String o = takeOpen(), s = takeShared();
                if (!o.isEmpty()) js("window.ZC&&ZC.platform&&ZC.platform._open(" + Bridge.quote(o) + ")");
                if (!s.isEmpty()) js("window.ZC&&ZC.platform&&ZC.platform._open(" + Bridge.quote(s) + ")");
            }

            // Android cerró el proceso de la página (poca memoria): se rehace en vez de dejar la pantalla en blanco
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                Log.w(TAG, "la página se cerró; se vuelve a cargar");
                if (v == web) {
                    box.removeView(web);
                    web.destroy();
                    web = new WebView(MainActivity.this);
                    box.addView(web, 0, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
                    pageReady = false;
                    setupWeb();
                    web.loadUrl(START);
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // el selector de imágenes (adjuntos, foto → eventos), con la cámara como opción
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    Intent pick = params.createIntent();
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    boolean images = false;
                    for (String t : params.getAcceptTypes()) if (t == null || t.isEmpty() || t.startsWith("image")) images = true;
                    Intent chooser = Intent.createChooser(pick, getString(R.string.pick_image));
                    photoUri = null;
                    if (images) {
                        Intent cam = cameraIntent();
                        if (cam != null) {
                            if (params.isCaptureEnabled()) chooser = cam;
                            else chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
                        }
                    }
                    startActivityForResult(chooser, REQ_FILE);
                    return true;
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
            }

            @Override public void onPermissionRequest(PermissionRequest r) {
                r.deny(); // (la página no usa cámara ni micro directamente)
            }

            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.w(TAG, m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
    }

    private Intent cameraIntent() {
        try {
            Intent cam = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            if (cam.resolveActivity(getPackageManager()) == null) return null;
            File dir = new File(getCacheDir(), "fotos");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File f = new File(dir, "foto-" + System.currentTimeMillis() + ".jpg");
            photoUri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
            cam.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, photoUri);
            cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return cam;
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("deprecation")
    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_FILE && fileCb != null) {
            Uri[] out = WebChromeClient.FileChooserParams.parseResult(res, data);
            if (out == null && data != null && data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                out = new Uri[n];
                for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
            }
            // la foto de la cámara no vuelve en «data»: está en photoUri
            if (out == null && res == RESULT_OK && photoUri != null) out = new Uri[]{photoUri};
            fileCb.onReceiveValue(out);
            fileCb = null;
            photoUri = null;
        } else if (req == GoogleAuth.REQ) {
            GoogleAuth.onResult(this, res, data);
        } else if (req == GoogleAuth.REQ_PICK) {
            GoogleAuth.onPickResult(this, res, data);
        } else if (req == GoogleAuth.REQ_CAL) {
            GoogleAuth.onCalResult(this, res, data);
        }
    }

    // ---------- de Java a la página ----------
    void js(String code) {
        main.post(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    /** Respuesta a una llamada asíncrona de la página (ZC.native._cb). */
    void callback(String id, String json) {
        js("window.ZC&&ZC.native&&ZC.native._cb(" + Bridge.quote(id) + "," + Bridge.quote(json) + ")");
    }

    static MainActivity current() { return current.get(); }

    /** Estado de la actualización de Android (Updater) → ZC.platform._update. */
    static void sendUpdate(String json) {
        MainActivity a = current.get();
        if (a != null) a.js("window.ZC&&ZC.platform&&ZC.platform._update&&ZC.platform._update(" + json + ")");
    }

    /** «Hecho» en una notificación con la app abierta: que la página lo recoja ya. */
    static void pokeActions() {
        MainActivity a = current.get();
        if (a != null) a.js("window.dispatchEvent(new Event('zc-actions'))");
    }

    // ---------- lo que abre la app ----------
    private void handleIntent(Intent i) {
        if (i == null) return;
        try {
            String action = i.getAction();
            if (ACTION_OPEN.equals(action)) {
                JSONObject o = new JSONObject();
                String what = i.getStringExtra("action");
                o.put("action", what != null ? what : "open");
                if (i.getStringExtra("id") != null) o.put("id", i.getStringExtra("id"));
                if (i.getStringExtra("date") != null) o.put("date", i.getStringExtra("date"));
                // aviso de un workspace: se abre ese workspace y sus líneas pendientes se olvidan
                if ("workspace".equals(what) && i.getStringExtra("id") != null) {
                    o.put("wid", i.getStringExtra("id"));
                    Workspaces.opened(this, i.getStringExtra("id"), true);
                }
                deliverOpen(o.toString());
            } else if (Intent.ACTION_VIEW.equals(action)) {
                // invitación a un workspace: zencalendar://join/#<wid>.<token> (también con la app cerrada:
                // deliverOpen lo guarda hasta que la página lo recoge). Desde «Recientes» no se repite.
                String code = Workspaces.joinCode(i.getData());
                if (code != null && (i.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0) {
                    JSONObject o = new JSONObject();
                    o.put("action", "join");
                    o.put("code", code);
                    deliverOpen(o.toString());
                }
            } else if (Intent.ACTION_SEND.equals(action)) {
                JSONObject o = new JSONObject();
                o.put("action", "ai");
                String text = i.getStringExtra(Intent.EXTRA_TEXT);
                String subject = i.getStringExtra(Intent.EXTRA_SUBJECT);
                if (subject != null && text != null && !text.contains(subject)) text = subject + "\n" + text;
                if (text != null) o.put("text", text);
                String type = i.getType();
                if (type != null && type.startsWith("image/")) {
                    @SuppressWarnings("deprecation") Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM);
                    if (u != null) {
                        byte[] img = readAll(u, 12 * 1024 * 1024);
                        if (img != null) {
                            o.put("image", Base64.encodeToString(img, Base64.NO_WRAP));
                            o.put("imageType", type);
                        }
                    }
                }
                synchronized (this) { pendingShared = o.toString(); }
                if (pageReady) { String s = takeShared(); if (!s.isEmpty()) js("window.ZC&&ZC.platform&&ZC.platform._open(" + Bridge.quote(s) + ")"); }
            }
        } catch (Exception e) {
            Log.w(TAG, "intent", e);
        }
        // (que no se repita al girar o volver)
        i.setAction(null);
    }

    private void deliverOpen(String json) {
        if (pageReady) js("window.ZC&&ZC.platform&&ZC.platform._open(" + Bridge.quote(json) + ")");
        else synchronized (this) { pendingOpen = json; }
    }

    synchronized String takeOpen() { String s = pendingOpen; pendingOpen = null; return s != null ? s : ""; }
    synchronized String takeShared() { String s = pendingShared; pendingShared = null; return s != null ? s : ""; }

    private byte[] readAll(Uri u, int max) {
        try (InputStream in = getContentResolver().openInputStream(u); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) return null;
            byte[] buf = new byte[16384];
            int n, total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > max) return null;
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    void openExternal(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            Log.w(TAG, "no se pudo abrir " + u);
        }
    }

    // ---------- notificaciones ----------
    void askNotifications(String id) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notifCbId = id;
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        } else {
            callback(id, "{\"granted\":" + new Bridge(this).notificationsAllowed() + "}");
        }
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == REQ_NOTIF && notifCbId != null) {
            boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            callback(notifCbId, "{\"granted\":" + ok + "}");
            notifCbId = null;
        }
    }

    // ---------- pantalla completa con la barra de estado transparente ----------
    @SuppressWarnings("deprecation")
    private void edgeToEdge() {
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {
            w.setStatusBarContrastEnforced(false);
            w.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            View d = w.getDecorView();
            d.setSystemUiVisibility(d.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    /**
     * La página va de borde a borde: los márgenes de las barras del sistema se
     * le pasan como variables CSS (--zc-safe-top, --zc-safe-bottom…). Con el
     * teclado abierto, el WebView se encoge (como adjustResize).
     */
    @SuppressWarnings("deprecation")
    private void setupInsets() {
        box.setOnApplyWindowInsetsListener((v, ins) -> {
            float dens = getResources().getDisplayMetrics().density;
            int top, bottom, left, right, ime;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets kb = ins.getInsets(WindowInsets.Type.ime());
                top = bars.top; bottom = bars.bottom; left = bars.left; right = bars.right;
                ime = kb.bottom;
            } else {
                top = ins.getSystemWindowInsetTop();
                left = ins.getSystemWindowInsetLeft();
                right = ins.getSystemWindowInsetRight();
                int sys = ins.getSystemWindowInsetBottom();
                int stable = ins.getStableInsetBottom();
                // en los Android de antes el teclado va dentro del margen de abajo
                if (sys > stable + Math.round(80 * dens)) { ime = sys; bottom = stable; }
                else { ime = 0; bottom = sys; }
            }
            if (edge) {
                v.setPadding(0, 0, 0, ime > bottom ? ime : 0);
                insetTop = Math.round(top / dens);
                insetBottom = ime > bottom ? 0 : Math.round(bottom / dens);
                insetLeft = Math.round(left / dens);
                insetRight = Math.round(right / dens);
            } else {
                // (sin borde a borde: las barras quedan fuera de la página, con el color del tema detrás)
                v.setPadding(left, top, right, Math.max(bottom, ime));
                insetTop = insetBottom = insetLeft = insetRight = 0;
            }
            pushInsets();
            return ins;
        });
    }

    /** La página dice si sabe dibujar detrás de las barras (con --zc-safe-*). */
    void setEdge(boolean on) {
        if (edge == on) return;
        edge = on;
        box.requestApplyInsets();
    }

    View webView() { return web; }

    String insetsJson() {
        return "{\"top\":" + insetTop + ",\"bottom\":" + insetBottom + ",\"left\":" + insetLeft + ",\"right\":" + insetRight + "}";
    }

    private void pushInsets() {
        js("(function(s){s.setProperty('--zc-safe-top','" + insetTop + "px');s.setProperty('--zc-safe-bottom','" + insetBottom + "px');"
                + "s.setProperty('--zc-safe-left','" + insetLeft + "px');s.setProperty('--zc-safe-right','" + insetRight + "px');"
                + "window.dispatchEvent(new Event('zc-insets'))})(document.documentElement.style)");
    }

    /**
     * Barra de estado y de navegación según el tema: iconos oscuros si el fondo es claro.
     * En Dot detrás va el negro o el blanco del tema, siempre opaco (nada de transparencias
     * del fondo animado de Zen), y en Android 9+ sin la rayita de separación de la barra de navegación.
     */
    @SuppressWarnings("deprecation")
    void applyTheme() {
        Theme t = Theme.load(this);
        int back = t.barColor();
        if (web != null) web.setBackgroundColor(back);
        if (box != null) box.setBackgroundColor(back);
        getWindow().getDecorView().setBackgroundColor(back);
        if (Build.VERSION.SDK_INT >= 28) {
            try { getWindow().setNavigationBarDividerColor(Color.TRANSPARENT); } catch (Exception ignored) {}
        }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(t.light ? mask : 0, mask);
            }
        } else {
            View d = getWindow().getDecorView();
            int f = d.getSystemUiVisibility();
            int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | (Build.VERSION.SDK_INT >= 26 ? View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
            d.setSystemUiVisibility(t.light ? (f | light) : (f & ~light));
        }
    }

    // ---------- iconos de la app: un activity-alias por variante ----------
    static final String[] ICONS = {"pastel", "sakura", "menta", "noche", "cielo", "melocoton", "dot",
            "dot_blanco", "dot_rojo", "dot_mes", "dot_z", "dot_glyph", "dot_reloj"};

    private static boolean iconOn(Context c, PackageManager pm, String n) {
        int st = pm.getComponentEnabledSetting(new ComponentName(c, c.getPackageName() + ".Icon_" + n));
        if (st == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return n.equals(ICONS[0]);
        return st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    /** Cambia el icono: primero se enciende el nuevo y luego se apagan los demás (siempre queda uno). */
    static void setAppIcon(Context c, String name) {
        boolean known = false;
        for (String n : ICONS) known |= n.equals(name);
        if (!known) name = ICONS[0];
        PackageManager pm = c.getPackageManager();
        try {
            if (!iconOn(c, pm, name)) {
                pm.setComponentEnabledSetting(new ComponentName(c, c.getPackageName() + ".Icon_" + name),
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            }
            for (String n : ICONS) {
                if (!n.equals(name) && iconOn(c, pm, n)) {
                    pm.setComponentEnabledSetting(new ComponentName(c, c.getPackageName() + ".Icon_" + n),
                            PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "icono", e);
        }
    }
}
