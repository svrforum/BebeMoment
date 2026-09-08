package im.bebe.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.widget.Toast;
import java.net.URLDecoder;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 웹의 다운로드(`<a download>` / Content-Disposition: attachment)를 Android
 * DownloadManager 로 넘긴다.
 *
 * Capacitor WebView 는 브라우저가 아니라 앱이라 기본적으로 이런 응답을 무시한다.
 * 세션 쿠키도 CookieManager 에서 가져와 Cookie 헤더로 실어야 인증된 미디어가 받아진다.
 */
final class Downloads {

    private static final Pattern CD_FILENAME_STAR =
        Pattern.compile("filename\\*\\s*=\\s*[^']*''([^;\\r\\n]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern CD_FILENAME =
        Pattern.compile("filename\\s*=\\s*\"?([^\";\\r\\n]+)\"?", Pattern.CASE_INSENSITIVE);

    private Downloads() {}

    @SuppressWarnings("deprecation")
    static void enqueue(
        Activity activity, String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            final String filename = resolveFilename(url, contentDisposition, mimeType);
            final DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            // 세션 쿠키는 우리 서버(same-origin) 다운로드에만 실어 보낸다 — 페이지가 임의
            // 외부 URL 로 다운로드를 띄워 세션 쿠키를 새 호스트로 유출하는 걸 막는다.
            final String base = AccountsStore.readServerBase(activity);
            if (base != null && DeepLinks.sameOrigin(url, base)) {
                final String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) req.addRequestHeader("Cookie", cookies);
            }
            if (userAgent != null) req.addRequestHeader("User-Agent", userAgent);
            req.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            if (mimeType != null) req.setMimeType(mimeType);
            req.allowScanningByMediaScanner();

            final DownloadManager dm =
                (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                NativeDiagnostics.warn("download", "no-download-manager", "DOWNLOAD_SERVICE null");
                Toast.makeText(activity, "다운로드를 시작할 수 없어요", Toast.LENGTH_SHORT).show();
                return;
            }
            dm.enqueue(req);
            Toast.makeText(activity, "다운로드를 시작했어요", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            NativeDiagnostics.warn("download", "enqueue", e);
            Toast.makeText(activity, "다운로드 실패: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    /**
     * 안드로이드 기본 URLUtil.guessFileName 은 Content-Disposition 정규식이 filename= 를
     * 문자열 끝에 고정($)해, 우리 헤더처럼 `filename="..."; filename*=UTF-8''...` 형태(또는
     * filename* 만 있는 경우)를 못 읽어 URL 마지막 조각("download")으로 떨어진다. 그래서
     * 직접 파싱한다 — filename*(UTF-8) 우선, 없으면 평문 filename=, 그래도 없으면 guessFileName.
     */
    static String resolveFilename(String url, String contentDisposition, String mimeType) {
        final String parsed = parseContentDispositionFilename(contentDisposition);
        if (parsed != null && !parsed.isEmpty()) return parsed;
        return URLUtil.guessFileName(url, contentDisposition, mimeType);
    }

    static String parseContentDispositionFilename(String cd) {
        if (cd == null || cd.isEmpty()) return null;
        final Matcher star = CD_FILENAME_STAR.matcher(cd);
        if (star.find()) {
            try {
                return sanitizeFilename(URLDecoder.decode(star.group(1).trim(), "UTF-8"));
            } catch (Exception e) {
                // pct-decode 실패 시 평문 filename= 로 폴백.
                NativeDiagnostics.warn("download", "filename-star-decode", e);
            }
        }
        final Matcher plain = CD_FILENAME.matcher(cd);
        if (plain.find()) return sanitizeFilename(plain.group(1).trim());
        return null;
    }

    /** 경로 분리자·제어문자 제거 — DownloadManager 가 하위 경로로 새지 않게. */
    static String sanitizeFilename(String name) {
        final String base = name.replaceAll("[/\\\\]", "_").replaceAll("[\\x00-\\x1f]", "").trim();
        return base.isEmpty() ? "download" : base;
    }
}
