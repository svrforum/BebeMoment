'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAGS,
  FEATURE_FLAG_LABELS,
  type FeatureFlag,
  type FeatureFlags,
} from '@bebe/core'
import { useEffect, useState } from 'react'

export default function FeaturesAdminPage() {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.features) setFlags({ ...DEFAULT_FEATURE_FLAGS, ...d.features })
      })
  }, [])

  async function save() {
    setSaving(true)
    setStatus(null)
    const results = await Promise.all(
      FEATURE_FLAGS.map((k) =>
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: `features.${k}`, value: flags[k] }),
        }),
      ),
    )
    setSaving(false)
    setStatus(results.every((r) => r.ok) ? '저장됨' : '실패')
  }

  function toggle(k: FeatureFlag, v: boolean) {
    setFlags((prev) => ({ ...prev, [k]: v }))
  }

  return (
    <>
      <AppHeader title="기능" subtitle="기능별 사용 여부" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <p className="px-2 text-sm text-base-500">
          끄면 해당 기능이 모든 사용자에게 숨겨지고 동작하지 않아요.
        </p>
        <Card>
          <CardBody className="space-y-4">
            {FEATURE_FLAGS.map((k) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{FEATURE_FLAG_LABELS[k].label}</div>
                  <div className="text-xs text-base-500">{FEATURE_FLAG_LABELS[k].description}</div>
                </div>
                <Toggle
                  checked={flags[k]}
                  disabled={saving}
                  onChange={(e) => toggle(k, e.target.checked)}
                />
              </div>
            ))}
          </CardBody>
        </Card>
        {status && <p className="px-2 text-sm text-base-500">{status}</p>}
        <Button onClick={save} disabled={saving}>
          {saving ? '...' : '저장'}
        </Button>
      </div>
    </>
  )
}
