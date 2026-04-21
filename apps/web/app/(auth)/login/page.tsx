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
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-3xl font-bold tracking-tight mb-8">
        bebe-<span className="text-point-500">moment</span>
      </h1>
      <LoginForm oidcProviders={providers} passwordEnabled={passwordEnabled} />
    </main>
  )
}
