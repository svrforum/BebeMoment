'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { useToast } from '@/lib/toast'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * 되살릴 수 없는 자산(업로드가 끊겨 바이트가 없는 실패 행) 정리.
 *
 * 자동으로 지우지 않는다 — 사진이 조용히 사라지는 것보다 사용자가 보고 치우는 게 낫다.
 * 먼저 몇 건인지 세어 보여주고, 누르면 휴지통으로 보낸다(완전 삭제 아님).
 */
export function UnrecoverableCleanup() {
  const t = useTranslations('admin')
  const toast = useToast()
  const router = useRouter()
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function scan() {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/assets/unrecoverable')
      const d = (await res.json()) as { count?: number; error?: string }
      if (!res.ok) {
        toast({ title: d.error ?? t('unrecoverable.failed'), variant: 'danger' })
        return
      }
      setCount(d.count ?? 0)
    } finally {
      setBusy(false)
    }
  }

  async function clean() {
    if (!window.confirm(t('unrecoverable.confirm', { count: count ?? 0 }))) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/assets/unrecoverable', { method: 'POST' })
      const d = (await res.json()) as { removed?: number; failed?: number; error?: string }
      if (!res.ok) {
        toast({ title: d.error ?? t('unrecoverable.failed'), variant: 'danger' })
        return
      }
      // 실패분을 숨기지 않는다 — "정리했어요"라고만 하고 남아 있으면 다음에 또 헤맨다.
      toast({
        title: d.failed
          ? t('unrecoverable.donePartly', { removed: d.removed ?? 0, failed: d.failed })
          : t('unrecoverable.done', { count: d.removed ?? 0 }),
        variant: d.failed ? 'danger' : 'success',
      })
      setCount(0)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardBody className="space-y-2">
        <h2 className="font-semibold">{t('unrecoverable.title')}</h2>
        <p className="text-sm text-base-500">{t('unrecoverable.help')}</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void scan()}>
            {t('unrecoverable.scan')}
          </Button>
          {count !== null && (
            <span className="text-sm text-base-500">{t('unrecoverable.found', { count })}</span>
          )}
          {count !== null && count > 0 && (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => void clean()}>
              {t('unrecoverable.clean')}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
