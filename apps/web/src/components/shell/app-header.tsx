'use client'
import { cn } from '@/lib/cn'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useEffect, useState } from 'react'

type Props = {
  title: string
  subtitle?: string
  left?: ReactNode
  right?: ReactNode
  /** 사진 그리드 등 넓은 화면에서 데스크탑 공간을 활용하는 페이지 */
  wide?: boolean
  /** 설정 시 + 앱(WebView)일 때만 제목을 이 경로로 가는 전환 버튼(▾)으로 렌더한다.
   *  멀티 인스턴스 — 가족 이름 탭 → 네이티브 계정 전환(`/__bebe/switch`). 웹에선 평범한 제목. */
  switchHref?: string
}

/**
 * 컴팩트 좌측 워드마크 헤더(29CM 스타일). 제목은 **항상 좌측 상단에 작게 고정**되고
 * 액션은 같은 줄 우측. 스크롤하면 배경만 블러로 떠 본문과 분리된다(제목 위치·크기는 불변).
 * 과거 iOS large-title(큰 제목이 스크롤되며 사라지는) 방식은 짧은 페이지에서 높이가
 * 진동(깜빡임)하는 문제가 있어, 높이 고정 단일 바로 단순화했다.
 */
export function AppHeader({ title, subtitle, left, right, wide = false, switchHref }: Props) {
  const t = useTranslations('shell')
  const [scrolled, setScrolled] = useState(false)
  const [isApp, setIsApp] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    // 멀티 인스턴스 지원 앱만 'bebeAppMulti' 마커를 단다 — 구버전 앱(전환 가로채기 없음)에선
    // 버튼을 숨겨 /__bebe/switch 404 를 막는다.
    setIsApp(navigator.userAgent.includes('bebeAppMulti'))
  }, [])

  const showSwitch = Boolean(switchHref) && isApp
  const maxW = wide ? 'max-w-3xl lg:max-w-5xl xl:max-w-6xl' : 'max-w-3xl'

  const titleNode =
    switchHref && showSwitch ? (
      // 멀티 인스턴스 지원 앱에서만 — 가족 이름 탭 시 네이티브가 /__bebe/switch 를
      // 가로채 가족 전환. 웹은 도메인이 곧 가족이라 전환 UI 불필요 → 평범한 제목.
      <a
        href={switchHref}
        className="flex max-w-full items-center gap-1 text-left active:opacity-70"
      >
        <span className="truncate text-[22px] font-bold leading-tight tracking-tight text-base-900 dark:text-base-50">
          {title}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2.4}
          className="shrink-0 text-base-400"
          aria-label={t('switchFamily')}
        />
      </a>
    ) : (
      <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight text-base-900 dark:text-base-50">
        {title}
      </h1>
    )

  return (
    <header
      className={cn(
        'sticky top-0 z-30 transition-[background-color,backdrop-filter] ease-ios duration-200',
        scrolled
          ? 'bg-base-50/80 backdrop-blur-xl dark:bg-base-950/70'
          : 'bg-base-50/0 dark:bg-base-950/0',
      )}
      style={{ WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(180%)' : undefined }}
    >
      <div className={cn('mx-auto px-5', maxW)}>
        <div className="flex min-h-12 items-center justify-between gap-3 pb-3 pt-[calc(env(safe-area-inset-top)+35px)]">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {left && <div className="flex flex-shrink-0 items-center gap-2">{left}</div>}
            <div className="min-w-0">
              {titleNode}
              {subtitle && <p className="mt-0.5 truncate text-[13px] text-base-500">{subtitle}</p>}
            </div>
          </div>
          {right && <div className="flex flex-shrink-0 items-center gap-2">{right}</div>}
        </div>
      </div>
      <div
        className={cn(
          'pointer-events-none h-px w-full bg-base-200 transition-opacity ease-ios duration-200 dark:bg-base-800',
          scrolled ? 'opacity-100' : 'opacity-0',
        )}
      />
    </header>
  )
}
