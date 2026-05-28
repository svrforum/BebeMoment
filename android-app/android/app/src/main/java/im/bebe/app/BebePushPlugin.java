package im.bebe.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "BebePush")
public class BebePushPlugin extends Plugin {

    @PluginMethod
    public void initAndGetToken(PluginCall call) {
        // Origin check: allowNavigation is "*" in the WebView, so any page could
        // call this plugin. Only let the saved server origin trigger FCM init.
        if (!isCallerOriginAllowed()) {
            call.reject("origin not allowed");
            return;
        }

        String apiKey = call.getString("apiKey");
        String appId = call.getString("appId");
        String projectId = call.getString("projectId");
        String senderId = call.getString("messagingSenderId");
        if (apiKey == null || appId == null || projectId == null || senderId == null) {
            call.reject("Firebase 설정이 누락되었습니다");
            return;
        }

        FirebaseApp app;
        try {
            app = FirebaseApp.getInstance("bebe");
        } catch (IllegalStateException e) {
            FirebaseOptions options = new FirebaseOptions.Builder()
                .setApiKey(apiKey)
                .setApplicationId(appId)
                .setProjectId(projectId)
                .setGcmSenderId(senderId)
                .build();
            app = FirebaseApp.initializeApp(getContext(), options, "bebe");
        }

        app.get(FirebaseMessaging.class).getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                call.reject("토큰 발급 실패", task.getException());
                return;
            }
            JSObject ret = new JSObject();
            ret.put("token", task.getResult());
            call.resolve(ret);
        });
    }

    private boolean isCallerOriginAllowed() {
        final String savedServerUrl = readServerUrl();
        if (savedServerUrl == null) return false;
        final Uri savedUri = safeParse(savedServerUrl);
        if (savedUri == null || savedUri.getHost() == null) return false;

        // WebView.getUrl() must run on the UI thread. If we're already there
        // (rare for plugin methods, but possible), just read directly.
        final String currentUrl;
        if (Looper.myLooper() == Looper.getMainLooper()) {
            currentUrl = safeGetWebViewUrl();
        } else {
            final String[] holder = new String[1];
            final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
            try {
                getBridge().getActivity().runOnUiThread(() -> {
                    holder[0] = safeGetWebViewUrl();
                    latch.countDown();
                });
                if (!latch.await(2, java.util.concurrent.TimeUnit.SECONDS)) return false;
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return false;
            } catch (Exception e) {
                return false;
            }
            currentUrl = holder[0];
        }

        if (currentUrl == null) return false;
        final Uri currentUri = safeParse(currentUrl);
        if (currentUri == null || currentUri.getHost() == null) return false;
        return sameOrigin(currentUri, savedUri);
    }

    private String safeGetWebViewUrl() {
        try {
            return getBridge().getWebView().getUrl();
        } catch (Exception e) {
            return null;
        }
    }

    private String readServerUrl() {
        try {
            SharedPreferences sp = getContext()
                .getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            return sp.getString("serverUrl", null);
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean sameOrigin(Uri a, Uri b) {
        final String aScheme = a.getScheme();
        final String bScheme = b.getScheme();
        final String aHost = a.getHost();
        final String bHost = b.getHost();
        if (aScheme == null || bScheme == null || aHost == null || bHost == null) return false;
        if (!aScheme.equalsIgnoreCase(bScheme)) return false;
        if (!aHost.equalsIgnoreCase(bHost)) return false;
        return effectivePort(a) == effectivePort(b);
    }

    private static int effectivePort(Uri u) {
        int p = u.getPort();
        if (p != -1) return p;
        final String s = u.getScheme();
        if ("https".equalsIgnoreCase(s)) return 443;
        if ("http".equalsIgnoreCase(s)) return 80;
        return -1;
    }

    private static Uri safeParse(String s) {
        try {
            return Uri.parse(s);
        } catch (Exception e) {
            return null;
        }
    }
}
