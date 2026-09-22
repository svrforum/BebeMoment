/** 손끝으로 누르는 컨트롤의 최소 변(px). 접근성 하한 — 빽빽하게 만들더라도 이 아래로는 못 간다. */
export const MIN_TOUCH_TARGET_PX = 44

const SPACING_UNIT_PX = 4
const ROOT_FONT_PX = 16

/** `h-11`·`w-9`·`h-[44px]`·`w-[2.75rem]` 같은 Tailwind 크기 유틸리티를 px 로. 못 읽으면 null. */
export function tailwindSizePx(token: string): number | null {
  const match = /^[hw]-(.+)$/.exec(token)
  const value = match?.[1]
  if (value === undefined) return null
  const arbitrary = /^\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(value)
  if (arbitrary?.[1] !== undefined)
    return Number(arbitrary[1]) * (arbitrary[2] === 'rem' ? ROOT_FONT_PX : 1)
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null
  return Number(value) * SPACING_UNIT_PX
}

/**
 * 클래스 문자열이 정하는 크기가 전부 터치 하한 이상인가. `w-full` 처럼 px 로 환산할 수 없는
 * 값은 제약이 아니므로 건너뛰지만, **높이를 하나도 못 읽으면 보장할 수 없으니 false** 다.
 */
export function meetsTouchTarget(className: string): boolean {
  const tokens = className.split(/\s+/).filter(Boolean)
  const sizes = tokens.map(tailwindSizePx).filter((px): px is number => px !== null)
  const heights = tokens
    .filter((token) => token.startsWith('h-'))
    .map(tailwindSizePx)
    .filter((px): px is number => px !== null)
  if (heights.length === 0) return false
  return sizes.every((px) => px >= MIN_TOUCH_TARGET_PX)
}
