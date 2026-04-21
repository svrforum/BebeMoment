'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useEffect, useState } from 'react'

export default function GeneralSettingsPage() {
  const [appName, setAppName] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => setAppName(d.general?.app_name ?? 'bebe-moment'))
  }, [])

  async function save() {
    setSaving(true)
    setStatus(null)
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'general.app_name', value: appName }),
    })
    setSaving(false)
    setStatus(res.ok ? '저장됨' : '실패')
  }

  return (
    <>
      <AppHeader title="일반 설정" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <Card>
          <CardBody className="space-y-3">
            <div>
              <Label htmlFor="appName">앱 이름</Label>
              <Input id="appName" value={appName} onChange={(e) => setAppName(e.target.value)} />
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
