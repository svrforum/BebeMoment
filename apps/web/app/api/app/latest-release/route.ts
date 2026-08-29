import { getAuth } from '@/lib/auth'
import { type GithubRelease, pickAndroidRelease } from '@/lib/app-release'
import { errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

const REPO = 'svrforum/BebeMoment'
const CACHE_SECONDS = 1800

/**
 * 최신 안드로이드 릴리스를 서버가 대신 조회한다.
 *
 * ⚠️ 브라우저에서 직접 api.github.com 을 부르면 CSP 의 `connect-src 'self'` 가 막는다.
 * 업데이트 배너가 오랫동안 조용히 실패했던 원인이라, 조회는 반드시 여기를 거친다.
 * 서버가 캐시하므로 가족 전원이 같은 공인 IP 에서 GitHub 레이트리밋(시간당 60)을
 * 나눠 쓰는 문제도 함께 사라진다.
 */
export async function GET(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)

  // 방금 올라온 버전을 잡아야 하는 '업데이트 확인' 버튼만 캐시를 건너뛴다.
  const fresh = new URL(req.url).searchParams.get('fresh') === '1'
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json' },
      ...(fresh ? { cache: 'no-store' as const } : { next: { revalidate: CACHE_SECONDS } }),
    })
    if (!res.ok) return NextResponse.json({ release: null }, { status: 502 })
    return NextResponse.json({ release: pickAndroidRelease((await res.json()) as GithubRelease[]) })
  } catch {
    return NextResponse.json({ release: null }, { status: 502 })
  }
}
