import { InstalledAppVersion } from '@/components/shell/installed-app-version'
import { DisplayNameEditor } from '@/components/settings/display-name-editor'
import { LanguageSwitcher } from '@/components/settings/language-switcher'
import { getTranslations } from 'next-intl/server'
import { SnsLinkSection } from '@/components/settings/sns-link-section'
import { ThemeToggle } from '@/components/settings/theme-toggle'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { isInstanceAdminUser } from '@/lib/admin'
import { getContext } from '@/server/context'
import { parseEnv } from '@bebe/config'
import {
  Baby,
  Bell,
  ChevronRight,
  LayoutGrid,
  type LucideIcon,
  SlidersHorizontal,
  Trash2,
  Users,
} from 'lucide-react'
import Link from 'next/link'

type Row = {
  href: string
  label: string
  sublabel?: string
  icon: LucideIcon
}

function LinkRows({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-card divide-y divide-base-100 dark:border-base-800/70 dark:bg-base-900 dark:divide-base-800">
      {rows.map(({ href, label, sublabel, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-center gap-3 px-4 py-3.5 transition-colors ease-ios focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-point-500/50 active:bg-base-100 md:hover:bg-base-50 dark:active:bg-base-800 dark:md:hover:bg-base-800/60"
        >
          <Icon className="h-[18px] w-[18px] flex-shrink-0 text-base-400" strokeWidth={1.9} />
          <span className="flex-1">
            <span className="block text-[15px] text-base-900 dark:text-base-50">{label}</span>
            {sublabel && <span className="block text-[12px] text-base-400">{sublabel}</span>}
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-base-300 transition-transform ease-ios group-hover:translate-x-0.5 dark:text-base-600" />
        </Link>
      ))}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="px-1 text-[13px] font-semibold text-base-500">{children}</h2>
}

export default async function SettingsPage() {
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

  const familyRows: Row[] = [
    { href: '/family', label: t('rows.members'), sublabel: t('rows.membersSub'), icon: Users },
    { href: '/babies', label: t('rows.babies'), icon: Baby },
  ]

  return (
    <>
      <AppHeader title={t('title')} />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4 space-y-6">
        {/* 계정 */}
        <div className="flex items-center gap-3 rounded-2xl border border-base-200/70 bg-base-0 px-4 py-4 shadow-card dark:border-base-800/70 dark:bg-base-900">
          {user.avatarPath ? (
            // biome-ignore lint/performance/noImgElement: 작은 아바타 — unoptimized 정책(§17.3)
            <img src={user.avatarPath} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-point-500/15 text-[18px] font-semibold text-point-500">
              {user.displayName.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <DisplayNameEditor
              initial={user.displayName}
              badge={
                role ? (
                  <span className="shrink-0 rounded-md bg-base-100 px-1.5 py-0.5 text-[10px] font-semibold text-base-500 dark:bg-base-800">
                    {t(`roles.${role}`)}
                  </span>
                ) : null
              }
            />
            <div className="truncate text-[13px] text-base-400">
              {user.username ? `@${user.username}` : (user.email ?? '')}
            </div>
          </div>
        </div>

        {/* 로그인 연동 */}
        <section className="space-y-2">
          <SectionTitle>{t('sections.sns')}</SectionTitle>
          <SnsLinkSection />
        </section>

        {/* 가족 — 관리(owner/관리자)만. 일반 구성원은 알림·화면·SNS 만 본다. */}
        {isAdmin && (
          <section className="space-y-2">
            <SectionTitle>{t('sections.family')}</SectionTitle>
            <LinkRows rows={familyRows} />
          </section>
        )}

        {/* 알림 */}
        <section className="space-y-2">
          <SectionTitle>{t('sections.notifications')}</SectionTitle>
          <LinkRows
            rows={[
              {
                href: '/settings/notifications',
                label: t('rows.push'),
                sublabel: t('rows.pushSub'),
                icon: Bell,
              },
            ]}
          />
        </section>

        {/* 화면 */}
        <section className="space-y-2">
          <SectionTitle>{t('language.title')}</SectionTitle>
          <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 px-4 py-3.5 shadow-card dark:border-base-800/70 dark:bg-base-900">
            <LanguageSwitcher />
          </div>
        </section>

        <section className="space-y-2">
          <SectionTitle>{t('sections.display')}</SectionTitle>
          <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 px-4 py-3.5 shadow-card dark:border-base-800/70 dark:bg-base-900">
            <ThemeToggle />
          </div>
          <LinkRows
            rows={[
              {
                href: '/settings/widget',
                label: t('rows.widget'),
                sublabel: t('rows.widgetSub'),
                icon: LayoutGrid,
              },
            ]}
          />
        </section>

        {/* 관리자 */}
        {isAdmin && (
          <section className="space-y-2">
            <SectionTitle>{t('sections.admin')}</SectionTitle>
            <LinkRows
              rows={[
                {
                  href: '/admin',
                  label: t('rows.instanceAdmin'),
                  sublabel: t('rows.instanceAdminSub'),
                  icon: SlidersHorizontal,
                },
                { href: '/trash', label: t('rows.trash'), icon: Trash2 },
              ]}
            />
          </section>
        )}

        <form action="/api/auth/logout" method="post">
          <Button
            type="submit"
            variant="ghost"
            className="w-full text-danger hover:bg-danger/10 hover:text-danger"
          >
            {t('logout')}
          </Button>
        </form>

        <p className="pt-2 text-center text-[12px] text-base-400">
          Bebe Moment {process.env.APP_VERSION ?? 'dev'}
          <InstalledAppVersion />
        </p>
      </div>
    </>
  )
}
