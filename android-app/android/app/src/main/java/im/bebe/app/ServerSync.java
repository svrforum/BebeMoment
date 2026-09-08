package im.bebe.app;

import android.content.Context;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.List;
import org.json.JSONObject;

/**
 * 원격 서버 페이지에는 Capacitor 브리지(window.Capacitor)가 주입되지 않아 웹→네이티브
 * 플러그인 호출이 안 된다. 그래서 위젯 토큰·FCM 기기 토큰·가족 이름은 네이티브가 WebView
 * 세션 쿠키를 실어 직접 주고받는다. 전부 onResume/페이지 로드 뒤에 조용히 돈다.
 */
final class ServerSync {

    private ServerSync() {}

    /** 활성 서버를 계정 목록에 보장하고, 세션이 있으면 가족 이름을 라벨로 채운다. */
    static void labelActiveFamily(Context ctx) {
        final Context app = ctx.getApplicationContext();
        final String base = AccountsStore.readServerBase(app);
        if (base == null) return;
        AccountsStore.ensureAccount(app, base);
        final String cookies = ServerApi.sessionCookie(base);
        if (cookies == null) return;
        ServerApi.run(() -> {
            final String body = ServerApi.get(base + "/api/family/name", cookies);
            if (body == null) return;
            try {
                AccountsStore.setAccountName(app, base, new JSONObject(body).optString("name", ""));
            } catch (Exception e) {
                NativeDiagnostics.warn("family-label", "parse", e);
            }
        });
    }

    /**
     * 홈 위젯이 쓸 토큰을 발급받아 저장하고 즉시 갱신을 건다. 위젯이 비어 보이는 건
     * 사용자가 바로 알아채는 실패라 서버 진단에도 남긴다.
     */
    static void registerWidgetToken(Context ctx) {
        final Context app = ctx.getApplicationContext();
        final String base = AccountsStore.readServerBase(app);
        if (base == null) return;
        final String cookies = ServerApi.sessionCookie(base);
        if (cookies == null) return; // 아직 로그인 전 — 다음 onResume 에서 재시도.
        ServerApi.run(() -> {
            final String body = ServerApi.postForBody(base + "/api/widget/token", cookies, null);
            if (body == null) {
                NativeDiagnostics.report(app, NativeDiagnostics.FLOW_WIDGET, "token", "no token response");
                return;
            }
            try {
                final String token = new JSONObject(body).optString("token", null);
                if (token == null || token.isEmpty()) {
                    NativeDiagnostics.report(
                        app, NativeDiagnostics.FLOW_WIDGET, "token", "empty token");
                    return;
                }
                app.getSharedPreferences(BebeWidgetPlugin.PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(BebeWidgetPlugin.KEY_TOKEN, token)
                    .putString(BebeWidgetPlugin.KEY_SERVER, base)
                    .apply();
                WidgetRefreshWorker.enqueueNow(app);
                // 주기 갱신도 보장 — 위젯 추가 시점(onEnabled)에만 스케줄됐다가 누락될 수 있어
                // 토큰 등록마다 재확인(UPDATE 정책이라 중복 스케줄 없음).
                WidgetRefreshWorker.ensurePeriodic(app);
            } catch (Exception e) {
                NativeDiagnostics.report(app, NativeDiagnostics.FLOW_WIDGET, "token-parse", e);
            }
        });
    }

    /**
     * FCM 기기 토큰 네이티브 등록. 관리자가 Firebase 를 설정(`/api/push/fcm-config` configured)
     * 했을 때만 동작 — 공개 config 로 2nd FirebaseApp 을 초기화해 토큰을 받고, 세션 쿠키로
     * `POST /api/notifications/register-device` 한다. 미설정이면 무동작.
     */
    static void registerFcm(Context ctx) {
        final Context app = ctx.getApplicationContext();
        final String base = AccountsStore.readServerBase(app);
        if (base == null) return;
        ServerApi.run(() -> {
            final String cfg = ServerApi.get(base + "/api/push/fcm-config");
            if (cfg == null) {
                NativeDiagnostics.report(app, NativeDiagnostics.FLOW_FCM, "config-fetch", "no response");
                return;
            }
            try {
                final JSONObject j = new JSONObject(cfg);
                if (!j.optBoolean("configured", false)) return; // 관리자가 아직 안 켬 — 정상.
                final String apiKey = j.optString("apiKey", "");
                final String appId = j.optString("appId", "");
                final String projectId = j.optString("projectId", "");
                final String senderId = j.optString("messagingSenderId", "");
                if (apiKey.isEmpty() || appId.isEmpty() || projectId.isEmpty() || senderId.isEmpty()) {
                    NativeDiagnostics.report(
                        app, NativeDiagnostics.FLOW_FCM, "config-incomplete", "missing firebase fields");
                    return;
                }
                firebaseApp(app, apiKey, appId, projectId, senderId)
                    .get(FirebaseMessaging.class)
                    .getToken()
                    .addOnCompleteListener(task -> {
                        if (!task.isSuccessful() || task.getResult() == null) {
                            NativeDiagnostics.report(app, NativeDiagnostics.FLOW_FCM, "token",
                                String.valueOf(task.getException()));
                            return;
                        }
                        registerDeviceEverywhere(app, base, task.getResult());
                    });
            } catch (Exception e) {
                NativeDiagnostics.report(app, NativeDiagnostics.FLOW_FCM, "init", e);
            }
        });
    }

    /** ⚠️ 2차 FirebaseApp 에서 메시징은 `app.get(...)` 로 — `getInstance(app)` 오버로드는 없다. */
    private static FirebaseApp firebaseApp(
        Context app, String apiKey, String appId, String projectId, String senderId) {
        try {
            return FirebaseApp.getInstance("bebe");
        } catch (IllegalStateException notYet) {
            final FirebaseOptions opts = new FirebaseOptions.Builder()
                .setApiKey(apiKey)
                .setApplicationId(appId)
                .setProjectId(projectId)
                .setGcmSenderId(senderId)
                .build();
            return FirebaseApp.initializeApp(app, opts, "bebe");
        }
    }

    /**
     * 멀티 인스턴스 — 토큰을 연결된 "모든" 가족 서버에 등록(각자 세션 쿠키로). 인스턴스들이
     * 같은 Firebase 프로젝트를 공유하면 모든 가족 푸시가 이 기기로 온다. (프로젝트가 다르면
     * 활성 가족만 — FCM 한계.)
     */
    private static void registerDeviceEverywhere(Context app, String base, String fcmToken) {
        final List<String> targets = AccountsStore.readBases(app);
        if (targets.isEmpty()) targets.add(base);
        for (final String t : targets) {
            ServerApi.run(() -> {
                try {
                    final String cookies = ServerApi.sessionCookie(t);
                    if (cookies == null) return; // 그 가족은 아직 로그인 전.
                    final JSONObject body =
                        new JSONObject().put("token", fcmToken).put("platform", "android");
                    final int code =
                        ServerApi.postJson(t + "/api/notifications/register-device", cookies, body.toString());
                    if (code < 200 || code >= 300) {
                        NativeDiagnostics.report(
                            app, NativeDiagnostics.FLOW_FCM, "register-device", "status=" + code);
                    }
                } catch (Exception e) {
                    NativeDiagnostics.report(app, NativeDiagnostics.FLOW_FCM, "register-device", e);
                }
            });
        }
    }
}
