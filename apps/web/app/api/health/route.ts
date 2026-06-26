import { prismaPublic } from '@/lib/db-init'
import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// 기본은 liveness(컨테이너 healthcheck 용 — DB 만, 미디어 일시장애로 재시작 루프 방지).
// `?deep=1` 은 readiness(모니터링 용 — 미디어까지 ping). 미디어가 죽었는데 health 가
// 200 으로 남던 함정을 모니터가 잡을 수 있게 한다.
async function mediaOk(): Promise<boolean> {
  const base = process.env.MEDIA_INTERNAL_URL?.replace(/\/$/, '')
  if (!base) return true // 분리 배포(미디어 별도)면 web 이 판단 못 함 — liveness 로 간주
  try {
    const res = await fetch(`${base}/media/v1/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get('deep') === '1'
  try {
    await prismaPublic.$queryRaw`SELECT 1`
    if (deep && !(await mediaOk())) {
      logger.error('readiness check: media service not healthy')
      return NextResponse.json({ status: 'error', db: 'ok', media: 'down' }, { status: 503 })
    }
    return NextResponse.json({
      status: 'ok',
      db: 'ok',
      ...(deep ? { media: 'ok' } : {}),
      time: new Date().toISOString(),
    })
  } catch (e) {
    // 무인증 엔드포인트라 내부 토폴로지(DB host/port 등)를 응답에 노출하지 않는다 —
    // 서버 로그에만 남기고 클라엔 정적 상태만.
    logger.error({ err: e }, 'health check db error')
    return NextResponse.json({ status: 'error', db: 'down' }, { status: 503 })
  }
}
