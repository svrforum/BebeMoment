/** 동작 줄이기를 켠 사용자에게는 부드러운 스크롤 대신 바로 이동한다. */
export function smoothScroll(): ScrollBehavior {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
}
