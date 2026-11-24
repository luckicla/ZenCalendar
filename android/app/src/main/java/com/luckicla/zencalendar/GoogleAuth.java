package com.luckicla.zencalendar;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;

import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Scope;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Inicio de sesión de Google con AuthorizationClient (Google Play Services).
 * No hace falta client secret: Google reconoce la app por el paquete y la
 * huella SHA-1 de la firma (docs/GOOGLE-SETUP.md).
 *  - Drive (authorize): la cuenta que elija Google. Devuelve { token }.
 *  - Google Calendar (account): una cuenta concreta (setAccount). Para añadir
 *    una, primero el selector de cuentas del sistema (AccountManager.newChooseAccountIntent,
 *    que no necesita ningún permiso). Devuelve { token, email }.
 * Si algo falla: { needsConsent | cancelled | error, network }.
 */
final class GoogleAuth {
    static final int REQ = 7301, REQ_PICK = 7302, REQ_CAL = 7303;
    private static final String CAL_SCOPES = "https://www.googleapis.com/auth/calendar openid email profile";
    private static String pendingId;
    // Google Calendar: la petición en marcha (el selector de cuentas y luego, quizá, la pantalla de permiso)
    private static String calId, calEmail, calScopes;

    static void authorize(MainActivity a, String cbId, boolean interactive, String scopes) {
        List<Scope> list = new ArrayList<>();
        for (String s : (scopes == null || scopes.isEmpty() ? "https://www.googleapis.com/auth/drive.appdata openid email profile" : scopes).split("\\s+")) {
            if (!s.isEmpty()) list.add(new Scope(s));
        }
        AuthorizationRequest req = AuthorizationRequest.builder().setRequestedScopes(list).build();
        Identity.getAuthorizationClient(a).authorize(req)
                .addOnSuccessListener(res -> {
                    if (res.hasResolution()) {
                        // hay que preguntar al usuario (la primera vez, o si quitó el permiso)
                        if (!interactive) { a.callback(cbId, json("needsConsent", true)); return; }
                        PendingIntent pi = res.getPendingIntent();
                        if (pi == null) { a.callback(cbId, json("error", "Google no dio la pantalla de permiso")); return; }
                        try {
                            pendingId = cbId;
                            a.startIntentSenderForResult(pi.getIntentSender(), REQ, null, 0, 0, 0);
                        } catch (Exception e) {
                            pendingId = null;
                            a.callback(cbId, json("error", String.valueOf(e.getMessage())));
                        }
                    } else {
                        a.callback(cbId, json("token", res.getAccessToken()));
                    }
                })
                .addOnFailureListener(e -> a.callback(cbId, error(e)));
    }

    /** Vuelta de la pantalla de permiso de Google (MainActivity.onActivityResult). */
    static void onResult(MainActivity a, int resultCode, Intent data) {
        String id = pendingId;
        pendingId = null;
        if (id == null) return;
        if (resultCode != Activity.RESULT_OK || data == null) { a.callback(id, json("cancelled", true)); return; }
        try {
            AuthorizationResult r = Identity.getAuthorizationClient(a).getAuthorizationResultFromIntent(data);
            a.callback(id, json("token", r.getAccessToken()));
        } catch (ApiException e) {
            a.callback(id, error(e));
        }
    }

    // ---------- Google Calendar: una cuenta concreta ----------

    /** email vacío = añadir: primero el selector de cuentas de Google del sistema. */
    static void account(MainActivity a, String cbId, String email, boolean interactive, String scopes) {
        String sc = scopes == null || scopes.isEmpty() ? CAL_SCOPES : scopes;
        if (email == null || email.isEmpty()) {
            if (calId != null) a.callback(calId, json("cancelled", true));
            calId = cbId; calEmail = null; calScopes = sc;
            try {
                Intent pick = AccountManager.newChooseAccountIntent(null, null, new String[]{"com.google"}, null, null, null, null);
                a.startActivityForResult(pick, REQ_PICK);
            } catch (Exception e) {
                calId = null;
                a.callback(cbId, json("error", "No se pudo abrir el selector de cuentas"));
            }
            return;
        }
        authorizeAccount(a, cbId, email, interactive, sc);
    }

