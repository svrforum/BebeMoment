'use server'
import { actionErrorText } from '@/lib/action-result'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { withActionLog } from '@/lib/with-action-log'
import { isRegistrationOpen } from '@/server/auth/registration'
import { createBaby } from '@/server/baby/create'
import { createFamily } from '@/server/family/create'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

export type OnboardingState = { error?: string } | null

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const t = await getTranslations('onboarding')
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

  const result = await withActionLog('onboarding.complete', async () => {
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
  })
  if (!result.ok) {
    // 위저드는 문장을 그대로 보여준다 — 여기서 요청 locale 로 번역해 넘긴다.
    const tRoot = await getTranslations()
    return { error: actionErrorText(tRoot, result) }
  }

  redirect('/')
}
