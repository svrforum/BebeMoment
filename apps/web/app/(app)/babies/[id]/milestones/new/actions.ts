'use server'
import type { FormActionState } from '@/lib/action-result'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { withActionLog } from '@/lib/with-action-log'
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

export async function createMilestoneAction(
  babyId: string,
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  const family = ctx.family
  const user = ctx.user
  const presetKey = String(formData.get('presetKey') ?? '').trim()
  const customLabel = String(formData.get('customLabel') ?? '').trim()
  const result = await withActionLog('milestone.create', () =>
    createMilestone(
      {
        familyId: family.id,
        babyId,
        ...(presetKey ? { presetKey } : {}),
        ...(customLabel ? { customLabel } : {}),
        achievedAt: String(formData.get('achievedAt') ?? ''),
        note: String(formData.get('note') ?? '').trim() || undefined,
        assetIds: parseAssetIds(formData.get('assetIds')),
        byUserId: user.id,
      },
      prismaPublic,
      prismaMedia,
    ),
  )
  if (!result.ok) return result
  redirect(`/babies/${babyId}/milestones`)
}
