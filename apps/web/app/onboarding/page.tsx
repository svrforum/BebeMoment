import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { isRegistrationOpen } from '@/server/auth/registration'
import { redirect } from 'next/navigation'
import { OnboardingWizard } from './onboarding-wizard'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const { user } = await getAuth()
  if (!user) redirect('/login')

  // 이미 가족이 있으면 온보딩 불필요 — 타임라인으로.
  const membership = await prismaPublic.membership.findFirst({
    where: { userId: user.id, deletedAt: null },
  })
  if (membership) redirect('/')

  // 가족이 없는데 인스턴스는 이미 설정 완료(공개 가입 닫힘) — 가족 생성 폼 대신
  // 합류 안내. (예: 초대 합류가 실패해 가족 없는 계정으로 남은 경우 — 폼을 보여주면
  // 제출해도 createFamily 가드에 막혀 온보딩 루프에 빠진다.)
  if (!(await isRegistrationOpen(prismaPublic))) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6 py-10 md:max-w-[480px]">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight">
          초대를 받아 합류해주세요
        </h1>
        <p className="mt-3 text-base text-base-500">
          이 인스턴스는 이미 가족 설정이 끝났어요. 가족 구성원이 보낸 초대 링크를 다시 열면 이
          계정으로 합류할 수 있어요.
        </p>
        <form action="/api/auth/logout" method="post" className="mt-8">
          <button type="submit" className="text-sm font-medium text-point-500">
            다른 계정으로 로그인
          </button>
        </form>
      </main>
    )
  }

  return <OnboardingWizard />
}
