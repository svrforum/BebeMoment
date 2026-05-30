import { prismaPublic } from '@/lib/db-init'
import { getSetting } from '@/server/settings/get'
import { z } from 'zod'
import { LoginForm } from './login-form'
import { ServerChangeLink } from './server-change-link'

export const dynamic = 'force-dynamic'

const ERROR_MESSAGES: Record<string, string> = {
  suspended: '관리자에 의해 일시 정지된 계정이에요. 관리자에게 문의해주세요.',
  invite_required: '초대가 필요한 인스턴스예요. 관리자에게 초대 링크를 요청해주세요.',
  state: '로그인 요청이 만료됐어요. 다시 시도해주세요.',
  oidc: '로그인 중 문제가 발생했어요. 다시 시도해주세요.',
  oidc_exchange: '로그인 중 문제가 발생했어요. 다시 시도해주세요.',
  provider: '사용할 수 없는 로그인 방식이에요.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined
  const providers = await prismaPublic.oidcProvider.findMany({
    where: { enabled: true },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })
  const passwordEnabled = await getSetting('auth.password_enabled', z.boolean(), true, prismaPublic)

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 py-10 md:min-h-0 md:p-0">
      <div className="md:hidden">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-point-500 text-sm font-bold text-white shadow-lg shadow-point-500/40">
            b
          </span>
          <span className="text-base font-semibold tracking-tight">
            bebe<span className="text-point-500">·</span>moment
          </span>
        </div>
      </div>
      <div className="flex-1">
        <h1 className="mt-10 text-[32px] font-bold leading-tight tracking-tight md:mt-0">
          다시 만나서 반가워요
        </h1>
        <p className="mt-3 text-base text-base-500">계정에 로그인해주세요.</p>
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
