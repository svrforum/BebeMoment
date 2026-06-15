'use client'
import { useTranslations } from 'next-intl'

export type UploadStatus = 'uploading' | 'processing' | 'ready' | 'failed'

/**
 * 업로드 후 처리 단계의 상태 표시(프레젠테이션 전용). 상태는 공유 family SSE 가 구동하는
 * 매니저 상태(doneIds/failedIds)에서 내려온다 — 과거엔 사진마다 별도 EventSource 를
 * 열어 배치 업로드에서 브라우저 연결 한도를 넘겨 멈췄다(이제 연결 0개).
 */
export function UploadProgressBar({ status }: { status: 'processing' | 'ready' | 'failed' }) {
  const t = useTranslations('upload')
  const danger = status === 'failed'
  return (
    <div aria-label={t('progress.aria')} className="flex items-center gap-2">
      <progress
        // processing 은 값 없는(indeterminate) 바, ready/failed 는 가득.
        {...(status === 'processing' ? {} : { value: 1 })}
        max={1}
        className="h-1 flex-1"
      />
      <span className={`text-xs ${danger ? 'text-red-500' : 'text-base-500'}`}>
        {t(`progress.${status}`)}
      </span>
    </div>
  )
}
