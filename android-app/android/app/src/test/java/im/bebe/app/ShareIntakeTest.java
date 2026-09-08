package im.bebe.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.shadows.ShadowLog;
import org.robolectric.shadows.ShadowLog;

/**
 * 공유받은 사진 바이트를 웹에 넘기는 경로. capacitor.config 의 allowNavigation 이 "*" 라
 * 웹뷰는 어떤 페이지로도 갈 수 있다 — 그래서 이 경로는 **경로 이름만으로 열리면 안 된다**.
 * 공유 당시의 서버 origin 이 아니면 아무것도 돌려주지 않아야 하고, 한 번 읽힌 파일은
 * 다시 읽히지 않아야 한다.
 */
@RunWith(RobolectricTestRunner.class)
public class ShareIntakeTest {

    private static final String SERVER = "https://family.example.com";
    private static final Uri PHOTO = Uri.parse("content://im.bebe.app.test.gallery/photo/42");
    private static final byte[] BYTES = "jpeg-bytes".getBytes(StandardCharsets.UTF_8);

    private Activity activity;
    private ShareIntake intake;

    @Before
    public void setUp() {
        // 실패했을 때 왜인지 보이게 — NativeDiagnostics 가 남긴 W/bebe 줄이 리포트에 실린다.
        ShadowLog.stream = System.out;
        activity = Robolectric.buildActivity(Activity.class).setup().get();
        intake = new ShareIntake();
        registerPhotoBytes();
    }

    private void registerPhotoBytes() {
        shadowOf(activity.getContentResolver())
            .registerInputStream(PHOTO, new ByteArrayInputStream(BYTES));
    }

    private String stageOnePhoto() {
        final Intent intent = new Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, PHOTO);
        final String js = intake.stage(activity, intent, SERVER);
        assertNotNull("staging should produce an injection script", js);
        return sharePathFrom(js);
    }

    /** 주입 스크립트에서 /__bebe_share/&lt;id&gt; 경로를 꺼낸다. */
    private static String sharePathFrom(String js) {
        final int from = js.indexOf("var d=") + "var d=".length();
        final int to = js.indexOf(";var t=0");
        try {
            final String url = new JSONArray(js.substring(from, to)).getJSONObject(0).getString("url");
            assertTrue(url.startsWith(ShareIntake.PATH_PREFIX));
            return url;
        } catch (Exception e) {
            throw new AssertionError("could not read the staged url out of " + js, e);
        }
    }

    /** 이 워크스트림이 닫은 구멍: 같은 경로라도 다른 origin 이면 바이트를 안 준다. */
    @Test
    public void aForeignOriginGetsNothingFromTheSamePath() {
        final String path = stageOnePhoto();
        assertNull(intake.serve(activity, Uri.parse("https://evil.test" + path)));
        // 접두가 비슷한 호스트도 마찬가지.
        assertNull(intake.serve(activity, Uri.parse("https://family.example.com.evil.test" + path)));
        // 포트가 다르면 다른 origin.
        assertNull(intake.serve(activity, Uri.parse("https://family.example.com:8443" + path)));
        // 앱 안의 로컬 온보딩 페이지도 서버가 아니다.
        assertNull(intake.serve(activity, Uri.parse("https://localhost" + path)));
        // 거절당한 뒤에도 진짜 origin 은 여전히 받을 수 있어야 한다.
        assertNotNull(intake.serve(activity, Uri.parse(SERVER + path)));
    }

    @Test
    public void theSharingOriginGetsTheBytes() throws Exception {
        final String path = stageOnePhoto();
        final WebResourceResponse res = intake.serve(activity, Uri.parse(SERVER + path));
        assertNotNull(res);
        final byte[] read = new byte[BYTES.length];
        assertEquals(BYTES.length, res.getData().read(read));
        assertEquals(new String(BYTES, StandardCharsets.UTF_8), new String(read, StandardCharsets.UTF_8));
    }

    /** 한 번 읽히면 버린다 — 나중에 열린 페이지가 같은 링크를 다시 못 쓰게. */
    @Test
    public void aStagedFileIsServedOnlyOnce() {
        final String path = stageOnePhoto();
        assertNotNull(intake.serve(activity, Uri.parse(SERVER + path)));
        assertNull(intake.serve(activity, Uri.parse(SERVER + path)));
    }

    /** id 는 추측할 수 없어야 한다 — 순번+uptimeMillis 이던 시절엔 맞힐 수 있었다. */
    @Test
    public void idsAreNotGuessable() {
        final String first = stageOnePhoto();
        registerPhotoBytes();
        final String second = stageOnePhoto();
        assertTrue("ids must differ", !first.equals(second));
        final String id = first.substring(ShareIntake.PATH_PREFIX.length());
        assertTrue("id should be a 32-byte random token, got " + id.length(), id.length() >= 42);
        assertNull(intake.serve(activity, Uri.parse(SERVER + ShareIntake.PATH_PREFIX + "0-12345")));
    }

    @Test
    public void unrelatedRequestsFallThrough() {
        stageOnePhoto();
        assertNull(intake.serve(activity, Uri.parse(SERVER + "/timeline")));
        assertNull(intake.serve(activity, Uri.parse(SERVER + "/api/health")));
        assertNull(intake.serve(activity, null));
    }

    @Test
    public void nothingIsStagedWithoutAServer() {
        final Intent intent = new Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, PHOTO);
        assertNull(intake.stage(activity, intent, null));
    }

    @Test
    public void nothingIsStagedWithoutFiles() {
        assertNull(intake.stage(activity, new Intent(Intent.ACTION_SEND), SERVER));
        assertNull(intake.stage(activity, new Intent(Intent.ACTION_VIEW), SERVER));
        assertNull(intake.stage(activity, null, SERVER));
    }
}
