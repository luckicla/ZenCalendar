package com.luckicla.zencalendar;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.HapticFeedbackConstants;
import android.view.View;

/**
 * Vibraciones cortitas de la interfaz (ZC.platform.haptic): un toque suave al
 * tocar, otro algo más firme al elegir, tres que suben al terminar algo bien y
 * uno largo para avisar; con el diseño Dot, «glyph»: dos golpes secos. Como en MixUp: con VibrationEffect en Android 8+ y,
 * si el móvil no deja, el «háptico» normal de la vista.
 */
final class Haptics {
    private Haptics() {}

    // {tiempos en ms (pausa, vibra, pausa, vibra…)}, {fuerza 0-255}
    private static long[] t(long... v) { return v; }
    private static int[] a(int... v) { return v; }

    static void play(Context ctx, View view, String kind) {
        long[] tm; int[] am;
        switch (kind == null ? "" : kind) {
            case "select":  tm = t(0, 9);                  am = a(0, 130); break;
            case "success": tm = t(0, 12, 60, 12, 60, 24); am = a(0, 100, 0, 150, 0, 230); break;
            case "warning": tm = t(0, 22, 50, 22);         am = a(0, 220, 0, 220); break;
            // diseño Dot: dos golpecitos secos y cortos, como un punto que se enciende
            case "glyph":   tm = t(0, 5, 34, 4);           am = a(0, 255, 0, 170); break;
            case "tap":
            default:        tm = t(0, 6);                  am = a(0, 80); break;
        }
        try {
            if (Build.VERSION.SDK_INT < 26) throw new IllegalStateException();
            Vibrator v;
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                v = vm == null ? null : vm.getDefaultVibrator();
            } else {
                v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (v == null || !v.hasVibrator()) return;
            if (v.hasAmplitudeControl()) v.vibrate(VibrationEffect.createWaveform(tm, am, -1));
            else v.vibrate(VibrationEffect.createWaveform(tm, -1));
        } catch (Exception e) {
            if (view != null) {
                view.performHapticFeedback("warning".equals(kind) || "success".equals(kind)
                        ? HapticFeedbackConstants.LONG_PRESS : HapticFeedbackConstants.KEYBOARD_TAP);
            }
        }
    }
}
