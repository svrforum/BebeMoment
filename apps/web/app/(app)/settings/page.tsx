import { DisplayNameEditor } from '@/components/settings/display-name-editor'
import { SnsLinkSection } from '@/components/settings/sns-link-section'
import { ThemeToggle } from '@/components/settings/theme-toggle'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { isInstanceAdminUser } from '@/lib/admin'
import { getContext } from '@/server/context'
import { getFeatureFlags } from '@/server/settings/features'
import { parseEnv } from '@bebe/config'
import type { FeatureFlag } from '@bebe/core'
import type { Role } from '@bebe/db-public'
import {
  Baby,
  Bell,
  Bookmark,
  ChevronRight,
  type LucideIcon,
  NotebookPen,
  SlidersHorizontal,
  Tags,
  Trash2,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { prismaPublic } from '@/lib/db-init'

type Row = {
  href: string
  label: string
  sublabel?: string
  icon: LucideIcon
  feature?: FeatureFlag
}

const ROLE_LABEL: Record<Role, string> = {
  owner: '관리자',
  guardian: '보호자',
  family: '가족',
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

  const features = await getFeatureFlags(prismaPublic)

  const familyRows: Row[] = [
    { href: '/family', label: '가족 멤버', sublabel: '구성원·초대', icon: Users },
    { href: '/babies', label: '아기 관리', icon: Baby },
  ]
  const contentRows: Row[] = (
    [
      { href: '/saved', label: '저장함', icon: Bookmark, feature: 'bookmarks' },
      { href: '/story', label: '스토리', icon: NotebookPen, feature: 'diary' },
      { href: '/settings/tags', label: '태그 관리', icon: Tags, feature: 'tags' },
      { href: '/trash', label: '휴지통', icon: Trash2 },
    ] satisfies Row[]
  ).filter((r) => !r.feature || features[r.feature])

  return (
    <>
      <AppHeader title="설정" />
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
            <div className="flex items-center gap-1.5">
              <DisplayNameEditor initial={user.displayName} />
              {role && (
                <span className="shrink-0 rounded-md bg-base-100 px-1.5 py-0.5 text-[10px] font-semibold text-base-500 dark:bg-base-800">
                  {ROLE_LABEL[role]}
                </span>
              )}
            </div>
            <div className="truncate text-[13px] text-base-400">
              {user.username ? `@${user.username}` : (user.email ?? '')}
            </div>
          </div>
        </div>

        {/* 로그인 연동 */}
        <section className="space-y-2">
          <SectionTitle>SNS 계정 연동</SectionTitle>
          <SnsLinkSection />
        </section>

        {/* 가족 */}
        <section className="space-y-2">
          <SectionTitle>가족</SectionTitle>
          <LinkRows rows={familyRows} />
        </section>

        {/* 콘텐츠 */}
        <section className="space-y-2">
          <SectionTitle>콘텐츠</SectionTitle>
          <LinkRows rows={contentRows} />
        </section>

        {/* 알림 */}
        <section className="space-y-2">
          <SectionTitle>알림</SectionTitle>
          <LinkRows
            rows={[
              {
                href: '/settings/notifications',
                label: '푸시 알림',
                sublabel: '기기 등록 · 테스트 · 받을 알림 설정',
                icon: Bell,
              },
            ]}
          />
        </section>

        {/* 화면 */}
        <section className="space-y-2">
          <SectionTitle>화면</SectionTitle>
          <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 px-4 py-3.5 shadow-card dark:border-base-800/70 dark:bg-base-900">
            <ThemeToggle />
          </div>
        </section>

        {/* 관리자 */}
        {isAdmin && (
          <section className="space-y-2">
            <SectionTitle>관리자</SectionTitle>
            <LinkRows
              rows={[
                {
                  href: '/admin',
                  label: '인스턴스 관리',
                  sublabel: '인증·기능·테마·SMTP·스토리지',
                  icon: SlidersHorizontal,
                },
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
            로그아웃
          </Button>
        </form>
      </div>
    </>
  )
}
