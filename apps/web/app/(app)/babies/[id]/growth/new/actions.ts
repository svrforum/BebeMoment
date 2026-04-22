'use server'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
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

export async function createGrowthAction(babyId: string, formData: FormData) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')

  await createGrowthRecord(
    {
      familyId: ctx.family.id,
      babyId,
      measuredAt: String(formData.get('measuredAt') ?? ''),
      heightCm: parseOptionalNumber(formData.get('heightCm')),
      weightKg: parseOptionalNumber(formData.get('weightKg')),
      headCm: parseOptionalNumber(formData.get('headCm')),
      note: parseOptionalString(formData.get('note')),
      byUserId: ctx.user.id,
    },
    prisma,
  )
  redirect(`/babies/${babyId}/growth`)
}
