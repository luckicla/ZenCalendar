package com.luckicla.zencalendar;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

/** Las filas del widget «Agenda»: una cabecera por día y sus eventos. */
public class AgendaWidgetService extends RemoteViewsService {

    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static final class Row {
        boolean header;
        String label;
        Widgets.Item item;
    }

    static final class Factory implements RemoteViewsFactory {
        private final Context c;
        private final List<Row> rows = new ArrayList<>();
        private Theme theme;
        private String allDayText = "Todo el día";

        Factory(Context c) { this.c = c; }

        @Override public void onCreate() { load(); }
        @Override public void onDataSetChanged() { load(); }
        @Override public void onDestroy() { rows.clear(); }
        @Override public int getCount() { return rows.size(); }
        @Override public RemoteViews getLoadingView() { return null; }
        // (4: las filas de Zen y las de Dot; el número no puede cambiar mientras el widget vive)
        @Override public int getViewTypeCount() { return 4; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }

        private void load() {
            theme = Theme.load(c);
            allDayText = Widgets.str(c, "allDay", "Todo el día");
            rows.clear();
            String last = null;
            for (Widgets.Item it : Widgets.items(c)) {
                if (!it.date.equals(last)) {
                    Row h = new Row();
                    h.header = true;
                    h.label = Widgets.dayLabel(c, it.date);
                    h.item = it;
                    rows.add(h);
                    last = it.date;
                }
                Row r = new Row();
                r.item = it;
                rows.add(r);
                if (rows.size() > 120) break;
            }
        }

        @Override public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= rows.size()) return null;
            Row r = rows.get(position);
            Intent fill = new Intent();
            if (theme.dot) return dotRow(r, fill);
            if (r.header) {
                RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_agenda_day);
                v.setTextViewText(R.id.day, r.label);
                v.setTextColor(R.id.day, theme.muted);
                fill.putExtra("action", "day");
                fill.putExtra("date", r.item.date);
                v.setOnClickFillInIntent(R.id.day, fill);
                return v;
            }
            Widgets.Item it = r.item;
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_agenda_item);
            v.setInt(R.id.dot, "setColorFilter", Widgets.color(it.color, theme.a1) | 0xFF000000);
            String time = it.allDay ? allDayText : it.time;
            if (it.allDay && time.length() > 9) time = "·";
            v.setTextViewText(R.id.time, time);
            v.setTextColor(R.id.time, theme.muted);
            v.setTextViewText(R.id.text, (it.task ? "☐ " : "") + it.title);
            v.setTextColor(R.id.text, theme.fg);
            fill.putExtra("action", "open");
            fill.putExtra("id", it.id);
            fill.putExtra("date", it.date);
            v.setOnClickFillInIntent(R.id.item, fill);
            return v;
        }

        /** Las filas con el diseño Dot: el día y las horas en ZenDot, un punto de color por evento. */
        private RemoteViews dotRow(Row r, Intent fill) {
            if (r.header) {
                RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_agenda_day_dot);
                try { v.setImageViewBitmap(R.id.day_img, DotText.draw(c, 11, DotText.label(r.label), theme.wMuted())); } catch (Throwable ignored) {}
                v.setContentDescription(R.id.day_img, r.label);
                fill.putExtra("action", "day");
                fill.putExtra("date", r.item.date);
                v.setOnClickFillInIntent(R.id.day, fill);
                return v;
            }
            Widgets.Item it = r.item;
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_agenda_item_dot);
            v.setInt(R.id.dot, "setColorFilter", Widgets.color(it.color, theme.accent) | 0xFF000000);
            String time = it.allDay ? allDayText : it.time;
            if (it.allDay && time.length() > 9) time = "·";
            try {
                v.setImageViewBitmap(R.id.time_img, DotText.draw(c, 12, it.allDay ? DotText.label(time) : time, it.allDay ? theme.wMuted() : theme.wFg()));
            } catch (Throwable ignored) {}
            v.setContentDescription(R.id.time_img, time);
            v.setTextViewText(R.id.text, (it.task ? "☐ " : "") + it.title);
            v.setTextColor(R.id.text, theme.wFg());
            fill.putExtra("action", "open");
            fill.putExtra("id", it.id);
            fill.putExtra("date", it.date);
            v.setOnClickFillInIntent(R.id.item, fill);
            return v;
        }
    }
}
