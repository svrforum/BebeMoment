import { BottomNav } from '@/components/shell/bottom-nav'
import { SideNav } from '@/components/shell/side-nav'
import { getContext } from '@/server/context'
import { redirect } from 'next/navigation'
import { AppShellClient } from './shell-client'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  if (!ctx.user) redirect('/login')
  if (!ctx.family) redirect('/onboarding')

  return (
    <AppShellClient>
      <SideNav familyName={ctx.family.name} />
      <main className="pb-20 md:pb-8 md:pl-60">{children}</main>
      <BottomNav />
    </AppShellClient>
  )
}
