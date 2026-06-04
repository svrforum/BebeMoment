'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useState } from 'react'

export default function SmtpSettingsPage() {
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
        setStatus('비밀번호 저장 실패')
        setBusy(false)
        return
      }
    }
    const results = await Promise.all(ops)
    setBusy(false)
    setStatus(results.every(Boolean) ? '저장됨' : '일부 실패')
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
    setStatus(r.ok ? '발송됨' : `실패: ${j.error}`)
  }

  return (
    <>
      <AppHeader title="SMTP" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <Card>
          <CardBody className="space-y-3">
            <div>
              <Label htmlFor="host">호스트</Label>
              <Input
                id="host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="port">포트</Label>
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
              <Label htmlFor="user">사용자</Label>
              <Input id="user" value={user} onChange={(e) => setUser(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">비밀번호 (변경할 때만)</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="(저장 시 암호화됨)"
              />
            </div>
            <div>
              <Label htmlFor="fromAddress">발신 주소</Label>
              <Input
                id="fromAddress"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fromName">발신 이름</Label>
              <Input id="fromName" value={fromName} onChange={(e) => setFromName(e.target.value)} />
            </div>
            {status && <p className="text-sm text-base-500">{status}</p>}
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>
                {busy ? '...' : '저장'}
              </Button>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-3">
            <h2 className="font-semibold">테스트 발송</h2>
            <div>
              <Label htmlFor="testTo">수신 주소</Label>
              <Input
                id="testTo"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
            </div>
            <Button variant="secondary" onClick={testSend} disabled={busy || !testTo}>
              테스트 발송
            </Button>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
