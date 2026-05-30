'use client'
import { cn } from '@/lib/cn'
import { type ReactNode, useEffect, useState } from 'react'

type Props = {
  title: string
  subtitle?: string
  left?: ReactNode
  right?: ReactNode
  /** 사진 그리드 등 넓은 화면에서 데스크탑 공간을 활용하는 페이지 */
  wide?: boolean
}

/**
 * iOS large-title 헤더. **고정 높이 sticky 컴팩트 바**(높이 불변) + **일반 흐름의 큰 제목**
 * (스크롤되며 사라짐)으로 분리한다. 과거엔 큰 제목을 sticky 바 안에서 max-height 로
 * 접었는데, sticky 요소의 높이가 스크롤 중 바뀌면 문서 높이도 바뀌어, 거의 안 스크롤되는
 * 짧은 페이지(예: 사진 몇 장)에선 맨 아래에서 compact↔펼침이 진동(깜빡임)했다. 바 높이를
 * 고정하면 그 오실레이션이 사라진다.
 */
export function AppHeader({ title, subtitle, left, right, wide = false }: Props) {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    // 큰 제목이 거의 스크롤되어 나간 시점부터 컴팩트 바 제목을 보여준다.
    const onScroll = () => setCompact(window.scrollY > 44)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const maxW = wide ? 'max-w-3xl lg:max-w-5xl' : 'max-w-3xl'

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-30 transition-[background-color,backdrop-filter] ease-ios duration-200',
          compact
            ? 'bg-base-50/80 backdrop-blur-xl dark:bg-base-950/70'
            : 'bg-base-50/0 dark:bg-base-950/0',
        )}
        style={{ WebkitBackdropFilter: compact ? 'blur(20px) saturate(180%)' : undefined }}
      >
        <div className={cn('mx-auto px-5', maxW)}>
          <div className="flex h-12 items-center justify-between gap-3">
            {left && <div className="flex flex-shrink-0 items-center gap-2">{left}</div>}
            <div
              className={cn(
                'min-w-0 flex-1 transition-opacity ease-ios duration-200',
                compact ? 'opacity-100' : 'opacity-0',
              )}
            >
              <div className="truncate text-center text-base font-semibold text-base-900 dark:text-base-50">
                {title}
              </div>
            </div>
            {/* 액션(right)은 평소엔 큰 제목 옆에 두고, 스크롤되어 컴팩트 바가 떠야
                여기로 옮겨 보인다 — 맨 위에서 상단 끝에 동떨어져 붙던 문제 해결. */}
            {right && compact && (
              <div className="flex flex-shrink-0 items-center gap-2">{right}</div>
            )}
          </div>
        </div>
        <div
          className={cn(
            'pointer-events-none h-px w-full bg-base-200 transition-opacity ease-ios duration-200 dark:bg-base-800',
            compact ? 'opacity-100' : 'opacity-0',
          )}
        />
      </header>

      {/* 큰 제목: sticky 바 아래 일반 흐름 — 스크롤되며 자연스럽게 사라진다(높이 고정 영향 없음).
          액션 버튼은 큰 제목과 같은 줄(우측)에 정렬해 깔끔하게 묶는다. */}
      <div className={cn('mx-auto px-5', maxW)}>
        <div className="flex items-end justify-between gap-3 pb-4 pt-1">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[34px] font-bold leading-tight tracking-tight text-base-900 dark:text-base-50">
              {title}
            </h1>
            {subtitle && <p className="mt-1 truncate text-[15px] text-base-500">{subtitle}</p>}
          </div>
          {right && !compact && (
            <div className="flex flex-shrink-0 items-center gap-2 pb-1">{right}</div>
          )}
        </div>
      </div>
    </>
  )
}
