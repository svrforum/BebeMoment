import { BottomNav } from '@/components/shell/bottom-nav'
import { SideNav } from '@/components/shell/side-nav'
import { FeaturesProvider } from '@/lib/features'
import { prismaPublic } from '@/lib/db-init'
import { getContext } from '@/server/context'
import { getFeatureFlags } from '@/server/settings/features'
import { redirect } from 'next/navigation'
import { AppShellClient } from './shell-client'

// `force-dynamic` removed from the layout — it was forcing every page in
// the (app) segment to re-render fully on each request. Auth + per-family
// data is request-scoped via `cookies()` inside `getContext()`, so Next.js
// already recognizes this layout as dynamic where it matters; pages keep
// the freedom to opt back in to caching where appropriate (e.g. diary
// list with 60s revalidate).

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  if (!ctx.user) redirect('/login')
  if (!ctx.family) redirect('/onboarding')

  const features = await getFeatureFlags(prismaPublic)

  return (
    <FeaturesProvider value={features}>
      <AppShellClient capabilities={ctx.capabilities}>
        <SideNav familyName={ctx.family.name} />
        <main className="pb-20 md:pb-8 md:pl-60">{children}</main>
        <BottomNav />
      </AppShellClient>
    </FeaturesProvider>
  )
}
