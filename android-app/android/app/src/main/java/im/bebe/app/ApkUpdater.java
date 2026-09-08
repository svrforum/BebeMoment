package im.bebe.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;

/**
 * 앱 내 업데이트 — 릴리스 APK 를 받아 설치 화면까지 연다.
 *
 * ⚠️ 페이지가 준 URL 을 그대로 설치하면 위험하다. 우리 릴리스 자산 경로로 시작하는 URL 만
 * 이 경로를 타고, 받은 파일의 패키지명까지 확인한 뒤에야 설치 화면을 연다.
 */
final class ApkUpdater {

    private static final String APK_URL_PREFIX =
        "https://github.com/svrforum/BebeMoment/releases/download/";
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final String PREF_DOWNLOAD_ID = "apkDownloadId";
    private static final String FLOW = NativeDiagnostics.FLOW_APK;

    static boolean isOwnApkUrl(String url) {
        return url != null && url.startsWith(APK_URL_PREFIX) && url.toLowerCase().endsWith(".apk");
    }

    static String filenameFromUrl(Uri uri) {
        final String last = uri != null ? uri.getLastPathSegment() : null;
        return last != null && last.toLowerCase().endsWith(".apk") ? last : "update.apk";
    }

    private final Activity activity;
    private BroadcastReceiver receiver;
    private boolean resumed = false;

    ApkUpdater(Activity activity) {
        this.activity = activity;
    }

    void onResume() {
        resumed = true;
        // 다운로드가 백그라운드에서 끝났으면 그때는 설치 화면을 띄울 수 없었다(안드로이드 10+
        // 가 막는다) — 돌아온 지금 이어서 연다. 프로세스가 죽었다 살아나도 SharedPrefs 에
        // 남긴 다운로드 id 로 찾아낸다.
        try {
            maybeInstall();
        } catch (Throwable t) {
            NativeDiagnostics.report(activity, FLOW, "resume-install", t);
        }
    }

    void onStop() {
        resumed = false;
    }

    void onDestroy() {
        if (receiver == null) return;
        try {
            activity.unregisterReceiver(receiver);
        } catch (Exception e) {
            NativeDiagnostics.warn(FLOW, "unregister-receiver", e);
        }
        receiver = null;
    }

