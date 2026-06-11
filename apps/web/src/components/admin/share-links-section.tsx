'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { useToast } from '@/lib/toast'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

type Kind = 'story' | 'asset' | 'album' | 'date' | 'selection'
type Link = {
  token: string
  kind: Kind
  target: string
  createdByName: string | null
  createdAt: string
  expiresAt: string | null
  lastAccessedAt: string | null
  expired: boolean
}

export function ShareLinksSection() {
  const t = useTranslations('admin')
  const locale = useLocale()
  const toast = useToast()
  const [links, setLinks] = useState<Link[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/share')
    if (!res.ok) {
      setLinks([])
      return
    }
    const data = (await res.json()) as { links: Link[] }
    setLinks(data.links)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const revoke = async (body: { token: string } | { all: true }, key: string) => {
    setBusy(key)
    try {
      const res = await fetch('/api/admin/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(String(res.status))
      await load()
      toast({ title: t('share.revoked') })
    } catch {
      toast({ title: t('share.revokeFailed'), variant: 'danger' })
    } finally {
      setBusy(null)
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale)

  if (links === null) return null

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">{t('share.heading')}</p>
            <p className="text-xs text-base-500">{t('share.help')}</p>
          </div>
          {links.length > 0 && (
            <Button
              variant="ghost"
              className="shrink-0 text-danger"
              disabled={busy !== null}
              onClick={() => {
                if (confirm(t('share.confirmAll'))) void revoke({ all: true }, 'all')
              }}
            >
              {t('share.revokeAll')}
            </Button>
          )}
        </div>

        {links.length === 0 ? (
          <p className="py-6 text-center text-sm text-base-500">{t('share.empty')}</p>
        ) : (
          <ul className="divide-y divide-base-200 dark:divide-base-800">
            {links.map((l) => (
              <li key={l.token} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t(`share.kind.${l.kind}`)}
                    {l.kind === 'date' ? ` · ${l.target}` : ''}
                  </p>
                  <p className="truncate text-xs text-base-500">
                    {t('share.createdBy', { name: l.createdByName ?? '—', date: fmt(l.createdAt) })}
                    {' · '}
                    {l.expiresAt
                      ? t('share.expiresOn', { date: fmt(l.expiresAt) })
                      : t('share.expiresPermanent')}
                    {l.expired ? ` · ${t('share.expiredTag')}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="shrink-0 text-danger"
                  disabled={busy !== null}
                  onClick={() => void revoke({ token: l.token }, l.token)}
                >
                  {t('share.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
