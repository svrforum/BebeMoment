'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function AcceptButton({ token }: { token: string }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '수락 실패')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button type="button" onClick={accept} disabled={submitting}>
        {submitting ? '...' : '수락하기'}
      </button>
      {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  )
}
