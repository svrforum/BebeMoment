package im.bebe.app;

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
}
