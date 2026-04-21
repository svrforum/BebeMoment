import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { listAssets } from '@/server/asset/list'
import { resolveContext } from '@/server/context'
import { redirect } from 'next/navigation'

export default async function AssetsPage() {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) redirect('/onboarding')

  const assets = await listAssets(
    { familyId: ctx.family.id, limit: 60, includeProcessing: true },
    prisma,
  )

  return (
    <main style={{ maxWidth: 900, margin: '24px auto', padding: 24 }}>
      <a href="/">← 홈</a>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 12 }}>타임라인</h1>
        <a href="/upload">
          <button type="button">업로드</button>
        </a>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 8,
          marginTop: 16,
        }}
      >
        {assets.length === 0 && (
          <p style={{ color: 'var(--base-500)', gridColumn: '1 / -1' }}>
            아직 올라온 사진이 없어요. <a href="/upload">업로드하기</a>
          </p>
        )}
        {assets.map((a) => {
          const derivs = (a.derivatives as Record<string, string>) ?? {}
          const thumb = derivs.thumb_sm ?? derivs.poster
          return (
            <a
              key={a.id}
              href={`/assets/${a.id}`}
              style={{
                display: 'block',
                aspectRatio: '1 / 1',
                background: 'var(--base-100)',
                borderRadius: 8,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {thumb ? (
                <img
                  src={`/media/${thumb}`}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    color: 'var(--base-500)',
                    fontSize: 12,
                  }}
                >
                  {a.status === 'processing' ? '처리 중…' : a.status}
                </div>
              )}
            </a>
          )
        })}
      </div>
    </main>
  )
}
