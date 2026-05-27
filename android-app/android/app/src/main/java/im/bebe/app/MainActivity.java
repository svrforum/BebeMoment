package im.bebe.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BebePushPlugin.class);
        super.onCreate(savedInstanceState);
        handleDeepLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null || getBridge() == null) return;
        final String url = intent.getStringExtra("deepLink");
        if (url == null) return;
        // Delay so the remote app page has a chance to load on a cold start.
        getBridge().getWebView().postDelayed(() -> {
            String js = "window.location.href=" + jsString(url) + ";";
            getBridge().getWebView().evaluateJavascript(js, null);
        }, 600);
    }

    private static String jsString(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }
}
