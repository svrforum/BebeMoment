package im.bebe.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Calendar;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * 위젯 렌더의 계산 부분. 비트맵 자체는 기기에서만 확인할 수 있지만, 캔버스 크기와 다운샘플
 * 배수는 RemoteViews 바인더 예산(≈1MB)을 지키는 근거라 여기서 못 박는다 — 넘치면 위젯이
 * 조용히 갱신되지 않는다.
 */
@RunWith(RobolectricTestRunner.class)
public class WidgetRefreshWorkerTest {

    private static final int FRAME_MAX_PX = 420;

    // ── photoDateLabel ────────────────────────────────────────────────────

    private static String isoInCurrentYear(int month, int day) {
        return String.format(
            "%04d-%02d-%02dT09:00:00.000Z", Calendar.getInstance().get(Calendar.YEAR), month, day);
    }

    @Test
    public void thisYearShowsMonthAndDayOnly() {
        final String labels = WidgetRefreshWorker.photoDateLabel(
            "[\"" + isoInCurrentYear(5, 12) + "\"]", 0);
        assertEquals("5월 12일", labels);
    }

    @Test
    public void otherYearsShowTheYearToo() {
        assertEquals("2019.5.12", WidgetRefreshWorker.photoDateLabel("[\"2019-05-12\"]", 0));
    }

    @Test
    public void outOfRangeIndexIsEmpty() {
        assertEquals("", WidgetRefreshWorker.photoDateLabel("[\"2019-05-12\"]", 1));
        assertEquals("", WidgetRefreshWorker.photoDateLabel("[\"2019-05-12\"]", -1));
    }

    @Test
    public void malformedInputIsEmptyNotAnException() {
        assertEquals("", WidgetRefreshWorker.photoDateLabel(null, 0));
        assertEquals("", WidgetRefreshWorker.photoDateLabel("", 0));
        assertEquals("", WidgetRefreshWorker.photoDateLabel("not json", 0));
        assertEquals("", WidgetRefreshWorker.photoDateLabel("[\"2019-0\"]", 0));
        assertEquals("", WidgetRefreshWorker.photoDateLabel("[\"\"]", 0));
        assertEquals("", WidgetRefreshWorker.photoDateLabel("[\"yyyy-mm-dd\"]", 0));
    }

    // ── sampleSize (디코드 다운샘플) ──────────────────────────────────────

    @Test
    public void smallImagesAreNotDownsampled() {
        assertEquals(1, WidgetRefreshWorker.sampleSize(800, 600, FRAME_MAX_PX));
        assertEquals(1, WidgetRefreshWorker.sampleSize(0, 0, FRAME_MAX_PX));
    }

    /** 2의 거듭제곱으로만 줄인다 — BitmapFactory 가 그 외 값을 반올림해 예측이 깨진다. */
    @Test
    public void largeImagesAreHalvedUntilTheyFit() {
        // 상한은 target*2(=840px) — 화질 여유를 남기고 메모리만 줄인다.
        assertEquals(4, WidgetRefreshWorker.sampleSize(2000, 1500, FRAME_MAX_PX));
        assertEquals(8, WidgetRefreshWorker.sampleSize(4000, 3000, FRAME_MAX_PX));
        assertEquals(16, WidgetRefreshWorker.sampleSize(8000, 6000, FRAME_MAX_PX));
        // 줄인 뒤에도 표시 크기(420px)보다는 크게 남는다.
        assertTrue(4000 / WidgetRefreshWorker.sampleSize(4000, 3000, FRAME_MAX_PX) >= FRAME_MAX_PX);
    }

    @Test
    public void portraitAndLandscapeUseTheLongEdge() {
        assertEquals(
            WidgetRefreshWorker.sampleSize(4000, 3000, FRAME_MAX_PX),
            WidgetRefreshWorker.sampleSize(3000, 4000, FRAME_MAX_PX));
    }

    // ── canvas 크기 (위젯 종횡비 액자) ────────────────────────────────────

    @Test
    public void squareWidgetGivesASquareCanvas() {
        assertEquals(FRAME_MAX_PX, WidgetRefreshWorker.canvasW(1f));
        assertEquals(FRAME_MAX_PX, WidgetRefreshWorker.canvasH(1f));
    }

    @Test
    public void theLongEdgeIsCappedSoRemoteViewsStaysUnderBudget() {
        // 가로로 넓은 위젯: 폭이 상한, 높이가 줄어든다.
        assertEquals(FRAME_MAX_PX, WidgetRefreshWorker.canvasW(2f));
        assertEquals(210, WidgetRefreshWorker.canvasH(2f));
        // 세로로 긴 위젯: 높이가 상한, 폭이 줄어든다.
        assertEquals(FRAME_MAX_PX, WidgetRefreshWorker.canvasH(0.5f));
        assertEquals(210, WidgetRefreshWorker.canvasW(0.5f));
    }

    @Test
    public void canvasKeepsTheWidgetAspect() {
        for (float aspect : new float[] {0.4f, 0.75f, 1f, 1.6f, 2.5f}) {
            final int w = WidgetRefreshWorker.canvasW(aspect);
            final int h = WidgetRefreshWorker.canvasH(aspect);
            assertTrue("positive canvas for " + aspect, w > 0 && h > 0);
            assertTrue("long edge capped for " + aspect, Math.max(w, h) <= FRAME_MAX_PX);
            assertEquals("aspect kept for " + aspect, aspect, (float) w / h, 0.02f);
            // 420² × 4바이트 ≈ 0.70MB — 바인더 한도(≈1MB) 아래.
            assertTrue("under the binder budget for " + aspect, (long) w * h * 4 < 1_000_000L);
        }
    }
}
