import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { initUpload } from '@/server/upload/init-upload'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const Body = z.object({
  mime: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  originalName: z.string().min(1),
})

// 업로드 진입점 #2 — 안드로이드 1.0.18~1.0.19 의 "갤러리 → 공유 → bebe" 네이티브 업로드용
// init. 1.0.20 부터는 공유받은 파일을 웹 업로드 흐름(startUpload)으로 넘기지만 옛 앱을 위해 남긴다.
// 세션 쿠키로 인증하고, 권한·mime 검사·tus 주소는 startUpload 와 같은 initUpload 를 지난다.
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
  try {
    const input = Body.parse(await req.json())
    const result = await initUpload(
      { role: ctx.membership.role, familyId: ctx.family.id, userId: ctx.user.id },
      input,
      { prisma: prismaPublic, media: getMediaClient(), headers: req.headers },
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
