import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { isRegistrationOpen } from '@/server/auth/registration'
import { resolveContext } from '@/server/context'
import { redirect } from 'next/navigation'

export default async function Home() {
  const { session } = await getAuth()
  // 갓 띄운 빈 인스턴스(가족 0 → 가입 열림)는 첫 사용자가 관리자 계정을 만들어야 하므로
  // 로그인 대신 가입 위저드로 바로 보낸다. 가족이 생기면(가입 닫힘) 다시 로그인으로.
  if (!session) redirect((await isRegistrationOpen(prismaPublic)) ? '/signup' : '/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.user) redirect('/login')
  if (!ctx.family) redirect('/onboarding')
  redirect('/timeline')
}
