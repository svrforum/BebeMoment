'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { cn } from '@/lib/cn'
import type { AssetUrls } from '@bebe/media-client'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { type CSSProperties, type MouseEvent, useRef } from 'react'

type Props = {
  id: string
  urls: AssetUrls | null
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
  /** When non-null, the card renders in selectable mode — tap toggles
   *  selection instead of navigating to detail. */
  selectionMode?: boolean
  selected?: boolean
  onLongPress?: (id: string) => void
  onTapInSelection?: (id: string) => void
}

const STATUS_KO: Record<Props['status'], string> = {
  uploading: '올리는 중',
  processing: '처리 중',
  ready: '준비 중',
  failed: '업로드 실패',
}

const LONG_PRESS_MS = 450

export function AssetCard({
  id,
  urls,
  status,
  kind,
  selectionMode = false,
  selected = false,
  onLongPress,
  onTapInSelection,
}: Props) {
  const trio = pickThumbTrio(urls)
  const fallbackUrl = pickThumbUrl(urls)
  const blurhash = pickBlurhash(urls)
  const hasImage = trio !== null || fallbackUrl !== null

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)

  const startPress = () => {
    longFired.current = false
    pressTimer.current = setTimeout(() => {
      longFired.current = true
      onLongPress?.(id)
    }, LONG_PRESS_MS)
  }
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const handleNavClick = (e: MouseEvent) => {
    // While in selection mode the Link is not rendered — this only fires
    // when not selecting. But if a long-press just fired, swallow the
    // imminent click so we don't navigate to detail right after entering
    // selection mode.
    if (longFired.current) {
      e.preventDefault()
      e.stopPropagation()
      longFired.current = false
    }
  }

  const inner = (
    <>
      {hasImage ? (
        <PictureImage
          trio={trio}
          fallbackUrl={fallbackUrl}
          alt=""
          aspectRatio={urls?.aspectRatio ?? null}
          dominantColor={urls?.dominantColor ?? null}
          blurhash={blurhash}
          className="h-full w-full"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-base-500">
          {STATUS_KO[status]}
        </div>
      )}
      {kind === 'video' && (
        <div className="absolute right-2 top-2 z-20 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          VIDEO
        </div>
      )}
      {selectionMode && (
        <>
          <div
            className={cn(
              // z-10 so the overlay sits above the <img> / <video> poster
              // (PictureImage gives the inner img z-index:1).
              'pointer-events-none absolute inset-0 z-10 box-border transition-all ease-ios',
              selected
                ? 'bg-point-500/15 ring-[3px] ring-point-500'
                : 'bg-black/10 ring-[3px] ring-transparent',
            )}
          />
          <div
            className={cn(
              'absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full shadow-md transition-all ease-ios',
              selected
                ? 'scale-100 bg-point-500 text-white'
                : 'scale-90 bg-base-0/90 text-base-400 dark:bg-base-900/90',
            )}
          >
            <Check size={16} strokeWidth={3} />
          </div>
        </>
      )}
    </>
  )

  const baseClass = cn(
    'relative block aspect-square overflow-hidden rounded-xl bg-base-100 dark:bg-base-900',
    'transition-transform ease-ios active:scale-[0.97]',
    selected && 'scale-[0.95]',
  )
  const styleProp = { viewTransitionName: `asset-${id}` } as CSSProperties

  if (selectionMode) {
    return (
      <button
        type="button"
        onClick={() => onTapInSelection?.(id)}
        onTouchStart={startPress}
        onTouchEnd={cancelPress}
        onTouchMove={cancelPress}
        onMouseDown={startPress}
        onMouseUp={cancelPress}
        onMouseLeave={cancelPress}
        className={cn(baseClass, 'w-full text-left')}
        style={styleProp}
      >
        {inner}
      </button>
    )
  }

  return (
    <Link
      href={`/detail/${id}`}
      onClick={handleNavClick}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      className={baseClass}
      style={styleProp}
    >
      {inner}
    </Link>
  )
}
