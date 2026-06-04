import { BrandLockup } from '@/components/brand/brand-mark'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { Home, LinkIcon, LogIn, ShieldCheck, Users } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { SignupWizard } from '../../(auth)/signup/signup-wizard'
import { AcceptButton } from './accept-button'
import { InviteAppButton } from './invite-app-button'
import { InviteOidcButtons } from './invite-oidc-buttons'

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
  shellTitle,
  loginLabel,
  homeLabel,
}: {
  icon: React.ReactNode
  title: string
  message: string
  shellTitle: string
  loginLabel: string
  homeLabel: string
}) {
  return (
    <InviteShell title={shellTitle}>
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
                {loginLabel}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="md" className="w-full">
              <Link href="/">
                <Home size={16} />
                {homeLabel}
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
  const t = await getTranslations('invite')
  const invite = await prismaPublic.invite.findUnique({
    where: { token },
    include: { family: true, invitedBy: true },
  })

  const errorShellProps = {
    shellTitle: t('shell.title'),
    loginLabel: t('errors.toLogin'),
    homeLabel: t('errors.toHome'),
  }

  if (!invite) {
    return (
      <InviteErrorCard
        icon={<LinkIcon size={26} />}
        title={t('errors.invalid.title')}
        message={t('errors.invalid.message')}
        {...errorShellProps}
      />
    )
  }

  if (invite.acceptedAt) {
    return (
      <InviteErrorCard
        icon={<ShieldCheck size={26} />}
        title={t('errors.used.title')}
        message={t('errors.used.message')}
        {...errorShellProps}
      />
    )
  }

  if (invite.revokedAt || invite.expiresAt.getTime() < Date.now()) {
    return (
      <InviteErrorCard
        icon={<LinkIcon size={26} />}
        title={t('errors.expired.title')}
        message={t('errors.expired.message')}
        {...errorShellProps}
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
        <BrandLockup
          className="mb-8 justify-center"
          iconClassName="h-11 w-11"
          textClassName="text-[19px]"
        />
        <InviteAppButton token={token} />
        <SignupWizard inviteToken={token} embedded />
        {providers.length > 0 && <InviteOidcButtons token={token} providers={providers} />}
      </main>
    )
  }

  const roleLabel =
    invite.role === 'guardian' || invite.role === 'family' ? t(`role.${invite.role}`) : invite.role

  return (
    <InviteShell title={t('shell.title')}>
      <div className="space-y-5">
        <Card>
          <CardBody className="space-y-6 py-7 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-point-500/10 text-point-500">
              <Users size={26} />
            </div>

            <div className="space-y-2">
              <p className="text-[13px] font-medium uppercase tracking-wide text-base-400">
                {t('join.eyebrow')}
              </p>
              <h2 className="text-[28px] font-bold leading-tight tracking-tight text-base-900 dark:text-base-50">
                {invite.family.name}
              </h2>
              <p className="text-[15px] text-base-500">
                {t('join.invitedBy', { name: invite.invitedBy.displayName })}
              </p>
            </div>

            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-base-100 px-3 py-1 text-[12px] font-medium text-base-600 dark:bg-base-800 dark:text-base-300">
                <ShieldCheck size={12} />
                {t('join.roleBadge', { role: roleLabel })}
              </span>
            </div>

            <AcceptButton token={token} />
          </CardBody>
        </Card>

        <p className="px-2 text-center text-[12px] text-base-400">
          {t('join.footnote', { family: invite.family.name })}
        </p>
      </div>
    </InviteShell>
  )
}
