'use server'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { createBaby } from '@/server/baby/create'
import { createFamily } from '@/server/family/create'
import { isRegistrationOpen } from '@/server/auth/registration'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

export type OnboardingState = { error?: string } | null

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const t = await getTranslations('onboarding')
  const tErrors = await getTranslations('errors')
  const { user, session } = await getAuth()
  if (!user || !session) redirect('/login')

  if (!(await isRegistrationOpen(prismaPublic))) redirect('/')

  const Input = z.object({
    familyName: z.string().min(1, t('errors.familyNameRequired')).max(80),
    babyName: z.string().min(1, t('errors.babyNameRequired')).max(40),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('errors.birthDateRequired')),
  })

  const parsed = Input.safeParse({
    familyName: formData.get('familyName'),
    babyName: formData.get('babyName'),
    birthDate: formData.get('birthDate'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t('errors.invalidInput') }
  }

  const birth = new Date(`${parsed.data.birthDate}T00:00:00Z`)
  if (birth.getTime() > Date.now() + 400 * 86400_000) {
    return { error: t('errors.birthDateTooFar') }
  }

  try {
    const { family } = await createFamily(
      { name: parsed.data.familyName, userId: user.id },
      prismaPublic,
      { enforceSingle: true },
    )
    await createBaby(
      {
        familyId: family.id,
        name: parsed.data.babyName,
        birthDate: parsed.data.birthDate,
        byUserId: user.id,
      },
      prismaPublic,
    )

    await prismaPublic.session.update({
      where: { id: session.id },
      data: { currentFamilyId: family.id },
    })
  } catch (e) {
    const msg = (e as Error).message
    if (msg && tErrors.has(msg)) return { error: tErrors(msg) }
    return { error: msg || t('errors.createFailed') }
  }

  redirect('/')
}
