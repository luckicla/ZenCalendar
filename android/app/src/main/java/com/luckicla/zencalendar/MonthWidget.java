package com.luckicla.zencalendar;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DateFormatSymbols;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Widget «Mes» (4×3): el mes en una rejilla, con hasta 3 puntitos de color en los días que tienen
 * algo y hoy marcado con el acento. Tocar un día lo abre en la app. Los puntitos salen de
 * «marks» (ZC.reminders.widgetData) y respetan los workspaces escogidos (WidgetConfig).
 */
public class MonthWidget extends AppWidgetProvider {
    private static final int[] WEEKS = {R.id.week1, R.id.week2, R.id.week3, R.id.week4, R.id.week5, R.id.week6};
    private static final int[] MARKS = {R.id.m1, R.id.m2, R.id.m3};

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
        Widgets.scheduleTicks(c);
    }

    @Override public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle opts) {
        update(c, m, id);
    }

    @Override public void onDeleted(Context c, int[] ids) {
        WidgetConfig.delete(c, ids);
    }

    static void update(Context c, AppWidgetManager m, int id) {
        Theme t = Theme.load(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_month);
        Widgets.paintBackground(v, t);
        v.setViewVisibility(R.id.grid, t.dot ? View.VISIBLE : View.GONE);
        v.setImageViewResource(R.id.add_bg, t.dot ? R.drawable.wplus_ring : R.drawable.wplus);
        int fg = t.wFg(), muted = t.wMuted(), accent = t.accent | 0xFF000000;
        Locale loc = Locale.getDefault();
        Date now = new Date();
        String ws = Widgets.wsLabel(c, id);

        // cabecera: «Noviembre 2026» (y el workspace si solo enseña uno)
        String title = new SimpleDateFormat("LLLL yyyy", loc).format(now);
        title = title.substring(0, 1).toUpperCase(loc) + title.substring(1);
        if (t.dot) {
            v.setViewVisibility(R.id.title, View.GONE);
            v.setViewVisibility(R.id.title_img, View.VISIBLE);
            String mon = DotText.label(new SimpleDateFormat("LLL", loc).format(now));
            String year = new SimpleDateFormat("yyyy", loc).format(now);
            try {
                if (ws != null) v.setImageViewBitmap(R.id.title_img, DotText.draw(c, 14, DotText.span(mon + " ", accent), DotText.span(year + "  ", fg), DotText.span(DotText.label(ws), muted)));
                else v.setImageViewBitmap(R.id.title_img, DotText.draw(c, 14, DotText.span(mon + " ", accent), DotText.span(year, fg)));
            } catch (Throwable ignored) {}
            v.setContentDescription(R.id.title_img, ws != null ? title + " · " + ws : title);
        } else {
            v.setViewVisibility(R.id.title_img, View.GONE);
            v.setViewVisibility(R.id.title, View.VISIBLE);
            v.setTextViewText(R.id.title, ws != null ? title + " · " + ws : title);
            v.setTextColor(R.id.title, fg);
        }

        // primer día de la semana: el de la app (0 = domingo, 1 = lunes…)
        int firstDay = Widgets.data(c).optInt("firstDay", 1);
        if (firstDay < 0 || firstDay > 6) firstDay = 1;

        // las letras de los días
        v.removeAllViews(R.id.dows);
        String[] wd = new DateFormatSymbols(loc).getShortWeekdays();   // [1] = domingo … [7] = sábado
        for (int i = 0; i < 7; i++) {
            int dow = (firstDay + i) % 7;   // 0 = domingo
            String name = wd[dow + 1];
            String letter = name == null || name.isEmpty() ? "·" : name.substring(0, 1).toUpperCase(loc);
            RemoteViews d = new RemoteViews(c.getPackageName(), R.layout.widget_month_dow);
            d.setTextViewText(R.id.dow, letter);
            d.setTextColor(R.id.dow, muted);
            v.addView(R.id.dows, d);
        }

        // la rejilla: desde el primer día de la semana que contiene el día 1
        JSONObject marks = Widgets.data(c).optJSONObject("marks");
        WidgetConfig cfg = WidgetConfig.load(c, id);
        Calendar cal = Calendar.getInstance();
        int month = cal.get(Calendar.MONTH);
        String today = Widgets.today();
        cal.set(Calendar.DAY_OF_MONTH, 1);
        int offset = ((cal.get(Calendar.DAY_OF_WEEK) - 1) - firstDay + 7) % 7;
        cal.add(Calendar.DAY_OF_YEAR, -offset);
        int daysInMonth = Calendar.getInstance().getActualMaximum(Calendar.DAY_OF_MONTH);
        int weeks = (offset + daysInMonth + 6) / 7;
        SimpleDateFormat ymd = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        int todayInk = Theme.luminance(accent) > 0.6 ? 0xFF1E1A2E : 0xFFFFFFFF;

        for (int w = 0; w < WEEKS.length; w++) {
            v.removeAllViews(WEEKS[w]);
            v.setViewVisibility(WEEKS[w], w < weeks ? View.VISIBLE : View.GONE);
            if (w >= weeks) continue;
            for (int d = 0; d < 7; d++) {
                String date = ymd.format(cal.getTime());
                boolean inMonth = cal.get(Calendar.MONTH) == month;
                boolean isToday = date.equals(today);
                RemoteViews cell = new RemoteViews(c.getPackageName(), R.layout.widget_month_cell);
                cell.setTextViewText(R.id.num, String.valueOf(cal.get(Calendar.DAY_OF_MONTH)));
                if (isToday) {
                    cell.setViewVisibility(R.id.today_bg, View.VISIBLE);
                    cell.setInt(R.id.today_bg, "setColorFilter", accent);
                    cell.setTextColor(R.id.num, todayInk);
                } else {
                    cell.setViewVisibility(R.id.today_bg, View.GONE);
                    cell.setTextColor(R.id.num, inMonth ? fg : (muted & 0x00FFFFFF) | 0x80000000);
                }
                // los puntitos (solo de lo que enseña este widget)
                List<Integer> colors = dayColors(marks, date, cfg, c, accent);
                for (int k = 0; k < MARKS.length; k++) {
                    if (k < colors.size()) {
                        cell.setViewVisibility(MARKS[k], View.VISIBLE);
                        // (en Dot, monocromo: puntos del color del texto)
                        int col = t.dot ? (inMonth ? fg : muted) : colors.get(k);
                        cell.setInt(MARKS[k], "setColorFilter", col | 0xFF000000);
                        if (!inMonth) cell.setInt(MARKS[k], "setImageAlpha", 110);
                    } else {
                        cell.setViewVisibility(MARKS[k], View.GONE);
                    }
                }
                cell.setOnClickPendingIntent(R.id.cell, Widgets.openPending(c, "day", null, date, 100000 + id * 64 + w * 7 + d));
                v.addView(WEEKS[w], cell);
                cal.add(Calendar.DAY_OF_YEAR, 1);
            }
        }

        v.setOnClickPendingIntent(R.id.head, Widgets.openPending(c, "day", null, today, 9000 + id));
        v.setOnClickPendingIntent(R.id.add, Widgets.openPending(c, "new", null, null, 9500 + id));
        m.updateAppWidget(id, v);
    }

    /** Los colores de ese día (sin repetir, hasta 3) de lo que enseña el widget. */
    private static List<Integer> dayColors(JSONObject marks, String date, WidgetConfig cfg, Context c, int def) {
        List<Integer> out = new ArrayList<>();
        if (marks == null) return out;
        JSONArray arr = marks.optJSONArray(date);
        if (arr == null) return out;
        for (int i = 0; i < arr.length() && out.size() < 3; i++) {
            JSONArray mk = arr.optJSONArray(i);
            if (mk == null) continue;
            if (!cfg.accepts(c, mk.optString(1, ""))) continue;
            int col = Widgets.color(mk.optString(0), def) | 0xFF000000;
            if (!out.contains(col)) out.add(col);
        }
        return out;
    }
}
