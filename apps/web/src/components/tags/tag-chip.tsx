'use client'
import { cn } from '@/lib/cn'
import { X } from 'lucide-react'
import Link from 'next/link'

type Props = {
  name: string
  slug?: string
  color?: string | null
  size?: 'sm' | 'md'
  /** Render as a link to the timeline filter for this tag. */
  href?: string
  /** Show an × that calls onRemove. Mutually exclusive with `href`. */
  onRemove?: () => void
  className?: string
}

export function TagChip({ name, color, size = 'md', href, onRemove, className }: Props) {
  const sizeClasses =
    size === 'sm'
      ? 'h-6 px-2.5 text-[11px]'
      : 'h-7 px-3 text-[12px]'

  const colorStyle = color
    ? {
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
      }
    : undefined

  const base = cn(
    'inline-flex items-center gap-1 rounded-full font-medium transition-transform ease-ios active:scale-95',
    sizeClasses,
    !color &&
      'bg-point-500/12 text-point-500 hover:bg-point-500/20 dark:bg-point-500/15',
    className,
  )

  const inner = (
    <>
      <span className="truncate max-w-[160px]">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`${name} 제거`}
          className="-mr-1 flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
        >
          <X size={12} strokeWidth={2.4} />
        </button>
      )}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={base} style={colorStyle}>
        {inner}
      </Link>
    )
  }
  return (
    <span className={base} style={colorStyle}>
      {inner}
    </span>
  )
}
