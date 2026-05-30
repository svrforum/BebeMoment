'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { useEffect, useState } from 'react'

// 일반 가족 구성원에게 숨길 수 있는 메뉴. 타임라인·캘린더는 핵심이라 항상 노출.
const MENUS: { key: string; label: string }[] = [
  { key: 'story', label: '스토리' },
  { key: 'albums', label: '앨범' },
]

export function FamilyNavSection() {
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
            일반 가족에게 보일 메뉴
          </h3>
          <p className="mt-1 text-[13px] text-base-500">
            끄면 일반 가족 구성원의 메뉴(하단 탭·사이드바)에서 숨겨져요. 타임라인·캘린더는 항상
            보여요.
          </p>
        </div>
        <div className="divide-y divide-base-100 dark:divide-base-800">
          {MENUS.map((m) => (
            <div key={m.key} className="flex items-center justify-between py-3">
              <span className="text-[15px] text-base-900 dark:text-base-50">{m.label}</span>
              <Toggle checked={!hidden.has(m.key)} onChange={() => toggle(m.key)} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
          {savedMsg && <span className="text-[13px] text-point-600">저장됐어요</span>}
        </div>
      </CardBody>
    </Card>
  )
}
