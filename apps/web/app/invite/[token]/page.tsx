import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { Home, LinkIcon, LogIn, ShieldCheck, Users } from 'lucide-react'
import Link from 'next/link'
import { SignupWizard } from '../../(auth)/signup/signup-wizard'
import { AcceptButton } from './accept-button'

const ROLE_LABEL: Record<string, string> = {
  guardian: '보호자',
  family: '가족',
}

function InviteShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <AppHeader title={title} />
      <main className="mx-auto w-full max-w-[520px] px-5 pb-16">{children}</main>
    </>
  )
}

function InviteErrorCard({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode
  title: string
  message: string
}) {
  return (
    <InviteShell title="가족 초대">
      <Card>
        <CardBody className="space-y-5 py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-base-100 text-base-500 dark:bg-base-800">
            {icon}
          </div>
          <div className="space-y-1.5">
            <h2 className="text-[22px] font-bold text-base-900 dark:text-base-50">{title}</h2>
            <p className="text-[15px] text-base-500">{message}</p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button asChild size="lg" className="w-full">
              <Link href="/login">
                <LogIn size={18} />
                로그인 화면으로
              </Link>
            </Button>
            <Button asChild variant="ghost" size="md" className="w-full">
              <Link href="/">
                <Home size={16} />
                홈으로
              </Link>
            </Button>
          </div>
        </CardBody>
      </Card>
    </InviteShell>
  )
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await prismaPublic.invite.findUnique({
    where: { token },
    include: { family: true, invitedBy: true },
  })

  if (!invite) {
    return (
      <InviteErrorCard
        icon={<LinkIcon size={26} />}
        title="초대 링크가 잘못되었어요"
        message="링크가 깨졌거나 잘못 복사된 것 같아요. 보낸 사람에게 다시 받아 주세요."
      />
    )
  }

  if (invite.acceptedAt) {
    return (
      <InviteErrorCard
        icon={<ShieldCheck size={26} />}
        title="이미 사용된 초대예요"
        message="이 링크는 한 번만 쓸 수 있어요. 이미 합류한 계정으로 로그인해 보세요."
      />
    )
  }

  if (invite.revokedAt || invite.expiresAt.getTime() < Date.now()) {
    return (
      <InviteErrorCard
        icon={<LinkIcon size={26} />}
        title="만료된 초대예요"
        message="유효 기간이 지났거나 철회된 초대예요. 새 링크를 받아서 다시 시도해 주세요."
      />
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

  const roleLabel = ROLE_LABEL[invite.role] ?? invite.role

  return (
    <InviteShell title="가족 초대">
      <div className="space-y-5">
        <Card>
          <CardBody className="space-y-6 py-7 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-point-500/10 text-point-500">
              <Users size={26} />
            </div>

            <div className="space-y-2">
              <p className="text-[13px] font-medium uppercase tracking-wide text-base-400">
                가족 앨범 초대
              </p>
              <h2 className="text-[28px] font-bold leading-tight tracking-tight text-base-900 dark:text-base-50">
                {invite.family.name}
              </h2>
              <p className="text-[15px] text-base-500">
                {invite.invitedBy.displayName} 님이 함께하자고 보냈어요
              </p>
            </div>

            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-base-100 px-3 py-1 text-[12px] font-medium text-base-600 dark:bg-base-800 dark:text-base-300">
                <ShieldCheck size={12} />
                {roleLabel} 권한으로 합류
              </span>
            </div>

            <AcceptButton token={token} />
          </CardBody>
        </Card>

        <p className="px-2 text-center text-[12px] text-base-400">
          수락하면 {invite.family.name} 가족의 사진과 기록을 함께 볼 수 있어요.
        </p>
      </div>
    </InviteShell>
  )
}
