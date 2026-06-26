// Next.js 가 서버 부팅 시 1회 실행(Node 런타임). env 를 즉시 검증해, 잘못 설정됐거나
// 약한/자리표시자 시크릿으로 띄운 배포가 — 공개된 시크릿으로 서빙하거나 나중에 미디어
// 페이지에서 조용히 500 나기 전에 — 부팅 단계에서 시끄럽게 실패하게 한다.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { parseEnv } = await import('@bebe/config')
  try {
    parseEnv(process.env as Record<string, string | undefined>)
  } catch (e) {
    const msg = `[bebe] invalid environment:\n${(e as Error).message}`
    if (process.env.NODE_ENV === 'production') {
      console.error(`\n${msg}\n→ refusing to boot. Fix the above and restart.\n`)
      process.exit(1)
    } else {
      console.warn(`\n${msg}\n(dev: continuing)\n`)
    }
  }
}
