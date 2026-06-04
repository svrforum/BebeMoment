'use client'
import { useToast } from '@/lib/toast'
import { Check, Link2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

type Provider = { id: string; name: string }
type Linked = { providerId: string; providerName: string; email: string | null }

export function SnsLinkSection() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [linked, setLinked] = useState<Linked[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()
  const t = useTranslations('settings')

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
    if (params.get('linked')) toast({ title: t('sns.linked'), variant: 'success' })
    if (params.get('error') === 'link_conflict') {
      toast({ title: t('sns.conflict'), variant: 'danger' })
    }
    if (params.get('linked') || params.get('error')) {
      window.history.replaceState({}, '', '/settings')
    }
  }, [])

  const isLinked = (id: string) => linked.some((l) => l.providerId === id)

  if (loading) {
    return <div className="h-12 animate-pulse rounded-xl bg-base-100 dark:bg-base-800" />
  }
  if (providers.length === 0) {
    return <p className="px-1 text-[13px] text-base-500">{t('sns.empty')}</p>
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
              <span className="inline-flex items-center gap-1 rounded-full bg-point-500/10 px-3 py-1.5 text-[13px] font-medium text-point-600 dark:text-point-400">
                <Check className="h-3.5 w-3.5" />
                {t('sns.connected')}
              </span>
            ) : (
              <a
                href={`/api/auth/oidc/${p.id}?link=1`}
                className="rounded-full bg-point-500 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-point-600"
              >
                {t('sns.connect')}
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
