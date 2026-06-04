import { BrandLockup } from '@/components/brand/brand-mark'
import { prismaPublic } from '@/lib/db-init'
import { isRegistrationOpen } from '@/server/auth/registration'
import Link from 'next/link'
import { SignupWizard } from './signup-wizard'

export const dynamic = 'force-dynamic'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const { invite } = await searchParams
  const open = await isRegistrationOpen(prismaPublic)

  if (!open && !invite) {
    return (
      <main className="flex min-h-[100dvh] flex-col justify-center px-6 py-10 md:min-h-0 md:p-0">
        <div className="md:hidden">
          <BrandLockup />
        </div>
        <div className="mt-10 md:mt-0">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight">
            초대를 통해서만 가입할 수 있어요
          </h1>
          <p className="mt-3 text-base text-base-500">
            이 가족 인스턴스는 이미 설정이 완료됐어요. 가족 구성원에게 초대 링크를 받아
            가입해주세요.
          </p>
          <p className="mt-8 text-sm text-base-500">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="font-medium text-point-500">
              로그인
            </Link>
          </p>
        </div>
      </main>
    )
  }

  return <SignupWizard />
}
