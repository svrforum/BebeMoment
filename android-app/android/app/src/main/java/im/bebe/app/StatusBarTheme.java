package im.bebe.app;

import android.app.Activity;
import android.os.Build;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/**
 * 상태바를 웹 테마(.dark 클래스)에 맞춘다. 원격 페이지엔 Capacitor 브리지가 없으므로
 * addJavascriptInterface(모든 origin 에 주입됨) + onPageFinished 주입으로 동적 적용한다.
 * edge-to-edge/inset 은 건드리지 않아 헤더 safe-area 패딩에 영향 없다(아이콘·색만).
 */
final class StatusBarTheme {

    /** 페이지 로드 후 주입 — html.dark 를 읽고, 이후 class 변화도 관찰해 따라간다. */
    static final String INJECT_JS =
        "(function(){function s(){try{BebeStatusBar.apply("
            + "document.documentElement.classList.contains('dark'));}catch(e){}}s();"
            + "try{if(!window.__bebeBarObs){window.__bebeBarObs=new MutationObserver(s);"
            + "window.__bebeBarObs.observe(document.documentElement,{attributes:true,"
            + "attributeFilter:['class']});}}catch(e){}})();";

    private StatusBarTheme() {}

    @SuppressWarnings("deprecation")
    static void apply(Activity activity, boolean dark) {
        final Window w = activity.getWindow();
        if (w == null) return;
        // Android 15(API 35)부터 setStatusBarColor 는 no-op 이고 edge-to-edge 가 강제된다 —
        // 그 기기에서는 웹 페이지 배경이 그대로 상태바 뒤로 비친다. 그 아래 기기에서는
        // 여전히 우리가 칠해야 하므로 조건부로 남긴다.
        // base-950 / base-50 — globals.css 의 다크/라이트 페이지 배경과 같은 톤.
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(dark ? 0xFF09090B : 0xFFF3F3F7);
        }
        final WindowInsetsControllerCompat c =
            WindowCompat.getInsetsController(w, w.getDecorView());
        c.setAppearanceLightStatusBars(!dark);
    }
}
