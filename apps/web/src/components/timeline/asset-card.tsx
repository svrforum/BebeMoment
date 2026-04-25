import { cn } from '@/lib/cn'
import Link from 'next/link'

type Props = {
  id: string
  thumbUrl?: string | null | undefined
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
}

export function AssetCard({ id, thumbUrl, status, kind }: Props) {
  return (
    <Link
      href={`/detail/${id}`}
      className={cn(
        'relative block aspect-square overflow-hidden rounded-xl bg-base-100 dark:bg-base-900',
        'transition-transform ease-ios active:scale-[0.97]',
      )}
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-base-500">
          {status === 'processing' ? '처리 중…' : status}
        </div>
      )}
      {kind === 'video' && (
        <div className="absolute top-2 right-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-semibold">
          VIDEO
        </div>
      )}
    </Link>
  )
}
