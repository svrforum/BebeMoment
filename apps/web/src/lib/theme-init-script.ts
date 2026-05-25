// Server-safe export. Lives outside theme.tsx so the root layout (a Server
// Component) can read it without dragging the 'use client' module into the
// server build — which under Next 15.5 caused `useState` to resolve to null
// during /404 prerender (every page failed; the misleading symptom was
// "<Html> outside pages/_document").
const STORAGE_KEY = 'bebe.theme'

export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=(t==='dark')||((!t||t==='auto')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`

export const THEME_STORAGE_KEY = STORAGE_KEY
