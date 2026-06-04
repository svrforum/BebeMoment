import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { initAssetViaMedia } from '@/server/upload/init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { resolveCan } from '@bebe/core'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const Body = z.object({
  mime: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  originalName: z.string().min(1),
})

// media 가 주는 상대 tus URL 을 현재 오리진으로 절대화(startUpload 와 동일 로직).
function absolutize(url: string, req: Request): string {
  if (!url.startsWith('/')) return url
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, '')
  if (!host) return publicUrl ? `${publicUrl}${url}` : url
  const proto =
    req.headers.get('x-forwarded-proto') ?? (publicUrl?.startsWith('https') ? 'https' : 'http')
  return `${proto}://${host}${url}`
}

// 안드로이드 "갤러리 → 공유 → bebe" 네이티브 업로드용 init. 세션 쿠키로 인증하고
// 업로드 토큰 + tus URL 을 돌려주면 앱이 미디어로 직접 PATCH 한다(브라우저 흐름과 동일).
export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user || !ctx.membership) {
    return errorJsonKey('noFamily', 400)
  }
  if (!resolveCan(ctx.membership.role, 'asset.upload', await getFamilyCapabilities(prismaPublic))) {
    return errorJsonKey('forbidden', 403)
  }
  try {
    const input = Body.parse(await req.json())
    const result = await initAssetViaMedia({
      familyId: ctx.family.id,
      uploaderId: ctx.user.id,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      originalName: input.originalName,
    })
    return NextResponse.json({ ...result, tusUploadUrl: absolutize(result.tusUploadUrl, req) })
  } catch (e) {
    return errorJson(e)
  }
}
