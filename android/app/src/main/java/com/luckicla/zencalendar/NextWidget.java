package com.luckicla.zencalendar;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Widget «Lo siguiente» (pequeño, 3×1): el próximo evento en grande, con la hora, el título y
 * cuánto falta («En 25 min», «Ahora»…). Si hoy no queda nada con hora, lo de todo el día de hoy;
 * si tampoco, lo primero de los próximos días. Respeta los workspaces que se escojan (WidgetConfig).
 */
public class NextWidget extends AppWidgetProvider {
    private static final Pattern TIME = Pattern.compile("^(\\d{1,2}):(\\d{2})\\s*(am|pm)?", Pattern.CASE_INSENSITIVE);

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

    /** Minutos desde medianoche de «17:30» / «5:30 pm»; -1 si no se entiende. */
    static int minutes(String time) {
        if (time == null) return -1;
        Matcher mt = TIME.matcher(time.trim());
        if (!mt.find()) return -1;
        int h = Integer.parseInt(mt.group(1)), mi = Integer.parseInt(mt.group(2));
        String ap = mt.group(3);
        if (ap != null) {
            h = h % 12;
            if (ap.equalsIgnoreCase("pm")) h += 12;
        }
        return h * 60 + mi;
    }

    /** El que toca enseñar: lo siguiente con hora de hoy, si no lo de todo el día de hoy, si no lo primero. */
    static Widgets.Item pick(List<Widgets.Item> items, String today) {
        Widgets.Item allDayToday = null;
        for (Widgets.Item it : items) {
            if (!it.date.equals(today)) break;
            if (ended(it)) continue;
            if (!it.allDay && !it.time.isEmpty()) return it;
            if (allDayToday == null) allDayToday = it;
        }
        if (allDayToday != null) return allDayToday;
        return items.isEmpty() ? null : items.get(0);
    }

    /** ¿Ya ha acabado? (la página quita lo terminado, pero si la app lleva horas sin abrirse puede quedar alguno) */
    static boolean ended(Widgets.Item it) {
        if (it.allDay || it.task) return false;
        int s = minutes(it.time), e = minutes(it.end);
        if (s < 0 || e < 0 || e < s) return false;   // (acaba otro día)
        Calendar now = Calendar.getInstance();
        return e <= now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
    }

