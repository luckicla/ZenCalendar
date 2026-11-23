package com.luckicla.zencalendar;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Al encender el móvil, al actualizarse la app o al cambiar la hora: se
 * vuelven a programar los avisos y se repintan los widgets. También recibe
 * el «tic» de medianoche/cada 30 min de los widgets.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (!Widgets.ACTION_TICK.equals(a)) Alarms.schedule(c);
        Widgets.updateAll(c);
        Widgets.scheduleTicks(c);
    }
}
