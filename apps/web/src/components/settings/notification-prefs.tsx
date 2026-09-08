'use client'
import { setNotificationPref } from '@/(app)/settings/notifications/actions'
import { actionErrorText } from '@/lib/action-result'
import { useToast } from '@/lib/toast'
import type { NotificationCategory } from '@bebe/core'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { Toggle } from '../ui/toggle'

// 라벨은 관리자 화면의 카테고리 이름과 같은 카탈로그 키를 쓴다(같은 항목, 같은 이름).
const CATEGORY_LABEL_KEYS: { category: NotificationCategory; key: string }[] = [
  { category: 'asset_upload', key: 'assetUpload' },
  { category: 'comment_mention', key: 'commentMention' },
  { category: 'album_add', key: 'albumAdd' },
  { category: 'diary_growth_milestone', key: 'diaryGrowthMilestone' },
  { category: 'memory', key: 'memory' },
]

type Props = {
  initial: Record<NotificationCategory, boolean>
}

export function NotificationPrefs({ initial }: Props): React.JSX.Element {
  const [prefs, setPrefs] = useState<Record<NotificationCategory, boolean>>(initial)
  const [, startTransition] = useTransition()
  const toast = useToast()
  const tCategory = useTranslations('admin.notifications.category')
  const tRoot = useTranslations()

  function onToggle(category: NotificationCategory): void {
    const next = !prefs[category]
    const prev = prefs[category]
    setPrefs((p) => ({ ...p, [category]: next }))
    startTransition(async () => {
      const r = await setNotificationPref(category, next)
      if (r.ok) return
      setPrefs((p) => ({ ...p, [category]: prev }))
      toast({ title: actionErrorText(tRoot, r), variant: 'danger' })
    })
  }

  return (
    <div className="divide-y divide-base-100 dark:divide-base-800">
      {CATEGORY_LABEL_KEYS.map(({ category, key }) => {
        const label = tCategory(key)
        return (
          <div key={category} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="flex-1 text-[15px] text-base-900 dark:text-base-50">{label}</span>
            <Toggle
              checked={prefs[category]}
              onChange={() => onToggle(category)}
              aria-label={label}
            />
          </div>
        )
      })}
    </div>
  )
}
