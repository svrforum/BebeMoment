package im.bebe.app;

import android.Manifest;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
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
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import java.net.URLDecoder;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
        handleAuthDeepLink(getIntent());
        handleInviteDeepLink(getIntent());
        setupDownloadListener();
        setupExternalSchemeHandler();
        markUserAgent();
    }

    /**
     * 카카오·네이버 등 SNS '앱으로 로그인' 은 웹페이지에서 `intent://` 또는 앱 전용
     * 스킴(kakaotalk://, kakaolink://, naversearchapp:// …)으로 네이티브 앱을 띄운다.
     * WebView 는 http/https 만 처리하므로 그대로 두면 "앱으로 가기" 가 먹통이 되고
     * 사용자가 아이디·비번을 손으로 쳐야 한다. BridgeWebViewClient 를 확장해 http(s)
     * 가 아닌 스킴을 가로채 네이티브 앱(또는 마켓)으로 보낸다. http(s) 는 super 로
     * 넘겨 Capacitor 브리지 동작을 유지.
     */
    private void setupExternalSchemeHandler() {
        if (getBridge() == null) return;
        final WebView wv = getBridge().getWebView();
        if (wv == null) return;
        wv.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                final Uri uri = request != null ? request.getUrl() : null;
                final String scheme = uri != null ? uri.getScheme() : null;
                if (scheme != null) {
                    final String s = scheme.toLowerCase();
                    if (!s.equals("http") && !s.equals("https")) {
                        return launchExternal(uri);
                    }
                    // SNS 로그인(OIDC start)은 외부 브라우저(Custom Tab)로 — 인앱 웹뷰는
                    // 카카오/네이버 앱-로그인이 막힌다. 연동(link=1)은 현재 세션이 필요해 제외.
                    if (isOidcLoginStart(uri)) {
                        return openOidcInCustomTab(uri);
                    }
                }
                return super.shouldOverrideUrlLoading(view, request);
            }

            // 배포 중(컨테이너 재시작)이나 일시적 서버 다운으로 메인 페이지가 502/네트워크
            // 오류면 WebView 가 에러 페이지에 갇혀 새로고침도 안 된다 → 자동 재연결.
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    scheduleReconnect(view, request.getUrl().toString());
                    return;
                }
                super.onReceivedError(view, request, error);
            }

            @Override
            public void onReceivedHttpError(
                WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request != null
                    && request.isForMainFrame()
                    && errorResponse != null
                    && errorResponse.getStatusCode() >= 500) {
                    scheduleReconnect(view, request.getUrl().toString());
                    return;
                }
                super.onReceivedHttpError(view, request, errorResponse);
            }
        });
    }

    /** 서버 origin 의 메인 프레임 로드 실패 시 "연결 중" 안내를 띄우고 4초마다 자동 재시도. */
    private void scheduleReconnect(WebView view, String url) {
        final String server = readServerUrl();
        if (server == null || url == null) return;
        final String base = server.replaceAll("/+$", "");
        if (!sameOrigin(url, base)) return; // 서버 origin 만 — 온보딩/외부/유사도메인 제외
        final String html =
            "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<style>html,body{height:100%;margin:0;background:#0b0b0c;color:#e7e7ea;"
                + "font-family:-apple-system,Roboto,sans-serif}.w{height:100%;display:flex;flex-direction:column;"
                + "align-items:center;justify-content:center;gap:18px;padding:24px;text-align:center}"
                + ".s{width:34px;height:34px;border:3px solid #2a2a2e;border-top-color:#6b8afd;border-radius:50%;"
                + "animation:r 0.9s linear infinite}@keyframes r{to{transform:rotate(360deg)}}"
                + "b{display:inline-block;margin-top:8px;padding:11px 22px;background:#6b8afd;color:#fff;"
                + "border-radius:999px;font-weight:600;text-decoration:none}p{margin:0;color:#9a9aa0;font-size:14px}</style>"
                + "</head><body><div class=w><div class=s></div>"
                + "<p>서버에 다시 연결하고 있어요…<br>업데이트 중이라면 잠시 후 자동으로 이어져요.</p>"
                + "<a class=b href='" + base + "'>다시 시도</a></div></body></html>";
        view.loadDataWithBaseURL(base, html, "text/html", "UTF-8", null);
        view.postDelayed(() -> view.loadUrl(url), 4000);
    }

    /** 비-http(s) URI 를 네이티브 앱으로. 앱이 없으면 browser_fallback_url / 마켓으로. */
    private boolean launchExternal(Uri uri) {
        final String scheme = uri.getScheme().toLowerCase();
        try {
            if (scheme.equals("intent")) {
                final Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException notFound) {
                    final String fallback = intent.getStringExtra("browser_fallback_url");
                    if (fallback != null) {
                        getBridge().getWebView().loadUrl(fallback);
                    } else {
                        final String pkg = intent.getPackage();
                        if (pkg != null) openMarket(pkg);
                    }
                }
                return true;
            }
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        } catch (Exception e) {
            // 파싱 실패·앱 부재 등은 조용히 무시(웹 로그인으로 계속 진행 가능).
            return true;
        }
    }

    private void openMarket(String pkg) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
        } catch (ActivityNotFoundException ignored) {
        }
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
            final String filename = resolveDownloadFilename(url, contentDisposition, mimeType);
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

    // 패턴: RFC 5987 의 filename*=UTF-8''<pct-encoded> 와 평문 filename="..." 둘 다 잡는다.
    private static final Pattern CD_FILENAME_STAR =
        Pattern.compile("filename\\*\\s*=\\s*[^']*''([^;\\r\\n]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern CD_FILENAME =
        Pattern.compile("filename\\s*=\\s*\"?([^\";\\r\\n]+)\"?", Pattern.CASE_INSENSITIVE);

    /**
     * 안드로이드 기본 URLUtil.guessFileName 은 Content-Disposition 정규식이 filename= 를
     * 문자열 끝에 고정($)해, 우리 헤더처럼 `filename="..."; filename*=UTF-8''...` 형태(또는
     * filename* 만 있는 경우)를 못 읽어 URL 마지막 조각("download")으로 떨어진다. 그래서
     * 직접 파싱한다 — filename*(UTF-8) 우선, 없으면 평문 filename=, 그래도 없으면 guessFileName.
     */
    private String resolveDownloadFilename(String url, String contentDisposition, String mimeType) {
        final String parsed = parseContentDispositionFilename(contentDisposition);
        if (parsed != null && !parsed.isEmpty()) return parsed;
        return URLUtil.guessFileName(url, contentDisposition, mimeType);
    }

    private String parseContentDispositionFilename(String cd) {
        if (cd == null || cd.isEmpty()) return null;
        final Matcher star = CD_FILENAME_STAR.matcher(cd);
        if (star.find()) {
            try {
                return sanitizeFilename(URLDecoder.decode(star.group(1).trim(), "UTF-8"));
            } catch (Exception ignored) {
                // pct-decode 실패 시 평문 filename= 로 폴백.
            }
        }
        final Matcher plain = CD_FILENAME.matcher(cd);
        if (plain.find()) return sanitizeFilename(plain.group(1).trim());
        return null;
    }

    private String sanitizeFilename(String name) {
        // 경로 분리자·제어문자 제거 — DownloadManager 가 하위 경로로 새지 않게.
        final String base = name.replaceAll("[/\\\\]", "_").replaceAll("[\\x00-\\x1f]", "").trim();
        return base.isEmpty() ? "download" : base;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
        handleAuthDeepLink(intent);
        handleInviteDeepLink(intent);
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

    // ── SNS 앱-로그인 (Custom Tab) ───────────────────────────────────────────
    private static final String AUTH_PREFS = "bebeAuth";

    private boolean isOidcLoginStart(Uri uri) {
        final String path = uri.getPath();
        if (path == null) return false;
        if (!path.matches("^/api/auth/oidc/[^/]+$")) return false; // start 만(콜백 제외)
        return !"1".equals(uri.getQueryParameter("link")); // 연동은 세션 필요 → 웹뷰 유지
    }

    private boolean openOidcInCustomTab(Uri uri) {
        try {
            final byte[] vb = new byte[32];
            new java.security.SecureRandom().nextBytes(vb);
            final int flags =
                android.util.Base64.URL_SAFE
                    | android.util.Base64.NO_PADDING
                    | android.util.Base64.NO_WRAP;
            final String verifier = android.util.Base64.encodeToString(vb, flags);
            final byte[] ch =
                java.security.MessageDigest.getInstance("SHA-256").digest(verifier.getBytes("UTF-8"));
            final String challenge = android.util.Base64.encodeToString(ch, flags);
            getApplicationContext()
                .getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString("verifier", verifier)
                .apply();
            final Uri target = uri.buildUpon().appendQueryParameter("app_challenge", challenge).build();
            new androidx.browser.customtabs.CustomTabsIntent.Builder().build().launchUrl(this, target);
            return true;
        } catch (Exception e) {
            return false; // 실패 시 super 가 웹뷰에서 로드(폴백)
        }
    }

    /**
     * 초대 링크 딥링크: bebe://invite?server=<url>&token=<token>. 웹 초대 페이지의
     * "앱에서 이어하기"(intent://)가 보낸다. 서버주소를 저장(CapacitorStorage)하고 그 서버의
     * 초대 화면을 WebView 에 띄워, 미설치였던 신규 구성원이 앱에서 바로 합류하게 한다.
     */
    private void handleInviteDeepLink(Intent intent) {
        if (intent == null) return;
        final Uri data = intent.getData();
        if (data == null || !"bebe".equals(data.getScheme()) || !"invite".equals(data.getHost())) return;
        final String server = data.getQueryParameter("server");
        final String token = data.getQueryParameter("token");
        if (server == null || server.isEmpty() || token == null || token.isEmpty()) return;
        final Uri s = safeParse(server);
        final String scheme = s != null ? s.getScheme() : null;
        if (scheme == null || (!scheme.equals("http") && !scheme.equals("https"))) return;
        final String base = server.replaceAll("/+$", "");
        final String current = readServerUrl();
        final String currentBase = current != null ? current.replaceAll("/+$", "") : null;
        // 이미 같은 서버면 확인 없이 초대 화면으로. 다른/새 서버면 사용자 확인을 받는다 —
        // 외부 페이지가 intent://invite 로 앱을 임의 서버에 몰래 연결(피싱)하는 걸 막는다.
        if (currentBase != null && sameOrigin(currentBase, base)) {
            loadInvite(base, token);
            return;
        }
        runOnUiThread(() ->
            new AlertDialog.Builder(MainActivity.this)
                .setTitle("이 서버에 연결할까요?")
                .setMessage(base + "\n\n초대 링크가 가리키는 서버 주소예요. 모르는 주소라면 취소하세요.")
                .setPositiveButton("연결", (d, w) -> {
                    getApplicationContext()
                        .getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                        .edit()
                        .putString("serverUrl", base)
                        .apply();
                    loadInvite(base, token);
                })
                .setNegativeButton("취소", null)
                .show());
    }

    private void loadInvite(String base, String token) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().loadUrl(base + "/invite/" + Uri.encode(token));
        }
    }

    /** scheme+host+port 비교(대소문자 무시). prefix startsWith 우회(server.evil.com)를 막는다. */
    private boolean sameOrigin(String a, String b) {
        final Uri ua = safeParse(a);
        final Uri ub = safeParse(b);
        if (ua == null || ub == null) return false;
        final String sa = ua.getScheme(), sb = ub.getScheme();
        final String ha = ua.getHost(), hb = ub.getHost();
        if (sa == null || sb == null || ha == null || hb == null) return false;
        return sa.equalsIgnoreCase(sb) && ha.equalsIgnoreCase(hb) && ua.getPort() == ub.getPort();
    }

    private void handleAuthDeepLink(Intent intent) {
        if (intent == null) return;
        final Uri data = intent.getData();
        if (data == null || !"bebe".equals(data.getScheme()) || !"auth".equals(data.getHost())) return;
        final String code = data.getQueryParameter("code");
        if (code == null || code.isEmpty()) return;
        final String verifier =
            getApplicationContext()
                .getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
                .getString("verifier", null);
        final String serverUrl = readServerUrl();
        if (verifier == null || serverUrl == null) return;
        new Thread(() -> exchangeHandoff(serverUrl, code, verifier)).start();
    }

    private void exchangeHandoff(String serverUrl, String code, String verifier) {
        try {
            final String base = serverUrl.replaceAll("/+$", "");
            final java.net.HttpURLConnection conn =
                (java.net.HttpURLConnection) new java.net.URL(base + "/api/auth/app-handoff").openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            final org.json.JSONObject reqBody = new org.json.JSONObject();
            reqBody.put("code", code);
            reqBody.put("verifier", verifier);
            try (java.io.OutputStream os = conn.getOutputStream()) {
                os.write(reqBody.toString().getBytes("UTF-8"));
            }
            if (conn.getResponseCode() != 200) {
                authFailToast();
                return;
            }
            final org.json.JSONObject cookie =
                new org.json.JSONObject(readBody(conn)).optJSONObject("cookie");
            final String name = cookie != null ? cookie.optString("name", null) : null;
            final String value = cookie != null ? cookie.optString("value", null) : null;
            if (name == null || value == null) {
                authFailToast();
                return;
            }
            final boolean secure = base.startsWith("https");
            runOnUiThread(
                () -> {
                    CookieManager.getInstance()
                        .setCookie(base, name + "=" + value + "; Path=/" + (secure ? "; Secure" : ""));
                    CookieManager.getInstance().flush();
                    getApplicationContext()
                        .getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
                        .edit()
                        .remove("verifier")
                        .apply();
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().loadUrl(base + "/");
                    }
                });
        } catch (Exception e) {
            authFailToast();
        }
    }

    private void authFailToast() {
        runOnUiThread(
            () ->
                Toast.makeText(
                        MainActivity.this,
                        "로그인에 실패했어요. 다시 시도해주세요.",
                        Toast.LENGTH_LONG)
                    .show());
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null || getBridge() == null) return;
        // "deepLink": 포그라운드에서 BebeMessagingService 가 만든 알림(커스텀 키).
        // "url": 백그라운드/종료 상태에서 시스템이 FCM notification 을 처리할 때 data
        //        페이로드(url)가 런처 인텐트 extra 로 전달되는 키. 둘 다 본다.
        String raw = intent.getStringExtra("deepLink");
        if (raw == null) raw = intent.getStringExtra("url");
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
