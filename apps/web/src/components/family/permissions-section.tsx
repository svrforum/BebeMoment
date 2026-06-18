'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

type GroupKey = 'upload' | 'records' | 'albums'

type Group = {
  key: GroupKey
  representative: string
  capabilities: string[]
}

const GROUPS: Group[] = [
  {
    key: 'upload',
    representative: 'asset.upload',
    capabilities: ['asset.upload', 'asset.edit.own', 'asset.delete.own'],
  },
  {
    key: 'records',
    representative: 'record.create',
    capabilities: ['record.create', 'record.edit.own', 'record.delete.own'],
  },
  {
    key: 'albums',
    representative: 'album.create',
    capabilities: [
      'album.create',
      'album.update.own',
      'album.delete.own',
      'album.asset.attach',
      'album.asset.detach',
    ],
  },
]

function deriveEnabled(caps: string[]): Record<GroupKey, boolean> {
  return GROUPS.reduce(
    (acc, g) => {
      acc[g.key] = caps.includes(g.representative)
      return acc
    },
    {} as Record<GroupKey, boolean>,
  )
}

export function PermissionsSection() {
  const t = useTranslations('family')
  const [enabled, setEnabled] = useState<Record<GroupKey, boolean>>({
    upload: false,
    records: false,
    albums: false,
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/admin/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const caps: string[] = Array.isArray(d.permissions?.family) ? d.permissions.family : []
        setEnabled(deriveEnabled(caps))
      })
  }, [])

  async function save() {
    setSaving(true)
    setStatus(null)
    const value = GROUPS.filter((g) => enabled[g.key]).flatMap((g) => g.capabilities)
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'permissions.family', value }),
    })
    setSaving(false)
    setStatus(res.ok ? t('permissions.saved') : t('permissions.failed'))
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[13px] font-semibold text-base-500">{t('permissions.heading')}</h2>
      <p className="px-1 text-[12px] text-base-500">{t('permissions.description')}</p>
      <Card>
        <CardBody className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.key} className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{t(`permissions.groups.${g.key}.label`)}</div>
                <div className="text-xs text-base-500">
                  {t(`permissions.groups.${g.key}.description`)}
                </div>
              </div>
              <Toggle
                checked={enabled[g.key]}
                disabled={saving}
                onChange={(e) => setEnabled((prev) => ({ ...prev, [g.key]: e.target.checked }))}
              />
            </div>
          ))}
        </CardBody>
      </Card>
      <div className="flex items-center gap-3 px-1">
        <Button onClick={save} disabled={saving}>
          {saving ? '...' : t('permissions.save')}
        </Button>
        {status && <span className="text-sm text-base-500">{status}</span>}
      </div>
    </section>
  )
}
