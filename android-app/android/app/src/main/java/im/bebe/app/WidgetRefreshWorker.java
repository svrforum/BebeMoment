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
 * 위젯 갱신 워커 — /api/widget/data 에서 최신 사진들(최대 4장)·아기 정보·새 사진 수를
 * 받아 단일/그리드 위젯을 모두 갱신한다. 나이는 저장된 생일로 매번 로컬 계산. 네트워크
 * 실패 시 마지막 상태 유지(조용히).
 */
public class WidgetRefreshWorker extends Worker {

    private static final String PERIODIC_NAME = "bebe-widget-refresh";
    private static final String KEY_BIRTHDATE = "birthDate";
    private static final String KEY_BABYNAME = "babyName";
    private static final String KEY_PHOTO_COUNT = "photoCount";
    private static final String KEY_NEWCOUNT = "newCount";
    private static final int MAX_PHOTOS = 4;
    // RemoteViews 비트맵 예산(바인더 트랜잭션 ~1MB) 안에 들어오도록 렌더 비트맵을
    // 작게 다운스케일한다. 과거엔 ~512px(ARGB ≈ 1MB) 원본을 그대로 넣어 특히 4장짜리
    // 그리드가 예산 초과 → updateAppWidget 예외 → 위젯 미갱신이었다.
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

    private static String photoFile(Context ctx, int i) {
        return new java.io.File(ctx.getFilesDir(), "widget_photo_" + i + ".jpg").getAbsolutePath();
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences sp = ctx.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String token = sp.getString(BebeWidgetPlugin.KEY_TOKEN, null);
        String serverUrl = sp.getString(BebeWidgetPlugin.KEY_SERVER, null);

        if (token != null && serverUrl != null) {
            try {
                fetchAndCache(ctx, sp, serverUrl, token);
            } catch (Exception e) {
                // 조용히 — 마지막 캐시로 렌더.
            }
        }
        render(ctx, sp);
        return Result.success();
    }

