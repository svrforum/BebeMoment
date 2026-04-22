'use server'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { softDeleteMilestone } from '@/server/milestone/soft-delete'
import { updateMilestone } from '@/server/milestone/update'
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

export async function updateMilestoneAction(babyId: string, msId: string, formData: FormData) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  await updateMilestone(
    {
      id: msId,
      familyId: ctx.family.id,
      byUserId: ctx.user.id,
      patch: {
        achievedAt: String(formData.get('achievedAt') ?? ''),
        note: String(formData.get('note') ?? '').trim() || null,
        assetIds: parseAssetIds(formData.get('assetIds')),
      },
    },
    prisma,
  )
  redirect(`/babies/${babyId}/milestones`)
}

export async function deleteMilestoneAction(babyId: string, msId: string) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  await softDeleteMilestone({ id: msId, familyId: ctx.family.id, byUserId: ctx.user.id }, prisma)
  redirect(`/babies/${babyId}/milestones`)
}
