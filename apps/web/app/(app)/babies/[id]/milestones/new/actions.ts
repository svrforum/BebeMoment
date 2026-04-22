'use server'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { createMilestone } from '@/server/milestone/create'
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

export async function createMilestoneAction(babyId: string, formData: FormData) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  const presetKey = String(formData.get('presetKey') ?? '').trim()
  const customLabel = String(formData.get('customLabel') ?? '').trim()
  await createMilestone(
    {
      familyId: ctx.family.id,
      babyId,
      ...(presetKey ? { presetKey } : {}),
      ...(customLabel ? { customLabel } : {}),
      achievedAt: String(formData.get('achievedAt') ?? ''),
      note: String(formData.get('note') ?? '').trim() || undefined,
      assetIds: parseAssetIds(formData.get('assetIds')),
      byUserId: ctx.user.id,
    },
    prisma,
  )
  redirect(`/babies/${babyId}/milestones`)
}
