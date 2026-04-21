'use client'
import { useEffect, useState } from 'react'

type Invite = {
  id: string
  email: string
  role: string
  expiresAt: string
  token: string
}

export default function FamilyPage() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
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
      body: JSON.stringify({ email, role }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? '초대 생성 실패')
      return
    }
    const data = await res.json()
    setLastCreated({ id: data.id, email, role, expiresAt: data.expiresAt, token: data.token })
    setEmail('')
    load()
  }

  async function revoke(id: string) {
    await fetch(`/api/invite/${id}/revoke`, { method: 'POST' })
    load()
  }

  const publicUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <main style={{ maxWidth: 640, margin: '24px auto', padding: 24 }}>
      <a href="/">← 홈</a>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 12 }}>가족 멤버 초대</h1>

      <form onSubmit={submit} className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>초대할 이메일</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>역할</div>
          <select value={role} onChange={(e) => setRole(e.target.value as 'guardian' | 'family')}>
            <option value="family">가족 (조부모·친척)</option>
            <option value="guardian">보호자 (부모급)</option>
          </select>
        </label>
        {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
        <button type="submit">초대 링크 생성</button>
      </form>

      {lastCreated && (
        <div className="card" style={{ marginTop: 16, background: 'var(--base-100)' }}>
          <p style={{ fontSize: 13 }}>초대 링크가 생성되었어요. 복사해서 전달하세요:</p>
          <code
            style={{
              display: 'block',
              padding: 8,
              background: 'var(--base-0)',
              borderRadius: 8,
              wordBreak: 'break-all',
            }}
          >
            {publicUrl}/invite/{lastCreated.token}
          </code>
        </div>
      )}

      <h2 style={{ fontSize: 18, marginTop: 32 }}>대기 중인 초대</h2>
      {invites.length === 0 && <p style={{ color: 'var(--base-500)' }}>없음</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {invites.map((inv) => (
          <li
            key={inv.id}
            className="card"
            style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}
          >
            <div>
              <b>{inv.email}</b> ({inv.role})
              <br />
              <small style={{ color: 'var(--base-500)' }}>
                만료 {new Date(inv.expiresAt).toLocaleString('ko-KR')}
              </small>
            </div>
            <button type="button" onClick={() => revoke(inv.id)} style={{ background: '#ef4444' }}>
              철회
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
