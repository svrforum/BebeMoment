'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/db-init'
import { getAuth } from '@/lib/auth'
import { createFamily } from '@/server/family/create'
import { createBaby } from '@/server/baby/create'

const Input = z.object({
  familyName: z.string().min(1).max(80),
  babyName: z.string().min(1).max(40),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function completeOnboarding(formData: FormData) {
  const { user, session } = await getAuth()
  if (!user || !session) redirect('/login')

  const parsed = Input.parse({
    familyName: formData.get('familyName'),
    babyName: formData.get('babyName'),
    birthDate: formData.get('birthDate'),
  })

  const { family } = await createFamily(
    { name: parsed.familyName, userId: user.id },
    prisma,
  )
  await createBaby(
    {
      familyId: family.id,
      name: parsed.babyName,
      birthDate: parsed.birthDate,
      byUserId: user.id,
    },
    prisma,
  )

  await prisma.session.update({
    where: { id: session.id },
    data: { currentFamilyId: family.id },
  })

  redirect('/')
}
