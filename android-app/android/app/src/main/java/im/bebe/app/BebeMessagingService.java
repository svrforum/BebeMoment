package im.bebe.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class BebeMessagingService extends FirebaseMessagingService {

    private static final String CHANNEL_ID = "bebe-default";

    @Override
    public void onMessageReceived(RemoteMessage msg) {
        // 서버는 데이터 전용 메시지를 보낸다(백그라운드에서도 이 콜백이 돌게) — title/body 를
        // data 에서 읽고, 혹시 모를 notification 페이로드(구버전 호환)는 폴백으로.
        java.util.Map<String, String> data = msg.getData();
        RemoteMessage.Notification n = msg.getNotification();
        String title = data.get("title");
        if (title == null || title.isEmpty()) {
            title = n != null && n.getTitle() != null ? n.getTitle() : "bebe";
        }
        String body = data.get("body");
        if (body == null) {
            body = n != null && n.getBody() != null ? n.getBody() : "";
        }
        String url = data.get("url");
        String server = data.get("server"); // 멀티 인스턴스 — 알림 출처 가족(서버).

        // 푸시가 오면(새 사진·댓글 등) 위젯도 즉시 갱신해 최신 사진·뱃지를 반영.
        try {
            WidgetRefreshWorker.enqueueNow(getApplicationContext());
        } catch (Throwable ignored) {
        }

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                new NotificationChannel(CHANNEL_ID, "알림", NotificationManager.IMPORTANCE_HIGH)
            );
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (url != null) intent.putExtra("deepLink", url);
        if (server != null && !server.isEmpty()) intent.putExtra("switchServer", server);
        // 출처 서버별로 PendingIntent 가 안 합쳐지게 requestCode 를 서버 해시로.
        int reqCode = server != null ? server.hashCode() : 0;
        PendingIntent pi = PendingIntent.getActivity(
            this, reqCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pi);
        nm.notify((int) System.currentTimeMillis(), builder.build());
    }
}
