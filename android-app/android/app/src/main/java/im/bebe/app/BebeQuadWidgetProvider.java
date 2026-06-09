package im.bebe.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * 사진 4장 위젯(2×2 콜라주). 단일 위젯과 동일한 레이아웃·단일-비트맵 구조를 쓰며,
 * 갱신·셔플·정리는 WidgetRefreshWorker / BebeWidgetProvider 의 공용 경로를 탄다
 * (renderQuad 가 4장을 한 장으로 합성). 탭·새로고침 PendingIntent 는 BebeWidgetProvider 공유.
 */
public class BebeQuadWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
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
}
