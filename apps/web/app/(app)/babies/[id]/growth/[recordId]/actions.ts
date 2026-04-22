'use server'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
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

export async function updateGrowthAction(babyId: string, recordId: string, formData: FormData) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  await updateGrowthRecord(
    {
      id: recordId,
      familyId: ctx.family.id,
      byUserId: ctx.user.id,
      patch: {
        measuredAt: String(formData.get('measuredAt') ?? ''),
        heightCm: parseOptionalNumber(formData.get('heightCm')),
        weightKg: parseOptionalNumber(formData.get('weightKg')),
        headCm: parseOptionalNumber(formData.get('headCm')),
        note: parseOptionalString(formData.get('note')),
      },
    },
    prisma,
  )
  redirect(`/babies/${babyId}/growth`)
}

export async function deleteGrowthAction(babyId: string, recordId: string) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  await softDeleteGrowthRecord(
    { id: recordId, familyId: ctx.family.id, byUserId: ctx.user.id },
    prisma,
  )
  redirect(`/babies/${babyId}/growth`)
}
