'use client'
import { cn } from '@/lib/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ImagePlus, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useUploadManager } from './upload-manager'

type Props = {
  onClick: () => void
}

export function UploadStatusPill({ onClick }: Props) {
  const { files, totalActive, uploadingCount, processingCount } = useUploadManager()

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
    const overallPct =
      totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0

    if (uploadingCount > 0) {
      return {
        percent: overallPct,
        label: `${uploadingCount}개 업로드 중 · ${overallPct}%`,
      }
    }
    return { percent: 100, label: `${processingCount}개 처리 중…` }
  }, [files, totalActive, uploadingCount, processingCount])

  // After a batch completes (totalActive transitions to 0), keep the pill
  // visible for ~1.4s in "완료" state so the user gets confirmation.
  const [recentlyDone, setRecentlyDone] = useState(false)
  useEffect(() => {
    if (totalActive === 0 && files.length > 0) {
      setRecentlyDone(true)
      const t = setTimeout(() => setRecentlyDone(false), 1400)
      return () => clearTimeout(t)
    }
    if (files.length > 0) setRecentlyDone(false)
  }, [totalActive, files.length])

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
          aria-label="업로드 상태"
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
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 28 28" aria-hidden>
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
          <span className="truncate">
            {completed ? '업로드 완료' : label}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
