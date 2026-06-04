import { AppUpdateBanner } from '@/components/shell/app-update-banner'
import { BottomNav } from '@/components/shell/bottom-nav'
import { SideNav } from '@/components/shell/side-nav'
import { WidgetRegistrar } from '@/components/widget/widget-registrar'
import { FeaturesProvider } from '@/lib/features'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getContext } from '@/server/context'
import { getSetting } from '@/server/settings/get'
import { getFeatureFlags } from '@/server/settings/features'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { AppShellClient } from './shell-client'

// `force-dynamic` removed from the layout — it was forcing every page in
// the (app) segment to re-render fully on each request. Auth + per-family
// data is request-scoped via `cookies()` inside `getContext()`, so Next.js
// already recognizes this layout as dynamic where it matters; pages keep
// the freedom to opt back in to caching where appropriate (e.g. diary
// list with 60s revalidate).

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  if (!ctx.user) {
    // 미로그인으로 보호 페이지(공유된 /detail/52 등)에 들어오면 로그인 후 그 자리로
    // 돌려보내도록 ?next= 를 붙인다. 경로는 미들웨어가 심은 x-pathname 에서 읽는다.
    const path = (await headers()).get('x-pathname') ?? ''
    // 같은-출처 절대경로만 (`//`·`/\` 프로토콜-상대 우회 차단).
    const next = /^\/(?![/\\])/.test(path) ? path : ''
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  }
  if (!ctx.family) redirect('/onboarding')

  const features = await getFeatureFlags(prismaPublic)
  // 일반 가족 구성원(family)은 멤버·초대 관리가 없으므로 '가족' 탭을 숨긴다(설정으로 대체).
  const role = ctx.membership?.role ?? null
  const canManageFamily = role === 'owner' || role === 'guardian'
  // 관리자가 일반 가족에게 숨기도록 설정한 메뉴(스토리·앨범). 일반 구성원에게만 적용.
  const hiddenNav = canManageFamily
    ? []
    : await getSetting('nav.family.hidden', z.array(z.string()), [], prismaPublic)
  // 스토리·앨범이 숨겨진 일반 가족에겐 북마크(저장함) 바로가기 탭을 대신 노출.
  const showBookmark = hiddenNav.length > 0 && features.bookmarks

  // Unread = ready assets in the current family newer than this member's
  // lastSeenAt. Capped to 100 (badge shows "99+"). First-visit (no
  // lastSeenAt) intentionally yields 0 — we don't badge "everything is
  // new" on the very first session.
  const lastSeen = ctx.membership?.lastSeenAt ?? null
  const unreadTimeline = lastSeen
    ? await prismaMedia.asset.count({
        where: {
          familyId: ctx.family.id,
          deletedAt: null,
          status: 'ready',
          duplicateOf: null, // 중복 별칭은 미열람 카운트에서 제외
          createdAt: { gt: lastSeen },
        },
      })
    : 0

  // 업로드 시트의 '스토리로 올리기' 옵션 게이팅 + 새 스토리에 붙일 기본 아기.
  const canCreateStory = features.diary && ctx.capabilities.includes('record.create')
  const storyBaby = canCreateStory
    ? await prismaPublic.baby.findFirst({
        where: { familyId: ctx.family.id, deletedAt: null },
        orderBy: { birthDate: 'asc' },
        select: { id: true },
      })
    : null

  return (
    <FeaturesProvider value={features}>
      <AppShellClient
        capabilities={ctx.capabilities}
        canCreateStory={canCreateStory}
        storyBabyId={storyBaby?.id ?? null}
      >
        <SideNav
          familyName={ctx.family.name}
          canManageFamily={canManageFamily}
          hiddenNav={hiddenNav}
          showBookmark={showBookmark}
        />
        <main className="pb-20 md:pb-8 md:pl-60">{children}</main>
        <BottomNav
          unreadCounts={{ '/timeline': unreadTimeline }}
          canManageFamily={canManageFamily}
          hiddenNav={hiddenNav}
          showBookmark={showBookmark}
        />
        <WidgetRegistrar />
        <AppUpdateBanner />
      </AppShellClient>
    </FeaturesProvider>
  )
}
