import { InviteManager } from '@/components/family/invite-manager'
import { MemberList } from '@/components/family/member-list'
import { PermissionsSection } from '@/components/family/permissions-section'
import { AppHeader } from '@/components/shell/app-header'
import { prismaPublic } from '@/lib/db-init'
import { getContext } from '@/server/context'
import { listFamilyMembers } from '@/server/family/list-members'
import { ChevronRight, Settings } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function FamilyPage() {
  const t = await getTranslations('family')
  const ctx = await getContext()
  if (!ctx.family || !ctx.user) return null

  const members = await listFamilyMembers(ctx.family.id, prismaPublic)
  const role = ctx.membership?.role ?? 'family'
  const canInvite = role === 'owner' || role === 'guardian'
  const isOwner = role === 'owner'

  return (
    <>
      <AppHeader title={t('title')} />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4 space-y-6">
        <MemberList members={members} currentUserId={ctx.user.id} isAdmin={isOwner} />
        {canInvite && <InviteManager />}
        {isOwner && <PermissionsSection />}

        <section className="space-y-2">
          <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-card dark:border-base-800/70 dark:bg-base-900">
            <Link
              href="/settings"
              className="group flex items-center gap-3 px-4 py-3.5 transition-colors ease-ios focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-point-500/50 active:bg-base-100 md:hover:bg-base-50 dark:active:bg-base-800 dark:md:hover:bg-base-800/60"
            >
              <Settings
                className="h-[18px] w-[18px] flex-shrink-0 text-base-400"
                strokeWidth={1.9}
              />
              <span className="flex-1">
                <span className="block text-[15px] text-base-900 dark:text-base-50">
                  {t('settings.title')}
                </span>
                <span className="block text-[12px] text-base-400">{t('settings.subtitle')}</span>
              </span>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-base-300 transition-transform ease-ios group-hover:translate-x-0.5 dark:text-base-600" />
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
