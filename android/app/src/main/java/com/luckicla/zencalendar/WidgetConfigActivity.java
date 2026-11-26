package com.luckicla.zencalendar;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/**
 * «¿Qué enseña este widget?»: sale al poner un widget de ZenCalendar, al mantenerlo pulsado →
 * Configurar (Android 12+) y desde Ajustes → Widgets de la app. Una tarjeta con los colores del
 * tema: todo, solo mi calendario, lo que esté abierto en la app o escoger los workspaces a mano.
 * Se hace con vistas normales (sin la página): tiene que abrirse al momento, con la app cerrada.
 */
public class WidgetConfigActivity extends Activity {
    static final String EXTRA_RECONFIGURE = "reconfigure";

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private WidgetConfig cfg;
    private final List<CheckBox> checks = new ArrayList<>();
    private final List<String> checkIds = new ArrayList<>();
    private LinearLayout pickBox;
    private Theme t;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Intent in = getIntent();
        if (in != null) widgetId = in.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        boolean reconfigure = in.getBooleanExtra(EXTRA_RECONFIGURE, false)
                || Theme.prefs(this).contains("wcfg_" + widgetId);

        List<WidgetConfig.Ws> spaces = WidgetConfig.workspaces(this);
        cfg = WidgetConfig.load(this, widgetId);
        if (!reconfigure) {
            // un widget nuevo: con workspaces, de entrada todo; sin ellos, mi calendario
            cfg.src = spaces.isEmpty() ? WidgetConfig.PERSONAL : WidgetConfig.ALL;
            cfg.save(this, widgetId);
        }
        // (si se sale con «atrás», el widget se queda puesto con lo de por defecto, no desaparece)
        done(false);

        t = Theme.load(this);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        build(spaces);
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private String s(String key, String def) {
        return Widgets.str(this, key, def);
    }

    private int surface() { return t.dot ? t.wBg() : (t.surface | 0xFF000000); }
    private int fg() { return t.wFg(); }
    private int muted() { return t.wMuted(); }

    private void build(List<WidgetConfig.Ws> spaces) {
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(22), dp(22), dp(22), dp(14));
        GradientDrawable card = new GradientDrawable();
        card.setColor(surface());
        card.setCornerRadius(dp(t.dot ? 28 : Math.max(16, t.radius)));
        if (t.dot) card.setStroke(dp(1), (fg() & 0x00FFFFFF) | 0x2E000000);
        scroll.setBackground(card);
        scroll.addView(box);

        TextView title = new TextView(this);
        title.setText(s("wTitle", getString(R.string.wcfg_title)));
        title.setTextColor(fg());
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        box.addView(title);

        ColorStateList tint = new ColorStateList(
                new int[][]{{android.R.attr.state_checked}, {}},
                new int[]{t.accent | 0xFF000000, muted()});

