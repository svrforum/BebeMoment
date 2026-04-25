'use client'
import { cn } from '@/lib/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, ImagePlus, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type Props = {
  onUpload: () => void
  className?: string
}

const item = {
  hidden: { opacity: 0, y: 12, scale: 0.92 },
  visible: { opacity: 1, y: 0, scale: 1 },
}

export function FAB({ onUpload, className }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-20 cursor-default bg-black/20 backdrop-blur-[2px]"
          />
        )}
      </AnimatePresence>

      <div className={cn('fixed bottom-20 right-4 z-30 md:bottom-8', className)}>
        <div className="flex flex-col items-end gap-3">
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  key="journal"
                  variants={item}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={{ type: 'spring', stiffness: 540, damping: 28, delay: 0.04 }}
                >
                  <Link
                    href="/journal/new"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-full bg-base-0 py-3 pl-4 pr-5 text-sm font-medium shadow-elevated ring-1 ring-base-200 transition-transform ease-ios active:scale-95 dark:bg-base-900 dark:ring-base-700"
                  >
                    <BookOpen className="h-4 w-4 text-point-500" strokeWidth={2.2} />
                    일기 쓰기
                  </Link>
                </motion.div>
                <motion.div
                  key="upload"
                  variants={item}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={{ type: 'spring', stiffness: 540, damping: 28 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onUpload()
                    }}
                    className="flex items-center gap-2 rounded-full bg-base-0 py-3 pl-4 pr-5 text-sm font-medium shadow-elevated ring-1 ring-base-200 transition-transform ease-ios active:scale-95 dark:bg-base-900 dark:ring-base-700"
                  >
                    <ImagePlus className="h-4 w-4 text-point-500" strokeWidth={2.2} />
                    사진 · 영상 올리기
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <motion.button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? '메뉴 닫기' : '추가'}
            aria-expanded={open}
            whileTap={{ scale: 0.92 }}
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ type: 'spring', stiffness: 480, damping: 22 }}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full bg-point-500 text-white shadow-elevated',
              'hover:bg-point-600',
            )}
          >
            {open ? (
              <X className="h-6 w-6" strokeWidth={2.5} />
            ) : (
              <Plus className="h-6 w-6" strokeWidth={2.5} />
            )}
          </motion.button>
        </div>
      </div>
    </>
  )
}
