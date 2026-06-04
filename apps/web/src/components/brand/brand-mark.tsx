import { cn } from '@/lib/cn'

/**
 * Bebe Moment 앱 아이콘(하트 b). 앱 아이콘과 **동일한 PNG**(/icons/icon-192.png)를 쓴다 —
 * 인라인 SVG 는 한 페이지에 여러 인스턴스가 있으면(예: 데스크탑 히어로 + 모바일 헤더)
 * gradient/mask id 충돌로 모바일에서 빈 사각형으로 깨졌다. PNG 는 그 문제가 없다.
 * 라이트/다크 모두 블루 스퀘어클이라 테마 무관. 크기는 className.
 */
export function BrandIcon({ className }: { className?: string }) {
  return (
    // biome-ignore lint/performance/noImgElement: 작은 정적 브랜드 아이콘(최적화 불필요)
    <img
      src="/icons/icon-192.png"
      alt=""
      width={192}
      height={192}
      className={cn('block object-contain', className)}
    />
  )
}

/**
 * 아이콘 + "Bebe Moment" 워드마크 락업. 로그인/가입 등 브랜드 노출 지점에서 사용.
 * Bebe = 본문색(다크모드 대응), Moment = 포인트 블루.
 */
export function BrandLockup({
  className,
  iconClassName = 'h-9 w-9',
  textClassName = 'text-[17px]',
}: {
  className?: string
  iconClassName?: string
  textClassName?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandIcon className={cn('shrink-0', iconClassName)} />
      <span className={cn('font-bold tracking-tight', textClassName)}>
        <span className="text-base-900 dark:text-base-50">Bebe</span>
        <span className="text-point-500"> Moment</span>
      </span>
    </div>
  )
}
