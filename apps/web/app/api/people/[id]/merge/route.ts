import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { mergePeople } from '@/server/people/list'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({ targetId: z.string().uuid() })

// 사람(군집) 합치기 — source(:id)의 얼굴을 target 으로 옮기고 source 를 삭제한다.
// 이름 변경과 같은 가족 공유 메타데이터 변경이라 person.rename 능력으로 게이트.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isFeatureEnabled('faces', prismaPublic)))
    return NextResponse.json({ error: '얼굴 인식이 꺼져 있어요' }, { status: 403 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return NextResponse.json({ error: 'No family' }, { status: 400 })
  if (!ctx.capabilities.includes('person.rename'))
    return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
  try {
    const { id } = await params
    const { targetId } = bodySchema.parse(await req.json())
    const { moved } = await mergePeople(
      { familyId: ctx.family.id, sourceId: id, targetId },
      prismaMedia,
    )
    return NextResponse.json({ ok: true, targetId, moved })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
