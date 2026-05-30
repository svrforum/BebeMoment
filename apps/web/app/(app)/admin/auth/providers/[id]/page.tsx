'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'

type Params = { id: string }

export default function EditProviderPage({ params }: { params: Promise<Params> }) {
  const router = useRouter()
  const { id } = use(params)
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [scopes, setScopes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/admin/oidc')
      .then((r) => r.json())
      .then((j) => {
        const p = j.providers.find((x: { id: string }) => x.id === id)
        if (p) {
          setName(p.name)
          setIssuer(p.issuer)
          setClientId(p.clientId)
          setScopes((p.scopes ?? []).join(' '))
        }
      })
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    // biome-ignore lint/suspicious/noExplicitAny: ad-hoc payload
    const payload: Record<string, any> = { name, issuer, clientId }
    if (clientSecret) payload.clientSecret = clientSecret
    payload.scopes = scopes.split(/[\s,]+/).filter(Boolean)
    const r = await fetch(`/api/admin/oidc/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (r.ok) router.push('/admin/auth/providers')
    else {
      const d = await r.json().catch(() => ({}))
      setError(d.error ?? '실패')
    }
  }

  return (
    <>
      <AppHeader title="OIDC 편집" />
      <div className="mx-auto max-w-3xl px-5 py-4">
        <Card>
          <CardBody>
            <form onSubmit={save} className="space-y-3">
              <div>
                <Label htmlFor="name">이름</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="issuer">Issuer URL</Label>
                <Input
                  id="issuer"
                  type="url"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="clientId">Client ID</Label>
                <Input
                  id="clientId"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="scopes">Scope (공백/쉼표 구분)</Label>
                <Input
                  id="scopes"
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                  placeholder="openid profile_nickname"
                />
                <p className="mt-1 text-[12px] text-base-400">
                  카카오는 이메일 동의항목이 비즈앱 심사를 요구해요 — account_email 을 빼면
                  닉네임만으로 가입돼요.
                </p>
              </div>
              <div>
                <Label htmlFor="clientSecret">Client Secret (변경할 때만)</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="(기존 유지)"
                />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? '...' : '저장'}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