        RadioGroup group = new RadioGroup(this);
        group.setOrientation(RadioGroup.VERTICAL);
        group.setPadding(0, dp(12), 0, 0);
        String[][] opts = {
                {WidgetConfig.ALL, s("wAll", getString(R.string.wcfg_all)), null},
                {WidgetConfig.PERSONAL, s("wPersonal", getString(R.string.wcfg_personal)), null},
                {WidgetConfig.CURRENT, s("wCurrent", getString(R.string.wcfg_current)), s("wCurrentSub", getString(R.string.wcfg_current_sub))},
                {WidgetConfig.PICK, s("wPick", getString(R.string.wcfg_pick)), null},
        };
        for (int i = 0; i < opts.length; i++) {
            RadioButton r = new RadioButton(this);
            r.setId(View.generateViewId());
            r.setTag(opts[i][0]);
            r.setTextColor(fg());
            r.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            r.setButtonTintList(tint);
            r.setPadding(dp(6), dp(10), 0, dp(10));
            if (opts[i][2] != null) {
                SpannableString sp = new SpannableString(opts[i][1] + "\n" + opts[i][2]);
                sp.setSpan(new ForegroundColorSpan(muted()), opts[i][1].length() + 1, sp.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                sp.setSpan(new android.text.style.RelativeSizeSpan(0.82f), opts[i][1].length() + 1, sp.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                r.setText(sp);
            } else {
                r.setText(opts[i][1]);
            }
            group.addView(r, new RadioGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            if (opts[i][0].equals(cfg.src)) r.setChecked(true);
        }
        box.addView(group);

        // los que se pueden escoger: mi calendario y cada workspace (con su puntito de color)
        pickBox = new LinearLayout(this);
        pickBox.setOrientation(LinearLayout.VERTICAL);
        pickBox.setPadding(dp(34), 0, 0, dp(4));
        addCheck(s("wMine", getString(R.string.wcfg_mine)), "", t.accent);
        for (WidgetConfig.Ws w : spaces) addCheck(w.name.isEmpty() ? "·" : w.name, w.id, Widgets.color(w.color, t.accent));
        box.addView(pickBox);
        pickBox.setVisibility(WidgetConfig.PICK.equals(cfg.src) ? View.VISIBLE : View.GONE);
        group.setOnCheckedChangeListener((g, id) -> {
            View v = g.findViewById(id);
            boolean pick = v != null && WidgetConfig.PICK.equals(v.getTag());
            pickBox.setVisibility(pick ? View.VISIBLE : View.GONE);
        });

        if (spaces.isEmpty()) {
            TextView note = new TextView(this);
            note.setText(s("wNoWs", getString(R.string.wcfg_no_ws)));
            note.setTextColor(muted());
            note.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            note.setPadding(dp(4), dp(8), dp(4), 0);
            box.addView(note);
        }

        // botones
        LinearLayout btns = new LinearLayout(this);
        btns.setOrientation(LinearLayout.HORIZONTAL);
        btns.setGravity(Gravity.END);
        btns.setPadding(0, dp(16), 0, 0);
        Button cancel = button(s("wCancel", getString(R.string.wcfg_cancel)), false);
        cancel.setOnClickListener(v -> finish());
        Button save = button(s("wSave", getString(R.string.wcfg_save)), true);
        save.setOnClickListener(v -> {
            View r = group.findViewById(group.getCheckedRadioButtonId());
            cfg.src = r != null ? String.valueOf(r.getTag()) : WidgetConfig.PERSONAL;
            cfg.pick.clear();
            if (WidgetConfig.PICK.equals(cfg.src)) {
                for (int i = 0; i < checks.size(); i++) if (checks.get(i).isChecked()) cfg.pick.add(checkIds.get(i));
                if (cfg.pick.isEmpty()) cfg.src = WidgetConfig.PERSONAL;
            }
            cfg.save(this, widgetId);
            done(true);
            finish();
        });
        btns.addView(cancel);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMarginStart(dp(8));
        btns.addView(save, lp);
        box.addView(btns);

        setContentView(scroll);
        Window w = getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
            int width = Math.min(getResources().getDisplayMetrics().widthPixels - dp(32), dp(440));
            w.setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
    }

    private void addCheck(String label, String id, int color) {
        CheckBox cb = new CheckBox(this);
        SpannableString sp = new SpannableString("●  " + label);
        sp.setSpan(new ForegroundColorSpan(color | 0xFF000000), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        cb.setText(sp);
        cb.setTextColor(fg());
        cb.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        cb.setButtonTintList(new ColorStateList(new int[][]{{android.R.attr.state_checked}, {}}, new int[]{t.accent | 0xFF000000, muted()}));
        cb.setPadding(dp(4), dp(6), 0, dp(6));
        cb.setChecked(WidgetConfig.PICK.equals(cfg.src) ? cfg.pick.contains(id) : id.isEmpty());
        pickBox.addView(cb);
        checks.add(cb);
        checkIds.add(id);
    }

    private Button button(String text, boolean primary) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setMinHeight(dp(42));
        b.setMinimumHeight(dp(42));
        b.setPadding(dp(18), 0, dp(18), 0);
        if (Build.VERSION.SDK_INT >= 21) b.setStateListAnimator(null);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(999));
        if (primary) {
            int acc = t.accent | 0xFF000000;
            bg.setColor(acc);
            b.setTextColor(Theme.luminance(acc) > 0.6 ? 0xFF1E1A2E : 0xFFFFFFFF);
        } else {
            bg.setColor(0);
            b.setTextColor(fg());
        }
        b.setBackground(bg);
        return b;
    }

    /** Devuelve el resultado al lanzador y repinta el widget. */
    private void done(boolean repaint) {
        Intent r = new Intent();
        r.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        setResult(RESULT_OK, r);
        if (repaint) {
            AppWidgetManager m = AppWidgetManager.getInstance(this);
            Widgets.updateAll(this);
            try { m.notifyAppWidgetViewDataChanged(new int[]{widgetId}, R.id.list); } catch (Exception ignored) {}
        }
    }

    /** «Todo», «Solo mi calendario», «Piso, Trabajo»… (para la lista de Ajustes de la app). */
    static String summary(Context c, WidgetConfig w) {
        switch (w.src) {
            case WidgetConfig.ALL: return Widgets.str(c, "wAll", c.getString(R.string.wcfg_all));
            case WidgetConfig.CURRENT: return Widgets.str(c, "wCurrent", c.getString(R.string.wcfg_current));
            case WidgetConfig.PICK: {
                StringBuilder sb = new StringBuilder();
                for (String id : w.pick) {
                    String n = id.isEmpty() ? Widgets.str(c, "wMine", c.getString(R.string.wcfg_mine)) : WidgetConfig.wsName(c, id);
                    if (n == null) continue;
                    if (sb.length() > 0) sb.append(", ");
                    sb.append(n);
                }
                return sb.length() > 0 ? sb.toString() : Widgets.str(c, "wPersonal", c.getString(R.string.wcfg_personal));
            }
            default: return Widgets.str(c, "wPersonal", c.getString(R.string.wcfg_personal));
        }
    }
}
