import { BrandLockup } from '@/components/brand/brand-mark'
import { prismaPublic } from '@/lib/db-init'
import { isRegistrationOpen } from '@/server/auth/registration'
import { getTranslations } from 'next-intl/server'
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
  const t = await getTranslations('auth')

  if (!open && !invite) {
    return (
      <main className="flex min-h-[100dvh] flex-col justify-center px-6 py-10 md:min-h-0 md:p-0">
        <div className="md:hidden">
          <BrandLockup />
        </div>
        <div className="mt-10 md:mt-0">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight">
            {t('signup.closed.title')}
          </h1>
          <p className="mt-3 text-base text-base-500">{t('signup.closed.body')}</p>
          <p className="mt-8 text-sm text-base-500">
            {t('signup.haveAccount')}{' '}
            <Link href="/login" className="font-medium text-point-500">
              {t('signup.loginLink')}
            </Link>
          </p>
        </div>
      </main>
    )
  }

  return <SignupWizard />
}
