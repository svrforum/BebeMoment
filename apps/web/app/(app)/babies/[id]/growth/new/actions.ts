'use server'
import type { FormActionState } from '@/lib/action-result'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { withActionLog } from '@/lib/with-action-log'
import { resolveContext } from '@/server/context'
import { createGrowthRecord } from '@/server/growth/create'
import { redirect } from 'next/navigation'

function parseOptionalNumber(v: FormDataEntryValue | null): number | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function parseOptionalString(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

export async function createGrowthAction(
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

  const result = await withActionLog('growth.create', () =>
    createGrowthRecord(
      {
        familyId: family.id,
        babyId,
        measuredAt: String(formData.get('measuredAt') ?? ''),
        heightCm: parseOptionalNumber(formData.get('heightCm')),
        weightKg: parseOptionalNumber(formData.get('weightKg')),
        headCm: parseOptionalNumber(formData.get('headCm')),
        note: parseOptionalString(formData.get('note')),
        byUserId: user.id,
      },
      prismaPublic,
    ),
  )
  if (!result.ok) return result
  redirect(`/babies/${babyId}/growth`)
}
