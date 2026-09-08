package im.bebe.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.net.Uri;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * 앱 내 업데이트는 페이지가 준 URL 을 받아 APK 를 설치까지 끌고 간다 — 여기서 통과시킨
 * 주소가 곧 설치 후보다. (설치 직전에 패키지명도 다시 보지만, 그 앞의 문이 이것이다.)
 */
@RunWith(RobolectricTestRunner.class)
public class ApkUpdaterUrlTest {

    private static final String OK =
        "https://github.com/svrforum/BebeMoment/releases/download/android-v1.0.49/bebe-1.0.49.apk";

    @Test
    public void acceptsOurReleaseAsset() {
        assertTrue(ApkUpdater.isOwnApkUrl(OK));
    }

    @Test
    public void rejectsAnotherHost() {
        assertFalse(ApkUpdater.isOwnApkUrl(
            "https://evil.test/svrforum/BebeMoment/releases/download/v1/app.apk"));
    }

    /** 호스트 접두가 같아 보여도 다른 도메인이다. */
    @Test
    public void rejectsLookalikeHost() {
        assertFalse(ApkUpdater.isOwnApkUrl(
            "https://github.com.evil.test/svrforum/BebeMoment/releases/download/v1/app.apk"));
    }

    @Test
    public void rejectsAnotherRepositoryOnGithub() {
        assertFalse(ApkUpdater.isOwnApkUrl(
            "https://github.com/someone/else/releases/download/v1/app.apk"));
    }

    @Test
    public void rejectsNonApkAndPlainHttp() {
        assertFalse(ApkUpdater.isOwnApkUrl(
            "https://github.com/svrforum/BebeMoment/releases/download/v1/notes.txt"));
        assertFalse(ApkUpdater.isOwnApkUrl(
            "http://github.com/svrforum/BebeMoment/releases/download/v1/app.apk"));
    }

    @Test
    public void rejectsNull() {
        assertFalse(ApkUpdater.isOwnApkUrl(null));
    }

    @Test
    public void filenameComesFromTheLastPathSegment() {
        assertEquals("bebe-1.0.49.apk", ApkUpdater.filenameFromUrl(Uri.parse(OK)));
    }

    /** .apk 가 아니면 임의 이름을 그대로 쓰지 않는다 — 고정 이름으로 떨어뜨린다. */
    @Test
    public void filenameFallsBackWhenNotAnApk() {
        assertEquals("update.apk",
            ApkUpdater.filenameFromUrl(Uri.parse("https://github.com/x/y/releases/download/v1/")));
        assertEquals("update.apk", ApkUpdater.filenameFromUrl(Uri.parse("https://github.com")));
        assertEquals("update.apk", ApkUpdater.filenameFromUrl(null));
    }
}
