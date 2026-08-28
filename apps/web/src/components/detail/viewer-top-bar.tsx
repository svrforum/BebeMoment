'use client'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { Download, MoreVertical, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export function ViewerTopBar({
  assetId,
  visible,
  showDownload = true,
  onDelete,
  onInfo,
  inWidget = false,
}: {
  assetId: string
  visible: boolean
  /** 상단 다운로드 아이콘 노출. 액션바에 다운로드가 이미 있는(앨범 권한 없는) 사용자는
   *  중복이라 숨긴다 — 앨범 권한자(관리자)만 상단 다운로드를 본다. */
  showDownload?: boolean
  onDelete?: () => void
  /** ⋮ "정보" — 세부정보(메타·태그) 시트를 펼친 채로 연다. 모바일 전용(데스크탑은 사이드 패널). */
  onInfo?: () => void
  /** ⋮ "홈 위젯에 담기" — 이 사진을 위젯 컬렉션에 넣고 뺀다. */
  inWidget?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [widgetOn, setWidgetOn] = useState(inWidget)
  const [widgetBusy, setWidgetBusy] = useState(false)
  const router = useRouter()
  const toast = useToast()
  const t = useTranslations('viewer')

  // 톱바는 사진을 넘겨도 remount 되지 않는다(깜빡임 방지) — 새 사진의 서버 상태로 맞춘다.
  // assetId 는 본문에서 안 읽지만 의도적 트리거: 낙관적 토글로 벌어진 로컬 state 를
  // 사진이 바뀌는 순간 서버 값으로 되돌린다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: assetId 는 위 사유로 의도적 트리거.
  useEffect(() => {
    setWidgetOn(inWidget)
  }, [assetId, inWidget])

  async function toggleWidget() {
    if (widgetBusy) return
    setWidgetBusy(true)
    setMenuOpen(false)
    const next = !widgetOn
    setWidgetOn(next) // 낙관적 — 실패하면 아래에서 되돌린다.
    try {
      const res = await fetch(`/api/asset/${assetId}/widget`, { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? t('actions.widgetFailed'))
      }
      const { inWidget: now } = (await res.json()) as { inWidget: boolean }
      setWidgetOn(now)
      toast({ title: now ? t('actions.widgetAdded') : t('actions.widgetRemoved') })
    } catch (e) {
      setWidgetOn(!next)
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setWidgetBusy(false)
    }
  }

  function close() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/timeline')
    }
  }

  return (
    <div
      className={cn(
        'absolute inset-x-0 top-0 z-40 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3 transition-opacity',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <button
        type="button"
        onClick={close}
        aria-label={t('actions.close')}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition active:scale-90 hover:bg-white/10"
      >
        <X className="h-6 w-6" />
      </button>
      <div className="flex items-center gap-1">
        {showDownload && (
          <a
            href={`/api/asset/${assetId}/download?q=original`}
            download
            aria-label={t('actions.download')}
            onClick={() => toast({ title: t('actions.savingPhoto') })}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition active:scale-90 hover:bg-white/10"
          >
            <Download className="h-6 w-6" />
          </a>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t('actions.menu')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition active:scale-90 hover:bg-white/10"
          >
            <MoreVertical className="h-6 w-6" />
          </button>
          {menuOpen && (
            <>
              {/* 바깥을 누르면 닫힌다 — 없으면 메뉴가 열린 채로 남아 사진을 가린다. */}
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-[1] cursor-default"
              />
              <div className="absolute right-0 top-full z-[2] mt-2 w-44 overflow-hidden rounded-xl border border-base-200 bg-base-0 shadow-lg dark:border-base-800 dark:bg-base-900">
                <button
                  type="button"
                  onClick={toggleWidget}
                  disabled={widgetBusy}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-base-100 disabled:opacity-50 dark:hover:bg-base-800"
                >
                  {widgetOn ? t('actions.widgetRemove') : t('actions.widgetAdd')}
                </button>
                {onInfo && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onInfo()
                    }}
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-base-100 md:hidden dark:hover:bg-base-800"
                  >
                    {t('actions.info')}
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onDelete()
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-base-100 dark:hover:bg-base-800"
                  >
                    {t('actions.moveToTrash')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
