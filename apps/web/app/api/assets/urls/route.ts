import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { resolveAssetUrlsForViewer } from '@/server/asset/urls-for-viewer'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(60) })

// PictureImage 의 만료된 서명 URL 을 신선한 것으로 교체하기 위한 자가치유 엔드포인트.
// 세션 인증 + 현재 가족 스코프 + 비밀 스토리 자산 제외(resolveAssetUrlsForViewer).
export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.membership)
    return NextResponse.json({ error: 'No current family' }, { status: 400 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const urls = await resolveAssetUrlsForViewer(
    { familyId: ctx.family.id, viewerRole: ctx.membership.role, ids: parsed.data.ids },
    prismaPublic,
    getMediaClient(),
  )
  return NextResponse.json({ urls })
}
