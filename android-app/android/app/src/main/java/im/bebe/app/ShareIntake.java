package im.bebe.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.webkit.WebResourceResponse;
import android.widget.Toast;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 갤러리 "공유 → bebe": ACTION_SEND / SEND_MULTIPLE 로 받은 사진·영상을 웹 업로드
 * 스테이징(미리보기·편집·최적화)으로 넘긴다 — 바로 안 올리고 사용자가 "업로드" 를 눌러야
 * 시작한다.
 *
 * 크기 제한이 없다: 파일은 여기 맵에만 담고 메타데이터만 웹 훅에 주입하면, 웹이
 * {@code /__bebe_share/<id>} 로 fetch → WebViewClient 가 스트리밍으로 돌려준다.
 */
final class ShareIntake {

    static final String PATH_PREFIX = "/__bebe_share/";

    private final Map<String, Uri> files = new ConcurrentHashMap<>();

    /**
     * 공유 인텐트를 스테이징하고, 웹에 주입할 스크립트를 돌려준다(넘길 게 없으면 null).
     * 스크립트는 웹 훅이 준비될 때까지 스스로 재시도한다.
     */
    String stage(Activity activity, Intent intent, String serverBase) {
        final ArrayList<Uri> uris = extractUris(intent);
        if (uris.isEmpty()) return null;
        if (serverBase == null) {
            Toast.makeText(activity, "먼저 앱에서 로그인해주세요", Toast.LENGTH_LONG).show();
            return null;
        }

        final ContentResolver cr = activity.getContentResolver();
        final JSONArray meta = new JSONArray();
        int i = 0;
        for (Uri u : uris) {
            try {
                String mime = cr.getType(u);
                if (mime == null) mime = "application/octet-stream";
                final String id = (i++) + "-" + android.os.SystemClock.uptimeMillis();
                files.put(id, u);
                final JSONObject o = new JSONObject();
                o.put("name", displayName(activity, u, mime));
                o.put("type", mime);
                o.put("url", PATH_PREFIX + id);
                meta.put(o);
            } catch (Exception e) {
                // 한 파일 실패는 건너뛴다 — 나머지는 넘어가야 한다.
                NativeDiagnostics.warn("share", "stage-file", e);
            }
        }
        if (meta.length() == 0) {
            NativeDiagnostics.warn("share", "stage", "no files staged from " + uris.size() + " uris");
            return null;
        }
        Toast.makeText(activity, "공유한 파일을 불러오는 중…", Toast.LENGTH_SHORT).show();
        return "(function(){var d=" + meta + ";var t=0;function go(){"
            + "if(window.bebeReceiveSharedFiles){window.bebeReceiveSharedFiles(d);}"
            + "else if(t++<25){setTimeout(go,300);}}go();})();";
    }

    @SuppressWarnings("deprecation")
    private static ArrayList<Uri> extractUris(Intent intent) {
        final ArrayList<Uri> uris = new ArrayList<>();
        if (intent == null) return uris;
        final String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            final Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            final ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        }
        return uris;
    }

    /**
     * {@code /__bebe_share/<id>} 요청을 공유받은 파일 스트림으로 응답한다(크기 무제한).
     * 이 요청이 아니면 null — 호출부가 평소대로 넘긴다.
     */
    WebResourceResponse serve(Context ctx, Uri requestUri) {
        if (requestUri == null) return null;
        final String path = requestUri.getPath();
        if (path == null || !path.startsWith(PATH_PREFIX)) return null;

        final Uri shared = files.get(path.substring(PATH_PREFIX.length()));
        if (shared == null) return null;
        try {
            final ContentResolver cr = ctx.getContentResolver();
            String mime = cr.getType(shared);
            if (mime == null) mime = "application/octet-stream";
            final InputStream in = cr.openInputStream(shared);
            if (in == null) {
                NativeDiagnostics.warn("share", "open-stream", "null stream");
                return null;
            }
            return new WebResourceResponse(mime, null, in);
        } catch (Exception e) {
            NativeDiagnostics.warn("share", "serve", e);
            return null;
        }
    }

    private static String displayName(Context ctx, Uri uri, String mime) {
        try (Cursor c = ctx.getContentResolver()
            .query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                final int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (ni >= 0 && !c.isNull(ni)) {
                    final String n = c.getString(ni);
                    if (n != null && !n.isEmpty()) return n;
                }
            }
        } catch (Exception e) {
            NativeDiagnostics.warn("share", "display-name", e);
        }
        return "shared-" + android.os.SystemClock.uptimeMillis()
            + (mime.startsWith("video/") ? ".mp4" : ".jpg");
    }
}
