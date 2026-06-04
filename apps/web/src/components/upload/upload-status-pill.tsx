'use client'
import { cn } from '@/lib/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ImagePlus, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { useUploadManager } from './upload-manager'

type Props = {
  onClick: () => void
}

export function UploadStatusPill({ onClick }: Props) {
  const { files, totalActive, uploadingCount, processingCount } = useUploadManager()
  const t = useTranslations('upload')

  // Compute aggregate progress across in-flight uploads (bytes-weighted).
  const { percent, label } = useMemo(() => {
    if (totalActive === 0) {
      return { percent: 100, label: '' }
    }

    let totalBytes = 0
    let uploadedBytes = 0
    for (const f of files) {
      const size = f.size ?? 0
      const pct = (f.progress?.percentage ?? 0) / 100
      totalBytes += size
      uploadedBytes += size * pct
    }
    const overallPct = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0

    if (uploadingCount > 0) {
      return {
        percent: overallPct,
        label: t('status.uploading', { n: uploadingCount, pct: overallPct }),
      }
    }
    return { percent: 100, label: t('status.processing', { n: processingCount }) }
  }, [files, totalActive, uploadingCount, processingCount, t])

  // After a batch completes (totalActive transitions to 0), keep the pill
  // visible for ~1.4s in "완료" state so the user gets confirmation.
  const [recentlyDone, setRecentlyDone] = useState(false)

  // Arm "완료" when a batch settles; disarm when a new upload starts. We must
  // NOT key the auto-hide timer off `files.length` — the UploadManager calls
  // uppy.cancelAll() ~700ms after completion, which empties `files` and would
  // otherwise re-run this effect and clear the 1.4s timer before it fires,
  // leaving the pill stuck on "업로드 완료" forever.
  useEffect(() => {
    if (totalActive === 0 && files.length > 0) setRecentlyDone(true)
    else if (totalActive > 0) setRecentlyDone(false)
  }, [totalActive, files.length])

  // Independent auto-hide: once armed, hide after 1.4s regardless of whether
  // `files` has since been cleared.
  useEffect(() => {
    if (!recentlyDone) return
    const t = setTimeout(() => setRecentlyDone(false), 1400)
    return () => clearTimeout(t)
  }, [recentlyDone])

  const visible = totalActive > 0 || recentlyDone
  const completed = recentlyDone && totalActive === 0

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={onClick}
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 480, damping: 28 }}
          aria-label={t('status.aria')}
          className={cn(
            'fixed bottom-36 right-4 z-30 flex items-center gap-2.5 overflow-hidden rounded-full pl-3 pr-4 py-2.5 text-[13px] font-medium shadow-elevated ring-1 backdrop-blur-xl md:bottom-24',
            completed
              ? 'bg-success/95 text-white ring-success/40'
              : 'bg-base-0/95 text-base-900 ring-base-200 dark:bg-base-900/95 dark:text-base-50 dark:ring-base-700',
          )}
        >
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
            {completed ? (
              <Check className="h-4 w-4" strokeWidth={2.6} />
            ) : uploadingCount > 0 ? (
              <>
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 28 28" aria-hidden="true">
                  <circle
                    cx="14"
                    cy="14"
                    r="11"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.18"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="14"
                    cy="14"
                    r="11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={`${(percent / 100) * 69.115} 69.115`}
                    className="text-point-500 transition-[stroke-dasharray] duration-200"
                  />
                </svg>
                <ImagePlus className="h-3.5 w-3.5 text-point-500" strokeWidth={2.4} />
              </>
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-point-500" strokeWidth={2.4} />
            )}
          </span>
          <span className="truncate">{completed ? t('status.done') : label}</span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
