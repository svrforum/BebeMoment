'use client'
import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

/**
 * 여러 사진을 한 번에 저장. ZIP 대신 개별 다운로드를 순차 트리거 — 휴대폰 갤러리에
 * 곧바로 들어가(압축 해제 불필요), 앱의 DownloadListener 가 각각 처리한다. 원본 화질
 * (EXIF 제거됨)로 받는다.
 *
 * 한 장씩 간격을 두고 거는 이유는 브라우저·WebView 가 연속 다운로드를 묶어서 떨구기
 * 때문이다. 그래서 마지막 장이 걸릴 때까지 이 페이지가 살아 있어야 한다 — 화면 전환은
 * 이 루프를 멈추지 않지만(리액트 언마운트와 무관한 async 함수다) 새로고침·앱 종료는
 * 아직 안 걸린 나머지를 통째로 날린다. 그래서 ⓐ 몇 장째인지 보여주고 ⓑ 진행 중 이탈을
 * 막는다.
 */
export function BulkDownloadButton({
  assetIds,
  label: labelProp,
  className,
}: {
  assetIds: string[]
  // 빈 문자열이면 아이콘 전용(좁은 멀티셀렉트 바에서 텍스트 줄바꿈 방지).
  label?: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const t = useTranslations('social')
  const label = labelProp ?? t('download.saveAll')

  // ⚠️ 앱(Capacitor WebView)에서는 이 경고가 뜨지 않는다 — BridgeWebChromeClient 가
  // onJsBeforeUnload 를 구현하지 않아 WebView 가 그냥 진행시킨다. 브라우저·PWA 전용
  // 안전망이고, 앱에서 남은 보호막은 "화면을 옮겨도 루프는 계속 돈다"는 성질이다.
  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  async function downloadAll() {
    if (busy || assetIds.length === 0) return
    setBusy(true)
    setDone(0)
    try {
      for (const [i, id] of assetIds.entries()) {
        const a = document.createElement('a')
        a.href = `/api/asset/${id}/download?q=auto`
        a.download = ''
        document.body.appendChild(a)
        a.click()
        a.remove()
        setDone(i + 1)
        await new Promise((r) => setTimeout(r, 450))
      }
    } finally {
      setBusy(false)
    }
  }

  if (assetIds.length === 0) return null

  return (
    <button
      type="button"
      onClick={downloadAll}
      disabled={busy}
      aria-label={label || t('download.save')}
      aria-live="polite"
      className={
        className ??
        'inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium text-base-500 transition-colors hover:bg-base-100 hover:text-base-800 active:scale-95 disabled:opacity-60 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100'
      }
    >
      <Download size={label ? 13 : 18} strokeWidth={2.2} />
      {label ? (
        <span className="whitespace-nowrap">
          {busy ? t('download.savingProgress', { done, total: assetIds.length }) : label}
        </span>
      ) : busy ? (
        <span className="tabular-nums">
          {done}/{assetIds.length}
        </span>
      ) : null}
    </button>
  )
}
