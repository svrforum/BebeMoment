import { prisma } from '@/lib/db-init'
import { getSetting } from '@/server/settings/get'
import { z } from 'zod'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const providers = await prisma.oidcProvider.findMany({
    where: { enabled: true },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })
  const passwordEnabled = await getSetting('auth.password_enabled', z.boolean(), true, prisma)

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
        <div className="mt-10">
          <LoginForm oidcProviders={providers} passwordEnabled={passwordEnabled} />
        </div>
      </div>
    </main>
  )
}
