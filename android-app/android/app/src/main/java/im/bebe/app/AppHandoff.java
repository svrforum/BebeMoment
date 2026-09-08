package im.bebe.app;

import android.app.Activity;
import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import android.webkit.CookieManager;
import android.widget.Toast;
import androidx.browser.customtabs.CustomTabsIntent;
import java.security.MessageDigest;
import java.security.SecureRandom;
import org.json.JSONObject;

/**
 * SNS 앱-로그인 핸드오프. OIDC start 는 Custom Tab(외부 브라우저)에서 돌고 — 인앱
 * 웹뷰에서는 카카오·네이버 앱-로그인이 막힌다 — 끝나면 `bebe://auth?code=…` 로 돌아온다.
 * 여기서 PKCE verifier 로 코드를 세션 쿠키와 바꿔 WebView 에 심는다.
 *
 * ⚠️ verifier·code·세션 쿠키는 절대 로그에 남기지 않는다. 진단은 단계 이름만 남긴다.
 */
final class AppHandoff {

    private static final String AUTH_PREFS = "bebeAuth";
    private static final String VERIFIER_KEY = "verifier";
    private static final String FLOW = NativeDiagnostics.FLOW_OIDC;
    private static final int B64 = Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP;
    /** 세션 TTL(90일)과 맞춘다 — Max-Age 가 없으면 프로세스 종료 시 사라져 재로그인. */
    private static final String COOKIE_MAX_AGE = "7776000";

    private AppHandoff() {}

    /** OIDC start 를 Custom Tab 으로. 실패하면 false — 호출부가 웹뷰 로드로 폴백한다. */
    static boolean startInCustomTab(Activity activity, Uri uri) {
        try {
            final byte[] vb = new byte[32];
            new SecureRandom().nextBytes(vb);
            final String verifier = Base64.encodeToString(vb, B64);
            final byte[] ch =
                MessageDigest.getInstance("SHA-256").digest(verifier.getBytes("UTF-8"));
            final String challenge = Base64.encodeToString(ch, B64);
            activity.getApplicationContext()
                .getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(VERIFIER_KEY, verifier)
                .apply();
            final Uri target = uri.buildUpon().appendQueryParameter("app_challenge", challenge).build();
            new CustomTabsIntent.Builder().build().launchUrl(activity, target);
            return true;
        } catch (Exception e) {
            NativeDiagnostics.report(activity, FLOW, "start-custom-tab", e);
            return false; // 실패 시 super 가 웹뷰에서 로드(폴백)
        }
    }

    /** `bebe://auth?code=…` 딥링크를 세션으로 바꾼다(백그라운드). */
    static void handleAuthDeepLink(Activity activity, android.content.Intent intent, ShellHost host) {
        if (intent == null) return;
        final Uri data = intent.getData();
        if (data == null || !"bebe".equals(data.getScheme()) || !"auth".equals(data.getHost())) return;
        final String code = data.getQueryParameter("code");
        if (code == null || code.isEmpty()) {
            NativeDiagnostics.report(activity, FLOW, "missing-code", "bebe://auth without code");
            return;
        }
        final String verifier = activity.getApplicationContext()
            .getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
            .getString(VERIFIER_KEY, null);
        final String base = AccountsStore.readServerBase(activity);
        if (verifier == null || base == null) {
            NativeDiagnostics.report(activity, FLOW, "missing-verifier",
                "verifier=" + (verifier != null) + " server=" + (base != null));
            return;
        }
        ServerApi.run(() -> exchange(activity, base, code, verifier, host));
    }

    private static void exchange(
        Activity activity, String base, String code, String verifier, ShellHost host) {
        final String name;
        final String value;
        try {
            final JSONObject reqBody = new JSONObject();
            reqBody.put("code", code);
            reqBody.put("verifier", verifier);
            final String body =
                ServerApi.postForBody(base + "/api/auth/app-handoff", null, reqBody.toString());
            if (body == null) {
                fail(activity, "exchange-http");
                return;
            }
            final JSONObject cookie = new JSONObject(body).optJSONObject("cookie");
            name = cookie != null ? cookie.optString("name", null) : null;
            value = cookie != null ? cookie.optString("value", null) : null;
            if (name == null || value == null) {
                fail(activity, "missing-cookie");
                return;
            }
        } catch (Exception e) {
            NativeDiagnostics.report(activity, FLOW, "exchange", e);
            failToast(activity);
            return;
        }
        final boolean secure = base.startsWith("https");
        activity.runOnUiThread(() -> {
            CookieManager.getInstance().setCookie(
                base,
                name + "=" + value + "; Path=/; Max-Age=" + COOKIE_MAX_AGE + (secure ? "; Secure" : ""));
            CookieManager.getInstance().flush();
            activity.getApplicationContext()
                .getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(VERIFIER_KEY)
                .apply();
            host.loadUrl(base + "/");
        });
    }

    private static void fail(Activity activity, String step) {
        NativeDiagnostics.report(activity, FLOW, step, "app-handoff did not return a session");
        failToast(activity);
    }

    private static void failToast(Activity activity) {
        activity.runOnUiThread(() ->
            Toast.makeText(activity, "로그인에 실패했어요. 다시 시도해주세요.", Toast.LENGTH_LONG).show());
    }
}