    private static void authorizeAccount(MainActivity a, String cbId, String email, boolean interactive, String scopes) {
        List<Scope> list = new ArrayList<>();
        for (String s : scopes.split("\\s+")) if (!s.isEmpty()) list.add(new Scope(s));
        AuthorizationRequest req = AuthorizationRequest.builder()
                .setRequestedScopes(list)
                .setAccount(new Account(email, "com.google"))
                .build();
        Identity.getAuthorizationClient(a).authorize(req)
                .addOnSuccessListener(res -> {
                    if (res.hasResolution()) {
                        if (!interactive) { a.callback(cbId, json("needsConsent", true)); return; }
                        PendingIntent pi = res.getPendingIntent();
                        if (pi == null) { a.callback(cbId, json("error", "Google no dio la pantalla de permiso")); return; }
                        try {
                            if (calId != null && !calId.equals(cbId)) a.callback(calId, json("cancelled", true));
                            calId = cbId; calEmail = email;
                            a.startIntentSenderForResult(pi.getIntentSender(), REQ_CAL, null, 0, 0, 0);
                        } catch (Exception e) {
                            calId = null;
                            a.callback(cbId, json("error", String.valueOf(e.getMessage())));
                        }
                    } else {
                        a.callback(cbId, tokenJson(res.getAccessToken(), email));
                    }
                })
                .addOnFailureListener(e -> a.callback(cbId, error(e)));
    }

    /** Vuelta del selector de cuentas (MainActivity.onActivityResult). */
    static void onPickResult(MainActivity a, int resultCode, Intent data) {
        String id = calId;
        if (id == null) return;
        String email = resultCode == Activity.RESULT_OK && data != null ? data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME) : null;
        if (email == null || email.isEmpty()) { calId = null; a.callback(id, json("cancelled", true)); return; }
        calEmail = email;
        authorizeAccount(a, id, email, true, calScopes != null ? calScopes : CAL_SCOPES);
    }

    /** Vuelta de la pantalla de permiso de Google Calendar. */
    static void onCalResult(MainActivity a, int resultCode, Intent data) {
        String id = calId, email = calEmail;
        calId = null; calEmail = null;
        if (id == null) return;
        if (resultCode != Activity.RESULT_OK || data == null) { a.callback(id, json("cancelled", true)); return; }
        try {
            AuthorizationResult r = Identity.getAuthorizationClient(a).getAuthorizationResultFromIntent(data);
            a.callback(id, tokenJson(r.getAccessToken(), email));
        } catch (ApiException e) {
            a.callback(id, error(e));
        }
    }

    private static String tokenJson(String token, String email) {
        try {
            JSONObject o = new JSONObject();
            o.put("token", token);
            o.put("email", email == null ? "" : email);
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /** Al desconectar: que Play Services olvide el token. */
    static void clear(Activity a, String token) {
        new Thread(() -> {
            try { GoogleAuthUtil.clearToken(a.getApplicationContext(), token); } catch (Exception ignored) {}
        }).start();
    }

    private static String error(Exception e) {
        try {
            JSONObject o = new JSONObject();
            o.put("error", e.getMessage() != null ? e.getMessage() : "No se pudo conectar con Google");
            if (e instanceof ApiException) {
                int code = ((ApiException) e).getStatusCode();
                o.put("code", code);
                if (code == CommonStatusCodes.NETWORK_ERROR) o.put("network", true);
                if (code == CommonStatusCodes.CANCELED) o.put("cancelled", true);
            }
            return o.toString();
        } catch (Exception x) {
            return "{\"error\":\"Google\"}";
        }
    }

    private static String json(String k, Object v) {
        try { return new JSONObject().put(k, v).toString(); } catch (Exception e) { return "{}"; }
    }

    private GoogleAuth() {}
}
