'use client'
import { cn } from '@/lib/cn'
import { BookOpen, ImagePlus, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type Props = {
  onUpload: () => void
  className?: string
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
    <div className={cn('fixed bottom-20 right-4 z-30 md:bottom-8', className)}>
      {open && (
        <button
          type="button"
          aria-label="닫기"
          onClick={() => setOpen(false)}
          className="fixed inset-0 -z-10 cursor-default bg-transparent"
        />
      )}
      <div className="flex flex-col items-end gap-3">
        {open && (
          <>
            <Link
              href="/journal/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-full bg-base-0 pl-4 pr-5 py-3 text-sm font-medium shadow-elevated ring-1 ring-base-200 transition-transform ease-ios active:scale-95 dark:bg-base-900 dark:ring-base-700"
            >
              <BookOpen className="h-4 w-4 text-point-500" strokeWidth={2.2} />
              일기 쓰기
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onUpload()
              }}
              className="flex items-center gap-2 rounded-full bg-base-0 pl-4 pr-5 py-3 text-sm font-medium shadow-elevated ring-1 ring-base-200 transition-transform ease-ios active:scale-95 dark:bg-base-900 dark:ring-base-700"
            >
              <ImagePlus className="h-4 w-4 text-point-500" strokeWidth={2.2} />
              사진 · 영상 올리기
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '메뉴 닫기' : '추가'}
          aria-expanded={open}
          className={cn(
            'h-14 w-14 rounded-full bg-point-500 text-white shadow-elevated',
            'flex items-center justify-center transition-transform ease-ios active:scale-95 hover:bg-point-600',
            open && 'rotate-45',
          )}
        >
          {open ? <X className="h-6 w-6" strokeWidth={2.5} /> : <Plus className="h-6 w-6" strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  )
}
