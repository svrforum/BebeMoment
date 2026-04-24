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
      <div className="flex-1">
        <h1 className="text-3xl font-bold tracking-tight md:hidden">
          bebe<span className="text-point-500">·</span>moment
        </h1>
        <h2 className="mt-6 text-2xl font-bold tracking-tight md:mt-0">다시 만나서 반가워요</h2>
        <p className="mt-1.5 text-sm text-base-500">계정에 로그인해주세요.</p>
        <div className="mt-8">
          <LoginForm oidcProviders={providers} passwordEnabled={passwordEnabled} />
        </div>
      </div>
    </main>
  )
}
