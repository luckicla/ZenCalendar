package com.luckicla.zencalendar;

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
 * Inicio de sesión de Google para Drive con AuthorizationClient (Google Play
 * Services). No hace falta client secret: Google reconoce la app por el
 * paquete y la huella SHA-1 de la firma (docs/GOOGLE-SETUP.md).
 * Devuelve a la página { token } o { needsConsent | cancelled | error, network }.
 */
final class GoogleAuth {
    static final int REQ = 7301;
    private static String pendingId;

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
