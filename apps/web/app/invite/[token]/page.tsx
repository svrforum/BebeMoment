import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { SignupWizard } from '../../(auth)/signup/signup-wizard'
import { AcceptButton } from './accept-button'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await prismaPublic.invite.findUnique({
    where: { token },
    include: { family: true, invitedBy: true },
  })

  if (!invite) {
    return (
      <main style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
        <h1>초대 링크가 잘못되었어요</h1>
      </main>
    )
  }

  if (invite.acceptedAt) {
    return (
      <main style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
        <h1>이미 사용된 초대예요</h1>
      </main>
    )
  }

  if (invite.revokedAt || invite.expiresAt.getTime() < Date.now()) {
    return (
      <main style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
        <h1>만료된 초대예요</h1>
      </main>
    )
  }

  const { user } = await getAuth()
  if (!user) {
    const providers = await prismaPublic.oidcProvider.findMany({
      where: { enabled: true },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    })
    return (
      <main className="mx-auto w-full max-w-[520px] px-6 py-10 md:py-16">
        <SignupWizard inviteToken={token} />
        {providers.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-base-200 dark:border-base-800" />
              <span className="mx-3 text-xs text-base-400">또는</span>
              <div className="flex-grow border-t border-base-200 dark:border-base-800" />
            </div>
            {providers.map((p) => (
              <a
                key={p.id}
                href={`/api/auth/oidc/${p.id}?invite=${token}`}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-base-100 text-sm font-medium text-base-900 hover:bg-base-200/60 dark:bg-base-800 dark:text-base-50"
              >
                {p.name} 으로 가입
              </a>
            ))}
          </div>
        )}
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
      <h1>{invite.family.name} 에 합류하기</h1>
      <p>{invite.invitedBy.displayName} 님이 초대했어요.</p>
      <AcceptButton token={token} />
    </main>
  )
}