    /** 업데이트 APK 를 받기 시작한다(설치 권한이 없으면 설정으로 안내). */
    void start(String url, String filename) {
        // 8.0+ 는 앱별로 "이 출처의 앱 설치 허용"이 켜져 있어야 설치 화면이 뜬다. OS 정책이라
        // 우회할 수 없으므로 설정으로 안내하고, 켠 뒤 다시 누르면 그대로 진행된다.
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(activity, "업데이트를 설치하려면 이 앱의 설치 권한을 켜주세요", Toast.LENGTH_LONG).show();
            try {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                    .setData(Uri.parse("package:" + activity.getPackageName())));
            } catch (Exception e) {
                NativeDiagnostics.report(activity, FLOW, "open-install-settings", e);
            }
            return;
        }
        final DownloadManager dm =
            (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            NativeDiagnostics.report(activity, FLOW, "no-download-manager", "DOWNLOAD_SERVICE null");
            Toast.makeText(activity, "다운로드를 시작할 수 없어요", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            // 같은 이름이 남아 있으면 DownloadManager 가 "<이름>-1.apk" 로 비켜 쓴다. 지난 시도의
            // 조각이 남아 계속 그걸 설치하려 드는 걸 막으려고 먼저 치운다.
            final File stale =
                new File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), filename);
            if (stale.exists() && !stale.delete()) {
                NativeDiagnostics.warn(FLOW, "stale-delete", stale.getName());
            }

            final DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setMimeType(APK_MIME);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            // 앱 전용 외부 폴더 — 저장소 권한이 필요 없고 FileProvider 로 설치 화면에 넘길 수 있다.
            req.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, filename);
            final long id = dm.enqueue(req);
            // 다운로드가 끝나기 전에 프로세스가 죽어도 이어갈 수 있게 남긴다 — 액티비티 필드로만
            // 들고 있으면 화면 회전·메모리 회수에 설치가 통째로 사라진다.
            prefs().edit().putLong(PREF_DOWNLOAD_ID, id).apply();
            registerReceiver();
            Toast.makeText(activity, "업데이트를 받고 있어요", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            NativeDiagnostics.report(activity, FLOW, "enqueue", e);
            Toast.makeText(activity, "다운로드 실패: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private SharedPreferences prefs() {
        return activity.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE);
    }

    private void registerReceiver() {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                maybeInstall();
            }
        };
        final IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        // 13+ 는 export 여부를 명시해야 한다. 시스템 브로드캐스트라 EXPORTED.
        if (Build.VERSION.SDK_INT >= 33) {
            activity.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            activity.registerReceiver(receiver, filter);
        }
    }

    /**
     * 받아둔 업데이트가 있으면 설치 화면을 연다. 브로드캐스트 수신 시점과 onResume 양쪽에서
     * 부른다 — 다운로드 중 앱을 벗어나 있으면 그때는 설치를 띄울 수 없기 때문.
     */
    private void maybeInstall() {
        // ⚠️ 화면에 없을 때 startActivity 는 안드로이드 10+ 가 조용히 막는다(예외도 안 난다).
        // 그래서 포그라운드일 때만 열고, 아니면 다음 onResume 까지 미룬다.
        if (!resumed) return;
        final SharedPreferences sp = prefs();
        final long id = sp.getLong(PREF_DOWNLOAD_ID, -1);
        if (id < 0) return;
        final DownloadManager dm =
            (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            NativeDiagnostics.report(activity, FLOW, "no-download-manager", "DOWNLOAD_SERVICE null");
            return;
        }

        String localUri = null;
        int status = -1;
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
            if (c != null && c.moveToFirst()) {
                status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                localUri = c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI));
            }
        } catch (Exception e) {
            NativeDiagnostics.report(activity, FLOW, "query-download", e);
        }
        if (status == DownloadManager.STATUS_PENDING || status == DownloadManager.STATUS_RUNNING
            || status == DownloadManager.STATUS_PAUSED) {
            return; // 아직 받는 중 — 다음 신호를 기다린다.
        }
        sp.edit().remove(PREF_DOWNLOAD_ID).apply();
        if (status != DownloadManager.STATUS_SUCCESSFUL || localUri == null) {
            // 완료 브로드캐스트는 실패해도 온다 — 확인 없이 설치를 띄우면 깨진 파일을 연다.
            NativeDiagnostics.report(activity, FLOW, "download-failed", "status=" + status);
            Toast.makeText(activity, "업데이트를 받지 못했어요. 다시 시도해주세요", Toast.LENGTH_LONG).show();
            return;
        }
        launchInstaller(localUri);
    }

    private void launchInstaller(String localUri) {
        try {
            // ⚠️ 요청한 파일명으로 경로를 되만들면 안 된다 — 같은 이름이 있으면
            // DownloadManager 가 "<이름>-1.apk" 로 비켜 쓴다. 실제 기록된 경로를 쓴다.
            final String path = Uri.parse(localUri).getPath();
            final File apk = path != null ? new File(path) : null;
            if (apk == null || !apk.exists() || apk.length() == 0) {
                NativeDiagnostics.report(activity, FLOW, "missing-file", "downloaded apk not found");
                Toast.makeText(activity, "받은 파일을 찾지 못했어요", Toast.LENGTH_LONG).show();
                return;
            }
            // 받은 바이트가 정말 우리 앱인지 확인한다 — URL 검사만 믿지 않는다.
            final PackageInfo info =
                activity.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
            if (info == null || !activity.getPackageName().equals(info.packageName)) {
                NativeDiagnostics.report(activity, FLOW, "package-mismatch",
                    "apk package=" + (info == null ? "null" : info.packageName));
                Toast.makeText(activity, "업데이트 파일이 올바르지 않아요", Toast.LENGTH_LONG).show();
                return;
            }
            // 7.0+ 는 file:// 을 다른 앱에 넘기면 FileUriExposedException — content:// 로 준다.
            final Uri uri = FileProvider.getUriForFile(
                activity, activity.getPackageName() + ".fileprovider", apk);
            activity.startActivity(new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, APK_MIME)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            // 조용히 죽지 않는다 — 파일은 받아졌으니 알림에서 직접 설치할 수 있다고 알린다.
            NativeDiagnostics.report(activity, FLOW, "launch-installer", e);
            Toast.makeText(activity, "설치 화면을 열지 못했어요. 알림에서 열어주세요", Toast.LENGTH_LONG).show();
        }
    }
}
