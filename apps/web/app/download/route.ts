import { RELEASES_URL, latestAndroidRelease } from '@/server/app-release/latest'
import { NextResponse } from 'next/server'

/**
 * 최신 안드로이드 APK 로 바로 보내는 공개 경로.
 *
 * 초대 링크의 "앱에서 이어하기"는 앱이 없으면 여기로 떨어진다. 예전엔 GitHub 의
 * `/releases/latest` 로 보냈는데, 그 주소는 **태그 종류를 안 가려서** 훨씬 잦은 서버 릴리스
 * (v0.0.x)를 가리키기 일쑤였다 — APK 가 없는 페이지로 보내는 셈이었다.
 *
 * 로그인 전 화면에서 쓰이므로 인증하지 않는다. 공개된 릴리스 자산으로의 리다이렉트일 뿐이고,
 * 조회 결과는 서버가 캐시한다.
 */
export async function GET(): Promise<NextResponse> {
  const release = await latestAndroidRelease().catch(() => null)
  // 못 찾으면 릴리스 목록으로 — 빈손으로 돌려보내지 않는다.
  return NextResponse.redirect(release?.url ?? RELEASES_URL, 302)
}
