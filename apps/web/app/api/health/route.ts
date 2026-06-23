import { prismaPublic } from '@/lib/db-init'
import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prismaPublic.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', db: 'ok', time: new Date().toISOString() })
  } catch (e) {
    // 무인증 엔드포인트라 내부 토폴로지(DB host/port 등)를 응답에 노출하지 않는다 —
    // 서버 로그에만 남기고 클라엔 정적 상태만.
    logger.error({ err: e }, 'health check db error')
    return NextResponse.json({ status: 'error', db: 'down' }, { status: 503 })
  }
}
