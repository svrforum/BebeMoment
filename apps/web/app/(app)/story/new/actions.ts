'use server'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { withActionLog } from '@/lib/with-action-log'
import { resolveContext } from '@/server/context'
import { createStoryEntry } from '@/server/story/create'
import { redirect } from 'next/navigation'

function parseAssetIds(v: FormDataEntryValue | null): string[] {
  if (!v) return []
  try {
    const parsed = JSON.parse(String(v))
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export async function createStoryAction(formData: FormData): Promise<void> {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  const family = ctx.family
  const user = ctx.user

  const babyId = String(formData.get('babyId') ?? '').trim()
  const mood = String(formData.get('mood') ?? '').trim()
  const result = await withActionLog('story.create', () =>
    createStoryEntry(
      {
        familyId: family.id,
        babyId: babyId || null,
        entryDate: String(formData.get('entryDate') ?? ''),
        title: String(formData.get('title') ?? '').trim() || undefined,
        body: String(formData.get('body') ?? ''),
        ...(mood ? { mood } : {}),
        assetIds: parseAssetIds(formData.get('assetIds')),
        byUserId: user.id,
      },
      prismaPublic,
      prismaMedia,
    ),
  )
  // <form action> 용이라 결과 봉투를 받을 곳이 없다 — 로그는 남겼으니 에러 경계로.
  if (!result.ok) throw new Error(result.message ?? result.errorKey)
  redirect('/story')
}
