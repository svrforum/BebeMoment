// 안드로이드 APK 는 GitHub 릴리스(android-v* 태그)로만 배포된다. 배너·설정의 업데이트
// 확인·웹의 다운로드 버튼이 모두 여기를 통해 같은 릴리스를 본다.
const REPO = 'svrforum/BebeMoment'
const CACHE_KEY = 'bebe.appLatest'

export type AppRelease = { version: string; url: string }

type GithubRelease = {
  tag_name: string
  html_url: string
  prerelease: boolean
  draft: boolean
  assets?: Array<{ name: string; browser_download_url: string }>
}

/** 네이티브 앱은 UA 에 bebeApp/<ver> 를 싣는다(MainActivity.markUserAgent). 웹이면 null. */
export function parseAppVersion(ua: string): string | null {
  const m = ua.match(/bebeApp\/(\d+\.\d+\.\d+)/)
  return m?.[1] ?? null
}

export function installedAppVersion(): string | null {
  if (typeof navigator === 'undefined') return null
  return parseAppVersion(navigator.userAgent)
}

/** 자리별 숫자 비교 — 문자열 비교면 1.0.9 가 1.0.10 보다 크다고 나온다. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

/**
 * 목록(최신순)에서 첫 android 릴리스. 웹 릴리스(v*)가 훨씬 잦아 그냥 최신 하나만 보면
 * 엉뚱한 태그를 잡는다.
 *
 * .apk 자산으로 바로 보낸다 — 릴리스 HTML 페이지를 열면 사용자가 'Source code (zip)' 을
 * 오선택하거나 브라우저가 .apk 를 받다 끊겨 "패키지가 잘못됨" 으로 설치가 깨지는 함정이 있다.
 */
export function pickAndroidRelease(releases: GithubRelease[]): AppRelease | null {
  const android = releases.find(
    (r) => !r.draft && !r.prerelease && r.tag_name.startsWith('android-v'),
  )
  if (!android) return null
  const apk = android.assets?.find((a) => a.name.toLowerCase().endsWith('.apk'))
  return {
    version: android.tag_name.replace('android-v', ''),
    url: apk?.browser_download_url ?? android.html_url,
  }
}

/**
 * 최신 안드로이드 릴리스. 세션 캐시를 쓰되 `force` 면 새로 조회한다 — "업데이트 확인"
 * 버튼은 방금 나온 버전을 잡아야 해서 캐시를 믿으면 안 된다.
 */
export async function fetchLatestAndroidRelease(
  opts: { force?: boolean } = {},
): Promise<AppRelease | null> {
  if (!opts.force) {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY)
      if (cached) return JSON.parse(cached) as AppRelease
    } catch {
      // 프라이빗 모드 등 — 캐시 없이 진행한다.
    }
  }
  // per_page=100(API 최대) — web(v*) 릴리스가 잦아 30개만 보면 그 사이에 묻힌 최신
  // android-v* 를 놓쳐 업데이트 안내가 조용히 끊긴다.
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) return null
  const data = pickAndroidRelease((await res.json()) as GithubRelease[])
  if (data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch {
      // 저장 실패는 무시 — 조회 결과 자체는 유효하다.
    }
  }
  return data
}
