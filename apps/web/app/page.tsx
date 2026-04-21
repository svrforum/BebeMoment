import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { redirect } from 'next/navigation'

export default async function Home() {
  const { session } = await getAuth()
  if (!session) redirect('/login')

  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.user) redirect('/login')
  if (!ctx.family) redirect('/onboarding')

  const babies = await prisma.baby.findMany({
    where: { familyId: ctx.family.id, deletedAt: null },
    orderBy: { birthDate: 'asc' },
  })

  return (
    <main style={{ maxWidth: 720, margin: '24px auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{ctx.family.name}</h1>
        <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/family">가족</a>
          <a href="/babies">아기</a>
          <a href="/assets">타임라인</a>
          <a href="/upload">업로드</a>
          <form action="/api/auth/logout" method="post" style={{ display: 'inline' }}>
            <button
              type="submit"
              style={{ background: 'transparent', color: 'var(--point-500)', padding: 0 }}
            >
              로그아웃
            </button>
          </form>
        </nav>
      </header>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>우리 아기</h2>
        {babies.length === 0 ? (
          <p style={{ color: 'var(--base-500)' }}>
            <a href="/babies/new">아기를 추가하세요</a>
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {babies.map((b) => (
              <li key={b.id} style={{ padding: '8px 0' }}>
                <b>{b.name}</b>{' '}
                <span style={{ color: 'var(--base-500)' }}>
                  ({b.birthDate.toISOString().slice(0, 10)})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 18 }}>타임라인</h2>
        <a href="/assets">타임라인 보기 →</a>
      </section>
    </main>
  )
}
