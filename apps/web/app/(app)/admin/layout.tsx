import { isInstanceAdminUser } from '@/lib/admin'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { parseEnv } from '@bebe/config'
import { notFound } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session } = await getAuth()
  if (!session) notFound()
  const user = await prismaPublic.user.findUnique({ where: { id: session.userId } })
  if (!user) notFound()
  const env = parseEnv(process.env as Record<string, string | undefined>)
  if (
    !isInstanceAdminUser(
      { email: user.email, emailVerified: user.emailVerified },
      env.ADMIN_USER_EMAILS,
    )
  ) {
    notFound()
  }
  return <>{children}</>
}
