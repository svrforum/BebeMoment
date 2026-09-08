package im.bebe.app;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

/**
 * 앱 셸. 원격 가족 서버를 WebView 로 띄우고, 웹이 할 수 없는 것들만 네이티브에서 처리한다
 * — 딥링크, 공유 인텐트, 다운로드, 알림 권한, 뒤로가기.
 *
 * 실제 일은 전부 옆의 협력자들이 한다: {@link ShellWebViewClient}(요청 훅),
 * {@link ApkUpdater}(앱 내 업데이트), {@link ShareIntake}(갤러리 공유),
 * {@link ServerSync}(위젯·FCM·가족 이름), {@link AccountsStore}(가족 목록),
 * {@link DeepLinks}(URL 판정).
 */
public class MainActivity extends BridgeActivity {

    private static final int REQ_POST_NOTIFICATIONS = 4242;
    private static final long BACK_EXIT_WINDOW_MS = 2000;
    /** 로그인 직후 쿠키가 자리잡을 틈 — 바로 부르면 세션 없이 빈손으로 돌아온다. */
    private static final long WIDGET_TOKEN_DELAY_MS = 1500;

    private final ShareIntake shareIntake = new ShareIntake();
    private ApkUpdater apkUpdater;
    private ShellWebViewClient webViewClient;
    private long lastBackPressMs = 0;

