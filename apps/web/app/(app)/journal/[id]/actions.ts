'use server'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { softDeleteJournalEntry } from '@/server/journal/soft-delete'
import { updateJournalEntry } from '@/server/journal/update'
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

export async function updateJournalAction(id: string, formData: FormData) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  const babyId = String(formData.get('babyId') ?? '').trim()
  const mood = String(formData.get('mood') ?? '').trim()
  await updateJournalEntry(
    {
      id,
      familyId: ctx.family.id,
      byUserId: ctx.user.id,
      patch: {
        babyId: babyId || null,
        entryDate: String(formData.get('entryDate') ?? ''),
        title: String(formData.get('title') ?? '').trim() || null,
        body: String(formData.get('body') ?? ''),
        mood: (mood || null) as 'happy' | 'grateful' | 'tired' | 'sad' | 'proud' | 'calm' | null,
        assetIds: parseAssetIds(formData.get('assetIds')),
      },
    },
    prismaPublic,
    prismaMedia,
  )
  redirect(`/journal/${id}`)
}

export async function deleteJournalAction(id: string) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  await softDeleteJournalEntry({ id, familyId: ctx.family.id, byUserId: ctx.user.id }, prismaPublic)
  redirect('/journal')
}
