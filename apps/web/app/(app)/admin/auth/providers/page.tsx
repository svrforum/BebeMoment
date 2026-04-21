'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type Provider = { id: string; name: string; issuer: string; enabled: boolean }

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/oidc')
    if (r.ok) {
      const j = await r.json()
      setProviders(j.providers)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(id: string, enabled: boolean) {
    await fetch(`/api/admin/oidc/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    })
    load()
  }

  async function remove(id: string) {
    if (!confirm('삭제하시겠어요?')) return
    await fetch(`/api/admin/oidc/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <>
      <AppHeader
        title="OIDC 프로바이더"
        right={
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/auth/providers/new">추가</Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-2">
        {providers.length === 0 && (
          <p className="text-sm text-base-500 text-center py-8">
            등록된 프로바이더가 없어요.{' '}
            <Link href="/admin/auth/providers/new" className="text-point-500">
              추가하기
            </Link>
          </p>
        )}
        {providers.map((p) => (
          <Card key={p.id}>
            <CardBody className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-base-500 truncate">{p.issuer}</div>
                <div className="text-xs mt-1">
                  <span className={p.enabled ? 'text-success' : 'text-base-500'}>
                    {p.enabled ? '활성' : '비활성'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="secondary" onClick={() => toggle(p.id, p.enabled)}>
                  {p.enabled ? '끄기' : '켜기'}
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/admin/auth/providers/${p.id}`}>편집</Link>
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(p.id)}>
                  삭제
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  )
}
