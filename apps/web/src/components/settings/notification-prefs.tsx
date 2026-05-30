'use client'
import { setNotificationPref } from '@/(app)/settings/notifications/actions'
import { useToast } from '@/lib/toast'
import type { NotificationCategory } from '@bebe/core'
import { useState, useTransition } from 'react'
import { Toggle } from '../ui/toggle'

const CATEGORY_LABELS: { category: NotificationCategory; label: string }[] = [
  { category: 'asset_upload', label: '새 사진/영상' },
  { category: 'comment_mention', label: '댓글·멘션' },
  { category: 'album_add', label: '앨범 추가' },
  { category: 'diary_growth_milestone', label: '스토리·성장·마일스톤' },
  { category: 'memory', label: '추억' },
]

type Props = {
  initial: Record<NotificationCategory, boolean>
}

export function NotificationPrefs({ initial }: Props): React.JSX.Element {
  const [prefs, setPrefs] = useState<Record<NotificationCategory, boolean>>(initial)
  const [, startTransition] = useTransition()
  const toast = useToast()

  function onToggle(category: NotificationCategory): void {
    const next = !prefs[category]
    const prev = prefs[category]
    setPrefs((p) => ({ ...p, [category]: next }))
    startTransition(async () => {
      try {
        await setNotificationPref(category, next)
      } catch {
        setPrefs((p) => ({ ...p, [category]: prev }))
        toast({ title: '잠시 후 다시 시도해주세요', variant: 'danger' })
      }
    })
  }

  return (
    <div className="divide-y divide-base-100 dark:divide-base-800">
      {CATEGORY_LABELS.map(({ category, label }) => (
        <div key={category} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className="flex-1 text-[15px] text-base-900 dark:text-base-50">{label}</span>
          <Toggle
            checked={prefs[category]}
            onChange={() => onToggle(category)}
            aria-label={label}
          />
        </div>
      ))}
    </div>
  )
}
