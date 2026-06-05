import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { notFound, redirect } from 'next/navigation'

export default async function GrowthLayout({ children }: { children: React.ReactNode }) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) redirect('/onboarding')
  if (!ctx.capabilities.includes('record.read')) notFound()
  return <>{children}</>
}
