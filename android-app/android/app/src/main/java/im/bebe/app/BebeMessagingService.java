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
        RemoteMessage.Notification n = msg.getNotification();
        String title = n != null && n.getTitle() != null ? n.getTitle() : "bebe";
        String body = n != null && n.getBody() != null ? n.getBody() : "";
        String url = msg.getData().get("url");

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                new NotificationChannel(CHANNEL_ID, "알림", NotificationManager.IMPORTANCE_HIGH)
            );
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (url != null) intent.putExtra("deepLink", url);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, intent,
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
