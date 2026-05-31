package im.bebe.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.view.View;
import android.widget.RemoteViews;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 위젯 갱신 워커 — 멀티 인스턴스(가족별 위젯). 각 위젯 인스턴스(appWidgetId)는 추가된
 * 시점의 "활성 가족" 서버/토큰에 1회 고정(bind)되고, 이후 그 가족의 데이터를 위젯ID별로
 * 캐시·렌더한다. 다른 가족 위젯을 원하면 앱에서 그 가족으로 전환한 뒤 위젯을 추가한다.
 * (전역 토큰/서버는 bind 안 된 위젯의 폴백 — 구버전 위젯 호환.)
 */
public class WidgetRefreshWorker extends Worker {

    private static final String PERIODIC_NAME = "bebe-widget-refresh";
    static final String EXTRA_WIDGET_ID = "widgetId";
    private static final int MAX_PHOTOS = 10;
    private static final int SINGLE_MAX_PX = 420;
    private static final int GRID_MAX_PX = 240;

    public WidgetRefreshWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    private static Constraints net() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    public static void enqueueNow(Context ctx) {
        WorkManager.getInstance(ctx).enqueue(
            new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class).setConstraints(net()).build());
    }

    public static void ensurePeriodic(Context ctx) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(
                WidgetRefreshWorker.class, 1, TimeUnit.HOURS)
            .setConstraints(net())
            .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
            PERIODIC_NAME, ExistingPeriodicWorkPolicy.UPDATE, req);
    }

    // ── per-widget 키/파일 ──────────────────────────────────────────────
    private static String wk(int id, String suffix) {
        return "w" + id + "_" + suffix;
    }
    private static String photoFile(Context ctx, int id, int i) {
        return new java.io.File(ctx.getFilesDir(), "w" + id + "_photo_" + i + ".jpg").getAbsolutePath();
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences sp = ctx.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, BebeWidgetProvider.class))) {
            processWidget(ctx, sp, mgr, id, false);
        }
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, BebeGridWidgetProvider.class))) {
            processWidget(ctx, sp, mgr, id, true);
        }
        return Result.success();
    }

    /** 위젯 1개: 서버/토큰 해석(필요 시 활성 가족으로 bind) → fetch → render. */
    private void processWidget(Context ctx, SharedPreferences sp, AppWidgetManager mgr, int id, boolean grid) {
        String server = sp.getString(wk(id, "server"), null);
        String token = sp.getString(wk(id, "token"), null);
        if (server == null || token == null) {
            // 아직 bind 안 됨(새로 추가/구버전) → 현재 활성 가족으로 고정.
            final String gServer = sp.getString(BebeWidgetPlugin.KEY_SERVER, null);
            final String gToken = sp.getString(BebeWidgetPlugin.KEY_TOKEN, null);
            if (server == null) server = gServer;
            if (token == null) token = gToken;
            if (server != null && token != null) {
                sp.edit().putString(wk(id, "server"), server).putString(wk(id, "token"), token).apply();
            }
        }
        if (server != null && token != null) {
            try {
                fetchAndCache(ctx, sp, id, server, token);
            } catch (Exception e) {
                // 조용히 — 마지막 캐시로 렌더.
            }
        }
        try {
            if (grid) renderGrid(ctx, sp, mgr, id);
            else renderSingle(ctx, sp, mgr, id);
        } catch (Throwable ignored) {
        }
    }

    private void fetchAndCache(Context ctx, SharedPreferences sp, int id, String serverUrl, String token)
            throws Exception {
        final String base = serverUrl.replaceAll("/+$", "");
        URL url = new URL(base + "/api/widget/data");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        if (conn.getResponseCode() != 200) return;

        StringBuilder body = new StringBuilder();
        try (InputStream is = conn.getInputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) body.append(new String(buf, 0, n, "UTF-8"));
        }
        JSONObject json = new JSONObject(body.toString());
        SharedPreferences.Editor ed = sp.edit();
        ed.putString(wk(id, "babyName"), json.optString("babyName", ""));
        ed.putInt(wk(id, "newCount"), json.optInt("newCount", 0));

        // 미디어 URL 은 루트-상대(/media/...)라 네이티브는 절대 URL 로 만들어 받아야 한다.
        JSONArray urls = json.optJSONArray("photoUrls");
        JSONArray dates = json.optJSONArray("photoDates");
        JSONArray savedDates = new JSONArray();
        int saved = 0;
        if (urls != null) {
            for (int i = 0; i < urls.length() && saved < MAX_PHOTOS; i++) {
                String u = urls.optString(i, null);
                if (u == null || u.isEmpty()) continue;
                if (!u.startsWith("http://") && !u.startsWith("https://")) {
                    u = base + (u.startsWith("/") ? u : "/" + u);
                }
                Bitmap bmp = downloadBitmap(u);
                if (bmp == null) continue;
                java.io.File f = new java.io.File(photoFile(ctx, id, saved));
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(f)) {
                    bmp.compress(Bitmap.CompressFormat.JPEG, 90, fos);
                }
                savedDates.put(dates != null ? dates.optString(i, "") : "");
                saved++;
            }
        }
        if (saved > 0) {
            ed.putInt(wk(id, "photoCount"), saved);
            ed.putInt(wk(id, "shuffleIdx"), 0);
            ed.putString(wk(id, "photoDates"), savedDates.toString());
        }
        ed.apply();
    }

    private Bitmap downloadBitmap(String photoUrl) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(photoUrl).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);
        if (conn.getResponseCode() != 200) return null;
        try (InputStream is = conn.getInputStream()) {
            return BitmapFactory.decodeStream(is);
        }
    }

    /** 새로고침(랜덤) 버튼 — 해당 위젯을 캐시된 사진 중 직전과 다른 무작위 한 장으로. */
    static void shuffle(Context ctx, int id) {
        SharedPreferences sp = ctx.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        int count = sp.getInt(wk(id, "photoCount"), 0);
        if (count > 1) {
            int cur = sp.getInt(wk(id, "shuffleIdx"), 0);
            int next = cur;
            for (int t = 0; t < 8 && next == cur; t++) next = (int) (Math.random() * count);
            sp.edit().putInt(wk(id, "shuffleIdx"), next).apply();
        }
        try {
            renderSingle(ctx, sp, AppWidgetManager.getInstance(ctx), id);
        } catch (Throwable ignored) {
        }
    }

    private static void renderSingle(Context ctx, SharedPreferences sp, AppWidgetManager mgr, int id) {
        String babyName = sp.getString(wk(id, "babyName"), "");
        int photoCount = sp.getInt(wk(id, "photoCount"), 0);
        int newCount = sp.getInt(wk(id, "newCount"), 0);
        int idx = sp.getInt(wk(id, "shuffleIdx"), 0);
        if (photoCount > 0) idx = Math.max(0, Math.min(idx, photoCount - 1));
        String photoDate = photoDateLabel(sp.getString(wk(id, "photoDates"), ""), idx);

        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.bebe_widget);
        rv.setTextViewText(R.id.widget_name, babyName == null ? "" : babyName);
        rv.setViewVisibility(R.id.widget_age, View.GONE);
        if (photoDate != null && !photoDate.isEmpty()) {
            rv.setViewVisibility(R.id.widget_date, View.VISIBLE);
            rv.setTextViewText(R.id.widget_date, photoDate);
        } else {
            rv.setViewVisibility(R.id.widget_date, View.GONE);
        }
        if (photoCount > 0) {
            Bitmap b = rounded(BitmapFactory.decodeFile(photoFile(ctx, id, idx)), 40f, SINGLE_MAX_PX);
            if (b != null) rv.setImageViewBitmap(R.id.widget_photo, b);
        }
        applyBadge(rv, newCount);
        rv.setOnClickPendingIntent(R.id.widget_root, BebeWidgetProvider.tapIntent(ctx));
        if (photoCount > 1) {
            rv.setViewVisibility(R.id.widget_refresh, View.VISIBLE);
            rv.setOnClickPendingIntent(R.id.widget_refresh, BebeWidgetProvider.shuffleIntent(ctx, id));
        } else {
            rv.setViewVisibility(R.id.widget_refresh, View.GONE);
        }
        mgr.updateAppWidget(id, rv);
    }

    private static void renderGrid(Context ctx, SharedPreferences sp, AppWidgetManager mgr, int id) {
        int photoCount = sp.getInt(wk(id, "photoCount"), 0);
        int newCount = sp.getInt(wk(id, "newCount"), 0);
        int[] cells = { R.id.grid_0, R.id.grid_1, R.id.grid_2, R.id.grid_3 };
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.bebe_widget_grid);
        for (int i = 0; i < cells.length; i++) {
            if (i < photoCount) {
                Bitmap b = rounded(BitmapFactory.decodeFile(photoFile(ctx, id, i)), 24f, GRID_MAX_PX);
                if (b != null) rv.setImageViewBitmap(cells[i], b);
            }
        }
        applyBadge(rv, newCount);
        rv.setOnClickPendingIntent(R.id.widget_root, BebeWidgetProvider.tapIntent(ctx));
        mgr.updateAppWidget(id, rv);
    }

    /** 비트맵 모서리를 둥글게 + RemoteViews 예산에 맞춰 maxPx 로 다운스케일. */
    private static Bitmap rounded(Bitmap src, float radius, int maxPx) {
        if (src == null) return null;
        Bitmap b = src;
        if (src.getWidth() > maxPx || src.getHeight() > maxPx) {
            float s = Math.min((float) maxPx / src.getWidth(), (float) maxPx / src.getHeight());
            b = Bitmap.createScaledBitmap(
                src, Math.max(1, Math.round(src.getWidth() * s)), Math.max(1, Math.round(src.getHeight() * s)), true);
        }
        Bitmap out = Bitmap.createBitmap(b.getWidth(), b.getHeight(), Bitmap.Config.ARGB_8888);
        android.graphics.Canvas canvas = new android.graphics.Canvas(out);
        android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new android.graphics.BitmapShader(
            b, android.graphics.Shader.TileMode.CLAMP, android.graphics.Shader.TileMode.CLAMP));
        android.graphics.RectF rect = new android.graphics.RectF(0, 0, b.getWidth(), b.getHeight());
        canvas.drawRoundRect(rect, radius, radius, paint);
        return out;
    }

    private static void applyBadge(RemoteViews rv, int newCount) {
        if (newCount > 0) {
            rv.setViewVisibility(R.id.widget_badge, View.VISIBLE);
            rv.setTextViewText(R.id.widget_badge, newCount > 99 ? "99+" : String.valueOf(newCount));
        } else {
            rv.setViewVisibility(R.id.widget_badge, View.GONE);
        }
    }

    /** 촬영일 JSON 의 idx 번째를 "5월 12일"(올해) / "2026.5.12" 로. */
    static String photoDateLabel(String datesJson, int idx) {
        if (datesJson == null || datesJson.isEmpty()) return "";
        try {
            JSONArray arr = new JSONArray(datesJson);
            if (idx < 0 || idx >= arr.length()) return "";
            String d = arr.optString(idx, "");
            if (d.length() < 10) return "";
            int y = Integer.parseInt(d.substring(0, 4));
            int m = Integer.parseInt(d.substring(5, 7));
            int day = Integer.parseInt(d.substring(8, 10));
            int curYear = Calendar.getInstance().get(Calendar.YEAR);
            return y == curYear ? (m + "월 " + day + "일") : (y + "." + m + "." + day);
        } catch (Exception e) {
            return "";
        }
    }
}
