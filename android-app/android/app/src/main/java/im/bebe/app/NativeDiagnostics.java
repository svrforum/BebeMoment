package im.bebe.app;

import android.content.Context;
import android.util.Log;
import org.json.JSONObject;

/**
 * 네이티브에서 조용히 끝나던 실패에 흔적을 남긴다 (CLAUDE.md §6.5.1 — "재현해야만 원인을
 * 알 수 있는 실패는 실패다").
 *
 * 두 단계다:
 *   1. 언제나 logcat 에 남긴다 — `adb logcat -s bebe` 로 바로 보인다.
 *   2. 사용자가 실제로 알아채는 흐름(위젯·FCM 등록·OIDC 핸드오프·앱 업데이트)은 서버의
 *      진단 엔드포인트에도 보낸다. 브라우저 진단과 같은 경로라 서버 로그 한 곳에 모인다.
 *
 * ⚠️ 서버의 zod 스키마(`apps/web/src/server/diagnostics/upload-report.ts`)에는 아직 아래
 * flow/step 값이 없다. 값이 없는 채로 보내면 400 으로 조용히 버려지므로 —
 * 그것이야말로 이 파일이 없애려는 실패다 — 스키마가 값을 받아들이기 전까지는
 * {@link #SERVER_ACCEPTS_NATIVE_FLOWS} 를 false 로 두어 logcat 에만 남긴다. 서버에 값이
 * 추가되면 이 상수 하나만 true 로 바꾸면 된다.
 *
 * 사진·파일명·본문은 보내지 않는다 — 어떤 흐름이 어느 단계에서 끊겼는지만.
 */
final class NativeDiagnostics {

    static final String TAG = "bebe";

    private static final boolean SERVER_ACCEPTS_NATIVE_FLOWS = false;

    private static final String ENDPOINT = "/api/diagnostics/upload";

    // 사용자가 알아채는 흐름 — 서버 스키마에 추가를 요청한 flow 값들.
    static final String FLOW_WIDGET = "android-widget";
    static final String FLOW_FCM = "android-fcm";
    static final String FLOW_OIDC = "android-oidc";
    static final String FLOW_APK = "android-apk-update";

    private NativeDiagnostics() {}

    /** logcat 에만 남긴다 — 사용자가 못 알아채는 내부 실패용. */
    static void warn(String flow, String step, Throwable t) {
        Log.w(TAG, flow + "/" + step, t);
    }

    static void warn(String flow, String step, String message) {
        Log.w(TAG, flow + "/" + step + ": " + message);
    }

    /** logcat + 서버 진단 로그 — 사용자가 알아채는 흐름용. */
    static void report(Context ctx, String flow, String step, Throwable t) {
        warn(flow, step, t);
        post(ctx, flow, step, t == null ? "unknown" : String.valueOf(t));
    }

    static void report(Context ctx, String flow, String step, String message) {
        warn(flow, step, message);
        post(ctx, flow, step, message);
    }

    private static void post(Context ctx, String flow, String step, String message) {
        if (!SERVER_ACCEPTS_NATIVE_FLOWS) return;
        if (ctx == null) return;
        final Context app = ctx.getApplicationContext();
        ServerApi.run(() -> {
            try {
                final String base = AccountsStore.readServerBase(app);
                if (base == null) return;
                final String cookies = ServerApi.sessionCookie(base);
                if (cookies == null) return;
                final JSONObject body = new JSONObject();
                body.put("flow", flow);
                body.put("step", step);
                body.put("message", message == null ? "" : trim(message));
                body.put("client", "android-app");
                ServerApi.postJson(base + ENDPOINT, cookies, body.toString());
            } catch (Exception e) {
                // 진단 보고 실패로 원래 실패를 덮지 않는다 — logcat 에는 이미 남았다.
                Log.w(TAG, "diagnostics/post", e);
            }
        });
    }

    private static String trim(String message) {
        final String one = message.replaceAll("\\s+", " ").trim();
        return one.length() > 500 ? one.substring(0, 500) : one;
    }
}
