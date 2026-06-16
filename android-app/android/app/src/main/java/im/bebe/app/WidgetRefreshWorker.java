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
    // 4장 콜라주 한 장의 정사각 캔버스(px). 비트맵 1개라 RemoteViews/바인더 예산 안전
    // (440²×4 ≈ 0.77MB < 1MB). 각 칸은 절반(220px) 정밀도로 다운샘플 디코드.
    private static final int QUAD_CANVAS_PX = 440;
    // 4장 위젯의 표시 모드(위젯별 SharedPrefs). 기본은 큰사진 1장, 토글로 그리드 전환.
    static final String MODE_SINGLE = "single";
    static final String MODE_GRID = "grid";

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
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, BebeQuadWidgetProvider.class))) {
            processWidget(ctx, sp, mgr, id, true);
        }
        return Result.success();
    }

    /** 위젯 1개: 서버/토큰 해석(필요 시 활성 가족으로 bind) → fetch → render. */
    private void processWidget(Context ctx, SharedPreferences sp, AppWidgetManager mgr, int id, boolean quad) {
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
            if (quad) renderQuad(ctx, sp, mgr, id);
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
        StringBuilder body = new StringBuilder();
        try {
            if (conn.getResponseCode() != 200) return;
            try (InputStream is = conn.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = is.read(buf)) != -1) body.append(new String(buf, 0, n, "UTF-8"));
            }
        } finally {
            conn.disconnect();
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
        try {
            if (conn.getResponseCode() != 200) return null;
            java.io.ByteArrayOutputStream bout = new java.io.ByteArrayOutputStream();
            try (InputStream is = conn.getInputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) != -1) bout.write(buf, 0, n);
            }
            byte[] data = bout.toByteArray();
            // 위젯 표시 크기(≤단일 420px)에 맞춰 다운샘플 디코드 — 풀해상도 비트맵을
            // 메모리에 안 올린다(저사양 기기 OOM 방지).
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, SINGLE_MAX_PX);
            return BitmapFactory.decodeByteArray(data, 0, data.length, opts);
        } finally {
            conn.disconnect();
        }
    }

    private static int sampleSize(int w, int h, int target) {
        int s = 1;
        final int max = Math.max(w, h);
        // target*2 여유로 둬 화질을 유지하면서 메모리만 절감(2의 거듭제곱).
        while (max > 0 && max / s > target * 2) s *= 2;
        return s;
    }

    /** 위젯이 제거되면 그 위젯의 캐시(설정 키 + 사진 파일)를 정리 — 디스크 누수 방지. */
    static void onWidgetsDeleted(Context ctx, int[] ids) {
        SharedPreferences sp = ctx.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = sp.edit();
        final String[] suffixes = {
            "server", "token", "babyName", "newCount", "photoCount", "shuffleIdx", "photoDates", "mode"
        };
        for (int id : ids) {
            for (String s : suffixes) ed.remove(wk(id, s));
            for (int i = 0; i < MAX_PHOTOS; i++) {
                try {
                    new java.io.File(photoFile(ctx, id, i)).delete();
                } catch (Exception ignored) {
                }
            }
        }
        ed.apply();
    }

    /** 새로고침 버튼 — 큰사진(단일/4장-단일모드)은 무작위 1장, 4장-그리드모드는 다음 4장 묶음. */
    static void shuffle(Context ctx, int id) {
        SharedPreferences sp = ctx.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        boolean quad = isQuad(ctx, mgr, id);
        boolean grid = quad && MODE_GRID.equals(sp.getString(wk(id, "mode"), MODE_SINGLE));
        int count = sp.getInt(wk(id, "photoCount"), 0);
        if (count > 1) {
            int cur = sp.getInt(wk(id, "shuffleIdx"), 0);
            int next;
            if (grid) {
                // 다음 4장 윈도로 회전(사진이 4장 이하면 사실상 그대로라 표시 변화 없음).
                next = (cur + 4) % count;
            } else {
                next = cur;
                for (int t = 0; t < 8 && next == cur; t++) next = (int) (Math.random() * count);
            }
            sp.edit().putInt(wk(id, "shuffleIdx"), next).apply();
        }
        try {
            if (quad) renderQuad(ctx, sp, mgr, id);
            else renderSingle(ctx, sp, mgr, id);
        } catch (Throwable ignored) {
        }
    }

    /** 모드 토글 버튼 — 그 4장 위젯만 그리드↔큰사진 1장으로 전환. */
    static void toggleMode(Context ctx, int id) {
        SharedPreferences sp = ctx.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String cur = sp.getString(wk(id, "mode"), MODE_SINGLE);
        sp.edit().putString(wk(id, "mode"), MODE_GRID.equals(cur) ? MODE_SINGLE : MODE_GRID).apply();
        try {
            renderQuad(ctx, sp, AppWidgetManager.getInstance(ctx), id);
        } catch (Throwable ignored) {
        }
    }

    private static boolean isQuad(Context ctx, AppWidgetManager mgr, int id) {
        for (int q : mgr.getAppWidgetIds(new ComponentName(ctx, BebeQuadWidgetProvider.class))) {
            if (q == id) return true;
        }
        return false;
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
        rv.setOnClickPendingIntent(R.id.widget_root, BebeWidgetProvider.tapIntent(ctx, id, sp.getString(wk(id, "server"), null)));
        if (photoCount > 1) {
            rv.setViewVisibility(R.id.widget_refresh, View.VISIBLE);
            rv.setOnClickPendingIntent(R.id.widget_refresh, BebeWidgetProvider.shuffleIntent(ctx, id));
        } else {
            rv.setViewVisibility(R.id.widget_refresh, View.GONE);
        }
        mgr.updateAppWidget(id, rv);
    }

    /**
     * 4장(3×3) 위젯 — 단일 위젯과 동일한 레이아웃(bebe_widget)·단일-비트맵 구조. 모드(위젯별)
     * 에 따라 큰사진 1장(기본) 또는 4장 2×2 콜라주를 widget_photo 한 장으로 그린다. 그리드는
     * 4장을 콜라주 비트맵 "한 장"으로 합성하므로 RemoteViews 에 비트맵이 1개만 실려 (과거
     * 그리드의) 비트맵 예산 초과 문제가 없다. 사진이 4장 미만이면 순환해 칸을 채운다.
     * 우하단 모드 토글 버튼으로 그리드↔큰사진을 전환한다.
     */
    private static void renderQuad(Context ctx, SharedPreferences sp, AppWidgetManager mgr, int id) {
        String babyName = sp.getString(wk(id, "babyName"), "");
        int photoCount = sp.getInt(wk(id, "photoCount"), 0);
        int newCount = sp.getInt(wk(id, "newCount"), 0);
        int offset = sp.getInt(wk(id, "shuffleIdx"), 0);
        if (photoCount > 0) offset = ((offset % photoCount) + photoCount) % photoCount;
        boolean grid = MODE_GRID.equals(sp.getString(wk(id, "mode"), MODE_SINGLE));

        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.bebe_widget);
        rv.setTextViewText(R.id.widget_name, babyName == null ? "" : babyName);
        rv.setViewVisibility(R.id.widget_age, View.GONE);

        String photoDate = "";
        if (photoCount > 0) {
            if (grid) {
                int[] idx = new int[4];
                for (int k = 0; k < 4; k++) idx[k] = (offset + k) % photoCount; // 사진 적으면 순환
                Bitmap collage = composeQuad(ctx, id, idx, QUAD_CANVAS_PX);
                if (collage != null) rv.setImageViewBitmap(R.id.widget_photo, collage);
                photoDate = photoDateLabel(sp.getString(wk(id, "photoDates"), ""), idx[0]);
            } else {
                Bitmap b = rounded(
                    BitmapFactory.decodeFile(photoFile(ctx, id, offset)), 40f, SINGLE_MAX_PX);
                if (b != null) rv.setImageViewBitmap(R.id.widget_photo, b);
                photoDate = photoDateLabel(sp.getString(wk(id, "photoDates"), ""), offset);
            }
        }
        if (photoDate != null && !photoDate.isEmpty()) {
            rv.setViewVisibility(R.id.widget_date, View.VISIBLE);
            rv.setTextViewText(R.id.widget_date, photoDate);
        } else {
            rv.setViewVisibility(R.id.widget_date, View.GONE);
        }

        applyBadge(rv, newCount);
        rv.setOnClickPendingIntent(R.id.widget_root, BebeWidgetProvider.tapIntent(ctx, id, sp.getString(wk(id, "server"), null)));
        if (photoCount > 1) {
            rv.setViewVisibility(R.id.widget_refresh, View.VISIBLE);
            rv.setOnClickPendingIntent(R.id.widget_refresh, BebeWidgetProvider.shuffleIntent(ctx, id));
        } else {
            rv.setViewVisibility(R.id.widget_refresh, View.GONE);
        }
        // 모드 토글 — 현재가 grid 면 '큰사진' 아이콘(전환 대상)을, 아니면 '그리드' 아이콘을 보인다.
        rv.setViewVisibility(R.id.widget_mode, View.VISIBLE);
        rv.setImageViewResource(
            R.id.widget_mode, grid ? R.drawable.widget_mode_single : R.drawable.widget_mode_grid);
        rv.setOnClickPendingIntent(R.id.widget_mode, BebeWidgetProvider.modeIntent(ctx, id));
        mgr.updateAppWidget(id, rv);
    }

    /** 4장을 2×2 로 합성한 정사각 비트맵 1장. 각 칸은 centerCrop, 바깥 둥근모서리는 OS 가 처리. */
    private static Bitmap composeQuad(Context ctx, int id, int[] photoIdx, int canvasPx) {
        Bitmap out = Bitmap.createBitmap(canvasPx, canvasPx, Bitmap.Config.ARGB_8888);
        android.graphics.Canvas c = new android.graphics.Canvas(out);
        // widget_bg 블루와 같은 톤으로 채워, 디코드 실패 등으로 빈 칸이 생겨도 위화감 없게.
        c.drawColor(0xFF7BA0F7);
        android.graphics.Paint p = new android.graphics.Paint(
            android.graphics.Paint.ANTI_ALIAS_FLAG | android.graphics.Paint.FILTER_BITMAP_FLAG);
        int half = canvasPx / 2;
        boolean any = false;
        for (int q = 0; q < 4; q++) {
            if (photoIdx[q] < 0) continue;
            Bitmap src = decodeFileSampled(photoFile(ctx, id, photoIdx[q]), half);
            if (src == null) continue;
            drawCenterCrop(c, src, p, (q % 2) * half, (q / 2) * half, half, half);
            src.recycle();
            any = true;
        }
        return any ? out : null;
    }

    /** src 를 dst 사각형에 centerCrop(꽉 채움) 으로 그린다. */
    private static void drawCenterCrop(
            android.graphics.Canvas c, Bitmap src, android.graphics.Paint p,
            int dl, int dt, int dw, int dh) {
        int sw = src.getWidth(), sh = src.getHeight();
        if (sw <= 0 || sh <= 0) return;
        float scale = Math.max((float) dw / sw, (float) dh / sh);
        float vw = dw / scale, vh = dh / scale; // 원본에서 잘라낼 영역
        int sx = Math.round((sw - vw) / 2f), sy = Math.round((sh - vh) / 2f);
        android.graphics.Rect srcR = new android.graphics.Rect(
            sx, sy, sx + Math.round(vw), sy + Math.round(vh));
        android.graphics.Rect dstR = new android.graphics.Rect(dl, dt, dl + dw, dt + dh);
        c.drawBitmap(src, srcR, dstR, p);
    }

    /** 캐시 JPEG 를 targetPx 근처로 다운샘플 디코드(콜라주 칸 크기 기준 — 메모리 절감). */
    private static Bitmap decodeFileSampled(String path, int targetPx) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(path, bounds);
        if (bounds.outWidth <= 0) return null;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, targetPx);
        return BitmapFactory.decodeFile(path, opts);
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
