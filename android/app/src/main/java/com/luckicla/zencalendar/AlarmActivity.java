package com.luckicla.zencalendar;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.lang.ref.WeakReference;

/**
 * La alarma en pantalla completa, encima del bloqueo (la abre el setFullScreenIntent
 * de AlarmReceiver.showAlarm). El sonido es el de la notificación: «Parar» y
 * «Posponer 10 min» quitan la notificación y con ella el sonido.
 * Sin WebView ni XML: se dibuja aquí mismo, para que salga al instante.
 */
public class AlarmActivity extends Activity {
    private static WeakReference<AlarmActivity> current;
    private int code;
    private JSONObject item;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        overLock();
        current = new WeakReference<>(this);
        build(getIntent());
        // (si nadie la para, se va con la notificación a los 10 minutos)
        handler.postDelayed(this::finish, AlarmReceiver.ALARM_RING_MS);
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        build(i);
    }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (current != null && current.get() == this) current = null;
        super.onDestroy();
    }

    // «Atrás» no para la alarma: solo esconde esta pantalla (la notificación sigue sonando)
    @Override public void onBackPressed() { finish(); }

    /** La cierra si está enseñando esa alarma (al pararla o posponerla desde la notificación). */
    static void closeFor(int code) {
        AlarmActivity a = current != null ? current.get() : null;
        if (a != null && a.code == code) a.finish();
    }

    private void overLock() {
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void build(Intent i) {
        try { item = new JSONObject(i.getStringExtra("item")); } catch (Exception e) { finish(); return; }
        code = i.getIntExtra("code", Alarms.code(item.optString("id")));
        float d = getResources().getDisplayMetrics().density;
        int accent = Theme.parse(item.optString("color"), 0xFFC9B8FF);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        int pad = (int) (28 * d);
        root.setPadding(pad, pad, pad, pad);
        root.setBackgroundColor(0xFF1E1A2B);

        TextView icon = text("⏰", 64, 0xFFFFFFFF, false);
        TextView kind = text(Alarms.str(this, "alarm", R.string.alarm), 16, 0xFFCFC6E6, false);
        TextView title = text(item.optString("title", "ZenCalendar"), 30, 0xFFFFFFFF, true);
        TextView body = text(item.optString("body", ""), 18, 0xFFCFC6E6, false);
        root.addView(icon, wrap(0));
        root.addView(kind, wrap((int) (8 * d)));
        root.addView(title, wrap((int) (10 * d)));
        root.addView(body, wrap((int) (6 * d)));

        TextView stop = button(Alarms.str(this, "stop", R.string.stop), accent, 0xFF2B2340, d);
        TextView snooze = button(Alarms.str(this, "snooze", R.string.snooze), 0xFF3A3350, 0xFFFFFFFF, d);
        stop.setOnClickListener(v -> { AlarmReceiver.stop(this, item, code); finish(); });
        snooze.setOnClickListener(v -> { AlarmReceiver.snooze(this, item, code); finish(); });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (int) (64 * d));
        lp.topMargin = (int) (48 * d);
        root.addView(stop, lp);
        LinearLayout.LayoutParams lp2 = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (int) (56 * d));
        lp2.topMargin = (int) (14 * d);
        root.addView(snooze, lp2);
        setContentView(root);
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        if (s.isEmpty()) t.setVisibility(View.GONE);
        return t;
    }

    private TextView button(String s, int bg, int fg, float d) {
        TextView t = text(s, 18, fg, true);
        GradientDrawable g = new GradientDrawable();
        g.setColor(bg);
        g.setCornerRadius(32 * d);
        t.setBackground(g);
        t.setClickable(true);
        t.setFocusable(true);
        return t;
    }

    private static LinearLayout.LayoutParams wrap(int top) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = top;
        return lp;
    }
}
