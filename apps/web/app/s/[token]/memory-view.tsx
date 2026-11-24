import type { MemoryPreview } from '@/server/share/memory-preview'
import { PhotoTiles, SaveFooter } from './photo-set-view'
import { ShareHeader, ShareShell } from './share-frame'

/**
 * 추억 링크의 공개 뷰 — 스토리마다 그 사진들과 글, 이어서 어느 스토리에도 안 담긴 사진. 사진은
 * 링크에 담긴 것 전부가 보인다('이 날 공유'처럼 잠그지 않는다). 저장은 사진 묶음 공유와 같다.
 */
export function MemoryShareView({
  p,
  meta,
  canDownload,
  loginHref,
}: {
  p: MemoryPreview
  meta: string
  canDownload: boolean
  loginHref: string
}) {
  return (
    <ShareShell>
      <ShareHeader familyName={p.photos.familyName} meta={meta} />

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

      <SaveFooter
        total={p.photos.total}
        canDownload={canDownload}
        downloadIds={p.photos.ids}
        loginHref={loginHref}
      />
    </ShareShell>
  )
}
