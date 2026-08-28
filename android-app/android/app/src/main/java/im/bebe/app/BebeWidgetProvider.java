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
    static final String ACTION_WIDGET_TAP = "im.bebe.app.WIDGET_TAP";

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

    /**
     * 위젯을 리사이즈하면 액자 비율이 달라진다 — 다시 그리지 않으면 이전 비트맵이 새 크기에
     * 맞춰 잘린다. 캐시에서 렌더만 하므로 네트워크를 타지 않는다.
     */
    @Override
    public void onAppWidgetOptionsChanged(
            Context ctx, AppWidgetManager mgr, int id, android.os.Bundle newOptions) {
        try {
            WidgetRefreshWorker.reRender(ctx, id);
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

    /**
     * 위젯 탭 — 그 위젯이 보여주는 가족 서버를 담아 앱을 연다(멀티 인스턴스: 활성 가족이
     * 달라도 위젯의 가족으로 전환). server 가 비면(아직 미바인딩) 활성 가족을 연다.
     * ⚠️ requestCode 를 위젯ID별로(0x20000000|id) 구분한다 — 안 그러면 IMMUTABLE
     * PendingIntent 가 위젯끼리 같아져 server extra 가 첫 위젯 것으로 공유돼, 어느 위젯을
     * 눌러도 같은 가족으로 갔다(이번 버그의 원인 중 하나).
     */
    static PendingIntent tapIntent(Context ctx, int id, String server) {
        Intent intent = new Intent(ctx, MainActivity.class)
            .setAction(ACTION_WIDGET_TAP)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (server != null && !server.isEmpty()) intent.putExtra("server", server);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(ctx, 0x20000000 | id, intent, flags);
    }
}
