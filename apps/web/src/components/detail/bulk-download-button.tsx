'use client'
import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

/**
 * 여러 사진을 한 번에 저장. ZIP 대신 개별 다운로드를 순차 트리거 — 휴대폰 갤러리에
 * 곧바로 들어가(압축 해제 불필요), 앱의 DownloadListener 가 각각 처리한다. 원본 화질
 * (EXIF 제거됨)로 받는다.
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
  const t = useTranslations('social')
  const label = labelProp ?? t('download.saveAll')

  async function downloadAll() {
    if (busy || assetIds.length === 0) return
    setBusy(true)
    try {
      for (const id of assetIds) {
        const a = document.createElement('a')
        a.href = `/api/asset/${id}/download?q=auto`
        a.download = ''
        document.body.appendChild(a)
        a.click()
        a.remove()
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
      className={
        className ??
        'inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium text-base-500 transition-colors hover:bg-base-100 hover:text-base-800 active:scale-95 disabled:opacity-60 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100'
      }
    >
      <Download size={label ? 13 : 18} strokeWidth={2.2} />
      {label ? (
        <span className="whitespace-nowrap">
          {busy ? t('download.saving', { count: assetIds.length }) : label}
        </span>
      ) : busy ? (
        <span className="tabular-nums">{assetIds.length}</span>
      ) : null}
    </button>
  )
}
