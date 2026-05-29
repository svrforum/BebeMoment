import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { toggleDiaryBookmark } from '@/server/diary-bookmark/toggle'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isFeatureEnabled('bookmarks', prismaPublic)))
    return NextResponse.json({ error: '저장함 기능이 꺼져 있어요' }, { status: 403 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const { id } = await params
    const result = await toggleDiaryBookmark(
      { entryId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
