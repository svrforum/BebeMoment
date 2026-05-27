'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Label } from '@/components/ui/input'
import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

type Invite = {
  id: string
  email?: string | null
  role: string
  expiresAt: string
  token: string
}

const ROLE_LABEL: Record<string, string> = {
  guardian: '보호자',
  family: '가족',
}

export function InviteManager() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [role, setRole] = useState<'guardian' | 'family'>('family')
  const [lastToken, setLastToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    const res = await fetch('/api/invite/list')
    if (res.ok) setInvites((await res.json()).invites)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    load()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? '초대 생성 실패')
      return
    }
    const data = await res.json()
    setLastToken(data.token)
    setCopied(false)
    load()
  }

  async function revoke(id: string) {
    await fetch(`/api/invite/${id}/revoke`, { method: 'POST' })
    load()
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const lastLink = lastToken ? `${origin}/invite/${lastToken}` : null

  async function copyLink() {
    if (!lastLink) return
    try {
      await navigator.clipboard.writeText(lastLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard 차단 환경 — 사용자가 직접 복사
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-[13px] font-semibold text-base-500">초대</h2>
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? '생성 중…' : '초대 링크 생성'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {lastLink && (
        <Card className="border-point-500/30 bg-point-500/5 dark:bg-point-500/10">
          <CardBody className="space-y-2">
            <p className="text-sm font-medium">초대 링크가 생성됐어요. 복사해 전달하세요.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-base-0 px-2.5 py-2 text-xs dark:bg-base-950">
                {lastLink}
              </code>
              <button
                type="button"
                onClick={copyLink}
                aria-label="링크 복사"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-base-900 text-base-50 active:scale-95 dark:bg-base-50 dark:text-base-900"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </CardBody>
        </Card>
      )}

      {invites.length > 0 && (
        <div className="space-y-2">
          <h3 className="px-1 text-[12px] font-medium text-base-400">대기 중인 초대</h3>
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between rounded-2xl border border-base-200/70 bg-base-0 px-4 py-3 dark:border-base-800/70 dark:bg-base-900"
            >
              <div className="min-w-0">
                <div className="text-[14px] font-medium">
                  {ROLE_LABEL[inv.role] ?? inv.role} 초대
                </div>
                <div className="text-xs text-base-500">
                  {new Date(inv.expiresAt).toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}{' '}
                  만료
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={() => revoke(inv.id)}>
                철회
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
