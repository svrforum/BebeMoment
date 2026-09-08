package im.bebe.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * 안드로이드 기본 URLUtil.guessFileName 은 우리 서버가 보내는
 * `filename="..."; filename*=UTF-8''...` 조합을 못 읽어 모든 파일이 "download" 로
 * 떨어졌다. 직접 파싱하는 이유가 그것이라, 그 조합들을 고정해 둔다.
 */
@RunWith(RobolectricTestRunner.class)
public class DownloadsFilenameTest {

    @Test
    public void prefersTheUtf8FilenameStar() {
        assertEquals(
            "아기 첫걸음.jpg",
            Downloads.parseContentDispositionFilename(
                "attachment; filename=\"download\"; filename*=UTF-8''%EC%95%84%EA%B8%B0%20%EC%B2%AB%EA%B1%B8%EC%9D%8C.jpg"));
    }

    @Test
    public void readsFilenameStarWhenItComesFirst() {
        assertEquals(
            "a b.mp4",
            Downloads.parseContentDispositionFilename("attachment; filename*=UTF-8''a%20b.mp4; filename=\"x\""));
    }

    @Test
    public void fallsBackToThePlainFilename() {
        assertEquals(
            "photo.jpg",
            Downloads.parseContentDispositionFilename("attachment; filename=\"photo.jpg\""));
        assertEquals(
            "photo.jpg", Downloads.parseContentDispositionFilename("attachment; filename=photo.jpg"));
    }

    @Test
    public void returnsNullWhenThereIsNoFilename() {
        assertNull(Downloads.parseContentDispositionFilename("attachment"));
        assertNull(Downloads.parseContentDispositionFilename(""));
        assertNull(Downloads.parseContentDispositionFilename(null));
    }

    /** 경로 분리자가 남으면 DownloadManager 가 Downloads 밖 하위 경로로 샌다. */
    @Test
    public void stripsPathSeparators() {
        assertEquals(
            ".._.._etc_passwd",
            Downloads.parseContentDispositionFilename("attachment; filename=\"../../etc/passwd\""));
        assertEquals(
            "a_b.jpg",
            Downloads.parseContentDispositionFilename("attachment; filename*=UTF-8''a%2Fb.jpg"));
    }

    @Test
    public void stripsControlCharacters() {
        assertEquals("ab.jpg", Downloads.sanitizeFilename("a\u0001b.jpg"));
        assertEquals("ab.jpg", Downloads.sanitizeFilename("a\nb.jpg"));
    }

    /** 이름이 통째로 사라지면 DownloadManager 가 거부한다 — 빈 이름은 내보내지 않는다. */
    @Test
    public void neverReturnsAnEmptyName() {
        assertEquals("download", Downloads.sanitizeFilename("  "));
        assertEquals("_", Downloads.sanitizeFilename("/"));
    }
}
