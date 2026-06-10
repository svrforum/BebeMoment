package im.bebe.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/** 홈 위젯 — 갱신은 WidgetRefreshWorker(WorkManager)가 담당. 탭하면 앱을 연다. */
public class BebeWidgetProvider extends AppWidgetProvider {

    static final String ACTION_SHUFFLE = "im.bebe.app.WIDGET_SHUFFLE";
    static final String ACTION_MODE = "im.bebe.app.WIDGET_MODE";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        final String action = intent.getAction();
        if (ACTION_SHUFFLE.equals(action) || ACTION_MODE.equals(action)) {
            final int id = intent.getIntExtra(
                WidgetRefreshWorker.EXTRA_WIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
                try {
                    // SHUFFLE = 캐시 사진 중 무작위/다음 묶음으로(네트워크 없음).
                    // MODE = 4장 위젯의 그리드↔큰사진 전환(그 위젯만).
                    if (ACTION_MODE.equals(action)) WidgetRefreshWorker.toggleMode(ctx, id);
                    else WidgetRefreshWorker.shuffle(ctx, id);
                } catch (Throwable ignored) {
                }
            }
            return;
        }
        super.onReceive(ctx, intent);
    }

    /** 위젯ID별 새로고침 PendingIntent — requestCode=id 로 위젯마다 구분(extras 보존). */
    static PendingIntent shuffleIntent(Context ctx, int id) {
        Intent intent = new Intent(ctx, BebeWidgetProvider.class)
            .setAction(ACTION_SHUFFLE)
            .putExtra(WidgetRefreshWorker.EXTRA_WIDGET_ID, id);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, id, intent, flags);
    }

    /** 위젯ID별 모드 토글 PendingIntent — shuffle 과 다른 requestCode 공간으로 충돌 회피. */
    static PendingIntent modeIntent(Context ctx, int id) {
        Intent intent = new Intent(ctx, BebeWidgetProvider.class)
            .setAction(ACTION_MODE)
            .putExtra(WidgetRefreshWorker.EXTRA_WIDGET_ID, id);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, 0x40000000 | id, intent, flags);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        // 시스템이 부를 때마다(추가/리사이즈/주기) 즉시 1회 갱신.
        // 위젯 추가 순간 호출되므로 절대 예외를 던지면 안 됨(던지면 "위젯 추가 불가").
        try {
            WidgetRefreshWorker.enqueueNow(ctx);
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onEnabled(Context ctx) {
        try {
            WidgetRefreshWorker.ensurePeriodic(ctx);
            WidgetRefreshWorker.enqueueNow(ctx);
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        try {
            WidgetRefreshWorker.onWidgetsDeleted(ctx, ids);
        } catch (Throwable ignored) {
        }
    }

    static PendingIntent tapIntent(Context ctx) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(ctx, 0, intent, flags);
    }
}
