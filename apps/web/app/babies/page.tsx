import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { redirect } from 'next/navigation'

export default async function BabiesPage() {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) redirect('/onboarding')

  const babies = await prisma.baby.findMany({
    where: { familyId: ctx.family.id, deletedAt: null },
    orderBy: { birthDate: 'asc' },
  })

  return (
    <main style={{ maxWidth: 640, margin: '24px auto', padding: 24 }}>
      <a href="/">← 홈</a>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 12 }}>아기</h1>
      <a href="/babies/new">
        <button type="button" style={{ marginTop: 12 }}>
          아기 추가
        </button>
      </a>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
        {babies.map((b) => (
          <li key={b.id} className="card" style={{ marginTop: 8 }}>
            <b>{b.name}</b>{' '}
            <span style={{ color: 'var(--base-500)' }}>
              ({b.birthDate.toISOString().slice(0, 10)})
            </span>
          </li>
        ))}
      </ul>
    </main>
  )
}
