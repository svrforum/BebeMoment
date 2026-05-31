package im.bebe.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** 사진 그리드 홈 위젯(최신 4장 2x2). 갱신은 WidgetRefreshWorker 가 양쪽 위젯을 함께 처리. */
public class BebeGridWidgetProvider extends AppWidgetProvider {

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
