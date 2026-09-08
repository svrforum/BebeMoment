'use server'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { withActionLog } from '@/lib/with-action-log'
import { createBaby } from '@/server/baby/create'
import { resolveContext } from '@/server/context'
import { redirect } from 'next/navigation'

export async function createBabyAction(formData: FormData): Promise<void> {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  const family = ctx.family
  const user = ctx.user

  const result = await withActionLog('baby.create', () =>
    createBaby(
      {
        familyId: family.id,
        name: String(formData.get('name') ?? ''),
        birthDate: String(formData.get('birthDate') ?? ''),
        byUserId: user.id,
      },
      prismaPublic,
    ),
  )
  // 이 폼은 페이지의 <form action> 이라 결과 봉투를 받을 곳이 없다 — 로그는 남겼으니
  // 에러 경계로 보낸다(useActionState 폼으로 바뀌면 봉투를 그대로 돌려주면 된다).
  if (!result.ok) throw new Error(result.message ?? result.errorKey)
  redirect('/babies')
}
