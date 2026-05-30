'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { useEffect, useState } from 'react'

type GroupKey = 'upload' | 'records' | 'albums'

type Group = {
  key: GroupKey
  label: string
  description: string
  representative: string
  capabilities: string[]
}

const GROUPS: Group[] = [
  {
    key: 'upload',
    label: '사진·영상 업로드',
    description: '직접 사진과 영상을 올리고 자신이 올린 항목을 수정·삭제할 수 있어요.',
    representative: 'asset.upload',
    capabilities: ['asset.upload', 'asset.edit.own', 'asset.delete.own'],
  },
  {
    key: 'records',
    label: '기록 작성 (성장·마일스톤·스토리)',
    description: '성장 기록, 마일스톤, 스토리를 작성하고 자신의 기록을 수정·삭제할 수 있어요.',
    representative: 'record.create',
    capabilities: ['record.create', 'record.edit.own', 'record.delete.own'],
  },
  {
    key: 'albums',
    label: '앨범 만들기·정리',
    description: '앨범을 만들고 사진을 담거나 빼며 자신의 앨범을 수정·삭제할 수 있어요.',
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
  const [enabled, setEnabled] = useState<Record<GroupKey, boolean>>({
    upload: false,
    records: false,
    albums: false,
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/admin/settings')
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
    setStatus(res.ok ? '저장됨' : '실패')
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[13px] font-semibold text-base-500">구성원 권한</h2>
      <p className="px-1 text-[12px] text-base-500">
        가족 구성원은 기본적으로 보기·댓글·좋아요만 가능해요. 아래를 켜면 모든 가족 구성원에게
        적용돼요.
      </p>
      <Card>
        <CardBody className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.key} className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{g.label}</div>
                <div className="text-xs text-base-500">{g.description}</div>
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
          {saving ? '...' : '저장'}
        </Button>
        {status && <span className="text-sm text-base-500">{status}</span>}
      </div>
    </section>
  )
}
