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

    static void update(Context c, AppWidgetManager m, int id) {
        Theme t = Theme.load(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_agenda);
        Widgets.paintBackground(v, t);
        String title = new SimpleDateFormat("EEEE d MMMM", Locale.getDefault()).format(new Date());
        v.setTextViewText(R.id.title, title.substring(0, 1).toUpperCase(Locale.getDefault()) + title.substring(1));
        v.setTextColor(R.id.title, t.fg);
        v.setTextColor(R.id.empty, t.muted);
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
