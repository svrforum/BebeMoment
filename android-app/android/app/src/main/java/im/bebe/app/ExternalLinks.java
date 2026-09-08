package im.bebe.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

/**
 * 웹뷰 밖으로 나가는 링크들 — 공유 시트, 네이티브 앱 스킴, 마켓.
 *
 * 카카오·네이버 등 SNS '앱으로 로그인'은 웹페이지에서 `intent://` 또는 앱 전용
 * 스킴(kakaotalk://, naversearchapp:// …)으로 네이티브 앱을 띄운다. WebView 는 http(s)
 * 만 처리하므로 그대로 두면 "앱으로 가기"가 먹통이 되고 사용자가 아이디·비번을 손으로
 * 쳐야 한다.
 */
final class ExternalLinks {

    private ExternalLinks() {}

    /**
     * bebe://share?url=…&amp;title=… → 안드로이드 공유 시트(ACTION_SEND).
     *
     * url 이 없으면 아무것도 하지 않는다(대신 true 를 돌려줘 WebView 가 알 수 없는 스킴을
     * 로드하려 들지 않게 한다).
     */
    static boolean openShareChooser(Activity activity, Uri uri) {
        final String url = uri.getQueryParameter("url");
        if (url == null || url.isEmpty()) {
            NativeDiagnostics.warn("share-chooser", "missing-url", "bebe://share without url");
            return true;
        }
        final String title = uri.getQueryParameter("title");
        final Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        // 제목은 본문에 한 번만. EXTRA_SUBJECT 까지 채우면 받는 앱(카카오톡)이 "제목 - 제목"
        // 으로 이어 붙여 보여줬다.
        send.putExtra(Intent.EXTRA_TEXT, title == null || title.isEmpty() ? url : title + "\n" + url);
        try {
            activity.startActivity(Intent.createChooser(send, null));
        } catch (ActivityNotFoundException e) {
            NativeDiagnostics.warn("share-chooser", "no-receiver", e);
            Toast.makeText(activity, "공유할 수 있는 앱이 없어요", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    /** 비-http(s) URI 를 네이티브 앱으로. 앱이 없으면 browser_fallback_url / 마켓으로. */
    static boolean launchExternal(Activity activity, Uri uri, ShellHost host) {
        final String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
        try {
            if (scheme.equals("intent")) {
                final Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                try {
                    activity.startActivity(intent);
                } catch (ActivityNotFoundException notFound) {
                    final String fallback = intent.getStringExtra("browser_fallback_url");
                    if (fallback != null) {
                        host.loadUrl(fallback);
                    } else {
                        final String pkg = intent.getPackage();
                        if (pkg != null) openMarket(activity, pkg);
                        else NativeDiagnostics.warn("external", "no-app-no-fallback", uri.toString());
                    }
                }
                return true;
            }
            activity.startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        } catch (Exception e) {
            // 파싱 실패·앱 부재 등은 흡수한다(웹 로그인으로 계속 진행할 수 있다) — 다만
            // 왜 앱이 안 떴는지 물어볼 때 답할 수 있게 로그는 남긴다.
            NativeDiagnostics.warn("external", "launch", e);
            return true;
        }
    }

    private static void openMarket(Activity activity, String pkg) {
        try {
            activity.startActivity(
                new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
        } catch (ActivityNotFoundException e) {
            NativeDiagnostics.warn("external", "market", e);
        }
    }
}
