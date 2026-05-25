'use server'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { createBaby } from '@/server/baby/create'
import { createFamily } from '@/server/family/create'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const Input = z.object({
  familyName: z.string().min(1, '가족 이름을 입력해주세요').max(80),
  babyName: z.string().min(1, '아기 이름을 입력해주세요').max(40),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '생년월일을 입력해주세요 (예: 2026-01-01)'),
})

export type OnboardingState = { error?: string } | null

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const { user, session } = await getAuth()
  if (!user || !session) redirect('/login')

  const parsed = Input.safeParse({
    familyName: formData.get('familyName'),
    babyName: formData.get('babyName'),
    birthDate: formData.get('birthDate'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값을 확인해주세요' }
  }

  const birth = new Date(`${parsed.data.birthDate}T00:00:00Z`)
  if (birth.getTime() > Date.now() + 400 * 86400_000) {
    return { error: '생년월일이 1년 이후일 수 없어요' }
  }

  try {
    const { family } = await createFamily(
      { name: parsed.data.familyName, userId: user.id },
      prismaPublic,
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
    return { error: (e as Error).message || '가족을 만들지 못했어요' }
  }

  redirect('/')
}
