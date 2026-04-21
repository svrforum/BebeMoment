import { notFound } from 'next/navigation'
import { parseEnv } from '@bebe/config'
import { getAuth } from '@/lib/auth'
import { isInstanceAdmin } from '@/lib/admin'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuth()
  if (!user) notFound()
  const env = parseEnv(process.env as Record<string, string | undefined>)
  if (!isInstanceAdmin(user.email, env.ADMIN_USER_EMAILS)) notFound()
  return <>{children}</>
}
