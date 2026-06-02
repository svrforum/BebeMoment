import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { renamePerson } from '@/server/people/list'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const patchSchema = z.object({ name: z.string().max(100).nullable() })

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isFeatureEnabled('faces', prismaPublic)))
    return NextResponse.json({ error: '얼굴 인식이 꺼져 있어요' }, { status: 403 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return NextResponse.json({ error: 'No family' }, { status: 400 })
  // 사람 이름변경은 가족 전체가 공유하는 메타데이터 변경 — person.rename 능력 필요
  // (owner/guardian 기본, 관리자가 family 에 부여 가능). 다른 변경과 동일하게 서버 게이트.
  if (!ctx.capabilities.includes('person.rename'))
    return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
  try {
    const { id } = await params
    const { name } = patchSchema.parse(await req.json())
    await renamePerson({ familyId: ctx.family.id, personId: id, name }, prismaMedia)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
