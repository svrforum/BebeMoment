'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Label } from '@/components/ui/input'
import { Check, Copy, QrCode, Share2 } from 'lucide-react'
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
  const [canShare, setCanShare] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/invite/list')
    if (res.ok) setInvites((await res.json()).invites)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    load()
    // navigator.share 는 모바일 Safari/Chrome/Android Chrome 에서만 존재.
    // 데스크탑/일부 브라우저는 hide.
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const lastLink = lastToken ? `${origin}/invite/${lastToken}` : null

  // QR 토글 시 lazy-load (qrcode ~50KB) — 첫 토글에서만 캐시.
  useEffect(() => {
    if (!showQr || !lastLink || qrDataUrl) return
    let cancelled = false
    ;(async () => {
      try {
        const QRCode = (await import('qrcode')).default
        const dataUrl = await QRCode.toDataURL(lastLink, {
          width: 480, // 200×200 표시, retina 위해 2.4×
          margin: 1,
          errorCorrectionLevel: 'M',
        })
        if (!cancelled) setQrDataUrl(dataUrl)
      } catch {
        // QR 생성 실패 — 토글만 닫음
        if (!cancelled) setShowQr(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showQr, lastLink, qrDataUrl])

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
    setShowQr(false)
    setQrDataUrl(null)
    load()
  }

  async function revoke(id: string) {
    await fetch(`/api/invite/${id}/revoke`, { method: 'POST' })
    load()
  }

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

  async function shareLink() {
    if (!lastLink) return
    try {
      await navigator.share({
        url: lastLink,
        title: '가족 앨범 초대',
        text: '가족 앨범에 함께해요',
      })
    } catch {
      // 사용자가 share UI 취소 — 무시
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
          <CardBody className="space-y-3">
            <p className="text-sm font-medium">
              초대 링크가 생성됐어요. 복사하거나 공유해 전달하세요.
            </p>

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

            <div className="flex flex-wrap gap-2">
              {canShare && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={shareLink}
                  className="flex-1 min-w-[120px]"
                >
                  <Share2 size={14} />
                  공유
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowQr((v) => !v)}
                aria-pressed={showQr}
                className="flex-1 min-w-[120px]"
              >
                <QrCode size={14} />
                {showQr ? 'QR 숨기기' : 'QR 코드'}
              </Button>
            </div>

            {showQr && (
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-base-0 p-5 dark:bg-base-950">
                <div className="flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-xl bg-white">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="초대 링크 QR 코드"
                      width={200}
                      height={200}
                      className="h-[200px] w-[200px]"
                    />
                  ) : (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-base-200 border-t-base-500" />
                  )}
                </div>
                <p className="break-all text-center text-[11px] text-base-500">{lastLink}</p>
                <p className="text-center text-[12px] text-base-400">
                  할머니·할아버지 폰 카메라로 비춰 주세요
                </p>
              </div>
            )}
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
