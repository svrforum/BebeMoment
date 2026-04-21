'use server'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { createBaby } from '@/server/baby/create'
import { resolveContext } from '@/server/context'
import { redirect } from 'next/navigation'

export async function createBabyAction(formData: FormData) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')

  await createBaby(
    {
      familyId: ctx.family.id,
      name: String(formData.get('name') ?? ''),
      birthDate: String(formData.get('birthDate') ?? ''),
      byUserId: ctx.user.id,
    },
    prisma,
  )
  redirect('/babies')
}
