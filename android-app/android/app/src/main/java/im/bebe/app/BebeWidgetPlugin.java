package im.bebe.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 홈 위젯용 설정 수신 플러그인. WebView(로그인된 앱)가 발급받은 위젯 토큰 + 서버 URL 을
 * 넘기면 위젯 전용 SharedPreferences 에 저장하고 즉시 갱신을 트리거한다.
 */
@CapacitorPlugin(name = "BebeWidget")
public class BebeWidgetPlugin extends Plugin {

    static final String PREFS = "BebeWidget";
    static final String KEY_TOKEN = "token";
    static final String KEY_SERVER = "serverUrl";

    @PluginMethod
    public void setConfig(PluginCall call) {
        String token = call.getString("token");
        String serverUrl = call.getString("serverUrl");
        if (token == null || serverUrl == null) {
            call.reject("token/serverUrl 누락");
            return;
        }
        Context ctx = getContext().getApplicationContext();
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit().putString(KEY_TOKEN, token).putString(KEY_SERVER, serverUrl).apply();

        // 즉시 1회 갱신 + 주기 작업 보장.
        WidgetRefreshWorker.enqueueNow(ctx);
        WidgetRefreshWorker.ensurePeriodic(ctx);

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}
