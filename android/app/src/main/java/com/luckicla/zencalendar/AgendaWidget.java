package com.luckicla.zencalendar;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Widget «Agenda»: la lista de los próximos días, con botón «+». */
public class AgendaWidget extends AppWidgetProvider {

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
        m.notifyAppWidgetViewDataChanged(ids, R.id.list);
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
        RemoteViews v = new RemoteViews(c.getPackageName(), t.dot ? R.layout.widget_agenda_dot : R.layout.widget_agenda);
        Widgets.paintBackground(v, t);
        Date now = new Date();
        String title = new SimpleDateFormat("EEEE d MMMM", Locale.getDefault()).format(now);
        title = title.substring(0, 1).toUpperCase(Locale.getDefault()) + title.substring(1);
        // (si enseña un solo workspace, su nombre al lado de la fecha)
        String ws = Widgets.wsLabel(c, id);
        if (ws != null) title += " · " + ws;
        if (t.dot) {
            // Dot: «LUN 23 NOV» en ZenDot, con el día de la semana en rojo
            Locale loc = Locale.getDefault();
            String wd = DotText.label(new SimpleDateFormat("EEE", loc).format(now));
            String rest = DotText.label(new SimpleDateFormat("d LLL", loc).format(now));
            try {
                if (ws != null) v.setImageViewBitmap(R.id.title_img, DotText.draw(c, 15, DotText.span(wd + " ", t.accent), DotText.span(rest + "  ", t.wFg()), DotText.span(DotText.label(ws), t.wMuted())));
                else v.setImageViewBitmap(R.id.title_img, DotText.draw(c, 15, DotText.span(wd + " ", t.accent), DotText.span(rest, t.wFg())));
            } catch (Throwable ignored) {}
            v.setContentDescription(R.id.title_img, title);
        } else {
            v.setTextViewText(R.id.title, title);
            v.setTextColor(R.id.title, t.fg);
        }
        v.setTextColor(R.id.empty, t.wMuted());
        v.setTextViewText(R.id.empty, Widgets.str(c, "empty", c.getString(R.string.empty)));

        // la lista: la rellena AgendaWidgetService
        Intent svc = new Intent(c, AgendaWidgetService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        svc.setData(Uri.parse("zencalendar://widget/agenda/" + id));
        v.setRemoteAdapter(R.id.list, svc);
        v.setEmptyView(R.id.list, R.id.empty);
        v.setPendingIntentTemplate(R.id.list, Widgets.listTemplate(c));

        // tocar la cabecera abre la app; «+» abre un evento nuevo
        v.setOnClickPendingIntent(R.id.title, Widgets.openPending(c, "day", null, Widgets.today(), 1000 + id));
        v.setOnClickPendingIntent(R.id.empty, Widgets.openPending(c, "day", null, Widgets.today(), 2000 + id));
        v.setOnClickPendingIntent(R.id.add, Widgets.openPending(c, "new", null, null, 3000 + id));
        m.updateAppWidget(id, v);
    }
}
