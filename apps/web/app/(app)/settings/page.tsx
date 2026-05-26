import { NotificationPrefs } from '@/components/settings/notification-prefs'
import { PushToggle } from '@/components/settings/push-toggle'
import { ThemeToggle } from '@/components/settings/theme-toggle'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@bebe/core'
import {
  Baby,
  Bookmark,
  ChevronRight,
  type LucideIcon,
  NotebookPen,
  Tags,
  Trash2,
  Users,
} from 'lucide-react'
import Link from 'next/link'

const MANAGE_ROWS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/babies', label: '아기 관리', icon: Baby },
  { href: '/family', label: '가족 멤버', icon: Users },
  { href: '/saved', label: '저장함', icon: Bookmark },
  { href: '/settings/tags', label: '태그 관리', icon: Tags },
  { href: '/diary', label: '일기', icon: NotebookPen },
  { href: '/trash', label: '휴지통', icon: Trash2 },
]

export default async function SettingsPage() {
  const { session } = await getAuth()
  if (!session) return null
  const user = await prismaPublic.user.findUnique({ where: { id: session.userId } })
  if (!user) return null

  const prefRows = await prismaPublic.notificationPref.findMany({
    where: { userId: session.userId },
  })
  const prefMap = new Map(prefRows.map((r) => [r.category, r.enabled]))
  const initialPrefs = Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((c) => [c, prefMap.get(c) ?? true]),
  ) as Record<NotificationCategory, boolean>

  return (
    <>
      <AppHeader title="설정" />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4 space-y-6">
        <Card>
          <CardBody>
            <h2 className="font-semibold mb-2">계정</h2>
            <p className="text-sm">{user.displayName}</p>
            <p className="text-sm text-base-500">{user.email}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="mb-3 font-semibold">테마</h2>
            <ThemeToggle />
          </CardBody>
        </Card>
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold text-base-500">알림</h2>
          <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 px-4 py-3.5 shadow-sm dark:border-base-800/70 dark:bg-base-900">
            <PushToggle />
          </div>
          <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 px-4 py-2 shadow-sm dark:border-base-800/70 dark:bg-base-900">
            <NotificationPrefs initial={initialPrefs} />
          </div>
        </section>
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold text-base-500">관리</h2>
          <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-sm divide-y divide-base-100 dark:border-base-800/70 dark:bg-base-900 dark:divide-base-800">
            {MANAGE_ROWS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors ease-ios active:bg-base-100 md:hover:bg-base-50 dark:active:bg-base-800 dark:md:hover:bg-base-800/60"
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0 text-base-400" strokeWidth={1.9} />
                <span className="flex-1 text-[15px] text-base-900 dark:text-base-50">{label}</span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-base-300 dark:text-base-600" />
              </Link>
            ))}
          </div>
        </section>
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
