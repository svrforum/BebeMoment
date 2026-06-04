'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import {
  DEFAULT_FACE_CLUSTER_DISTANCE,
  DEFAULT_FEATURE_FLAGS,
  FACE_CLUSTER_DISTANCE_MAX,
  FACE_CLUSTER_DISTANCE_MIN,
  FEATURE_FLAGS,
  FEATURE_FLAG_LABELS,
  type FeatureFlag,
  type FeatureFlags,
} from '@bebe/core'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

export default function FeaturesAdminPage() {
  const t = useTranslations('admin')
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS)
  const [clusterDistance, setClusterDistance] = useState<number>(DEFAULT_FACE_CLUSTER_DISTANCE)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.features) setFlags({ ...DEFAULT_FEATURE_FLAGS, ...d.features })
        if (typeof d.faces?.cluster_distance === 'number')
          setClusterDistance(d.faces.cluster_distance)
      })
  }, [])

  async function save() {
    setSaving(true)
    setStatus(null)
    const clamped = Math.min(
      FACE_CLUSTER_DISTANCE_MAX,
      Math.max(FACE_CLUSTER_DISTANCE_MIN, clusterDistance),
    )
    const results = await Promise.all([
      ...FEATURE_FLAGS.map((k) =>
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: `features.${k}`, value: flags[k] }),
        }),
      ),
      fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'faces.cluster_distance', value: clamped }),
      }),
    ])
    setSaving(false)
    setStatus(results.every((r) => r.ok) ? t('features.saved') : t('features.failed'))
  }

  function toggle(k: FeatureFlag, v: boolean) {
    setFlags((prev) => ({ ...prev, [k]: v }))
  }

  return (
    <>
      <AppHeader title={t('features.title')} subtitle={t('features.subtitle')} />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <p className="px-2 text-sm text-base-500">{t('features.intro')}</p>
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
        {flags.faces && (
          <Card>
            <CardBody className="space-y-3">
              <div>
                <div className="font-medium">{t('features.faceCluster.label')}</div>
                <div className="text-xs text-base-500">
                  {t('features.faceCluster.help', { default: DEFAULT_FACE_CLUSTER_DISTANCE })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={FACE_CLUSTER_DISTANCE_MIN}
                  max={FACE_CLUSTER_DISTANCE_MAX}
                  step={0.01}
                  value={clusterDistance}
                  disabled={saving}
                  onChange={(e) => setClusterDistance(Number(e.target.value))}
                  className="flex-1 accent-point-500"
                />
                <span className="w-12 text-right text-sm font-semibold tabular-nums">
                  {clusterDistance.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-base-400">
                <span>{t('features.faceCluster.strict')}</span>
                <span>{t('features.faceCluster.loose')}</span>
              </div>
            </CardBody>
          </Card>
        )}
        {status && <p className="px-2 text-sm text-base-500">{status}</p>}
        <Button onClick={save} disabled={saving}>
          {saving ? '...' : t('features.save')}
        </Button>
      </div>
    </>
  )
}
