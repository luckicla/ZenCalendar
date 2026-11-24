package com.luckicla.zencalendar;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.util.Log;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * El trabajo periódico de los workspaces (JobScheduler, cada ~15 min con red; lo programa
 * Workspaces.ensureJob). La comprobación hace peticiones: va en su propio hilo.
 */
public class WsJob extends JobService {
    private static final ExecutorService POOL = Executors.newSingleThreadExecutor();

    @Override public boolean onStartJob(JobParameters params) {
        POOL.execute(() -> {
            try {
                Workspaces.check(getApplicationContext());
            } catch (Throwable t) {
                Log.w("ZenCalendar", "workspaces: job", t);
            }
            // (periódico: la siguiente vuelta ya está programada; sin reintentos con espera)
            jobFinished(params, false);
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        // Android lo corta (se fue la red…): la petición en marcha acaba sola y la próxima vuelta llega igual
        return false;
    }
}
