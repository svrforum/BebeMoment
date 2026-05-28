// Empty Suspense fallback so swipe-nav between sibling /detail pages doesn't
// flash a skeleton. The Swiper carousel inside the viewer already shows the
// neighbor photo as the user swipes, and the previous page's image stays
// rendered until the new RSC commits → no "flicker" between detail pages.
// For a cold-start (timeline → detail) Next still shows the previous page
// until the new one is ready, which is acceptable here given our short TTFB.
export default function Loading() {
  return null
}
