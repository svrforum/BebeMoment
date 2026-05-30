import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { MemoryGroup } from '@/server/memories/list'
import { ChevronRight, Sparkles } from 'lucide-react'
import Link from 'next/link'

/** 타임라인 최상단 "오늘 추억" 카드. 대표 간격 하나(보통 가장 먼 과거)를 미리 보여준다. */
export function MemoriesCard({ group }: { group: MemoryGroup }) {
  const thumbs = group.assets.slice(0, 4)
  return (
    <Link
      href="/memories"
      className="group block rounded-2xl border border-point-500/20 bg-point-500/5 p-3 transition-colors hover:bg-point-500/10 dark:border-point-500/25"
    >
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-[18px] w-[18px] flex-shrink-0 text-point-500" strokeWidth={2} />
        <span className="text-[14px] font-semibold tracking-tight text-base-900 dark:text-base-50">
          {group.label}
        </span>
        <span className="ml-auto flex items-center gap-0.5 text-[12px] font-medium text-point-600 dark:text-point-300">
          추억 보기
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      {thumbs.length > 0 ? (
        <div className="flex gap-1">
          {thumbs.map((a) => (
            <div key={a.id} className="aspect-square min-w-0 flex-1 overflow-hidden rounded-lg">
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
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-base-500">그날의 스토리를 다시 만나보세요</p>
      )}
    </Link>
  )
}
