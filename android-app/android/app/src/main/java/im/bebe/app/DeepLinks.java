package im.bebe.app;

import android.net.Uri;

/**
 * 앱 셸이 받아들이는 URL 들의 판정 — 같은-출처 비교, 푸시 딥링크 해석, OIDC start 감지.
 *
 * 전부 부수효과 없는 정적 함수라 단위 테스트로 고정한다. 여기서 한 글자 잘못 판단하면
 * 외부 페이지가 앱 셸 안으로 들어오거나 세션 쿠키가 남의 호스트로 새므로, 회귀가
 * 조용히 지나가면 안 된다.
 */
final class DeepLinks {

    private DeepLinks() {}

    static Uri safeParse(String s) {
        if (s == null) return null;
        try {
            return Uri.parse(s);
        } catch (Exception e) {
            NativeDiagnostics.warn("deep-link", "uri-parse", e);
            return null;
        }
    }

    /** 끝 슬래시를 떼어 base URL 로 만든다. */
    static String base(String url) {
        return url == null ? null : url.replaceAll("/+$", "");
    }

    /**
     * scheme+host+port 비교(대소문자 무시). prefix startsWith 우회(server.evil.com)를 막는다.
     * 포트는 기본 포트를 채워 비교한다 — https://a 와 https://a:443 은 같은 출처다.
     */
    static boolean sameOrigin(String a, String b) {
        return sameOrigin(safeParse(a), safeParse(b));
    }

    static boolean sameOrigin(Uri a, Uri b) {
        if (a == null || b == null) return false;
        final String aScheme = a.getScheme();
        final String bScheme = b.getScheme();
        final String aHost = a.getHost();
        final String bHost = b.getHost();
        if (aScheme == null || bScheme == null || aHost == null || bHost == null) return false;
        if (!aScheme.equalsIgnoreCase(bScheme)) return false;
        if (!aHost.equalsIgnoreCase(bHost)) return false;
        return effectivePort(a) == effectivePort(b);
    }

    static int effectivePort(Uri u) {
        final int p = u.getPort();
        if (p != -1) return p;
        final String s = u.getScheme();
        if ("https".equalsIgnoreCase(s)) return 443;
        if ("http".equalsIgnoreCase(s)) return 80;
        return -1;
    }

    static String buildOrigin(Uri u) {
        final StringBuilder sb = new StringBuilder();
        sb.append(u.getScheme()).append("://").append(u.getHost());
        final int port = u.getPort();
        if (port != -1) sb.append(':').append(port);
        return sb.toString();
    }

    /** 딥링크가 실어 온 서버 주소가 http(s) 인지 — 다른 스킴은 통째로 무시한다. */
    static boolean isHttpUrl(String url) {
        final Uri u = safeParse(url);
        final String scheme = u != null ? u.getScheme() : null;
        if (scheme == null) return false;
        final String s = scheme.toLowerCase();
        return s.equals("http") || s.equals("https");
    }

    /** 같은-출처 절대경로만 (//·/\ 프로토콜-상대 우회 차단). */
    static boolean isSafeRelativePath(String path) {
        return path != null
            && path.startsWith("/")
            && !path.startsWith("//")
            && !path.startsWith("/\\");
    }

    /**
     * 푸시가 준 URL 을 이동 전에 검증한다.
     *
     * 받아들이는 것:
     *   - 상대 경로("/story/3"): 설정된 서버 origin 기준으로 해석.
     *   - 설정된 서버와 scheme/host/port 가 같은 절대 http(s) URL.
     *
     * javascript:, data:, intent:, file:, 커스텀 스킴, 교차 출처는 전부 거절(null).
     *
     * @param serverUrl  저장된 서버 주소(없으면 null)
     * @param currentUrl serverUrl 이 없을 때 비교 기준으로 쓸 현재 페이지 주소(없으면 null)
     */
    static String resolveDeepLink(String raw, String serverUrl, String currentUrl) {
        if (raw == null) return null;
        final String trimmed = raw.trim();
        if (trimmed.isEmpty()) return null;

        final Uri serverUri = serverUrl != null ? safeParse(serverUrl) : null;

        if (trimmed.startsWith("/")) {
            // 상대 경로 → origin 을 알아야만 의미가 있다.
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
            // 비교할 저장 origin 이 없으면 지금 열려 있는 페이지의 origin 으로.
            final Uri currentUri = currentUrl != null ? safeParse(currentUrl) : null;
            if (currentUri == null) return null;
            return sameOrigin(target, currentUri) ? trimmed : null;
        }
        return sameOrigin(target, serverUri) ? trimmed : null;
    }

    /**
     * SNS 로그인(OIDC start)은 외부 브라우저(Custom Tab)로 보낸다 — 인앱 웹뷰는 카카오·네이버
     * 앱-로그인이 막힌다. 연동(link=1)은 현재 세션이 필요해 웹뷰에 남긴다.
     */
    static boolean isOidcLoginStart(Uri uri) {
        if (uri == null) return false;
        final String path = uri.getPath();
        if (path == null) return false;
        if (!path.matches("^/api/auth/oidc/[^/]+$")) return false; // start 만(콜백 제외)
        return !"1".equals(uri.getQueryParameter("link"));
    }

    /** evaluateJavascript 에 넣을 문자열 리터럴. */
    static String jsString(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }
}
