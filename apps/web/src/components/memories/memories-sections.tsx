import { StoryCard, storyCardDataFromEntry } from '@/components/story/story-card'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { MemoryGroup } from '@/server/memories/list'
import Link from 'next/link'

export function MemoriesSections({ groups }: { groups: MemoryGroup[] }) {
  return (
    <div className="space-y-7">
      {groups.map((g) => (
        <section key={`${g.interval.kind}-${g.interval.n}`}>
          <h2 className="mb-2.5 flex items-center gap-2 px-1">
            <span className="text-[15px] font-bold tracking-tight text-base-900 dark:text-base-50">
              {g.label}
            </span>
            <span className="text-[12px] tabular-nums text-base-400">
              {[
                g.assets.length > 0 ? `사진 ${g.assets.length}` : null,
                g.stories.length > 0 ? `스토리 ${g.stories.length}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </h2>

          {g.assets.length > 0 && (
            <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl">
              {g.assets.map((a) => (
                <Link key={a.id} href={`/detail/${a.publicNo}`} className="block aspect-square">
                  <PictureImage
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
      ))}
    </div>
  )
}
