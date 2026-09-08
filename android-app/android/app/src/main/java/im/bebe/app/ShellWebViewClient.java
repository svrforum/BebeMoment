package im.bebe.app;

import android.app.Activity;
import android.net.Uri;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * 셸 WebView 의 요청 훅. 원격 서버 페이지를 그대로 보여주되 네 가지를 가로챈다:
 *
 *   ① 앱 전용 스킴(bebe://share, intent://, kakaotalk:// …) → 네이티브로
 *   ② 우리 릴리스 APK URL → 앱 내 업데이트로 (⚠️ DownloadListener 가 아니라 여기서.
 *      GitHub 릴리스는 302 로 CDN 에 넘기고, DownloadListener 는 리다이렉트가 끝난 CDN
 *      URL 을 받아 우리 주소 검사가 영영 안 맞는다)
 *   ③ 공유받은 사진 스트림(/__bebe_share/&lt;id&gt;)
 *   ④ 메인 프레임 실패 → 재연결 화면 (배포 중 컨테이너 재시작 등으로 WebView 가 에러
 *      페이지에 갇혀 새로고침도 안 되던 것)
 */
final class ShellWebViewClient extends BridgeWebViewClient {

    private static final String SWITCH_PATH = "/__bebe/switch";
    private static final String ACCOUNTS_PAGE = "https://localhost/accounts.html";
    private static final long RECONNECT_DELAY_MS = 4000;

    private final Activity activity;
    private final ShellHost host;
    private final ShareIntake shareIntake;
    private final ApkUpdater apkUpdater;

    /** /timeline 로드 완료 후 실행할 공유-주입 스크립트(타이밍 안전을 위해 onPageFinished 에서). */
    private volatile String pendingShareInjectJs = null;
    /** 재연결 화면의 자동 재시도 콜백. 계정 전환 시 취소해야 죽은 서버로 되돌아가지 않는다. */
    private Runnable pendingReconnect = null;

    ShellWebViewClient(
        Bridge bridge, Activity activity, ShellHost host, ShareIntake shareIntake, ApkUpdater apkUpdater) {
        super(bridge);
        this.activity = activity;
        this.host = host;
        this.shareIntake = shareIntake;
        this.apkUpdater = apkUpdater;
    }

    void setPendingShareInject(String js) {
        pendingShareInjectJs = js;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        final Uri uri = request != null ? request.getUrl() : null;
        // 멀티 인스턴스 — 원격 웹의 "가족 이름" 탭이 /__bebe/switch 로 오면 로컬 계정
        // 페이지를 띄운다(원격엔 브리지가 없어 직접 못 부르므로 URL 가로채기).
        if (uri != null && SWITCH_PATH.equals(uri.getPath())) {
            cancelPendingReconnect(view); // 죽은 서버 재시도 취소 후 계정 목록으로
            view.loadUrl(ACCOUNTS_PAGE);
            return true;
        }
        if (uri != null && ApkUpdater.isOwnApkUrl(uri.toString())) {
            apkUpdater.start(uri.toString(), ApkUpdater.filenameFromUrl(uri));
            return true;
        }
        final String scheme = uri != null ? uri.getScheme() : null;
        if (scheme != null) {
            final String s = scheme.toLowerCase();
            // 웹의 '공유' 버튼 — 앱 안에서는 Web Share API 도 클립보드 API 도 없어 링크
            // 복사밖에 못 했다. launchExternal 보다 먼저 잡아야 한다 — bebe:// 는 우리
            // 딥링크 스킴이라 그냥 두면 ACTION_VIEW 로 자기 자신을 다시 연다.
            if (s.equals("bebe") && "share".equals(uri.getHost())) {
                return ExternalLinks.openShareChooser(activity, uri);
            }
            if (!s.equals("http") && !s.equals("https")) {
                return ExternalLinks.launchExternal(activity, uri, host);
            }
            if (DeepLinks.isOidcLoginStart(uri) && AppHandoff.startInCustomTab(activity, uri)) {
                return true;
            }
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    /**
     * 공유받은 파일을 same-origin 경로(/__bebe_share/&lt;id&gt;)로 스트리밍 제공 — 웹이 fetch 해
     * Blob 으로 만들어 스테이징에 넣는다(크기 무제한, 메모리 폭증 없음).
     */
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        final Uri uri = request != null ? request.getUrl() : null;
        final WebResourceResponse shared = shareIntake.serve(activity, uri);
        if (shared != null) return shared;
        return super.shouldInterceptRequest(view, request);
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request != null && request.isForMainFrame()) {
            NativeDiagnostics.warn("shell", "main-frame-error",
                error != null ? String.valueOf(error.getErrorCode()) : "unknown");
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
            NativeDiagnostics.warn("shell", "main-frame-5xx",
                String.valueOf(errorResponse.getStatusCode()));
            scheduleReconnect(view, request.getUrl().toString());
            return;
        }
        super.onReceivedHttpError(view, request, errorResponse);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        view.evaluateJavascript(StatusBarTheme.INJECT_JS, null);
        final String js = pendingShareInjectJs;
        if (js != null) {
            pendingShareInjectJs = null;
            view.evaluateJavascript(js, null);
        }
        // 원격 서버 페이지가 뜰 때 계정 목록에 보장 + 가족 이름 라벨을 채운다. 초대
        // "이어하기"로 새 서버에 연결하거나 WebView 안에서 로그인한 직후, 다음 onResume 을
        // 기다리지 않고 가족이 전환 목록에 이름과 함께 나타나게 한다. 라벨이 없을 때만 —
        // 매 화면 전환마다 요청을 보내지 않도록(localhost 로컬 페이지 제외).
        if (url != null
            && (url.startsWith("http://") || url.startsWith("https://"))
            && !url.contains("localhost")
            && AccountsStore.activeAccountNeedsLabel(activity)) {
            ServerSync.labelActiveFamily(activity);
        }
    }

    /** 대기 중인 재연결 재시도 콜백을 취소한다(계정 전환·정상 로드 시). */
    private void cancelPendingReconnect(WebView view) {
        if (pendingReconnect != null) {
            view.removeCallbacks(pendingReconnect);
            pendingReconnect = null;
        }
    }

    /** 서버 origin 의 메인 프레임 로드 실패 시 "연결 중" 안내를 띄우고 4초마다 자동 재시도. */
    private void scheduleReconnect(WebView view, String url) {
        final String base = AccountsStore.readServerBase(activity);
        if (base == null || url == null) return;
        if (!DeepLinks.sameOrigin(url, base)) return; // 서버 origin 만 — 온보딩/외부/유사도메인 제외
        // 계정이 2개 이상이면 "다른 가족으로 전환" 탈출구를 준다 — 한 인스턴스가 죽어도 앱
        // 전체가 재연결 화면에 갇히지 않게(죽은 서버만 무한 재시도하던 회귀 수정).
        final boolean multi = AccountsStore.readBases(activity).size() > 1;
        view.loadDataWithBaseURL(base, reconnectHtml(base, multi), "text/html", "UTF-8", null);
        cancelPendingReconnect(view);
        pendingReconnect = () -> view.loadUrl(url);
        view.postDelayed(pendingReconnect, RECONNECT_DELAY_MS);
    }

    private static String reconnectHtml(String base, boolean multi) {
        final String switchBtn =
            multi ? "<a class=b2 href='" + base + SWITCH_PATH + "'>다른 가족으로 전환</a>" : "";
        return "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<style>html,body{height:100%;margin:0;background:#0b0b0c;color:#e7e7ea;"
            + "font-family:-apple-system,Roboto,sans-serif}.w{height:100%;display:flex;flex-direction:column;"
            + "align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center}"
            + ".s{width:34px;height:34px;border:3px solid #2a2a2e;border-top-color:#6b8afd;border-radius:50%;"
            + "animation:r 0.9s linear infinite}@keyframes r{to{transform:rotate(360deg)}}"
            + "b{display:inline-block;margin-top:8px;padding:11px 22px;background:#6b8afd;color:#fff;"
            + "border-radius:999px;font-weight:600;text-decoration:none}"
            + "b2{display:inline-block;padding:11px 22px;background:transparent;color:#c7c7cc;"
            + "border:1px solid #3a3a3e;border-radius:999px;font-weight:600;text-decoration:none}"
            + "p{margin:0;color:#9a9aa0;font-size:14px}</style>"
            + "</head><body><div class=w><div class=s></div>"
            + "<p>서버에 다시 연결하고 있어요…<br>업데이트 중이라면 잠시 후 자동으로 이어져요.</p>"
            + "<a class=b href='" + base + "'>다시 시도</a>" + switchBtn + "</div></body></html>";
    }
}
