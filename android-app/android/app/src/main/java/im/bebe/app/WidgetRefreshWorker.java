package im.bebe.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.TypedValue;
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
    private static final int MAX_MEMORY_PHOTOS = 4;
    // 렌더 비트맵의 긴 변(px). 위젯 종횡비대로 캔버스를 만들되 이 값을 넘지 않게 해
    // RemoteViews/바인더 예산(≈1MB)을 지킨다: 420²×4 ≈ 0.70MB.
    private static final int FRAME_MAX_PX = 420;
    // 위젯은 자유 리사이즈라 극단적 비율이 나올 수 있다 — 캔버스 크기를 묶어둔다.
    private static final float MIN_ASPECT = 0.4f;
    private static final float MAX_ASPECT = 2.5f;

    // 위젯별 표시 스타일(SharedPrefs). 모드 버튼이 이 목록을 순환한다.
    static final String STYLE_PHOTO = "photo";
    static final String STYLE_GRID = "grid";
    static final String STYLE_DDAY = "dday";
    static final String STYLE_MEMORY = "memory";
    static final String STYLE_MINIMAL = "minimal";

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
        return photoFile(ctx, id, i, false);
    }
    private static String photoFile(Context ctx, int id, int i, boolean memory) {
        String kind = memory ? "_memory_" : "_photo_";
        return new java.io.File(ctx.getFilesDir(), "w" + id + kind + i + ".jpg").getAbsolutePath();
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
            render(ctx, sp, mgr, id, quad);
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
        // 나이 라벨·추억은 서버가 만들어 보낸다 — 날짜 계산과 로케일이 앱과 갈라지지 않게.
        // 구버전 서버는 이 필드가 없다 → 빈 값이면 해당 스타일을 순환에서 건너뛴다.
        ed.putString(wk(id, "ageText"), json.optString("ageText", ""));
        ed.putString(wk(id, "memoryLabel"), json.optString("memoryLabel", ""));

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
        // 추억 사진도 미리 받아둔다 — 스타일 전환이 네트워크 없이 즉시 되어야 한다.
        ed.putInt(wk(id, "memoryCount"), cachePhotos(ctx, id, base, json.optJSONArray("memoryUrls"),
            MAX_MEMORY_PHOTOS, true));
        ed.apply();
    }

    /** urls 를 최대 max 장까지 받아 위젯 캐시 파일로 저장하고 저장한 장수를 돌려준다. */
    private int cachePhotos(Context ctx, int id, String base, JSONArray urls, int max, boolean memory) {
        int saved = 0;
        if (urls == null) return 0;
        for (int i = 0; i < urls.length() && saved < max; i++) {
            String u = urls.optString(i, null);
            if (u == null || u.isEmpty()) continue;
            if (!u.startsWith("http://") && !u.startsWith("https://")) {
                u = base + (u.startsWith("/") ? u : "/" + u);
            }
            try {
                Bitmap bmp = downloadBitmap(u);
                if (bmp == null) continue;
                java.io.File f = new java.io.File(photoFile(ctx, id, saved, memory));
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(f)) {
                    bmp.compress(Bitmap.CompressFormat.JPEG, 90, fos);
                }
                saved++;
            } catch (Exception ignored) {
                // 한 장 실패가 나머지를 막지 않게 — 받은 만큼만 캐시한다.
            }
        }
        return saved;
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
            opts.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, FRAME_MAX_PX);
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
            "server", "token", "babyName", "newCount", "photoCount", "shuffleIdx", "photoDates",
            "mode", "style", "ageText", "memoryLabel", "memoryCount"
        };
        for (int id : ids) {
            for (String s : suffixes) ed.remove(wk(id, s));
            for (int i = 0; i < MAX_PHOTOS; i++) {
                try {
                    new java.io.File(photoFile(ctx, id, i, false)).delete();
                } catch (Exception ignored) {
                }
            }
            for (int i = 0; i < MAX_MEMORY_PHOTOS; i++) {
                try {
                    new java.io.File(photoFile(ctx, id, i, true)).delete();
                } catch (Exception ignored) {
                }
            }
        }
        ed.apply();
    }

    /** 새로고침 버튼 — 큰사진은 무작위 1장, 그리드는 다음 4장 묶음. */
    static void shuffle(Context ctx, int id) {
        SharedPreferences sp = ctx.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        boolean quad = isQuad(ctx, mgr, id);
        String style = styleOf(sp, id, quad);
        int count = photoCountFor(sp, id, style);
        if (count > 1) {
            int cur = sp.getInt(wk(id, "shuffleIdx"), 0);
            int next;
            if (STYLE_GRID.equals(style)) {
                // 다음 4장 윈도로 회전(사진이 4장 이하면 사실상 그대로라 표시 변화 없음).
                next = (cur + 4) % count;
            } else {
                next = cur;
                for (int t = 0; t < 8 && next == cur; t++) next = (int) (Math.random() * count);
            }
            sp.edit().putInt(wk(id, "shuffleIdx"), next).apply();
        }
        try {
            render(ctx, sp, mgr, id, quad);
        } catch (Throwable ignored) {
        }
    }

    /** 스타일 버튼 — 그 위젯만 다음 스타일로. 네트워크 없이 캐시에서 즉시 다시 그린다. */
    static void toggleMode(Context ctx, int id) {
        SharedPreferences sp = ctx.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        boolean quad = isQuad(ctx, mgr, id);
        String[] all = stylesFor(sp, id, quad);
        String cur = styleOf(sp, id, quad);
        int at = 0;
        for (int i = 0; i < all.length; i++) if (all[i].equals(cur)) at = i;
        // 스타일이 바뀌면 사진 풀도 바뀔 수 있다(추억↔일반) — 인덱스를 처음으로.
        sp.edit().putString(wk(id, "style"), all[(at + 1) % all.length]).putInt(wk(id, "shuffleIdx"), 0).apply();
        try {
            render(ctx, sp, mgr, id, quad);
        } catch (Throwable ignored) {
        }
    }

    /** 위젯 크기가 바뀌면 액자 비율이 달라진다 — 캐시에서 다시 그린다(네트워크 없음). */
    static void reRender(Context ctx, int id) {
        SharedPreferences sp = ctx.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE);
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        try {
            render(ctx, sp, mgr, id, isQuad(ctx, mgr, id));
        } catch (Throwable ignored) {
        }
    }

    /** 이 위젯에서 고를 수 있는 스타일 순서. 4장 콜라주는 3×3 위젯에서만, 추억은 사진이 있을 때만. */
    private static String[] stylesFor(SharedPreferences sp, int id, boolean quad) {
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        out.add(STYLE_PHOTO);
        if (quad) out.add(STYLE_GRID);
        if (!sp.getString(wk(id, "ageText"), "").isEmpty()) out.add(STYLE_DDAY);
        if (sp.getInt(wk(id, "memoryCount"), 0) > 0) out.add(STYLE_MEMORY);
        out.add(STYLE_MINIMAL);
        return out.toArray(new String[0]);
    }

    /** 저장된 스타일. 구버전 'mode' 키(single/grid)를 이어받고, 지금 고를 수 없는 스타일이면 기본으로. */
    private static String styleOf(SharedPreferences sp, int id, boolean quad) {
        String s = sp.getString(wk(id, "style"), null);
        if (s == null) s = "grid".equals(sp.getString(wk(id, "mode"), null)) ? STYLE_GRID : STYLE_PHOTO;
        for (String allowed : stylesFor(sp, id, quad)) if (allowed.equals(s)) return s;
        return STYLE_PHOTO;
    }

    private static int photoCountFor(SharedPreferences sp, int id, String style) {
        return STYLE_MEMORY.equals(style)
            ? sp.getInt(wk(id, "memoryCount"), 0)
            : sp.getInt(wk(id, "photoCount"), 0);
    }

    private static boolean isQuad(Context ctx, AppWidgetManager mgr, int id) {
        for (int q : mgr.getAppWidgetIds(new ComponentName(ctx, BebeQuadWidgetProvider.class))) {
            if (q == id) return true;
        }
        return false;
    }

    /**
     * 위젯 1개 렌더. 스타일(사진/콜라주/D+/추억/미니멀)에 따라 표시 요소만 달라지고,
     * 사진은 항상 위젯의 실제 종횡비로 만든 액자에 담는다.
     *
     * ⚠️ 액자를 비트맵에 굽는 이유: 레이아웃의 ImageView 는 scaleType="centerCrop" 인데
     * RemoteViews 로는 scaleType 을 런타임에 바꿀 수 없다(enum setter 없음). 비트맵을
     * 뷰와 같은 비율로 만들어 두면 centerCrop 이 아무것도 잘라내지 않는다.
     */
    private static void render(
            Context ctx, SharedPreferences sp, AppWidgetManager mgr, int id, boolean quad) {
        final String style = styleOf(sp, id, quad);
        final boolean memory = STYLE_MEMORY.equals(style);
        final boolean grid = STYLE_GRID.equals(style);
        final boolean minimal = STYLE_MINIMAL.equals(style);
        final boolean dday = STYLE_DDAY.equals(style);

        final int count = photoCountFor(sp, id, style);
        int idx = sp.getInt(wk(id, "shuffleIdx"), 0);
        if (count > 0) idx = ((idx % count) + count) % count;
        final float aspect = widgetAspect(mgr, id);

        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.bebe_widget);

        if (count > 0) {
            Bitmap b;
            if (grid) {
                int[] cells = new int[4];
                for (int k = 0; k < 4; k++) cells[k] = (idx + k) % count; // 사진 적으면 순환
                b = composeQuad(ctx, id, cells, aspect, memory);
            } else {
                b = framed(decodeFileSampled(photoFile(ctx, id, idx, memory), FRAME_MAX_PX), aspect);
            }
            if (b != null) rv.setImageViewBitmap(R.id.widget_photo, b);
        }

        // ⚠️ 보이기/숨기기를 **양방향 모두** 써야 한다. 레이아웃 id 가 같으면 호스트가
        // 기존 뷰를 재사용하고 새 RemoteViews 에 담긴 액션만 재생한다(reapply) — 한쪽에서만
        // GONE 하면 다음 스타일에서 XML 기본값으로 돌아오지 않고 영영 숨은 채로 남는다.
        rv.setViewVisibility(R.id.widget_scrim, minimal ? View.GONE : View.VISIBLE);
        rv.setViewVisibility(R.id.widget_caption, minimal ? View.GONE : View.VISIBLE);

        if (minimal) {
            // 사진만 — 글자·뱃지를 모두 걷어낸다.
            rv.setViewVisibility(R.id.widget_date, View.GONE);
            rv.setViewVisibility(R.id.widget_badge, View.GONE);
            rv.setViewVisibility(R.id.widget_refresh, View.GONE);
        } else {
            rv.setTextViewText(R.id.widget_name, sp.getString(wk(id, "babyName"), ""));
            if (dday) {
                // D+ 카드 — 나이가 주인공. 날짜는 빼서 시선을 하나로 모은다.
                rv.setViewVisibility(R.id.widget_age, View.VISIBLE);
                rv.setTextViewText(R.id.widget_age, sp.getString(wk(id, "ageText"), ""));
                rv.setTextViewTextSize(R.id.widget_age, TypedValue.COMPLEX_UNIT_SP, 24f);
                rv.setViewVisibility(R.id.widget_date, View.GONE);
            } else {
                rv.setViewVisibility(R.id.widget_age, View.GONE);
                // 추억 스타일은 촬영일 대신 "1년 전 오늘" 라벨을 같은 자리에 쓴다.
                String top = memory
                    ? sp.getString(wk(id, "memoryLabel"), "")
                    : photoDateLabel(sp.getString(wk(id, "photoDates"), ""), idx);
                if (top != null && !top.isEmpty()) {
                    rv.setViewVisibility(R.id.widget_date, View.VISIBLE);
                    rv.setTextViewText(R.id.widget_date, top);
                } else {
                    rv.setViewVisibility(R.id.widget_date, View.GONE);
                }
            }
            applyBadge(rv, sp.getInt(wk(id, "newCount"), 0));
            if (count > 1) {
                rv.setViewVisibility(R.id.widget_refresh, View.VISIBLE);
                rv.setOnClickPendingIntent(R.id.widget_refresh, BebeWidgetProvider.shuffleIntent(ctx, id));
            } else {
                rv.setViewVisibility(R.id.widget_refresh, View.GONE);
            }
        }

        // 스타일 버튼은 미니멀에서도 남긴다 — 없애면 미니멀에서 빠져나올 길이 사라진다.
        // 대신 배경 원과 아이콘을 흐리게 해 사진을 방해하지 않는다.
        String[] all = stylesFor(sp, id, quad);
        rv.setViewVisibility(R.id.widget_mode, all.length > 1 ? View.VISIBLE : View.GONE);
        int at = 0;
        for (int i = 0; i < all.length; i++) if (all[i].equals(style)) at = i;
        String next = all[(at + 1) % all.length];
        rv.setImageViewResource(R.id.widget_mode,
            STYLE_GRID.equals(next) ? R.drawable.widget_mode_grid : R.drawable.widget_mode_single);
        // 같은 reapply 이유로 두 속성 모두 매번 명시한다 — 미니멀에서 나온 뒤에도 버튼이
        // 흐린 유령으로 남아, 정작 스타일을 되돌릴 유일한 컨트롤이 안 보이게 됐다.
        rv.setInt(R.id.widget_mode, "setBackgroundResource", minimal ? 0 : R.drawable.widget_icon_bg);
        rv.setInt(R.id.widget_mode, "setImageAlpha", minimal ? 90 : 255);
        rv.setOnClickPendingIntent(R.id.widget_mode, BebeWidgetProvider.modeIntent(ctx, id));

        rv.setOnClickPendingIntent(R.id.widget_root,
            BebeWidgetProvider.tapIntent(ctx, id, sp.getString(wk(id, "server"), null)));
        mgr.updateAppWidget(id, rv);
    }

    /**
     * 위젯이 실제로 차지한 폭/높이 비(w/h). 런처 셀은 보통 세로로 길고 사용자가 자유롭게
     * 리사이즈하므로 고정값으로 가정할 수 없다. 값을 못 읽으면 정사각으로 둔다.
     */
    private static float widgetAspect(AppWidgetManager mgr, int id) {
        try {
            android.os.Bundle o = mgr.getAppWidgetOptions(id);
            if (o != null) {
                // 세로 방향 기준: 폭은 MIN_WIDTH, 높이는 MAX_HEIGHT 가 실제 크기에 가깝다.
                int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
                int h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
                if (w > 0 && h > 0) {
                    return Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, (float) w / h));
                }
            }
        } catch (Throwable ignored) {
        }
        return 1f;
    }

    /**
     * 4장을 2×2 로 합성한 비트맵 1장. 캔버스를 **위젯 종횡비**로 만드는 게 핵심 — 정사각으로
     * 만들면 세로로 긴 위젯에서 ImageView 가 다시 centerCrop 해 좌우가 통째로 잘렸다(이중 크롭).
     * 칸 자체는 centerCrop 을 유지한다: 칸이 작아 크롭이 덜 거슬리고, 네 칸 모두 레터박스를
     * 두면 여백이 격자처럼 남아 산만하다.
     */
    private static Bitmap composeQuad(Context ctx, int id, int[] photoIdx, float aspect, boolean memory) {
        final int cw = canvasW(aspect), ch = canvasH(aspect);
        Bitmap out = Bitmap.createBitmap(cw, ch, Bitmap.Config.ARGB_8888);
        android.graphics.Canvas c = new android.graphics.Canvas(out);
        // widget_bg 블루와 같은 톤으로 채워, 디코드 실패 등으로 빈 칸이 생겨도 위화감 없게.
        c.drawColor(0xFF7BA0F7);
        android.graphics.Paint p = new android.graphics.Paint(
            android.graphics.Paint.ANTI_ALIAS_FLAG | android.graphics.Paint.FILTER_BITMAP_FLAG);
        final int halfW = cw / 2, halfH = ch / 2;
        boolean any = false;
        for (int q = 0; q < 4; q++) {
            if (photoIdx[q] < 0) continue;
            Bitmap src = decodeFileSampled(photoFile(ctx, id, photoIdx[q], memory), Math.max(halfW, halfH));
            if (src == null) continue;
            // 홀수 픽셀에서 가운데 틈이 생기지 않게 오른쪽·아래 칸은 남은 만큼 채운다.
            int l = (q % 2) * halfW, top = (q / 2) * halfH;
            int w = (q % 2 == 0) ? halfW : cw - halfW;
            int h = (q / 2 == 0) ? halfH : ch - halfH;
            drawCenterCrop(c, src, p, l, top, w, h);
            src.recycle();
            any = true;
        }
        return any ? roundCorners(out, 40f) : null;
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

    private static int canvasW(float aspect) {
        return aspect >= 1f ? FRAME_MAX_PX : Math.max(1, Math.round(FRAME_MAX_PX * aspect));
    }

    private static int canvasH(float aspect) {
        return aspect >= 1f ? Math.max(1, Math.round(FRAME_MAX_PX / aspect)) : FRAME_MAX_PX;
    }

    /**
     * 사진을 위젯 종횡비의 액자에 담는다. 사진은 잘리지 않고 전체가 보이며(fitCenter),
     * 남는 여백은 같은 사진을 크게 키워 흐린 배경으로 채운다 — 가로 사진을 세로 위젯에
     * 넣어도 좌우가 날아가지 않는다.
     */
    private static Bitmap framed(Bitmap src, float aspect) {
        if (src == null) return null;
        final int cw = canvasW(aspect), ch = canvasH(aspect);
        Bitmap out = Bitmap.createBitmap(cw, ch, Bitmap.Config.ARGB_8888);
        android.graphics.Canvas c = new android.graphics.Canvas(out);
        android.graphics.Paint p = new android.graphics.Paint(
            android.graphics.Paint.ANTI_ALIAS_FLAG | android.graphics.Paint.FILTER_BITMAP_FLAG);

        Bitmap bg = blurred(src, cw, ch);
        if (bg != null) {
            c.drawBitmap(bg, null, new android.graphics.Rect(0, 0, cw, ch), p);
            bg.recycle();
            // 흐린 배경이 전경만큼 밝으면 사진 경계가 뭉개진다 — 살짝 눌러 준다.
            c.drawColor(0x40000000);
        } else {
            c.drawColor(0xFF7BA0F7);
        }

        float s = Math.min((float) cw / src.getWidth(), (float) ch / src.getHeight());
        int dw = Math.max(1, Math.round(src.getWidth() * s));
        int dh = Math.max(1, Math.round(src.getHeight() * s));
        int dl = (cw - dw) / 2, dt = (ch - dh) / 2;
        c.drawBitmap(src, null, new android.graphics.Rect(dl, dt, dl + dw, dt + dh), p);
        return roundCorners(out, 40f);
    }

    /**
     * 다운스케일 후 필터 업스케일로 낸 블러. RenderScript 는 API 31 에서 폐기됐고
     * RenderEffect 는 31+ 인데 minSdk 가 22 라, 의존성 없이 전 기기에서 도는 이 방법을 쓴다.
     */
    private static Bitmap blurred(Bitmap src, int w, int h) {
        try {
            int sw = Math.max(1, w / 24), sh = Math.max(1, h / 24);
            Bitmap small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas c = new android.graphics.Canvas(small);
            android.graphics.Paint p =
                new android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG);
            drawCenterCrop(c, src, p, 0, 0, sw, sh);
            Bitmap big = Bitmap.createScaledBitmap(small, w, h, true);
            small.recycle();
            return big;
        } catch (Throwable t) {
            return null;
        }
    }

    /** 비트맵 모서리를 둥글게. */
    private static Bitmap roundCorners(Bitmap b, float radius) {
        if (b == null) return null;
        Bitmap out = Bitmap.createBitmap(b.getWidth(), b.getHeight(), Bitmap.Config.ARGB_8888);
        android.graphics.Canvas canvas = new android.graphics.Canvas(out);
        android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new android.graphics.BitmapShader(
            b, android.graphics.Shader.TileMode.CLAMP, android.graphics.Shader.TileMode.CLAMP));
        android.graphics.RectF rect = new android.graphics.RectF(0, 0, b.getWidth(), b.getHeight());
        canvas.drawRoundRect(rect, radius, radius, paint);
        b.recycle();
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
