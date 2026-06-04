'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

// 일반 가족 구성원에게 숨길 수 있는 메뉴. 타임라인·캘린더는 핵심이라 항상 노출.
const MENU_KEYS = ['story', 'albums'] as const

export function FamilyNavSection() {
  const t = useTranslations('family')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => {
    void fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => {
        const arr: string[] = Array.isArray(d.nav?.family?.hidden) ? d.nav.family.hidden : []
        setHidden(new Set(arr))
        setLoaded(true)
      })
  }, [])

  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setSavedMsg(false)
  }

  async function save() {
    setSaving(true)
    setSavedMsg(false)
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'nav.family.hidden', value: [...hidden] }),
    })
    setSaving(false)
    if (res.ok) setSavedMsg(true)
  }

  if (!loaded) {
    return <div className="h-24 animate-pulse rounded-2xl bg-base-100 dark:bg-base-800" />
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h3 className="text-[15px] font-semibold text-base-900 dark:text-base-50">
            {t('navMenus.heading')}
          </h3>
          <p className="mt-1 text-[13px] text-base-500">{t('navMenus.description')}</p>
        </div>
        <div className="divide-y divide-base-100 dark:divide-base-800">
          {MENU_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between py-3">
              <span className="text-[15px] text-base-900 dark:text-base-50">
                {t(`navMenus.${key}`)}
              </span>
              <Toggle checked={!hidden.has(key)} onChange={() => toggle(key)} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? t('navMenus.saving') : t('navMenus.save')}
          </Button>
          {savedMsg && <span className="text-[13px] text-point-600">{t('navMenus.saved')}</span>}
        </div>
      </CardBody>
    </Card>
  )
}
