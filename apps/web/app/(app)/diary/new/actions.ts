'use server'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { createJournalEntry } from '@/server/journal/create'
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

export async function createJournalAction(formData: FormData) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')

  const babyId = String(formData.get('babyId') ?? '').trim()
  const mood = String(formData.get('mood') ?? '').trim()
  await createJournalEntry(
    {
      familyId: ctx.family.id,
      babyId: babyId || null,
      entryDate: String(formData.get('entryDate') ?? ''),
      title: String(formData.get('title') ?? '').trim() || undefined,
      body: String(formData.get('body') ?? ''),
      ...(mood ? { mood } : {}),
      assetIds: parseAssetIds(formData.get('assetIds')),
      byUserId: ctx.user.id,
    },
    prismaPublic,
    prismaMedia,
  )
  redirect('/diary')
}
