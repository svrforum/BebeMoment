import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { redirect } from 'next/navigation'
import { AcceptButton } from './accept-button'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invite = await prisma.invite.findUnique({
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
    redirect(`/signup?invite=${token}&email=${encodeURIComponent(invite.email)}`)
  }

  return (
    <main style={{ maxWidth: 420, margin: '64px auto', padding: 24 }}>
      <h1>{invite.family.name} 에 합류하기</h1>
      <p>{invite.invitedBy.displayName} 님이 초대했어요.</p>
      <p style={{ color: 'var(--base-500)', fontSize: 13 }}>
        계정 이메일이 <b>{invite.email}</b> 과 같아야 합류할 수 있어요.
      </p>
      <AcceptButton token={token} />
    </main>
  )
}
