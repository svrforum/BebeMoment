package im.bebe.app;

import android.webkit.WebView;

/**
 * 셸에서 떼어낸 조각들이 WebView 를 건드릴 때 쓰는 최소 창구. MainActivity 가 구현한다 —
 * 조각들이 액티비티 전체를 알 필요는 없다.
 */
interface ShellHost {

    /** 셸 WebView. 아직 없거나 이미 정리됐으면 null. */
    WebView webView();

    /** 셸 WebView 로 이동(WebView 가 없으면 무시). */
    void loadUrl(String url);
}
