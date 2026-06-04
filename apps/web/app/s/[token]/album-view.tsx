import type { PublicAlbumPreview } from '@/server/share/public-album'
import { Images } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ShareViewFrame, appDeepLink } from './share-frame'

export async function AlbumShareView({ p, base }: { p: PublicAlbumPreview; base: string }) {
  const t = await getTranslations('share')
  const webUrl = `${base}/albums/${p.albumId}`
  const appHref = appDeepLink(base, `/albums/${p.albumId}`, webUrl)

  return (
    <ShareViewFrame
      familyName={p.familyName}
      meta={p.photoCount > 0 ? t('album.metaWithCount', { n: p.photoCount }) : t('album.meta')}
      appHref={appHref}
      webUrl={webUrl}
      appLabel={t('album.appView')}
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
      <p className="mt-1 text-[14px] text-base-500">{t('album.loginToView')}</p>
    </ShareViewFrame>
  )
}
