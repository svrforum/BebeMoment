'use client'
import { useFeatures } from '@/lib/features'
import { useToast } from '@/lib/toast'
import { Download, FolderPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { BookmarkButton } from './bookmark-button'
import type { CommentWithAuthor } from './comment-item'
import { CommentList } from './comment-list'
import { LikeButton } from './like-button'
import { LikerAvatars } from './liker-avatars'
import { MetadataEditor } from './metadata-editor'
import { MetadataSection } from './metadata-section'

type Member = { id: string; displayName: string }
type User = { id: string; displayName: string; avatarPath: string | null }

type MetaProps = React.ComponentProps<typeof MetadataSection>

export function ViewerInfoPanel({
  assetId,
  currentUserId,
  canDeleteAny,
  familyMembers,
  meta,
  likers,
  liked,
  setLiked,
  count,
  setCount,
  bookmarked,
  setBookmarked,
  commentCount,
  onCommentCountChange,
  initialComments,
  initialFilename,
  initialCaption,
  canAlbum,
  onAlbumTap,
}: {
  assetId: string
  currentUserId: string
  canDeleteAny: boolean
  familyMembers: Member[]
  meta: MetaProps
  likers: { count: number; users: User[] }
  liked: boolean
  setLiked: (next: boolean) => void
  count: number
  setCount: (next: number) => void
  bookmarked: boolean
  setBookmarked: (next: boolean) => void
  commentCount: number
  onCommentCountChange: (count: number) => void
  initialComments: CommentWithAuthor[]
  initialFilename: string
  initialCaption: string | null
  canAlbum: boolean
  onAlbumTap: () => void
}) {
  const toast = useToast()
  const features = useFeatures()
  const t = useTranslations('viewer')
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-base-200/70 bg-base-0/85 px-5 py-3.5 backdrop-blur-xl dark:border-base-800/70 dark:bg-base-900/85">
        <h2 className="text-[15px] font-semibold tracking-tight text-base-900 dark:text-base-50">
          {t('info.details')}
        </h2>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5">
        {/* MetadataEditor 는 initial* 를 useState 시드로만 쓰고 prop 변경에 동기화하지
            않는다 → 패널 자체가 더 이상 remount 되지 않으므로 assetId 키로 이 컴포넌트만
            remount 해 새 사진의 메타데이터로 fresh 마운트. */}
        <MetadataEditor
          key={assetId}
          assetId={assetId}
          initialFilename={initialFilename}
          initialCaption={initialCaption}
          initialTakenAtISO={meta.takenAt.toISOString()}
          initialTakenAtSource={meta.takenAtSource}
        />
        <MetadataSection {...meta} />
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <LikeButton assetId={assetId} controlled={{ liked, setLiked, count, setCount }} />
            <BookmarkButton assetId={assetId} controlled={{ bookmarked, setBookmarked }} />
            {canAlbum ? (
              <button
                type="button"
                onClick={onAlbumTap}
                aria-label={t('actions.addToAlbum')}
                className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-base-500 transition-colors hover:bg-base-100 hover:text-base-900 dark:hover:bg-base-800 dark:hover:text-base-100"
              >
                <FolderPlus size={18} strokeWidth={2} />
              </button>
            ) : (
              <a
                href={`/api/asset/${assetId}/download?q=original`}
                download
                aria-label={t('actions.downloadOriginal')}
                onClick={() => toast({ title: t('actions.savingPhoto') })}
                className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-base-500 transition-colors hover:bg-base-100 hover:text-base-900 dark:hover:bg-base-800 dark:hover:text-base-100"
              >
                <Download size={18} strokeWidth={2} />
              </a>
            )}
          </div>
          <LikerAvatars users={likers.users} />
        </div>
        {features.comments && (
          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold tracking-tight text-base-500">
              {t('info.comments')}{' '}
              <span className="tabular-nums text-base-700 dark:text-base-300">{commentCount}</span>
            </h3>
            <CommentList
              assetId={assetId}
              currentUserId={currentUserId}
              canDeleteAny={canDeleteAny}
              familyMembers={familyMembers}
              initialComments={initialComments}
              onCountChange={onCommentCountChange}
            />
          </div>
        )}
      </div>
    </div>
  )
}
