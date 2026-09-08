'use server'
import type { FormActionState } from '@/lib/action-result'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { withActionLog } from '@/lib/with-action-log'
import { resolveContext } from '@/server/context'
import { softDeleteGrowthRecord } from '@/server/growth/soft-delete'
import { updateGrowthRecord } from '@/server/growth/update'
import { redirect } from 'next/navigation'

function parseOptionalNumber(v: FormDataEntryValue | null): number | null | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function parseOptionalString(v: FormDataEntryValue | null): string | null | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s === '' ? null : s
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

export async function updateGrowthAction(
  babyId: string,
  recordId: string,
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { familyId, userId } = await requireFamilyUser()
  const result = await withActionLog('growth.update', () =>
    updateGrowthRecord(
      {
        id: recordId,
        familyId,
        byUserId: userId,
        patch: {
          measuredAt: String(formData.get('measuredAt') ?? ''),
          heightCm: parseOptionalNumber(formData.get('heightCm')),
          weightKg: parseOptionalNumber(formData.get('weightKg')),
          headCm: parseOptionalNumber(formData.get('headCm')),
          note: parseOptionalString(formData.get('note')),
        },
      },
      prismaPublic,
    ),
  )
  if (!result.ok) return result
  redirect(`/babies/${babyId}/growth`)
}

export async function deleteGrowthAction(babyId: string, recordId: string): Promise<void> {
  const { familyId, userId } = await requireFamilyUser()
  const result = await withActionLog('growth.delete', () =>
    softDeleteGrowthRecord({ id: recordId, familyId, byUserId: userId }, prismaPublic),
  )
  // 페이지의 <form action> 이라 결과 봉투를 받을 곳이 없다 — 로그는 남겼으니 에러 경계로.
  if (!result.ok) throw new Error(result.message ?? result.errorKey)
  redirect(`/babies/${babyId}/growth`)
}
