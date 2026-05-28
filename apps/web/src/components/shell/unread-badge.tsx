import { cn } from '@/lib/cn'

type Props = {
  count: number
  /** Place at top-right of the relatively-positioned parent. */
  className?: string
}

/**
 * 작은 unread 배지 — 1~99 는 숫자, 100+ 는 "99+". 0 이하면 렌더 안 함.
 *
 * Toss/Apple 톤: 작고 둥글게(점-크기), tabular-nums 로 흔들림 없이, point/red
 * 가 아닌 살짝 가라앉은 red-500 — 너무 시끄럽지 않게.
 */
export function UnreadBadge({ count, className }: Props) {
  if (count <= 0) return null
  const display = count > 99 ? '99+' : String(count)
  return (
    <span
      aria-label={`새 사진 ${display}개`}
      className={cn(
        'pointer-events-none absolute -right-1.5 -top-1 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-[3px] text-[9px] font-semibold leading-none text-white tabular-nums shadow-[0_0_0_2px_var(--badge-ring,theme(colors.base.0))] dark:shadow-[0_0_0_2px_theme(colors.base.950)]',
        className,
      )}
    >
      {display}
    </span>
  )
}
