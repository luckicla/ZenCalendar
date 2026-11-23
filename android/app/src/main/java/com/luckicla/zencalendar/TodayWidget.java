package com.luckicla.zencalendar;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Widget «Hoy»: la fecha en grande y los siguientes eventos (hasta 4, según el alto). */
public class TodayWidget extends AppWidgetProvider {
    private static final int[] ROWS = {R.id.row1, R.id.row2, R.id.row3, R.id.row4};
    private static final int[] DOTS = {R.id.dot1, R.id.dot2, R.id.dot3, R.id.dot4};
    private static final int[] TEXTS = {R.id.text1, R.id.text2, R.id.text3, R.id.text4};

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
        Widgets.scheduleTicks(c);
    }

    @Override public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle opts) {
        update(c, m, id);
    }

    static void update(Context c, AppWidgetManager m, int id) {
        Theme t = Theme.load(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        Widgets.paintBackground(v, t);
        Date now = new Date();
        Locale loc = Locale.getDefault();
        String wd = new SimpleDateFormat("EEEE", loc).format(now);
        v.setTextViewText(R.id.weekday, wd.substring(0, 1).toUpperCase(loc) + wd.substring(1));
        v.setTextViewText(R.id.daynum, new SimpleDateFormat("d", loc).format(now));
        v.setTextViewText(R.id.month, new SimpleDateFormat("LLLL yyyy", loc).format(now));
        v.setTextColor(R.id.weekday, t.a1 | 0xFF000000);
        v.setTextColor(R.id.daynum, t.fg);
        v.setTextColor(R.id.month, t.muted);
        v.setTextColor(R.id.none, t.muted);
        v.setTextViewText(R.id.none, Widgets.str(c, "empty", c.getString(R.string.empty)));

        // cuántas filas caben (según el alto del widget)
        int rows = 2;
        try {
            Bundle o = m.getAppWidgetOptions(id);
            int h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            if (h <= 0) h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110);
            rows = h >= 220 ? 4 : h >= 170 ? 3 : h >= 120 ? 2 : 1;
        } catch (Exception ignored) {}

        List<Widgets.Item> items = Widgets.items(c);
        String today = Widgets.today();
        int shown = 0;
        for (int i = 0; i < ROWS.length; i++) {
            if (i < rows && i < items.size()) {
                Widgets.Item it = items.get(i);
                String when = it.date.equals(today) ? "" : Widgets.dayLabel(c, it.date) + " · ";
                String time = it.allDay ? "" : it.time + "  ";
                v.setViewVisibility(ROWS[i], View.VISIBLE);
                v.setInt(DOTS[i], "setColorFilter", Widgets.color(it.color, t.a1) | 0xFF000000);
                v.setTextViewText(TEXTS[i], when + time + (it.task ? "☐ " : "") + it.title);
                v.setTextColor(TEXTS[i], t.fg);
                v.setOnClickPendingIntent(ROWS[i], Widgets.openPending(c, "open", it.id, it.date, 5000 + id * 8 + i));
                shown++;
            } else {
                v.setViewVisibility(ROWS[i], View.GONE);
            }
        }
        v.setViewVisibility(R.id.none, shown == 0 ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.root, Widgets.openPending(c, "day", null, today, 4000 + id));
        v.setOnClickPendingIntent(R.id.add, Widgets.openPending(c, "new", null, null, 4500 + id));
        m.updateAppWidget(id, v);
    }
}
