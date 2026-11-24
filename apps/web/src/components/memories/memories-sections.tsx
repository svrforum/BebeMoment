import { formatMemoryInterval } from '@/i18n/labels'
import { StoryCard, storyCardDataFromEntry } from '@/components/story/story-card'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { MemoryGroup } from '@/server/memories/list'
import { memoryShareIds } from '@/server/memories/share-ids'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { MemoryShareButton } from './memory-share-button'

export async function MemoriesSections({
  groups,
  secretAssetIds,
}: {
  groups: MemoryGroup[]
  /** 공유 링크를 만들 수 있는 사람에게만 — 링크에 담지 않을 비밀 스토리 사진. null 이면 버튼이 없다. */
  secretAssetIds: ReadonlySet<string> | null
}) {
  const t = await getTranslations('memories')
  return (
    <div className="space-y-7">
      {groups.map((g) => {
        const label = formatMemoryInterval(g.interval, t)
        return (
          <section key={`${g.interval.kind}-${g.interval.n}`}>
            <div className="mb-2.5 flex items-center gap-2 px-1">
              <h2 className="flex min-w-0 items-center gap-2">
                <span className="text-[15px] font-bold tracking-tight text-base-900 dark:text-base-50">
                  {label}
                </span>
                <span className="text-[12px] tabular-nums text-base-400">
                  {[
                    g.assets.length > 0 ? t('photoCount', { n: g.assets.length }) : null,
                    g.stories.length > 0 ? t('storyCount', { n: g.stories.length }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </h2>
              {secretAssetIds && (
                <MemoryShareButton
                  assetIds={memoryShareIds(g.assets, secretAssetIds)}
                  label={label}
                />
              )}
            </div>

            {g.assets.length > 0 && (
              <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl">
                {g.assets.map((a) => (
                  <Link
                    key={a.id}
                    href={`/detail/${a.publicNo}?ctx=memories`}
                    className="block aspect-square"
                  >
                    <PictureImage
                      assetId={a.id}
                      trio={pickThumbTrio(a.urls)}
                      fallbackUrl={pickThumbUrl(a.urls)}
                      alt=""
                      dominantColor={a.urls?.dominantColor ?? null}
                      blurhash={pickBlurhash(a.urls)}
                      aspectRatio={1}
                      className="aspect-square w-full"
                      objectFit="cover"
                    />
                  </Link>
                ))}
              </div>
            )}

            {g.stories.length > 0 && (
              <ul className="mt-3 space-y-3">
                {g.stories.map((s) => (
                  <li key={s.id}>
                    <StoryCard data={storyCardDataFromEntry(s)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