    private final ShellHost host = new ShellHost() {
        @Override
        public WebView webView() {
            return getBridge() != null ? getBridge().getWebView() : null;
        }

        @Override
        public void loadUrl(String url) {
            final WebView wv = webView();
            if (wv != null) wv.loadUrl(url);
            else NativeDiagnostics.warn("shell", "load-url", "no webview for " + url);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BebePushPlugin.class);
        registerPlugin(BebeWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        apkUpdater = new ApkUpdater(this);
        setupWebViewClient();
        requestPostNotificationsIfNeeded();
        handleIntent(getIntent());
        setupDownloadListener();
        markUserAgent();
        setupBackHandler();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        handlePushDeepLink(intent);
        AppHandoff.handleAuthDeepLink(this, intent, host);
        handleInviteDeepLink(intent);
        handleOpenDeepLink(intent);
        handleWidgetTap(intent);
        handleShareIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        apkUpdater.onResume();
        // 위젯 토큰·FCM 기기 토큰은 네이티브에서 등록한다 — 원격 서버 페이지에는 Capacitor
        // 브리지가 주입되지 않아 웹→네이티브 플러그인 호출이 안 되기 때문.
        getWindow().getDecorView()
            .postDelayed(() -> ServerSync.registerWidgetToken(this), WIDGET_TOKEN_DELAY_MS);
        ServerSync.registerFcm(this);
        // 멀티 인스턴스 — 현재 서버를 계정 목록에 보장하고, 로그인됐으면 가족 이름을 라벨로.
        ServerSync.labelActiveFamily(this);
    }

    @Override
    public void onStop() {
        super.onStop();
        apkUpdater.onStop();
        // WebView 세션 쿠키를 디스크에 즉시 영구화 — 백그라운드/종료 직후 프로세스가 죽어도
        // 세션이 살아남는다. 안 하면 로그인 후 앱을 끄면 쿠키가 디스크에 안 남아 재로그인.
        try {
            CookieManager.getInstance().flush();
        } catch (Throwable t) {
            NativeDiagnostics.warn("shell", "cookie-flush", t);
        }
        // 앱을 나갈 때(예: 사진 업로드 후 홈으로) 위젯을 한 번 갱신한다 — onResume(재진입)
        // 만으로는 "올리고 바로 홈 화면 위젯 확인" 케이스를 못 잡아 갱신이 느리게 느껴졌다.
        try {
            WidgetRefreshWorker.enqueueNow(getApplicationContext());
        } catch (Throwable t) {
            NativeDiagnostics.report(this, NativeDiagnostics.FLOW_WIDGET, "enqueue-on-stop", t);
        }
    }

    @Override
    public void onDestroy() {
        apkUpdater.onDestroy();
        super.onDestroy();
    }

    // ── WebView 셸 ────────────────────────────────────────────────────────

    private void setupWebViewClient() {
        if (getBridge() == null) return;
        final WebView wv = getBridge().getWebView();
        if (wv == null) return;
        wv.addJavascriptInterface(new StatusBarBridge(), "BebeStatusBar");
        webViewClient = new ShellWebViewClient(getBridge(), this, host, shareIntake, apkUpdater);
        wv.setWebViewClient(webViewClient);
    }

    /** 웹 테마(.dark)를 상태바에 전달하는 창구 — 원격 페이지에도 주입된다. */
    private final class StatusBarBridge {
        @JavascriptInterface
        public void apply(final boolean dark) {
            runOnUiThread(() -> StatusBarTheme.apply(MainActivity.this, dark));
        }
    }

    /**
     * 하드웨어 BACK: WebView 히스토리가 있으면 한 단계 뒤로(앨범·상세에서 위로), 루트면
     * 더블탭으로 종료. Capacitor 기본 동작(브리지로 라우팅 → 원격 페이지엔 리스너가 없어
     * 곧장 종료)을 대체한다. super.onCreate 뒤에 콜백을 추가해 브리지 콜백보다 우선.
     */
    private void setupBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                final WebView wv = host.webView();
                if (wv != null && wv.canGoBack()) {
                    wv.goBack();
                    return;
                }
                final long now = System.currentTimeMillis();
                if (now - lastBackPressMs < BACK_EXIT_WINDOW_MS) {
                    finish();
                    return;
                }
                lastBackPressMs = now;
                Toast.makeText(MainActivity.this, "한 번 더 누르면 종료돼요", Toast.LENGTH_SHORT).show();
            }
        });
    }

    /**
     * 원격 서버 페이지엔 Capacitor 브리지(window.Capacitor)가 없어 웹이 "네이티브 앱"인지
     * 감지할 수 없다 → User-Agent 에 표식을 넣어 웹이 앱 환경을 인식하게 한다.
     *
     * bebeApp/&lt;versionName&gt; = 설치 버전 마커(업데이트 안내용), bebeAppMulti = 멀티
     * 인스턴스(가족 전환) 마커. **항상 기존 마커를 떼고 현재 버전으로 다시 붙인다** — 마커가
     * 있으면 건너뛰던 과거 방식은 UA 가 이어질 때 옛 버전이 남아 업데이트 안내가 계속 뜰 수
     * 있었다.
     */
    private void markUserAgent() {
        final WebView wv = host.webView();
        if (wv == null) return;
        try {
            final WebSettings s = wv.getSettings();
            final String ua = s.getUserAgentString();
            if (ua == null) return;
            final String base = ua
                .replaceAll("\\s*bebeApp/\\S+", "")
                .replaceAll("\\s*bebeAppMulti", "")
                .trim();
            final String marked = base + " bebeApp/" + appVersionName() + " bebeAppMulti";
            if (!marked.equals(ua)) s.setUserAgentString(marked);
        } catch (Exception e) {
            NativeDiagnostics.warn("shell", "mark-user-agent", e);
        }
    }

    private String appVersionName() {
        try {
            final String v = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return v != null ? v : "";
        } catch (Exception e) {
            NativeDiagnostics.warn("shell", "version-name", e);
            return "";
        }
    }

    /**
     * Capacitor WebView 는 기본적으로 `&lt;a download&gt;` / Content-Disposition: attachment
     * 응답을 무시한다(브라우저가 아니라 앱이라서) — DownloadListener 를 직접 붙인다.
     */
    private void setupDownloadListener() {
        final WebView wv = host.webView();
        if (wv == null) return;
        wv.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(
                String url, String userAgent, String contentDisposition, String mimeType, long len) {
                Downloads.enqueue(MainActivity.this, url, userAgent, contentDisposition, mimeType);
            }
        });
    }

    private void requestPostNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        ActivityCompat.requestPermissions(
            this, new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_POST_NOTIFICATIONS);
    }

    // ── 딥링크 ────────────────────────────────────────────────────────────

    /**
     * 푸시 알림 탭. "deepLink" = 포그라운드에서 BebeMessagingService 가 만든 알림(커스텀 키),
     * "url" = 백그라운드/종료 상태에서 시스템이 FCM notification 을 처리할 때 data 페이로드가
     * 런처 인텐트 extra 로 오는 키. 둘 다 본다.
     */
    private void handlePushDeepLink(Intent intent) {
        if (intent == null || getBridge() == null) return;
        // 멀티 인스턴스 — 알림 출처 서버가 현재 활성과 다르면 먼저 그 가족으로 전환한다
        // (등록된 계정일 때만). 그러면 아래 resolveDeepLink 가 그 서버 기준으로 해석한다.
        final String switchServer = intent.getStringExtra("switchServer");
        if (switchServer != null && !switchServer.isEmpty()) {
            final String b = DeepLinks.base(switchServer);
            if (AccountsStore.readBases(this).contains(b)) AccountsStore.setActiveServer(this, b);
        }
        String raw = intent.getStringExtra("deepLink");
        if (raw == null) raw = intent.getStringExtra("url");
        if (raw == null) return;
        final String serverUrl = AccountsStore.readServerUrl(this);
        final WebView wv = host.webView();
        final String currentUrl = serverUrl == null && wv != null ? wv.getUrl() : null;
        final String target = DeepLinks.resolveDeepLink(raw, serverUrl, currentUrl);
        if (target == null) {
            NativeDiagnostics.warn("deep-link", "rejected", "push url not same-origin");
            return;
        }
        if (wv == null) return;
        // 콜드 스타트에서 원격 페이지가 뜰 틈을 준다.
        wv.postDelayed(() -> wv.evaluateJavascript(
            "window.location.href=" + DeepLinks.jsString(target) + ";", null), 600);
    }

    /**
     * 초대 링크 딥링크: bebe://invite?server=&amp;token=. 웹 초대 페이지의 "앱에서 이어하기"
     * (intent://)가 보낸다. 서버주소를 저장하고 그 서버의 초대 화면을 띄워, 미설치였던 신규
     * 구성원이 앱에서 바로 합류하게 한다.
     */
    private void handleInviteDeepLink(Intent intent) {
        final Uri data = deepLinkData(intent, "invite");
        if (data == null) return;
        final String server = data.getQueryParameter("server");
        final String token = data.getQueryParameter("token");
        if (server == null || server.isEmpty() || token == null || token.isEmpty()) return;
        if (!DeepLinks.isHttpUrl(server)) return;
        final String base = DeepLinks.base(server);
        connectThen(base, "초대 링크가 가리키는 서버 주소예요. 모르는 주소라면 취소하세요.",
            () -> host.loadUrl(base + "/invite/" + Uri.encode(token)));
    }

    /**
     * 공유 링크 "앱에서 이어보기" 딥링크: bebe://open?server=&amp;path=/story/3. 같은 서버면
     * 바로 그 경로, 다른/새 서버면 사용자 확인(피싱 방지 — invite 와 같은 패턴).
     */
    private void handleOpenDeepLink(Intent intent) {
        final Uri data = deepLinkData(intent, "open");
        if (data == null) return;
        final String server = data.getQueryParameter("server");
        final String path = data.getQueryParameter("path");
        if (server == null || server.isEmpty() || path == null || path.isEmpty()) return;
        if (!DeepLinks.isSafeRelativePath(path)) {
            NativeDiagnostics.warn("deep-link", "unsafe-path", path);
            return;
        }
        if (!DeepLinks.isHttpUrl(server)) return;
        final String base = DeepLinks.base(server);
        connectThen(base, "공유 링크가 가리키는 서버 주소예요. 모르는 주소라면 취소하세요.",
            () -> host.loadUrl(base + path));
    }

    private static Uri deepLinkData(Intent intent, String host) {
        if (intent == null) return null;
        final Uri data = intent.getData();
        if (data == null || !"bebe".equals(data.getScheme()) || !host.equals(data.getHost())) return null;
        return data;
    }

    /**
     * 이미 같은 서버면 확인 없이 진행. 다른/새 서버면 사용자 확인을 받는다 — 외부 페이지가
     * intent:// 로 앱을 임의 서버에 몰래 연결(피싱)하는 걸 막는다.
     */
    private void connectThen(String base, String message, Runnable proceed) {
        final String currentBase = AccountsStore.readServerBase(this);
        if (currentBase != null && DeepLinks.sameOrigin(currentBase, base)) {
            proceed.run();
            return;
        }
        runOnUiThread(() ->
            new AlertDialog.Builder(MainActivity.this)
                .setTitle("이 서버에 연결할까요?")
                .setMessage(base + "\n\n" + message)
                .setPositiveButton("연결", (d, w) -> {
                    AccountsStore.setActiveServer(MainActivity.this, base);
                    proceed.run();
                })
                .setNegativeButton("취소", null)
                .show());
    }

    /**
     * 홈 위젯 탭 — 위젯이 보여주는 가족 서버로 전환해서 연다(멀티 인스턴스).
     *
     * ⚠️ MainActivity 는 exported 라 외부 앱도 ACTION_WIDGET_TAP + 임의 server 로 띄울 수
     * 있다 → 임의 서버로 전환하면 앱 셸 안에 공격자 페이지(피싱)가 뜬다. 그래서 사용자가
     * 앱에서 직접 추가한 가족(bebeAccounts)으로만 전환을 허용한다.
     */
    private void handleWidgetTap(Intent intent) {
        if (intent == null || !BebeWidgetProvider.ACTION_WIDGET_TAP.equals(intent.getAction())) return;
        final String server = intent.getStringExtra("server");
        if (server == null || server.isEmpty()) return;
        if (!DeepLinks.isHttpUrl(server)) return;
        final String base = DeepLinks.base(server);
        boolean known = false;
        for (final String acc : AccountsStore.readBases(this)) {
            if (DeepLinks.sameOrigin(acc, base)) { known = true; break; }
        }
        if (!known) {
            NativeDiagnostics.warn("widget-tap", "unknown-server", "tap for a family not in the list");
            return;
        }
        final String currentBase = AccountsStore.readServerBase(this);
        if (currentBase != null && DeepLinks.sameOrigin(currentBase, base)) return; // 이미 그 가족
        AccountsStore.setActiveServer(this, base);
        host.loadUrl(base + "/timeline");
    }

    /** 갤러리 "공유 → bebe" — 파일을 스테이징하고 타임라인에서 주입 스크립트를 실행한다. */
    private void handleShareIntent(Intent intent) {
        if (intent == null) return;
        final String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        final String base = AccountsStore.readServerBase(this);
        final String js = shareIntake.stage(this, intent, base);
        if (js == null) return;
        if (webViewClient != null) webViewClient.setPendingShareInject(js);
        host.loadUrl(base + "/timeline");
    }
}
