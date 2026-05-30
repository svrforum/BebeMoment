package im.bebe.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/** 홈 위젯 — 갱신은 WidgetRefreshWorker(WorkManager)가 담당. 탭하면 앱을 연다. */
public class BebeWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        // 시스템이 부를 때마다(추가/리사이즈/주기) 즉시 1회 갱신.
        WidgetRefreshWorker.enqueueNow(ctx);
    }

    @Override
    public void onEnabled(Context ctx) {
        WidgetRefreshWorker.ensurePeriodic(ctx);
        WidgetRefreshWorker.enqueueNow(ctx);
    }

    static PendingIntent tapIntent(Context ctx) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(ctx, 0, intent, flags);
    }
}
