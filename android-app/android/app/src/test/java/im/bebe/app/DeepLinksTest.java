package im.bebe.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.net.Uri;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * URL 판정은 셸의 보안 경계다 — 여기가 뚫리면 외부 페이지가 앱 셸 안으로 들어오거나
 * 세션 쿠키가 남의 호스트로 나간다. 그래서 판정마다 통과·거절을 못 박아 둔다.
 */
@RunWith(RobolectricTestRunner.class)
public class DeepLinksTest {

    private static final String SERVER = "https://family.example.com";

    // ── sameOrigin ────────────────────────────────────────────────────────

    @Test
    public void sameOriginAcceptsIdenticalOrigins() {
        assertTrue(DeepLinks.sameOrigin("https://a.example.com/x", "https://a.example.com"));
    }

    @Test
    public void sameOriginIgnoresCase() {
        assertTrue(DeepLinks.sameOrigin("HTTPS://A.example.com", "https://a.EXAMPLE.com"));
    }

    @Test
    public void sameOriginTreatsDefaultPortAsExplicitPort() {
        assertTrue(DeepLinks.sameOrigin("https://a.example.com", "https://a.example.com:443"));
        assertTrue(DeepLinks.sameOrigin("http://a.example.com:80", "http://a.example.com"));
    }

    @Test
    public void sameOriginRejectsDifferentPort() {
        assertFalse(DeepLinks.sameOrigin("https://a.example.com:8443", "https://a.example.com"));
    }

    @Test
    public void sameOriginRejectsDifferentScheme() {
        assertFalse(DeepLinks.sameOrigin("http://a.example.com", "https://a.example.com"));
    }

    /** startsWith 로 비교하던 시절 뚫렸던 모양 — 접두가 같아도 다른 호스트다. */
    @Test
    public void sameOriginRejectsHostPrefixLookalikes() {
        assertFalse(DeepLinks.sameOrigin("https://family.example.com.evil.test", SERVER));
        assertFalse(DeepLinks.sameOrigin("https://evil.test/?x=https://family.example.com", SERVER));
    }

    @Test
    public void sameOriginRejectsMissingParts() {
        assertFalse(DeepLinks.sameOrigin(null, SERVER));
        assertFalse(DeepLinks.sameOrigin("not a url", SERVER));
        assertFalse(DeepLinks.sameOrigin("/just/a/path", SERVER));
    }

    // ── resolveDeepLink (푸시가 준 URL) ──────────────────────────────────

    @Test
    public void resolveTurnsRelativePathIntoServerUrl() {
        assertEquals(SERVER + "/story/3", DeepLinks.resolveDeepLink("/story/3", SERVER, null));
    }

    @Test
    public void resolveKeepsPortWhenBuildingOrigin() {
        assertEquals(
            "http://192.0.2.9:3000/timeline",
            DeepLinks.resolveDeepLink("/timeline", "http://192.0.2.9:3000", null));
    }

    @Test
    public void resolveAcceptsAbsoluteSameOriginUrl() {
        assertEquals(
            SERVER + "/detail/42", DeepLinks.resolveDeepLink(SERVER + "/detail/42", SERVER, null));
    }

    @Test
    public void resolveRejectsCrossOriginUrl() {
        assertNull(DeepLinks.resolveDeepLink("https://evil.test/steal", SERVER, null));
    }

    @Test
    public void resolveRejectsNonHttpSchemes() {
        assertNull(DeepLinks.resolveDeepLink("javascript:alert(1)", SERVER, null));
        assertNull(DeepLinks.resolveDeepLink("data:text/html,<script>x</script>", SERVER, null));
        assertNull(DeepLinks.resolveDeepLink("file:///etc/hosts", SERVER, null));
        assertNull(DeepLinks.resolveDeepLink("intent://evil#Intent;end", SERVER, null));
        assertNull(DeepLinks.resolveDeepLink("bebe://open?server=https://evil.test", SERVER, null));
    }

