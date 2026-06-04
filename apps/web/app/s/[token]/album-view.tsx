import type { PublicAlbumPreview } from '@/server/share/public-album'
import { Images } from 'lucide-react'
import { ShareViewFrame, appDeepLink } from './share-frame'

export function AlbumShareView({ p, base }: { p: PublicAlbumPreview; base: string }) {
  const webUrl = `${base}/albums/${p.albumId}`
  const appHref = appDeepLink(base, `/albums/${p.albumId}`, webUrl)

  return (
    <ShareViewFrame
      familyName={p.familyName}
      meta={`앨범${p.photoCount > 0 ? ` · 사진 ${p.photoCount}장` : ''}`}
      appHref={appHref}
      webUrl={webUrl}
      appLabel="앱에서 보기"
    >
      {p.imageUrl ? (
        <div className="mt-4 overflow-hidden rounded-2xl shadow-card">
          {/* biome-ignore lint/performance/noImgElement: 공개 랜딩의 단일 signed URL — PictureImage(클라) 불필요 */}
          <img src={p.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
        </div>
      ) : (
        <div className="mt-4 flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-base-100 dark:bg-base-800">
          <Images size={36} className="text-base-300 dark:text-base-600" />
        </div>
      )}

      <p className="mt-4 text-[19px] font-bold tracking-tight text-base-900 dark:text-base-50">
        {p.name}
      </p>
      <p className="mt-1 text-[14px] text-base-500">로그인하면 앨범의 사진을 전부 볼 수 있어요</p>
    </ShareViewFrame>
  )
}
