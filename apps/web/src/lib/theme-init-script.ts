// Server-safe export. Lives outside theme.tsx so the root layout (a Server
// Component) can read it without dragging the 'use client' module into the
// server build — which under Next 15.5 caused `useState` to resolve to null
// during /404 prerender (every page failed; the misleading symptom was
// "<Html> outside pages/_document").
const STORAGE_KEY = 'bebe.theme'

export type DefaultTheme = 'auto' | 'light' | 'dark'

/**
 * Pre-hydration theme bootstrap. User's localStorage choice wins; otherwise the
 * admin-configured instance default (`defaultMode`) applies — which itself may
 * be 'auto' (follow system). 인스턴스 기본은 'light' — 가족 사진은 밝은 배경에서
 * 톤이 더 자연스럽고, 라이트모드 가시성을 정성껏 다듬어 둠.
 */
export function buildThemeInitScript(defaultMode: DefaultTheme = 'light'): string {
  return `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var m=(t==='light'||t==='dark'||t==='auto')?t:'${defaultMode}';var sys=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=(m==='dark')||(m==='auto'&&sys);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`
}

export const THEME_STORAGE_KEY = STORAGE_KEY
