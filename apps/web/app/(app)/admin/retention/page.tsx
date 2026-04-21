'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useEffect, useState } from 'react'

export default function RetentionSettingsPage() {
  const [days, setDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => setDays(Number(d.retention?.trash_days ?? 30)))
  }, [])

  async function save() {
    setSaving(true)
    setStatus(null)
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'retention.trash_days', value: Number(days) }),
    })
    setSaving(false)
    setStatus(res.ok ? '저장됨' : '실패')
  }

  return (
    <>
      <AppHeader title="리텐션" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <Card>
          <CardBody className="space-y-3">
            <div>
              <Label htmlFor="days">휴지통 자동 삭제 (일)</Label>
              <Input
                id="days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
              <p className="text-xs text-base-500 mt-2">
                휴지통의 에셋이 이 기간 이후 영구 삭제됩니다 (정기 작업으로 실행됨).
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
