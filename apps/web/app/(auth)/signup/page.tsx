'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

export default function SignupPage() {
  const router = useRouter()
  const params = useSearchParams()
  const inviteToken = params.get('invite')
  const prefilledEmail = params.get('email') ?? ''

  const [email, setEmail] = useState(prefilledEmail)
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '가입 실패')
      return
    }
    if (inviteToken) {
      await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken }),
      })
      router.push('/')
    } else {
      router.push('/onboarding')
    }
    router.refresh()
  }

  return (
    <main style={{ maxWidth: 380, margin: '64px auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>가입하기</h1>
      {inviteToken && (
        <p style={{ color: 'var(--base-500)', marginTop: 8, fontSize: 14 }}>
          초대 링크로 가입하시는군요. 가입이 끝나면 자동으로 가족에 합류돼요.
        </p>
      )}
      <form onSubmit={submit} className="card" style={{ marginTop: 24, display: 'grid', gap: 12 }}>
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>이름</div>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>이메일</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>비밀번호 (8자 이상)</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? '...' : '가입하기'}
        </button>
        <p style={{ fontSize: 13, marginTop: 8 }}>
          계정이 있으신가요? <a href="/login">로그인</a>
        </p>
      </form>
    </main>
  )
}
