package im.bebe.app;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * 영상 전체화면을 실제로 띄우는 크롬 클라이언트.
 *
 * Capacitor 의 {@link BridgeWebChromeClient#onShowCustomView} 는 첫 줄에서
 * {@code callback.onCustomViewHidden()} 을 불러 전체화면을 즉시 취소한다(6.2.1 · 8.5.1
 * 동일). 그래서 영상 컨트롤의 전체화면 버튼이 눌리긴 해도 들어갔다 곧바로 되돌아왔다.
 * 그 상태에서 뒤로가기를 누르면 "전체화면 닫기"가 아니라 페이지 이동이 되어 보던 화면을
 * 벗어났다.
 *
 * BridgeWebChromeClient 를 **상속**한다(맨 WebChromeClient 로 갈아끼우면 안 된다) —
 * 파일 선택기(onShowFileChooser), 권한 요청, JS 다이얼로그가 전부 그쪽에 있어서 업로드가
 * 깨진다. 여기서는 전체화면 두 메서드만 우리가 맡는다.
 */
public class ShellWebChromeClient extends BridgeWebChromeClient {

    private final Activity activity;
    private final WebView webView;

    private View customView;
    private CustomViewCallback customViewCallback;
    private int savedSystemUiVisibility;

    public ShellWebChromeClient(Bridge bridge, Activity activity, WebView webView) {
        super(bridge);
        this.activity = activity;
        this.webView = webView;
    }

    /** 전체화면 표시 중인가 — 뒤로가기가 페이지 이동 대신 전체화면을 닫도록 판단하는 근거. */
    public boolean isInCustomView() {
        return customView != null;
    }

    /**
     * 밖(뒤로가기)에서 전체화면을 닫는다. Chromium 에 알린 뒤 정리는
     * {@link #onHideCustomView()} 가 하지만, 콜백이 되돌아오지 않는 경우를 대비해
     * 여기서도 직접 정리한다(정리는 멱등하다).
     */
    public void exitCustomView() {
        if (customViewCallback != null) {
            try {
                customViewCallback.onCustomViewHidden();
            } catch (Throwable t) {
                NativeDiagnostics.warn("shell", "exit-fullscreen", t);
            }
        }
        onHideCustomView();
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        // super 를 부르지 않는다 — super 가 바로 취소하는 그 코드다.
        if (customView != null) {
            callback.onCustomViewHidden();
            return;
        }
        customView = view;
        customViewCallback = callback;

        final ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
        savedSystemUiVisibility = decor.getSystemUiVisibility();
        decor.addView(
            view,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        webView.setVisibility(View.GONE);
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(activity.getWindow(), decor);
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
    }

    @Override
    public void onHideCustomView() {
        if (customView == null) return;
        final ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
        decor.removeView(customView);
        decor.setSystemUiVisibility(savedSystemUiVisibility);
        customView = null;
        customViewCallback = null;

        webView.setVisibility(View.VISIBLE);
        activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        new WindowInsetsControllerCompat(activity.getWindow(), decor)
            .show(WindowInsetsCompat.Type.systemBars());
    }
}
