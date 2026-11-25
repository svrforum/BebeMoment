'use client'
import { useToast } from '@/lib/toast'
import { Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '../ui/button'

type TestResult = {
  hasDevices: boolean
  web: { sent: number; failed: number; total: number }
  fcm: { sent: number; failed: number; total: number; enabled: boolean }
}

export function PushTestButton(): React.JSX.Element {
  const [pending, setPending] = useState(false)
  const toast = useToast()
  const t = useTranslations('settings')

  async function onTest(): Promise<void> {
    if (pending) return
    setPending(true)
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' })
      if (!res.ok) {
        toast({ title: t('notifications.test.failed'), variant: 'danger' })
        return
      }
      const r = (await res.json()) as TestResult
      if (!r.hasDevices) {
        toast({
          title: t('notifications.test.noDevicesTitle'),
          description: t('notifications.test.noDevicesBody'),
          variant: 'danger',
        })
        return
      }
      const sent = r.web.sent + r.fcm.sent
      const failed = r.web.failed + r.fcm.failed
      if (sent > 0) {
        toast({
          title: t('notifications.test.sentTitle'),
          description: t('notifications.test.sentBody'),
          variant: 'success',
        })
      } else {
        toast({
          title: t('notifications.test.undeliveredTitle'),
          description:
            failed > 0
              ? t('notifications.test.undeliveredResubscribe')
              : t('notifications.test.undeliveredAdmin'),
          variant: 'danger',
        })
      }
    } catch {
      toast({ title: t('push.retry'), variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={onTest}
      disabled={pending}
      className="w-full"
    >
      <Send className="h-4 w-4" strokeWidth={2} />
      {pending ? t('notifications.test.sending') : t('notifications.test.send')}
    </Button>
  )
}
