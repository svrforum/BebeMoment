import { StoryAlbumButton } from '@/components/story/story-album-button'
import { StoryBookmarkButton } from '@/components/story/StoryBookmarkButton'
import { StoryDeleteButton } from '@/components/story/StoryDeleteButton'
import { StoryDetail } from '@/components/story/StoryDetail'
import { StoryEditForm } from '@/components/story/StoryEditForm'
import { ShareLinkButton } from '@/components/detail/share-link-button'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { getStoryEntry } from '@/server/story/get'
import { getFeatureFlags } from '@/server/settings/features'
import { ChevronLeft, Pencil } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { deleteStoryAction } from './actions'

export default async function StoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  const { id } = await params
  const sp = await searchParams
  const entry = await getStoryEntry(
    id,
    ctx.family.id,
    prismaPublic,
    prismaMedia,
    getMediaClient(),
    ctx.membership?.role ?? 'family',
  )
  if (!entry) notFound()
  const uuid = entry.id
  const publicNo = entry.publicNo

  // 편집·삭제는 권한 있는 사용자에게만(서버 update/soft-delete 가 최종 방어).
  // 본인 글이면 *.own, 남의 글이면 *.any 능력이 필요.
  const isOwn = entry.createdByUserId === ctx.user.id
  const canEdit = ctx.capabilities.includes(isOwn ? 'record.edit.own' : 'record.edit.any')
  const canDelete = ctx.capabilities.includes(isOwn ? 'record.delete.own' : 'record.delete.any')

  if (sp.edit === '1') {
    if (!canEdit) redirect(`/story/${publicNo}`)
    const existingAssets = entry.assets.flatMap((ea) =>
      ea.asset ? [{ id: ea.asset.id, kind: ea.asset.kind, urls: ea.asset.urls }] : [],
    )
    return (
      <>
        <header className="sticky top-0 z-30 border-b border-base-200/60 bg-base-50/80 backdrop-blur-xl dark:border-base-800/60 dark:bg-base-950/70">
          <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-5">
            <Link
              href={`/story/${publicNo}`}
              className="text-[15px] font-medium text-base-600 transition-colors hover:text-base-900 dark:text-base-300 dark:hover:text-base-50"
            >
              취소
            </Link>
            <span className="text-[15px] font-semibold text-base-900 dark:text-base-50">
              스토리 편집
            </span>
            <span className="w-12" aria-hidden />
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-5 py-4">
          <StoryEditForm
            entryId={uuid}
            defaultBody={entry.body}
            existingAssets={existingAssets}
            canUpload={ctx.capabilities.includes('asset.upload')}
          />
        </div>
      </>
    )
  }

  const features = await getFeatureFlags(prismaPublic)
  const bookmark = features.bookmarks
    ? await prismaPublic.storyBookmark.findFirst({
        where: { entryId: uuid, userId: ctx.user.id, familyId: ctx.family.id },
      })
    : null

  return (
    <>
      <StoryDetailHeader />
      <div className="mx-auto max-w-2xl px-5 py-4">
        <StoryDetail entry={entry} />
        <div className="mt-3 flex items-center justify-end gap-1 text-[12px]">
          {features.bookmarks && (
            <StoryBookmarkButton entryId={uuid} initialBookmarked={bookmark !== null} />
          )}
          {features.albums && <StoryAlbumButton entryId={uuid} />}
          <ShareLinkButton
            path={`/story/${publicNo}`}
            showLabel
            iconSize={13}
            className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-medium text-base-500 transition-colors hover:bg-base-100 hover:text-base-800 active:scale-95 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100"
          />
          {canEdit && (
            <Link
              href={`/story/${publicNo}?edit=1`}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-medium text-base-500 transition-colors hover:bg-base-100 hover:text-base-800 active:scale-95 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100"
            >
              <Pencil size={13} strokeWidth={2.2} />
              <span>편집</span>
            </Link>
          )}
          {canDelete && <StoryDeleteButton onDelete={deleteStoryAction.bind(null, uuid)} />}
        </div>
      </div>
    </>
  )
}

function StoryDetailHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-base-50/80 backdrop-blur-xl transition-colors dark:bg-base-950/70">
      <div className="mx-auto flex h-12 max-w-2xl items-center gap-2 px-3">
        <Link
          href="/story"
          aria-label="뒤로"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-base-700 transition-colors hover:bg-base-100 active:scale-95 dark:text-base-200 dark:hover:bg-base-800"
        >
          <ChevronLeft size={20} strokeWidth={2.2} />
        </Link>
        <span className="flex-1 truncate text-[15px] font-semibold text-base-900 dark:text-base-50">
          스토리
        </span>
      </div>
    </header>
  )
}
