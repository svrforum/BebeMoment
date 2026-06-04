'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'

type Params = { id: string }

export default function EditProviderPage({ params }: { params: Promise<Params> }) {
  const t = useTranslations('admin')
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
      setError(d.error ?? t('auth.saveFailed'))
    }
  }

  return (
    <>
      <AppHeader title={t('auth.editTitle')} />
      <div className="mx-auto max-w-3xl px-5 py-4">
        <Card>
          <CardBody>
            <form onSubmit={save} className="space-y-3">
              <div>
                <Label htmlFor="name">{t('auth.name')}</Label>
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
                <Label htmlFor="scopes">{t('auth.scopeLabel')}</Label>
                <Input
                  id="scopes"
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                  placeholder="openid profile_nickname"
                />
                <p className="mt-1 text-[12px] text-base-400">{t('auth.kakaoScopeHint')}</p>
              </div>
              <div>
                <Label htmlFor="clientSecret">{t('auth.clientSecretEditLabel')}</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={t('auth.clientSecretKeepPlaceholder')}
                />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? '...' : t('auth.save')}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
