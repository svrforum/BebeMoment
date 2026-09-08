package im.bebe.app;

import android.webkit.CookieManager;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 가족 서버로 나가는 네이티브 HTTP.
 *
 * 원격 서버 페이지에는 Capacitor 브리지가 주입되지 않아 웹→네이티브 플러그인 호출이 안
 * 된다. 그래서 위젯 토큰·FCM 등록·가족 이름 같은 것은 네이티브가 WebView 의 세션
 * 쿠키(CookieManager)를 실어 직접 호출한다.
 */
final class ServerApi {

    private static final int TIMEOUT_MS = 8000;

    // onResume 마다 계정 수만큼 raw 스레드를 띄우던 폭주를 막는 공유 풀.
    private static final ExecutorService BG = Executors.newFixedThreadPool(3);

    private ServerApi() {}

    static void run(Runnable r) {
        BG.execute(r);
    }

    /** 이 서버의 WebView 쿠키. 세션이 없으면 null — 로그인 전에는 부를 필요가 없다. */
    static String sessionCookie(String base) {
        final String cookies;
        try {
            cookies = CookieManager.getInstance().getCookie(base);
        } catch (Exception e) {
            NativeDiagnostics.warn("server-api", "cookie-read", e);
            return null;
        }
        return (cookies != null && cookies.contains("session")) ? cookies : null;
    }

    /** 200 이면 본문, 아니면 null. */
    static String get(String urlStr) {
        return get(urlStr, null);
    }

    static String get(String urlStr, String cookies) {
        HttpURLConnection conn = null;
        try {
            conn = open(urlStr, cookies);
            final int code = conn.getResponseCode();
            if (code != 200) {
                NativeDiagnostics.warn("server-api", "get", urlStr + " -> " + code);
                return null;
            }
            return readBody(conn);
        } catch (Exception e) {
            NativeDiagnostics.warn("server-api", "get", e);
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** 응답 코드(네트워크 실패는 -1). 본문은 쓰지 않는 호출들이라 버린다. */
    static int postJson(String urlStr, String cookies, String json) {
        HttpURLConnection conn = null;
        try {
            conn = open(urlStr, cookies);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(json.getBytes("UTF-8"));
            }
            final int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                NativeDiagnostics.warn("server-api", "post", urlStr + " -> " + code);
            }
            return code;
        } catch (Exception e) {
            NativeDiagnostics.warn("server-api", "post", e);
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** POST 후 200 본문을 돌려준다(토큰 발급처럼 응답이 필요한 호출용). 실패면 null. */
    static String postForBody(String urlStr, String cookies, String json) {
        HttpURLConnection conn = null;
        try {
            conn = open(urlStr, cookies);
            conn.setRequestMethod("POST");
            if (json != null) {
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(json.getBytes("UTF-8"));
                }
            }
            final int code = conn.getResponseCode();
            if (code != 200) {
                NativeDiagnostics.warn("server-api", "post-body", urlStr + " -> " + code);
                return null;
            }
            return readBody(conn);
        } catch (Exception e) {
            NativeDiagnostics.warn("server-api", "post-body", e);
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static HttpURLConnection open(String urlStr, String cookies) throws Exception {
        final HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        if (cookies != null) conn.setRequestProperty("Cookie", cookies);
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        return conn;
    }

    private static String readBody(HttpURLConnection conn) throws Exception {
        final StringBuilder sb = new StringBuilder();
        try (InputStream is = conn.getInputStream()) {
            final byte[] buf = new byte[2048];
            int n;
            while ((n = is.read(buf)) != -1) sb.append(new String(buf, 0, n, "UTF-8"));
        }
        return sb.toString();
    }
}
