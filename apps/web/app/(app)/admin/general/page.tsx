'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useEffect, useState } from 'react'

type ThemeChoice = 'auto' | 'light' | 'dark'
const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'auto', label: '시스템 따름' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
]

export default function GeneralSettingsPage() {
  const [appName, setAppName] = useState('')
  const [defaultTheme, setDefaultTheme] = useState<ThemeChoice>('auto')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => {
        setAppName(d.general?.app_name ?? 'bebe-moment')
        const t = d.appearance?.default_theme
        if (t === 'auto' || t === 'light' || t === 'dark') setDefaultTheme(t)
      })
  }, [])

  async function save() {
    setSaving(true)
    setStatus(null)
    const post = (key: string, value: unknown) =>
      fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
    const results = await Promise.all([
      post('general.app_name', appName),
      post('appearance.default_theme', defaultTheme),
    ])
    setSaving(false)
    setStatus(results.every((r) => r.ok) ? '저장됨' : '실패')
  }

  return (
    <>
      <AppHeader title="일반 설정" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <Card>
          <CardBody className="space-y-4">
            <div>
              <Label htmlFor="appName">앱 이름</Label>
              <Input id="appName" value={appName} onChange={(e) => setAppName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="defaultTheme">기본 테마</Label>
              <select
                id="defaultTheme"
                value={defaultTheme}
                onChange={(e) => setDefaultTheme(e.target.value as ThemeChoice)}
                className="h-11 w-full rounded-xl border border-base-200 bg-base-0 px-4 text-base dark:border-base-800 dark:bg-base-900"
              >
                {THEME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-base-500">
                새 사용자에게 적용되는 기본값이에요. 사용자가 설정에서 직접 바꾸면 그 선택이
                우선해요.
              </p>
            </div>
            {status && <p className="text-sm text-base-500">{status}</p>}
            <Button onClick={save} disabled={saving}>
              {saving ? '...' : '저장'}
            </Button>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
