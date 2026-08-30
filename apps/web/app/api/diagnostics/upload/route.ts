import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJsonKey } from '@/lib/error-response'
import { logger } from '@/lib/logger'
import { resolveContext } from '@/server/context'
import { toLogFields, uploadReportSchema } from '@/server/diagnostics/upload-report'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 업로드·스토리 제출 실패를 서버 로그로 넘긴다.
 *
 * 이 흐름은 실패가 브라우저 안에서 끝나 서버에 아무 흔적이 없다. 사진이 안 올라간 사고를
 * 쫓을 때마다 재현부터 해야 했던 이유다. 진단 전용이라 결과는 보지 않고, 실패해도 원래
 * 에러를 덮지 않도록 호출부는 이 응답을 무시한다.
 */
export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)

  const parsed = uploadReportSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return errorJsonKey('badRequest', 400)

  logger.warn(
    toLogFields(parsed.data, { userId: ctx.user.id, familyId: ctx.family.id }),
    'upload flow failed (client report)',
  )
  return NextResponse.json({ ok: true })
}
