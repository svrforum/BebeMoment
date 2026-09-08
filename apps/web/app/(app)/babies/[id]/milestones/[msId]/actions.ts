'use server'
import type { FormActionState } from '@/lib/action-result'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { withActionLog } from '@/lib/with-action-log'
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

async function requireFamilyUser(): Promise<{ familyId: string; userId: string }> {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  return { familyId: ctx.family.id, userId: ctx.user.id }
}

export async function updateMilestoneAction(
  babyId: string,
  msId: string,
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { familyId, userId } = await requireFamilyUser()
  const result = await withActionLog('milestone.update', () =>
    updateMilestone(
      {
        id: msId,
        familyId,
        byUserId: userId,
        patch: {
          achievedAt: String(formData.get('achievedAt') ?? ''),
          note: String(formData.get('note') ?? '').trim() || null,
          assetIds: parseAssetIds(formData.get('assetIds')),
        },
      },
      prismaPublic,
      prismaMedia,
    ),
  )
  if (!result.ok) return result
  redirect(`/babies/${babyId}/milestones`)
}

export async function deleteMilestoneAction(babyId: string, msId: string): Promise<void> {
  const { familyId, userId } = await requireFamilyUser()
  const result = await withActionLog('milestone.delete', () =>
    softDeleteMilestone({ id: msId, familyId, byUserId: userId }, prismaPublic),
  )
  // 페이지의 <form action> 이라 결과 봉투를 받을 곳이 없다 — 로그는 남겼으니 에러 경계로.
  if (!result.ok) throw new Error(result.message ?? result.errorKey)
  redirect(`/babies/${babyId}/milestones`)
}
