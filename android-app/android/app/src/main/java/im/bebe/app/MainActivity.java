package im.bebe.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int REQ_POST_NOTIFICATIONS = 4242;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BebePushPlugin.class);
        super.onCreate(savedInstanceState);
        requestPostNotificationsIfNeeded();
        handleDeepLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    private void requestPostNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        ActivityCompat.requestPermissions(
            this,
            new String[] { Manifest.permission.POST_NOTIFICATIONS },
            REQ_POST_NOTIFICATIONS
        );
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null || getBridge() == null) return;
        final String raw = intent.getStringExtra("deepLink");
        if (raw == null) return;
        final String target = resolveDeepLink(raw);
        if (target == null) return;
        // Delay so the remote app page has a chance to load on a cold start.
        getBridge().getWebView().postDelayed(() -> {
            String js = "window.location.href=" + jsString(target) + ";";
            getBridge().getWebView().evaluateJavascript(js, null);
        }, 600);
    }

    /**
     * Validate a push-supplied URL before we evaluate JS that navigates to it.
     *
     * Accepts:
     *   - A relative path ("/diary/123"): resolved against the configured server origin.
     *   - An absolute http/https URL whose host (+scheme/+port) matches the configured server.
     *
     * Rejects javascript:, data:, intent:, file:, custom schemes, and any cross-origin URL.
     * Returns the URL string to navigate to, or null if the input should be ignored.
     */
    private String resolveDeepLink(String raw) {
        final String trimmed = raw.trim();
        if (trimmed.isEmpty()) return null;

        final String serverUrl = readServerUrl();
        final Uri serverUri = serverUrl != null ? safeParse(serverUrl) : null;

        if (trimmed.startsWith("/")) {
            // Relative path → only meaningful if we know the origin.
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
            // No saved origin to compare against; fall back to the currently loaded page's origin.
            final String currentUrl = getBridge().getWebView().getUrl();
            final Uri currentUri = currentUrl != null ? safeParse(currentUrl) : null;
            if (currentUri == null) return null;
            return sameOrigin(target, currentUri) ? trimmed : null;
        }
        return sameOrigin(target, serverUri) ? trimmed : null;
    }

    private static boolean sameOrigin(Uri a, Uri b) {
        final String aScheme = a.getScheme();
        final String bScheme = b.getScheme();
        final String aHost = a.getHost();
        final String bHost = b.getHost();
        if (aScheme == null || bScheme == null || aHost == null || bHost == null) return false;
        if (!aScheme.equalsIgnoreCase(bScheme)) return false;
        if (!aHost.equalsIgnoreCase(bHost)) return false;
        final int aPort = effectivePort(a);
        final int bPort = effectivePort(b);
        return aPort == bPort;
    }

    private static int effectivePort(Uri u) {
        int p = u.getPort();
        if (p != -1) return p;
        final String s = u.getScheme();
        if ("https".equalsIgnoreCase(s)) return 443;
        if ("http".equalsIgnoreCase(s)) return 80;
        return -1;
    }

    private static String buildOrigin(Uri u) {
        final StringBuilder sb = new StringBuilder();
        sb.append(u.getScheme()).append("://").append(u.getHost());
        final int port = u.getPort();
        if (port != -1) sb.append(':').append(port);
        return sb.toString();
    }

    private static Uri safeParse(String s) {
        try {
            return Uri.parse(s);
        } catch (Exception e) {
            return null;
        }
    }

    /** Read the server URL stored by the Capacitor Preferences plugin (default group: CapacitorStorage). */
    private String readServerUrl() {
        try {
            SharedPreferences sp = getApplicationContext()
                .getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            return sp.getString("serverUrl", null);
        } catch (Exception e) {
            return null;
        }
    }

    private static String jsString(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }
}