    @Test
    public void resolveRejectsEmptyInput() {
        assertNull(DeepLinks.resolveDeepLink("   ", SERVER, null));
        assertNull(DeepLinks.resolveDeepLink(null, SERVER, null));
    }

    @Test
    public void resolveWithoutSavedServerFallsBackToTheLoadedPage() {
        assertEquals(
            "https://loaded.example.com/x",
            DeepLinks.resolveDeepLink("https://loaded.example.com/x", null, "https://loaded.example.com/y"));
        assertNull(DeepLinks.resolveDeepLink("https://evil.test/x", null, "https://loaded.example.com/y"));
        // origin 을 전혀 모르면 상대 경로도 해석할 수 없다.
        assertNull(DeepLinks.resolveDeepLink("/story/3", null, null));
        assertNull(DeepLinks.resolveDeepLink("https://any.example.com/x", null, null));
    }

    // ── isSafeRelativePath (bebe://open 의 path) ────────────────────────

    @Test
    public void safeRelativePathAcceptsAbsolutePaths() {
        assertTrue(DeepLinks.isSafeRelativePath("/timeline"));
        assertTrue(DeepLinks.isSafeRelativePath("/story/3?x=1"));
    }

    /** `//evil.test` 는 프로토콜-상대 URL 이라 base 에 붙이면 남의 호스트로 나간다. */
    @Test
    public void safeRelativePathRejectsProtocolRelativeBypass() {
        assertFalse(DeepLinks.isSafeRelativePath("//evil.test/steal"));
        assertFalse(DeepLinks.isSafeRelativePath("/\\evil.test/steal"));
        assertFalse(DeepLinks.isSafeRelativePath("https://evil.test"));
        assertFalse(DeepLinks.isSafeRelativePath("timeline"));
        assertFalse(DeepLinks.isSafeRelativePath(null));
    }

    // ── 그 밖의 판정 ─────────────────────────────────────────────────────

    @Test
    public void isHttpUrlAcceptsOnlyHttpAndHttps() {
        assertTrue(DeepLinks.isHttpUrl("https://a.example.com"));
        assertTrue(DeepLinks.isHttpUrl("HTTP://a.example.com"));
        assertFalse(DeepLinks.isHttpUrl("bebe://open"));
        assertFalse(DeepLinks.isHttpUrl("javascript:alert(1)"));
        assertFalse(DeepLinks.isHttpUrl("a.example.com"));
        assertFalse(DeepLinks.isHttpUrl(null));
    }

    @Test
    public void baseStripsTrailingSlashes() {
        assertEquals(SERVER, DeepLinks.base(SERVER + "///"));
        assertEquals(SERVER, DeepLinks.base(SERVER));
        assertNull(DeepLinks.base(null));
    }

    @Test
    public void oidcStartIsOnlyTheStartRoute() {
        assertTrue(DeepLinks.isOidcLoginStart(Uri.parse(SERVER + "/api/auth/oidc/kakao")));
        // 콜백은 웹뷰가 처리해야 한다 — Custom Tab 으로 보내면 세션이 앱에 안 남는다.
        assertFalse(DeepLinks.isOidcLoginStart(Uri.parse(SERVER + "/api/auth/oidc/kakao/callback")));
        // 계정 연동은 현재 세션이 필요해 웹뷰에 남긴다.
        assertFalse(DeepLinks.isOidcLoginStart(Uri.parse(SERVER + "/api/auth/oidc/kakao?link=1")));
        assertFalse(DeepLinks.isOidcLoginStart(Uri.parse(SERVER + "/api/auth/login")));
        assertFalse(DeepLinks.isOidcLoginStart(null));
    }

    @Test
    public void jsStringEscapesQuotesAndBackslashes() {
        assertEquals("'a\\'b'", DeepLinks.jsString("a'b"));
        assertEquals("'a\\\\b'", DeepLinks.jsString("a\\b"));
    }
}
