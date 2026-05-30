package im.bebe.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private static final int REQ_POST_NOTIFICATIONS = 4242;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BebePushPlugin.class);
        registerPlugin(BebeWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        requestPostNotificationsIfNeeded();
        handleDeepLink(getIntent());
        setupDownloadListener();
        markUserAgent();
    }

    /**
     * 원격 서버 페이지엔 Capacitor 브리지(window.Capacitor)가 없어 웹이 "네이티브 앱"인지
     * 감지할 수 없다 → User-Agent 에 표식을 넣어 웹이 앱 환경을 인식하게 한다(알림 안내 등).
     */
    private void markUserAgent() {
        if (getBridge() == null) return;
        final WebView wv = getBridge().getWebView();
        if (wv == null) return;
        try {
            final android.webkit.WebSettings s = wv.getSettings();
            final String ua = s.getUserAgentString();
            if (ua != null && !ua.contains("bebeApp")) s.setUserAgentString(ua + " bebeApp");
        } catch (Exception ignored) {
        }
    }

    /**
     * Capacitor WebView 는 기본적으로 `<a download>` / Content-Disposition: attachment
     * 응답을 무시한다 (브라우저가 아니라 앱이라서) — DownloadListener 를 직접 붙여
     * Android DownloadManager 로 넘긴다. 세션 쿠키도 CookieManager 에서 가져와
     * Cookie 헤더로 전달해야 인증된 미디어 다운로드가 동작.
     */
    private void setupDownloadListener() {
        if (getBridge() == null) return;
        final WebView wv = getBridge().getWebView();
        if (wv == null) return;
        wv.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(
                String url,
                String userAgent,
                String contentDisposition,
                String mimeType,
                long contentLength
            ) {
                enqueueDownload(url, userAgent, contentDisposition, mimeType);
            }
        });
    }

    private void enqueueDownload(
        String url,
        String userAgent,
        String contentDisposition,
        String mimeType
    ) {
        try {
            final String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
            final DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            // 같은 WebView 가 세션 쿠키를 들고 있으니 그대로 헤더에 실어 보내야
            // 인증이 필요한 /api/asset/.../download 같은 사설 경로도 통과한다.
            final String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) req.addRequestHeader("Cookie", cookies);
            if (userAgent != null) req.addRequestHeader("User-Agent", userAgent);
            req.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            if (mimeType != null) req.setMimeType(mimeType);
            req.allowScanningByMediaScanner();

            final DownloadManager dm =
                (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                Toast.makeText(MainActivity.this, "다운로드를 시작할 수 없어요", Toast.LENGTH_SHORT).show();
                return;
            }
            dm.enqueue(req);
            Toast.makeText(MainActivity.this, "다운로드를 시작했어요", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(MainActivity.this, "다운로드 실패: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        // 위젯 토큰을 네이티브에서 직접 발급받는다. 원격 서버 페이지에는 Capacitor
        // 브리지(window.Capacitor)가 주입되지 않아 웹→네이티브 플러그인 호출이 안 되므로,
        // WebView 세션 쿠키(CookieManager — 다운로드에서 검증된 방식)로 POST /api/widget/token
        // 을 직접 호출해 토큰을 저장하고 위젯을 갱신한다.
        tryRegisterWidget();
        // FCM 기기 토큰도 같은 이유(원격 페이지에 브리지 없음)로 네이티브에서 등록한다.
        tryRegisterFcm();
    }

    /**
     * FCM 기기 토큰 네이티브 등록. 관리자가 Firebase 를 설정(`/api/push/fcm-config` configured)
     * 했을 때만 동작 — 공개 config 로 2nd FirebaseApp 초기화해 토큰을 받고, 세션 쿠키로
     * `POST /api/notifications/register-device` 한다. 미설정/실패 시 조용히 무동작.
     */
    private void tryRegisterFcm() {
        final String serverUrl = readServerUrl();
        if (serverUrl == null) return;
        final String base = serverUrl.replaceAll("/+$", "");
        new Thread(() -> {
            try {
                final String cfg = httpGet(base + "/api/push/fcm-config");
                if (cfg == null) return;
                final JSONObject j = new JSONObject(cfg);
                if (!j.optBoolean("configured", false)) return;
                final String apiKey = j.optString("apiKey", "");
                final String appId = j.optString("appId", "");
                final String projectId = j.optString("projectId", "");
                final String senderId = j.optString("messagingSenderId", "");
                if (apiKey.isEmpty() || appId.isEmpty() || projectId.isEmpty() || senderId.isEmpty()) return;

                FirebaseApp app;
                try {
                    app = FirebaseApp.getInstance("bebe");
                } catch (IllegalStateException e) {
                    FirebaseOptions opts = new FirebaseOptions.Builder()
                        .setApiKey(apiKey)
                        .setApplicationId(appId)
                        .setProjectId(projectId)
                        .setGcmSenderId(senderId)
                        .build();
                    app = FirebaseApp.initializeApp(getApplicationContext(), opts, "bebe");
                }
                app.get(FirebaseMessaging.class).getToken().addOnCompleteListener(task -> {
                    if (!task.isSuccessful() || task.getResult() == null) return;
                    final String fcmToken = task.getResult();
                    new Thread(() -> {
                        try {
                            final String cookies = CookieManager.getInstance().getCookie(serverUrl);
                            if (cookies == null || !cookies.contains("session")) return;
                            postJson(base + "/api/notifications/register-device", cookies,
                                new JSONObject().put("token", fcmToken).put("platform", "android").toString());
                        } catch (Exception ignored) {
                        }
                    }).start();
                });
            } catch (Exception ignored) {
            }
        }).start();
    }

    private String httpGet(String urlStr) {
        try {
            java.net.HttpURLConnection conn =
                (java.net.HttpURLConnection) new java.net.URL(urlStr).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            if (conn.getResponseCode() != 200) return null;
            return readBody(conn);
        } catch (Exception e) {
            return null;
        }
    }

    private void postJson(String urlStr, String cookies, String json) {
        try {
            java.net.HttpURLConnection conn =
                (java.net.HttpURLConnection) new java.net.URL(urlStr).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Cookie", cookies);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            try (java.io.OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes("UTF-8"));
            }
            conn.getResponseCode();
        } catch (Exception ignored) {
        }
    }

    private static String readBody(java.net.HttpURLConnection conn) throws Exception {
        final StringBuilder sb = new StringBuilder();
        try (java.io.InputStream is = conn.getInputStream()) {
            final byte[] buf = new byte[2048];
            int n;
            while ((n = is.read(buf)) != -1) sb.append(new String(buf, 0, n, "UTF-8"));
        }
        return sb.toString();
    }

    private void tryRegisterWidget() {
        final String serverUrl = readServerUrl();
        if (serverUrl == null) return;
        getWindow().getDecorView().postDelayed(() -> {
            String cookies;
            try {
                cookies = CookieManager.getInstance().getCookie(serverUrl);
            } catch (Exception e) {
                return;
            }
            if (cookies == null || !cookies.contains("session")) return;
            final String c = cookies;
            new Thread(() -> registerWidgetToken(serverUrl, c)).start();
        }, 1500);
    }

    private void registerWidgetToken(String serverUrl, String cookies) {
        try {
            final String base = serverUrl.replaceAll("/+$", "");
            final java.net.HttpURLConnection conn =
                (java.net.HttpURLConnection) new java.net.URL(base + "/api/widget/token").openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Cookie", cookies);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            if (conn.getResponseCode() != 200) return;
            final StringBuilder sb = new StringBuilder();
            try (java.io.InputStream is = conn.getInputStream()) {
                final byte[] buf = new byte[2048];
                int n;
                while ((n = is.read(buf)) != -1) sb.append(new String(buf, 0, n, "UTF-8"));
            }
            final String token = new org.json.JSONObject(sb.toString()).optString("token", null);
            if (token == null || token.isEmpty()) return;
            getApplicationContext()
                .getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(BebeWidgetPlugin.KEY_TOKEN, token)
                .putString(BebeWidgetPlugin.KEY_SERVER, base)
                .apply();
            WidgetRefreshWorker.enqueueNow(getApplicationContext());
        } catch (Exception e) {
            // 다음 onResume 에서 재시도.
        }
    }

    private void requestPostNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        ActivityCompat.requestPermissions(
            this,
            new String[] { Manifest.permission.POST_NOTIFICATIONS },
            REQ_POST_NOTIFICATIONS
        );
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null || getBridge() == null) return;
        final String raw = intent.getStringExtra("deepLink");
        if (raw == null) return;
        final String target = resolveDeepLink(raw);
        if (target == null) return;
        // Delay so the remote app page has a chance to load on a cold start.
        getBridge().getWebView().postDelayed(() -> {
            String js = "window.location.href=" + jsString(target) + ";";
            getBridge().getWebView().evaluateJavascript(js, null);
        }, 600);
    }

    /**
     * Validate a push-supplied URL before we evaluate JS that navigates to it.
     *
     * Accepts:
     *   - A relative path ("/diary/123"): resolved against the configured server origin.
     *   - An absolute http/https URL whose host (+scheme/+port) matches the configured server.
     *
     * Rejects javascript:, data:, intent:, file:, custom schemes, and any cross-origin URL.
     * Returns the URL string to navigate to, or null if the input should be ignored.
     */
    private String resolveDeepLink(String raw) {
        final String trimmed = raw.trim();
        if (trimmed.isEmpty()) return null;

        final String serverUrl = readServerUrl();
        final Uri serverUri = serverUrl != null ? safeParse(serverUrl) : null;

        if (trimmed.startsWith("/")) {
            // Relative path → only meaningful if we know the origin.
            if (serverUri == null) return null;
            return buildOrigin(serverUri) + trimmed;
        }

        final Uri target = safeParse(trimmed);
        if (target == null) return null;
        final String scheme = target.getScheme();
        if (scheme == null) return null;
        final String lowerScheme = scheme.toLowerCase();
        if (!"http".equals(lowerScheme) && !"https".equals(lowerScheme)) return null;
        if (target.getHost() == null) return null;

        if (serverUri == null) {
            // No saved origin to compare against; fall back to the currently loaded page's origin.
            final String currentUrl = getBridge().getWebView().getUrl();
            final Uri currentUri = currentUrl != null ? safeParse(currentUrl) : null;
            if (currentUri == null) return null;
            return sameOrigin(target, currentUri) ? trimmed : null;
        }
        return sameOrigin(target, serverUri) ? trimmed : null;
    }

    private static boolean sameOrigin(Uri a, Uri b) {
        final String aScheme = a.getScheme();
        final String bScheme = b.getScheme();
        final String aHost = a.getHost();
        final String bHost = b.getHost();
        if (aScheme == null || bScheme == null || aHost == null || bHost == null) return false;
        if (!aScheme.equalsIgnoreCase(bScheme)) return false;
        if (!aHost.equalsIgnoreCase(bHost)) return false;
        final int aPort = effectivePort(a);
        final int bPort = effectivePort(b);
        return aPort == bPort;
    }

    private static int effectivePort(Uri u) {
        int p = u.getPort();
        if (p != -1) return p;
        final String s = u.getScheme();
        if ("https".equalsIgnoreCase(s)) return 443;
        if ("http".equalsIgnoreCase(s)) return 80;
        return -1;
    }

    private static String buildOrigin(Uri u) {
        final StringBuilder sb = new StringBuilder();
        sb.append(u.getScheme()).append("://").append(u.getHost());
        final int port = u.getPort();
        if (port != -1) sb.append(':').append(port);
        return sb.toString();
    }

    private static Uri safeParse(String s) {
        try {
            return Uri.parse(s);
        } catch (Exception e) {
            return null;
        }
    }

    /** Read the server URL stored by the Capacitor Preferences plugin (default group: CapacitorStorage). */
    private String readServerUrl() {
        try {
            SharedPreferences sp = getApplicationContext()
                .getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            return sp.getString("serverUrl", null);
        } catch (Exception e) {
            return null;
        }
    }

    private static String jsString(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }
}
