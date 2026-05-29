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
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

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
      <AppHeader title="푸시 알림" />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4 space-y-4">
        <p className="px-1 text-[13.5px] leading-relaxed text-base-500">
          새 사진·댓글·기록이 올라오면 휴대폰으로 바로 알려드려요. 아래에서 이 기기의 알림을 켜고
          테스트해보세요.
        </p>

        {/* 이 기기 — 켜기 + 테스트 */}
        <Card icon={Bell} title="이 기기">
          <div className="space-y-3">
            <div className="rounded-xl border border-base-200/70 px-3.5 py-3 dark:border-base-800/70">
              <PushToggle />
            </div>
            <PushTestButton />
            <p className="text-[12.5px] leading-relaxed text-base-500">
              알림을 켠 뒤 <span className="font-medium">테스트 알림 보내기</span>를 누르면 이
              기기로 샘플 알림이 와요. 안 오면 아래 플랫폼별 안내를 확인해주세요.
            </p>
          </div>
        </Card>

        {/* 안드로이드 앱 */}
        <Card icon={Smartphone} title="안드로이드 앱" badge="권장">
          <Steps
            items={[
              <>
                bebe 앱을 설치하고 <span className="font-medium">서버 주소</span>를 입력해
                로그인해요.
              </>,
              <>
                위 <span className="font-medium">이 기기에서 알림 받기</span>를 켜고, 안드로이드
                알림 권한을 <span className="font-medium">허용</span>해요.
              </>,
              <>
                <span className="font-medium">테스트 알림 보내기</span>로 도착하는지 확인해요.
              </>,
            ]}
          />
          <Note>
            앱 푸시는 관리자가 Firebase(FCM)를 설정해야 동작해요. 권한 팝업이 안 떴거나 거부했다면
            휴대폰 <span className="font-medium">설정 → 앱 → bebe → 알림</span>에서 켤 수 있어요.
          </Note>
        </Card>

        {/* 웹 브라우저 */}
        <Card icon={Globe} title="웹 브라우저" badge="안드로이드·데스크탑">
          <Steps
            items={[
              <>
                크롬·엣지 등에서 사이트를 열고 위{' '}
                <span className="font-medium">이 기기에서 알림 받기</span>를 켜요.
              </>,
              <>
                브라우저가 물어보면 <span className="font-medium">허용</span>을 눌러요.
              </>,
              <>
                <span className="font-medium">테스트 알림 보내기</span>로 확인해요.
              </>,
            ]}
          />
          <Note>
            실수로 차단했다면 주소창 왼쪽{' '}
            <span className="font-medium">자물쇠 아이콘 → 알림 → 허용</span>으로 바꾼 뒤 다시
            켜주세요. 홈 화면에 설치(PWA)하면 더 안정적으로 와요.
          </Note>
        </Card>

        {/* iOS */}
        <Card icon={Send} title="아이폰 · 아이패드" badge="iOS 16.4+">
          <Steps
            items={[
              <>
                <span className="font-medium">Safari</span>로 사이트를 열고, 공유 버튼 →{' '}
                <span className="font-medium">홈 화면에 추가</span>를 눌러요.
              </>,
              <>홈 화면에 생긴 bebe 아이콘으로 사이트를 다시 열어요.</>,
              <>
                위 <span className="font-medium">이 기기에서 알림 받기</span>를 켜고 권한을 허용한
                뒤 테스트해요.
              </>,
            ]}
          />
          <Note>
            아이폰은 <span className="font-medium">홈 화면에 추가한 경우에만</span> 푸시가 와요.
            Safari 탭에서 연 상태로는 켤 수 없어요(Apple 정책).
          </Note>
        </Card>

        {/* 카테고리 */}
        <Card icon={Bell} title="받을 알림 고르기">
          <p className="mb-3 text-[13px] leading-relaxed text-base-500">
            아래에서 받고 싶은 알림 종류를 켜고 끌 수 있어요. (기기별이 아니라 내 계정 전체에
            적용돼요.)
          </p>
          <NotificationPrefs initial={initialPrefs} />
        </Card>

        {/* 관리자 */}
        {isAdmin && (
          <Card icon={SlidersHorizontal} title="관리자 설정">
            <p className="mb-3 text-[13px] leading-relaxed text-base-500">
              가족 전체에 알림이 가려면 관리자가 한 번 켜줘야 해요:
            </p>
            <Steps
              items={[
                <>
                  <span className="font-medium">알림 마스터 스위치</span>를 켜요.
                </>,
                <>
                  웹 푸시용 <span className="font-medium">VAPID 키</span>를 생성해요(버튼 한 번).
                </>,
                <>
                  앱 푸시용{' '}
                  <span className="font-medium">Firebase 서비스 계정 + 클라이언트 설정</span>을
                  입력해요.
                </>,
                <>받게 할 알림 카테고리를 켜요.</>,
              ]}
            />
            <Link
              href="/admin/notifications"
              className="mt-3 flex items-center gap-2 rounded-xl bg-point-500/10 px-3.5 py-3 text-[14px] font-medium text-point-600 transition-colors hover:bg-point-500/15 dark:text-point-300"
            >
              <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
              <span className="flex-1">관리자 알림 설정 열기</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Card>
        )}
      </div>
    </>
  )
}
