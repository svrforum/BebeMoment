'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Label } from '@/components/ui/input'
import { useEffect, useState } from 'react'

type Invite = {
  id: string
  email?: string | null
  role: string
  expiresAt: string
  token: string
}

export default function FamilyPage() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [role, setRole] = useState<'guardian' | 'family'>('family')
  const [lastCreated, setLastCreated] = useState<Invite | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/invite/list')
    if (res.ok) {
      const data = await res.json()
      setInvites(data.invites)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load is stable, run once on mount
  useEffect(() => {
    load()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? '초대 생성 실패')
      return
    }
    const data = await res.json()
    setLastCreated({ id: data.id, role, expiresAt: data.expiresAt, token: data.token })
    load()
  }

  async function revoke(id: string) {
    await fetch(`/api/invite/${id}/revoke`, { method: 'POST' })
    load()
  }

  const publicUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <>
      <AppHeader title="가족 멤버 초대" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-4">
        <Card>
          <CardBody>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="role">역할</Label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'guardian' | 'family')}
                  className="h-11 w-full rounded-xl border border-base-200 bg-base-0 px-4 text-base dark:border-base-800 dark:bg-base-900"
                >
                  <option value="family">가족 (조부모·친척)</option>
                  <option value="guardian">보호자 (부모급)</option>
                </select>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" className="w-full">
                초대 링크 생성
              </Button>
            </form>
          </CardBody>
        </Card>

        {lastCreated && (
          <Card className="bg-base-100 dark:bg-base-900">
            <CardBody>
              <p className="text-sm mb-2">초대 링크가 생성되었어요. 복사해서 전달하세요:</p>
              <code className="block rounded-lg bg-base-0 dark:bg-base-950 p-2 text-xs break-all font-mono">
                {publicUrl}/invite/{lastCreated.token}
              </code>
            </CardBody>
          </Card>
        )}

        <h2 className="text-base font-semibold pt-4">대기 중인 초대</h2>
        {invites.length === 0 && <p className="text-sm text-base-500">없음</p>}
        <div className="space-y-2">
          {invites.map((inv) => (
            <Card key={inv.id}>
              <CardBody className="flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    {inv.email ?? '링크 초대'}{' '}
                    <span className="text-sm text-base-500">({inv.role})</span>
                  </div>
                  <div className="text-xs text-base-500">
                    만료{' '}
                    {new Date(inv.expiresAt).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </div>
                </div>
                <Button variant="danger" size="sm" onClick={() => revoke(inv.id)}>
                  철회
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
