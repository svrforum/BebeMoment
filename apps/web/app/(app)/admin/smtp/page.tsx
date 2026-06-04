'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export default function SmtpSettingsPage() {
  const t = useTranslations('admin')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(587)
  const [secure, setSecure] = useState(false)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [fromName, setFromName] = useState('Bebe Moment')
  const [testTo, setTestTo] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function postKey(key: string, value: unknown): Promise<boolean> {
    const r = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    return r.ok
  }

  async function save() {
    setBusy(true)
    setStatus(null)
    const ops: Array<Promise<boolean>> = [
      postKey('smtp.host', host),
      postKey('smtp.port', Number(port)),
      postKey('smtp.secure', secure),
      postKey('smtp.user', user),
      postKey('smtp.from_address', fromAddress),
      postKey('smtp.from_name', fromName),
    ]
    if (password) {
      const r = await fetch('/api/admin/smtp/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!r.ok) {
        setStatus(t('smtp.passwordSaveFailed'))
        setBusy(false)
        return
      }
    }
    const results = await Promise.all(ops)
    setBusy(false)
    setStatus(results.every(Boolean) ? t('smtp.saved') : t('smtp.partialFail'))
  }

  async function testSend() {
    setBusy(true)
    setStatus(null)
    const r = await fetch('/api/admin/smtp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: testTo }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    setStatus(r.ok ? t('smtp.sent') : t('smtp.sendFailed', { error: String(j.error) }))
  }

  return (
    <>
      <AppHeader title="SMTP" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <Card>
          <CardBody className="space-y-3">
            <div>
              <Label htmlFor="host">{t('smtp.host')}</Label>
              <Input
                id="host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="port">{t('smtp.port')}</Label>
                <Input
                  id="port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={secure}
                    onChange={(e) => setSecure(e.target.checked)}
                  />
                  <span>TLS (secure)</span>
                </label>
              </div>
            </div>
            <div>
              <Label htmlFor="user">{t('smtp.user')}</Label>
              <Input id="user" value={user} onChange={(e) => setUser(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">{t('smtp.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('smtp.passwordPlaceholder')}
              />
            </div>
            <div>
              <Label htmlFor="fromAddress">{t('smtp.fromAddress')}</Label>
              <Input
                id="fromAddress"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fromName">{t('smtp.fromName')}</Label>
              <Input id="fromName" value={fromName} onChange={(e) => setFromName(e.target.value)} />
            </div>
            {status && <p className="text-sm text-base-500">{status}</p>}
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>
                {busy ? '...' : t('smtp.save')}
              </Button>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <h2 className="font-semibold">{t('smtp.testSend')}</h2>
            <div>
              <Label htmlFor="testTo">{t('smtp.recipient')}</Label>
              <Input
                id="testTo"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
            </div>
            <Button variant="secondary" onClick={testSend} disabled={busy || !testTo}>
              {t('smtp.testSend')}
            </Button>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
