import { NotificationPrefs } from '@/components/settings/notification-prefs'
import { PushTestButton } from '@/components/settings/push-test-button'
import { PushToggle } from '@/components/settings/push-toggle'
import { AppHeader } from '@/components/shell/app-header'
import { isInstanceAdminUser } from '@/lib/admin'
import { prismaPublic } from '@/lib/db-init'
import { getContext } from '@/server/context'
import { parseEnv } from '@bebe/config'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@bebe/core'
import { Bell, ChevronRight, Globe, Send, Smartphone, SlidersHorizontal } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

const richTags = {
  b: (chunks: React.ReactNode) => <span className="font-medium">{chunks}</span>,
}

function Card({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: LucideIcon
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 p-4 shadow-card dark:border-base-800/70 dark:bg-base-900">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-[18px] w-[18px] flex-shrink-0 text-point-500" strokeWidth={2} />
        <h2 className="text-[15px] font-semibold text-base-900 dark:text-base-50">{title}</h2>
        {badge && (
          <span className="rounded-full bg-point-500/12 px-2 py-0.5 text-[11px] font-semibold text-point-600 dark:text-point-300">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => {
        const key = `step-${i}`
        return (
          <li
            key={key}
            className="flex gap-2.5 text-[14px] leading-relaxed text-base-700 dark:text-base-200"
          >
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-base-100 text-[11px] font-bold text-base-500 dark:bg-base-800 dark:text-base-300">
              {i + 1}
            </span>
            <span className="flex-1">{item}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-xl bg-base-100 px-3 py-2 text-[12.5px] leading-relaxed text-base-600 dark:bg-base-800/60 dark:text-base-300">
      {children}
    </p>
  )
}

export default async function PushNotificationsPage() {
  const t = await getTranslations('settings')
  const ctx = await getContext()
  if (!ctx.user) return null
  const user = ctx.user
  const role = ctx.membership?.role ?? null
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const isAdmin =
    role === 'owner' ||
    isInstanceAdminUser(
      { email: user.email, emailVerified: user.emailVerified },
      env.ADMIN_USER_EMAILS,
    )

  const prefRows = await prismaPublic.notificationPref.findMany({ where: { userId: user.id } })
  const prefMap = new Map(prefRows.map((r) => [r.category, r.enabled]))
  const initialPrefs = Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((c) => [c, prefMap.get(c) ?? true]),
  ) as Record<NotificationCategory, boolean>

  return (
    <>
      <AppHeader title={t('notifications.title')} />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4 space-y-4">
        <p className="px-1 text-[13.5px] leading-relaxed text-base-500">
          {t('notifications.intro')}
        </p>

        {/* 이 기기 — 켜기 + 테스트 */}
        <Card icon={Bell} title={t('notifications.thisDevice.title')}>
          <div className="space-y-3">
            <div className="rounded-xl border border-base-200/70 px-3.5 py-3 dark:border-base-800/70">
              <PushToggle />
            </div>
            <PushTestButton />
            <p className="text-[12.5px] leading-relaxed text-base-500">
              {t.rich('notifications.thisDevice.hint', richTags)}
            </p>
          </div>
        </Card>

        {/* 안드로이드 앱 */}
        <Card
          icon={Smartphone}
          title={t('notifications.android.title')}
          badge={t('notifications.android.badge')}
        >
          <Steps
            items={[
              t.rich('notifications.android.step1', richTags),
              t.rich('notifications.android.step2', richTags),
              t.rich('notifications.android.step3', richTags),
            ]}
          />
          <Note>{t.rich('notifications.android.note', richTags)}</Note>
        </Card>

        {/* 웹 브라우저 */}
        <Card
          icon={Globe}
          title={t('notifications.web.title')}
          badge={t('notifications.web.badge')}
        >
          <Steps
            items={[
              t.rich('notifications.web.step1', richTags),
              t.rich('notifications.web.step2', richTags),
              t.rich('notifications.web.step3', richTags),
            ]}
          />
          <Note>{t.rich('notifications.web.note', richTags)}</Note>
        </Card>

        {/* iOS */}
        <Card icon={Send} title={t('notifications.ios.title')} badge={t('notifications.ios.badge')}>
          <Steps
            items={[
              t.rich('notifications.ios.step1', richTags),
              t.rich('notifications.ios.step2', richTags),
              t.rich('notifications.ios.step3', richTags),
            ]}
          />
          <Note>{t.rich('notifications.ios.note', richTags)}</Note>
        </Card>

        {/* 카테고리 */}
        <Card icon={Bell} title={t('notifications.categories.title')}>
          <p className="mb-3 text-[13px] leading-relaxed text-base-500">
            {t('notifications.categories.hint')}
          </p>
          <NotificationPrefs initial={initialPrefs} />
        </Card>

        {/* 관리자 */}
        {isAdmin && (
          <Card icon={SlidersHorizontal} title={t('notifications.admin.title')}>
            <p className="mb-3 text-[13px] leading-relaxed text-base-500">
              {t('notifications.admin.hint')}
            </p>
            <Steps
              items={[
                t.rich('notifications.admin.step1', richTags),
                t.rich('notifications.admin.step2', richTags),
                t.rich('notifications.admin.step3', richTags),
                t.rich('notifications.admin.step4', richTags),
              ]}
            />
            <Link
              href="/admin/notifications"
              className="mt-3 flex items-center gap-2 rounded-xl bg-point-500/10 px-3.5 py-3 text-[14px] font-medium text-point-600 transition-colors hover:bg-point-500/15 dark:text-point-300"
            >
              <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
              <span className="flex-1">{t('notifications.admin.open')}</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Card>
        )}
      </div>
    </>
  )
}
