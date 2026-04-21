'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function NewProviderPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const r = await fetch('/api/admin/oidc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        issuer,
        clientId,
        clientSecret,
        scopes: ['openid', 'email', 'profile'],
      }),
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
      <AppHeader title="OIDC 추가" />
      <div className="mx-auto max-w-3xl px-5 py-4">
        <Card>
          <CardBody>
            <form onSubmit={save} className="space-y-3">
              <div>
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Google"
                />
              </div>
              <div>
                <Label htmlFor="issuer">Issuer URL</Label>
                <Input
                  id="issuer"
                  type="url"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  required
                  placeholder="https://accounts.google.com"
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
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  required
                  placeholder="(저장 시 암호화됨)"
                />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? '...' : '추가'}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
