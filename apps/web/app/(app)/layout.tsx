import { BottomNav } from '@/components/shell/bottom-nav'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.user) redirect('/login')
  if (!ctx.family) redirect('/onboarding')

  return (
    <>
      <main className="pb-20">{children}</main>
      <BottomNav />
    </>
  )
}
