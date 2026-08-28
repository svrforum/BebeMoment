import { AppDownloadRow } from '@/components/settings/app-download-row'
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
  Coffee,
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

        <section className="space-y-2">
          <SectionTitle>{t('sections.app')}</SectionTitle>
          <AppDownloadRow />
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

        <div className="flex items-center justify-center gap-2 pt-2">
          <a
            href="https://github.com/svrforum/BebeMoment"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-base-200 px-3.5 py-2 text-[13px] font-medium text-base-600 transition-colors hover:bg-base-100 active:scale-95 dark:border-base-800 dark:text-base-300 dark:hover:bg-base-800"
          >
            <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            {t('about.github')}
          </a>
          <a
            href="https://buymeacoffee.com/svrforum"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-3.5 py-2 text-[13px] font-medium text-amber-700 transition-colors hover:bg-amber-100 active:scale-95 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
          >
            <Coffee size={15} strokeWidth={2.1} />
            {t('about.sponsor')}
          </a>
        </div>

        <p className="pt-3 text-center text-[12px] text-base-400">
          Bebe Moment {process.env.APP_VERSION ?? 'dev'}
          <InstalledAppVersion />
        </p>
      </div>
    </>
  )
}
