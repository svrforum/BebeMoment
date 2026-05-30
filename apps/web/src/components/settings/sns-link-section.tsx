'use client'
import { useToast } from '@/lib/toast'
import { Link2, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

type Provider = { id: string; name: string }
type Linked = { providerId: string; providerName: string; email: string | null }

export function SnsLinkSection() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [linked, setLinked] = useState<Linked[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)
  const toast = useToast()

  async function load() {
    const res = await fetch('/api/auth/oidc/providers')
    if (!res.ok) {
      setLoading(false)
      return
    }
    const d = (await res.json()) as { providers: Provider[]; linked: Linked[] }
    setProviders(d.providers)
    setLinked(d.linked)
    setLoading(false)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: 마운트 1회만(목록 로드 + 콜백 결과 안내)
  useEffect(() => {
    void load()
    // 연동 콜백 결과(?linked / ?error=link_conflict) 안내.
    const params = new URLSearchParams(window.location.search)
    if (params.get('linked')) toast({ title: 'SNS 계정을 연동했어요', variant: 'success' })
    if (params.get('error') === 'link_conflict') {
      toast({ title: '이미 다른 계정에 연결된 SNS 예요', variant: 'danger' })
    }
    if (params.get('linked') || params.get('error')) {
      window.history.replaceState({}, '', '/settings')
    }
  }, [])

  const isLinked = (id: string) => linked.some((l) => l.providerId === id)

  async function unlink(providerId: string) {
    setPending(providerId)
    const res = await fetch('/api/auth/oidc/unlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId }),
    })
    setPending(null)
    if (res.ok) {
      setLinked((prev) => prev.filter((l) => l.providerId !== providerId))
      toast({ title: '연동을 해제했어요' })
    } else {
      toast({ title: '해제하지 못했어요', variant: 'danger' })
    }
  }

  if (loading) {
    return <div className="h-12 animate-pulse rounded-xl bg-base-100 dark:bg-base-800" />
  }
  if (providers.length === 0) {
    return (
      <p className="px-1 text-[13px] text-base-500">
        관리자가 SNS 로그인(카카오·네이버 등)을 설정하면 여기서 연동할 수 있어요.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-card divide-y divide-base-100 dark:border-base-800/70 dark:bg-base-900 dark:divide-base-800">
      {providers.map((p) => {
        const linkedNow = isLinked(p.id)
        return (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <Link2 className="h-[18px] w-[18px] flex-shrink-0 text-base-400" strokeWidth={1.9} />
            <span className="flex-1 text-[15px] text-base-900 dark:text-base-50">{p.name}</span>
            {linkedNow ? (
              <button
                type="button"
                onClick={() => unlink(p.id)}
                disabled={pending === p.id}
                className="flex items-center gap-1 rounded-full bg-base-100 px-3 py-1.5 text-[13px] font-medium text-base-600 transition-colors hover:bg-base-200 disabled:opacity-50 dark:bg-base-800 dark:text-base-300"
              >
                {pending === p.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                연동 해제
              </button>
            ) : (
              <a
                href={`/api/auth/oidc/${p.id}?link=1`}
                className="rounded-full bg-point-500 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-point-600"
              >
                연동
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
