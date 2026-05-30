package im.bebe.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
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
import org.json.JSONObject;

/**
 * 위젯 갱신 워커 — 서버 /api/widget/data 에서 최신 사진·아기 정보를 받아 모든 위젯
 * 인스턴스를 업데이트한다. 나이는 저장된 생일로 매번 로컬 계산(날짜만 바뀌면 자동 갱신).
 * 네트워크 실패 시 마지막 상태 유지(조용히).
 */
public class WidgetRefreshWorker extends Worker {

    private static final String PERIODIC_NAME = "bebe-widget-refresh";
    private static final String KEY_BIRTHDATE = "birthDate";
    private static final String KEY_BABYNAME = "babyName";
    private static final String KEY_IMAGE_PATH = "imagePath";

    public WidgetRefreshWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    public static void enqueueNow(Context ctx) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build();
        WorkManager.getInstance(ctx).enqueue(req);
    }

    public static void ensurePeriodic(Context ctx) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(
                WidgetRefreshWorker.class, 3, TimeUnit.HOURS)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
            PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, req);
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
                fetchAndCache(sp, serverUrl, token);
            } catch (Exception e) {
                // 조용히 실패 — 마지막 캐시로 렌더(아래). 다음 주기 재시도.
            }
        }
        render(ctx, sp);
        return Result.success();
    }

    private void fetchAndCache(SharedPreferences sp, String serverUrl, String token) throws Exception {
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
        String babyName = json.optString("babyName", "");
        String birthDate = json.optString("birthDate", "");
        String photoUrl = json.isNull("photoUrl") ? null : json.optString("photoUrl", null);

        SharedPreferences.Editor ed = sp.edit();
        ed.putString(KEY_BABYNAME, babyName);
        ed.putString(KEY_BIRTHDATE, birthDate);

        if (photoUrl != null && !photoUrl.isEmpty()) {
            Bitmap bmp = downloadBitmap(photoUrl);
            if (bmp != null) {
                java.io.File f = new java.io.File(getApplicationContext().getFilesDir(), "widget_photo.jpg");
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(f)) {
                    bmp.compress(Bitmap.CompressFormat.JPEG, 90, fos);
                }
                ed.putString(KEY_IMAGE_PATH, f.getAbsolutePath());
            }
        }
        ed.apply();
    }

    private Bitmap downloadBitmap(String photoUrl) throws Exception {
        URL url = new URL(photoUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);
        if (conn.getResponseCode() != 200) return null;
        try (InputStream is = conn.getInputStream()) {
            return BitmapFactory.decodeStream(is);
        }
    }

    private void render(Context ctx, SharedPreferences sp) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, BebeWidgetProvider.class));
        if (ids == null || ids.length == 0) return;

        String babyName = sp.getString(KEY_BABYNAME, "");
        String birthDate = sp.getString(KEY_BIRTHDATE, "");
        String imagePath = sp.getString(KEY_IMAGE_PATH, null);
        String ageText = ageLabel(birthDate);

        for (int id : ids) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.bebe_widget);
            rv.setTextViewText(R.id.widget_name, babyName == null ? "" : babyName);
            rv.setTextViewText(R.id.widget_age, ageText);
            if (imagePath != null) {
                Bitmap bmp = BitmapFactory.decodeFile(imagePath);
                if (bmp != null) rv.setImageViewBitmap(R.id.widget_photo, bmp);
            }
            rv.setOnClickPendingIntent(R.id.widget_root, BebeWidgetProvider.tapIntent(ctx));
            mgr.updateAppWidget(id, rv);
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
