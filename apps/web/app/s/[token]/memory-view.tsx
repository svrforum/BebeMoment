import { shareInAppPath } from '@/lib/share-in-app-path'
import type { MemoryPreview } from '@/server/share/memory-preview'
import { PhotoTiles } from './photo-set-view'
import { ShareViewFrame, appDeepLink } from './share-frame'

/**
 * 추억 링크의 공개 뷰 — 스토리마다 그 사진들과 글, 이어서 어느 스토리에도 안 담긴 사진. 사진은
 * 링크에 담긴 것 전부가 보인다('이 날 공유'처럼 잠그지 않는다).
 *
 * 로그인하지 않은 사람이 보는 화면이다 — 가족으로 로그인해 있으면 페이지가 여기 오기 전에 앱의
 * 그 날 타임라인으로 보낸다. 아래 버튼도 같은 곳으로 이어진다(`shareInAppPath`).
 */
export function MemoryShareView({
  p,
  date,
  meta,
  base,
}: {
  p: MemoryPreview
  date: string
  meta: string
  base: string
}) {
  const path = shareInAppPath({ kind: 'memory', date })
  const webUrl = `${base}${path}`
  return (
    <ShareViewFrame
      familyName={p.photos.familyName}
      meta={meta}
      appHref={appDeepLink(base, path, webUrl)}
      webUrl={webUrl}
    >
      {p.stories.map((s, i) => (
        <section key={s.id} className={i === 0 ? 'mt-4' : 'mt-7'}>
          <PhotoTiles items={s.items} lazyFrom={i === 0 ? 9 : 0} />
          {s.body.trim() && (
            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-base-800 dark:text-base-200">
              {s.body}
            </p>
          )}
        </section>
      ))}

      {p.loose.length > 0 && (
        <div className={p.stories.length === 0 ? 'mt-4' : 'mt-7'}>
          <PhotoTiles items={p.loose} lazyFrom={p.stories.length === 0 ? 9 : 0} />
        </div>
      )}
    </ShareViewFrame>
  )
}
