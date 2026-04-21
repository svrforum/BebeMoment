'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '로그인 실패')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <main style={{ maxWidth: 380, margin: '64px auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>로그인</h1>
      <form onSubmit={submit} className="card" style={{ marginTop: 24, display: 'grid', gap: 12 }}>
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>이메일</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          <div style={{ fontSize: 13, marginBottom: 6 }}>비밀번호</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? '...' : '로그인'}
        </button>
        <p style={{ fontSize: 13, marginTop: 8 }}>
          계정이 없으신가요? <a href="/signup">가입하기</a>
        </p>
      </form>
    </main>
  )
}
