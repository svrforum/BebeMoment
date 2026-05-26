import { cn } from '@/lib/cn'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  icon: LucideIcon
  title: string
  description?: string
  /** Optional CTA — typically a <Button> or styled <Link>. */
  action?: ReactNode
  className?: string
}

/**
 * 공용 빈 상태 — 타임라인 / 앨범 / 일기 등에서 동일한 톤으로 사용.
 * 아이콘은 point-틴트 헤일로 + 살짝 튀어오르는 pop-in 으로 의도된 느낌을 준다.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center gap-4 px-4 py-16 text-center',
        className,
      )}
    >
      <div className="icon-halo pop-in flex h-20 w-20 items-center justify-center rounded-full">
        <Icon className="h-9 w-9 text-point-500/80" strokeWidth={1.6} />
      </div>
      <div>
        <p className="text-base font-semibold text-base-900 dark:text-base-50">{title}</p>
        {description && (
          <p className="mt-1.5 text-sm leading-relaxed text-base-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
