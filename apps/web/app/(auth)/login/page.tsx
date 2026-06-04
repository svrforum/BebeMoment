import { BrandLockup } from '@/components/brand/brand-mark'
import { prismaPublic } from '@/lib/db-init'
import { getSetting } from '@/server/settings/get'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { LoginForm } from './login-form'
import { ServerChangeLink } from './server-change-link'

export const dynamic = 'force-dynamic'

const ERROR_KEYS: Record<string, string> = {
  suspended: 'login.error.suspended',
  invite_required: 'login.error.inviteRequired',
  state: 'login.error.state',
  oidc: 'login.error.oidc',
  oidc_exchange: 'login.error.oidc',
  provider: 'login.error.provider',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const t = await getTranslations('auth')
  const errorKey = error ? ERROR_KEYS[error] : undefined
  const errorMessage = errorKey ? t(errorKey) : undefined
  const providers = await prismaPublic.oidcProvider.findMany({
    where: { enabled: true },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })
  const passwordEnabled = await getSetting('auth.password_enabled', z.boolean(), true, prismaPublic)

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 py-10 md:min-h-0 md:p-0">
      <div className="md:hidden">
        <BrandLockup />
      </div>
      <div className="flex-1">
        <h1 className="mt-10 text-[32px] font-bold leading-tight tracking-tight md:mt-0">
          {t('login.title')}
        </h1>
        <p className="mt-3 text-base text-base-500">{t('login.subtitle')}</p>
        {errorMessage && (
          <p className="mt-6 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {errorMessage}
          </p>
        )}
        <div className="mt-10">
          <LoginForm oidcProviders={providers} passwordEnabled={passwordEnabled} />
        </div>
        <ServerChangeLink />
      </div>
    </main>
  )
}