    static void update(Context c, AppWidgetManager m, int id) {
        Theme t = Theme.load(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_next);
        Widgets.paintBackground(v, t);
        int fg = t.wFg(), muted = t.wMuted();
        v.setViewVisibility(R.id.grid, t.dot ? View.VISIBLE : View.GONE);
        v.setImageViewResource(R.id.add_bg, t.dot ? R.drawable.wplus_ring : R.drawable.wplus);
        if (t.dot) v.setImageViewResource(R.id.bar, R.drawable.wdot_round);

        String today = Widgets.today();
        List<Widgets.Item> items = Widgets.items(c, id);
        Widgets.Item it = pick(items, today);
        String ws = Widgets.wsLabel(c, id);

        if (it == null) {
            String head = Widgets.str(c, "wNext", c.getString(R.string.widget_next));
            v.setTextViewText(R.id.label, ws != null ? head + " · " + ws : head);
            v.setTextColor(R.id.label, t.dot ? t.accent : muted);
            v.setViewVisibility(R.id.time, View.GONE);
            v.setViewVisibility(R.id.time_img, View.GONE);
            v.setTextViewText(R.id.text, Widgets.str(c, "empty", c.getString(R.string.empty)));
            v.setTextColor(R.id.text, muted);
            v.setViewVisibility(R.id.sub, View.GONE);
            v.setInt(R.id.bar, "setColorFilter", (t.accent & 0x00FFFFFF) | 0x55000000);
            v.setOnClickPendingIntent(R.id.root, Widgets.openPending(c, "day", null, today, 8000 + id));
        } else {
            // cabecera: «Hoy», «Mañana» o el día (y el workspace, si solo enseña uno)
            String head = Widgets.dayLabel(c, it.date);
            head = head.substring(0, 1).toUpperCase(Locale.getDefault()) + head.substring(1);
            if (ws != null) head += " · " + ws;
            v.setTextViewText(R.id.label, t.dot ? head.toUpperCase(Locale.getDefault()) : head);
            v.setTextColor(R.id.label, t.dot ? t.accent : muted);

            String time = it.allDay || it.time.isEmpty() ? Widgets.str(c, "allDay", "Todo el día") : it.time;
            if (t.dot) {
                v.setViewVisibility(R.id.time, View.GONE);
                v.setViewVisibility(R.id.time_img, View.VISIBLE);
                try {
                    v.setImageViewBitmap(R.id.time_img, DotText.draw(c, it.allDay ? 14 : 24, it.allDay ? DotText.label(time) : time, fg));
                } catch (Throwable e) {
                    v.setViewVisibility(R.id.time_img, View.GONE);
                }
                v.setContentDescription(R.id.time_img, time);
            } else {
                v.setViewVisibility(R.id.time_img, View.GONE);
                v.setViewVisibility(R.id.time, View.VISIBLE);
                v.setTextViewText(R.id.time, time);
                v.setTextViewTextSize(R.id.time, android.util.TypedValue.COMPLEX_UNIT_SP, it.allDay ? 16 : 26);
                v.setTextColor(R.id.time, fg);
            }
            v.setTextViewText(R.id.text, (it.task ? "☐ " : "") + it.title);
            v.setTextColor(R.id.text, fg);

            // debajo: cuánto falta, el sitio y de qué workspace es (si se mezclan)
            StringBuilder sub = new StringBuilder();
            String rel = relative(c, it, today);
            if (rel != null) sub.append(rel);
            if (!it.location.isEmpty()) { if (sub.length() > 0) sub.append(" · "); sub.append(it.location); }
            WidgetConfig cfg = WidgetConfig.load(c, id);
            if (ws == null && cfg.mixed(c) && !it.ws.isEmpty()) {
                String n = WidgetConfig.wsName(c, it.ws);
                if (n != null && !n.isEmpty()) { if (sub.length() > 0) sub.append(" · "); sub.append(n); }
            }
            // y si hoy hay más cosas, cuántas
            int more = 0;
            for (Widgets.Item o : items) if (o != it && o.date.equals(today) && !ended(o)) more++;
            if (more > 0 && it.date.equals(today)) { if (sub.length() > 0) sub.append(" · "); sub.append("+").append(more); }
            v.setViewVisibility(R.id.sub, sub.length() > 0 ? View.VISIBLE : View.GONE);
            v.setTextViewText(R.id.sub, sub.toString());
            v.setTextColor(R.id.sub, muted);
            v.setInt(R.id.bar, "setColorFilter", Widgets.color(it.color, t.accent) | 0xFF000000);
            v.setOnClickPendingIntent(R.id.root, Widgets.openPending(c, "open", it.id, it.date, 8000 + id));
        }
        v.setOnClickPendingIntent(R.id.add, Widgets.openPending(c, "new", null, null, 8500 + id));
        m.updateAppWidget(id, v);
    }

    /** «Ahora», «En 25 min», «En 3 h»; null si es otro día o de todo el día. */
    private static String relative(Context c, Widgets.Item it, String today) {
        if (!it.date.equals(today) || it.allDay) return null;
        int start = minutes(it.time);
        if (start < 0) return null;
        Calendar now = Calendar.getInstance();
        int diff = start - (now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE));
        if (diff <= 0) return Widgets.str(c, "now", "Ahora");
        if (diff < 60) return Widgets.str(c, "inM", "En %n min").replace("%n", String.valueOf(diff));
        return Widgets.str(c, "inH", "En %n h").replace("%n", String.valueOf(Math.round(diff / 60f)));
    }

    /** ¿Cuándo hay que repintar para que «En 25 min» no se quede viejo? (ms; 0 = no hace falta antes de lo normal) */
    static long nextRefresh(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new android.content.ComponentName(c, NextWidget.class));
            if (ids.length == 0) return 0;
            // cada 5 min mientras falte menos de una hora para algo de hoy; si no, cuando falte una hora
            String today = Widgets.today();
            Calendar now = Calendar.getInstance();
            int nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
            long best = 0;
            for (Widgets.Item it : Widgets.items(c)) {
                if (!it.date.equals(today)) break;
                if (it.allDay || ended(it)) continue;
                int s = minutes(it.time);
                if (s < 0) continue;
                int diff = s - nowMin;
                long at;
                if (diff <= 60) at = System.currentTimeMillis() + 5 * 60_000L;
                else at = System.currentTimeMillis() + (diff - 60) * 60_000L;
                if (best == 0 || at < best) best = at;
            }
            return best;
        } catch (Exception e) {
            return 0;
        }
    }
}
