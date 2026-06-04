'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function AuthSettingsPage() {
  const t = useTranslations('admin')
  const [signupEnabled, setSignupEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((d) => {
        setSignupEnabled(Boolean(d.auth?.signup_enabled))
      })
  }, [])

  async function toggleSignup() {
    const next = !signupEnabled
    setSaving(true)
    const r = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'auth.signup_enabled', value: next }),
    })
    setSaving(false)
    if (r.ok) {
      setSignupEnabled(next)
      setStatus(t('auth.saved'))
    } else {
      setStatus(t('auth.saveFailed'))
    }
  }

  return (
    <>
      <AppHeader title={t('auth.title')} />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{t('auth.publicSignup')}</h3>
                <p className="text-xs text-base-500 mt-1">{t('auth.publicSignupHint')}</p>
              </div>
              <Toggle checked={signupEnabled} onChange={toggleSignup} disabled={saving} />
            </div>
            {status && <p className="text-sm text-base-500 mt-2">{status}</p>}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{t('auth.oidcProviders')}</h3>
              <p className="text-xs text-base-500">{t('auth.oidcProvidersHint')}</p>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/auth/providers">{t('auth.manage')}</Link>
            </Button>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
