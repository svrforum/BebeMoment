import { type GithubRelease, pickAndroidRelease } from '@/lib/app-release'

const REPO = 'svrforum/BebeMoment'
const CACHE_SECONDS = 1800

export type AppRelease = { version: string; url: string }

/**
 * 최신 안드로이드 릴리스를 서버가 조회한다.
 *
 * ⚠️ 브라우저에서 api.github.com 을 직접 부르면 CSP 의 `connect-src 'self'` 가 막는다(§17#31) —
 * 업데이트 배너가 그래서 몇 달간 조용히 죽어 있었다. 클라이언트는 반드시 우리 라우트를 거친다.
 * 서버가 캐시하므로 한 집에서 여러 기기가 GitHub 익명 레이트리밋(시간당 60)을 나눠 쓰지도 않는다.
 *
 * `fresh` 는 "업데이트 확인" 버튼처럼 방금 올라온 버전을 잡아야 할 때만.
 */
export async function latestAndroidRelease(
  opts: { fresh?: boolean } = {},
): Promise<AppRelease | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json' },
    ...(opts.fresh ? { cache: 'no-store' as const } : { next: { revalidate: CACHE_SECONDS } }),
  })
  if (!res.ok) return null
  return pickAndroidRelease((await res.json()) as GithubRelease[])
}

/** APK 를 못 찾았을 때 보낼 곳 — 최소한 릴리스 목록에서 직접 받을 수는 있게. */
export const RELEASES_URL = `https://github.com/${REPO}/releases`
