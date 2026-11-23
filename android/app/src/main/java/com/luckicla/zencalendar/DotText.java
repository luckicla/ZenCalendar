package com.luckicla.zencalendar;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;

import androidx.core.content.res.ResourcesCompat;

import java.util.Locale;

/**
 * Texto en ZenDot (la fuente de matriz de puntos del diseño Dot) pintado en un
 * Bitmap, para ponerlo en los widgets con setImageViewBitmap: los TextView de
 * RemoteViews no pueden usar una fuente propia de forma fiable en Android 7–7.1
 * (ni con fontFamily en el XML en todos los lanzadores), y un Bitmap se ve igual
 * en todas las versiones.
 *
 * La fuente sale de res/font/zendot.ttf con ResourcesCompat.getFont (androidx.core:
 * funciona desde Android 4 y no hace falta copiarla a assets). Si no se pudiera
 * cargar, se usa la monoespaciada del sistema: el widget sigue funcionando.
 */
final class DotText {
    private static final String TAG = "ZenCalendar";
    private static Typeface face;
    private static boolean tried;

    // métricas de ZenDot (en «em»; ver tools/mkfont.py)
    private static final float CAP = 0.68f;    // alto de las cifras y las mayúsculas
    private static final float SIDE = 0.06f;   // margen a cada lado de cada glifo (paso 0,1 − radio 0,04)
    private static final int MAX_PX = 2048;    // ningún bitmap más ancho que esto

    private DotText() {}

    static synchronized Typeface face(Context c) {
        if (!tried) {
            tried = true;
            try {
                face = ResourcesCompat.getFont(c, R.font.zendot);
            } catch (Exception e) {
                Log.w(TAG, "ZenDot", e);
            }
        }
        return face != null ? face : Typeface.MONOSPACE;
    }

    /** Un trozo de texto con su color. */
    static final class Span {
        final String text;
        final int color;

        Span(String text, int color) {
            this.text = text == null ? "" : text;
            this.color = color;
        }
    }

    static Span span(String text, int color) {
        return new Span(text, color);
    }

    /** «lun.» → «LUN», «nov.» → «NOV» (las abreviaturas de las fechas, en mayúsculas y sin puntos). */
    static String label(String s) {
        if (s == null) return "";
        return s.replace(".", "").trim().toUpperCase(Locale.getDefault());
    }

    /**
     * Pinta los trozos seguidos, en una línea, a sp de tamaño (escala con el
     * tamaño de letra del sistema, como el resto del widget). El bitmap mide lo
     * justo: de alto, la altura de las mayúsculas (más lo que suban los acentos o
     * bajen las colas) y de ancho, desde el primer punto hasta el último.
     */
    static Bitmap draw(Context c, float sp, Span... spans) {
        DisplayMetrics dm = c.getResources().getDisplayMetrics();
        float px = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, dm);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTypeface(face(c));
        p.setTextSize(px);

        float[] widths = new float[spans.length];
        float total = 0;
        int inkTop = 0, inkBottom = 0;
        Rect r = new Rect();
        for (int i = 0; i < spans.length; i++) {
            String s = spans[i].text;
            if (s.isEmpty()) continue;
            widths[i] = p.measureText(s);
            total += widths[i];
            p.getTextBounds(s, 0, s.length(), r);
            inkTop = Math.min(inkTop, r.top);
            inkBottom = Math.max(inkBottom, r.bottom);
        }
        int pad = Math.max(1, Math.round(px * 0.02f));
        int side = Math.round(px * SIDE);
        int top = Math.max(Math.round(px * CAP), -inkTop) + pad;   // del borde de arriba a la línea base
        int bottom = Math.max(0, inkBottom) + pad;
        int w = (int) Math.ceil(total) - 2 * side + 2 * pad + 1;   // (+1: el borde suavizado del último punto)
        w = Math.max(1, Math.min(w, MAX_PX));
        int h = Math.max(1, Math.min(top + bottom, MAX_PX));

        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        b.setDensity(dm.densityDpi);
        Canvas cv = new Canvas(b);
        float x = pad - side;
        for (int i = 0; i < spans.length; i++) {
            if (spans[i].text.isEmpty()) continue;
            p.setColor(spans[i].color);
            cv.drawText(spans[i].text, x, top, p);
            x += widths[i];
        }
        return b;
    }

    /** Lo mismo con un solo color. */
    static Bitmap draw(Context c, float sp, String text, int color) {
        return draw(c, sp, span(text, color));
    }
}