    private void fetchAndCache(Context ctx, SharedPreferences sp, String serverUrl, String token)
            throws Exception {
        URL url = new URL(serverUrl.replaceAll("/+$", "") + "/api/widget/data");
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
        ed.putString(KEY_BABYNAME, json.optString("babyName", ""));
        ed.putString(KEY_BIRTHDATE, json.optString("birthDate", ""));
        ed.putInt(KEY_NEWCOUNT, json.optInt("newCount", 0));

        // 미디어 URL 은 루트-상대(`/media/v1/files/...`)로 온다(브라우저 동일출처용,
        // mixed-content 회피). 네이티브 워커는 절대 URL 이 필요하므로 서버 베이스를 붙인다 —
        // 안 붙이면 `new URL("/media/...")` 가 던져 사진이 전혀 안 받아져 위젯이 빈칸이었다.
        final String base = serverUrl.replaceAll("/+$", "");
        JSONArray urls = json.optJSONArray("photoUrls");
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
                java.io.File f = new java.io.File(photoFile(ctx, saved));
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(f)) {
                    bmp.compress(Bitmap.CompressFormat.JPEG, 90, fos);
                }
                saved++;
            }
        }
        if (saved > 0) ed.putInt(KEY_PHOTO_COUNT, saved);
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

    private void render(Context ctx, SharedPreferences sp) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        String babyName = sp.getString(KEY_BABYNAME, "");
        String ageText = ageLabel(sp.getString(KEY_BIRTHDATE, ""));
        int photoCount = sp.getInt(KEY_PHOTO_COUNT, 0);
        int newCount = sp.getInt(KEY_NEWCOUNT, 0);

        // 단일 위젯. 한 위젯 갱신이 실패(예: 비트맵 과다)해도 doWork 전체가 죽지 않도록
        // 위젯 단위 try/catch — 과거엔 render 예외가 doWork 를 실패시켜 위젯이 통째로
        // 안 갱신되던 원인이었다.
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, BebeWidgetProvider.class))) {
            try {
                RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.bebe_widget);
                rv.setTextViewText(R.id.widget_name, babyName == null ? "" : babyName);
                rv.setTextViewText(R.id.widget_age, ageText);
                if (photoCount > 0) {
                    Bitmap b = rounded(BitmapFactory.decodeFile(photoFile(ctx, 0)), 40f, SINGLE_MAX_PX);
                    if (b != null) rv.setImageViewBitmap(R.id.widget_photo, b);
                }
                applyBadge(rv, newCount);
                rv.setOnClickPendingIntent(R.id.widget_root, BebeWidgetProvider.tapIntent(ctx));
                mgr.updateAppWidget(id, rv);
            } catch (Throwable ignored) {
            }
        }

        // 그리드 위젯
        int[] gridIds = mgr.getAppWidgetIds(new ComponentName(ctx, BebeGridWidgetProvider.class));
        int[] cells = { R.id.grid_0, R.id.grid_1, R.id.grid_2, R.id.grid_3 };
        for (int id : gridIds) {
            try {
                RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.bebe_widget_grid);
                for (int i = 0; i < cells.length; i++) {
                    if (i < photoCount) {
                        Bitmap b = rounded(BitmapFactory.decodeFile(photoFile(ctx, i)), 24f, GRID_MAX_PX);
                        if (b != null) rv.setImageViewBitmap(cells[i], b);
                    }
                }
                applyBadge(rv, newCount);
                rv.setOnClickPendingIntent(R.id.widget_root, BebeWidgetProvider.tapIntent(ctx));
                mgr.updateAppWidget(id, rv);
            } catch (Throwable ignored) {
            }
        }
    }

    /** 비트맵 모서리를 둥글게 + RemoteViews 예산에 맞춰 maxPx 로 다운스케일. */
    private static Bitmap rounded(Bitmap src, float radius, int maxPx) {
        if (src == null) return null;
        // 위젯 표시 크기에 맞춰 작게 — RemoteViews 비트맵 예산 초과(→ updateAppWidget
        // 예외)를 막는다.
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

    private void applyBadge(RemoteViews rv, int newCount) {
        if (newCount > 0) {
            rv.setViewVisibility(R.id.widget_badge, View.VISIBLE);
            rv.setTextViewText(R.id.widget_badge, newCount > 99 ? "99+" : String.valueOf(newCount));
        } else {
            rv.setViewVisibility(R.id.widget_badge, View.GONE);
        }
    }

    /** 생일 기준 나이 문자열. 태어났으면 "D+123 · 4개월", 출산 전이면 "D-89". */
    static String ageLabel(String birthDate) {
        if (birthDate == null || birthDate.length() < 10) return "";
        try {
            int by = Integer.parseInt(birthDate.substring(0, 4));
            int bm = Integer.parseInt(birthDate.substring(5, 7));
            int bd = Integer.parseInt(birthDate.substring(8, 10));
            Calendar birth = Calendar.getInstance();
            birth.clear();
            birth.set(by, bm - 1, bd);
            Calendar today = Calendar.getInstance();
            Calendar todayMid = Calendar.getInstance();
            todayMid.clear();
            todayMid.set(today.get(Calendar.YEAR), today.get(Calendar.MONTH), today.get(Calendar.DAY_OF_MONTH));

            long days = Math.round((todayMid.getTimeInMillis() - birth.getTimeInMillis()) / 86400000.0);
            if (days < 0) return "D-" + (-days);

            int months = (todayMid.get(Calendar.YEAR) - by) * 12 + (todayMid.get(Calendar.MONTH) - (bm - 1));
            if (todayMid.get(Calendar.DAY_OF_MONTH) < bd) months -= 1;
            String s = "D+" + days;
            if (months > 0) s += " · " + months + "개월";
            return s;
        } catch (Exception e) {
            return "";
        }
    }
}
