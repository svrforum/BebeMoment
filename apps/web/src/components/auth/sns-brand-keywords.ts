// 관리자가 공급자 이름을 한글로 지어도('네이버') 브랜드를 알아보도록 영문·한글 이름을 함께 본다.
// 화면에 내보내는 글이 아니라 입력과 맞춰 보는 값이라 번역하지 않는다.
const BRAND_KEYWORDS = {
  naver: ['naver', '네이버'],
  kakao: ['kakao', '카카오'],
  google: ['google', '구글'],
} as const

export type KnownBrand = keyof typeof BRAND_KEYWORDS

export function matchBrand(name: string): KnownBrand | null {
  const n = name.toLowerCase()
  for (const brand of Object.keys(BRAND_KEYWORDS) as KnownBrand[]) {
    if (BRAND_KEYWORDS[brand].some((word) => n.includes(word))) return brand
  }
  return null
}
