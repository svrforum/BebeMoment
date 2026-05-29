'use client'
import { useToast } from '@/lib/toast'
import { Send } from 'lucide-react'
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

  async function onTest(): Promise<void> {
    if (pending) return
    setPending(true)
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' })
      if (!res.ok) {
        toast({ title: '테스트에 실패했어요 — 잠시 후 다시 시도해주세요', variant: 'danger' })
        return
      }
      const r = (await res.json()) as TestResult
      if (!r.hasDevices) {
        toast({
          title: '등록된 기기가 없어요',
          description: '먼저 위에서 "이 기기에서 알림 받기"를 켜주세요',
          variant: 'danger',
        })
        return
      }
      const sent = r.web.sent + r.fcm.sent
      const failed = r.web.failed + r.fcm.failed
      if (sent > 0) {
        toast({
          title: '테스트 알림을 보냈어요 🔔',
          description: '잠깐 기다렸다가 알림이 오는지 확인해보세요',
          variant: 'success',
        })
      } else {
        toast({
          title: '보냈지만 도착에 실패했어요',
          description:
            failed > 0
              ? '알림을 껐다가 다시 켠 뒤 시도해보세요'
              : '관리자 알림 설정을 확인해주세요',
          variant: 'danger',
        })
      }
    } catch {
      toast({ title: '잠시 후 다시 시도해주세요', variant: 'danger' })
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
      {pending ? '보내는 중…' : '테스트 알림 보내기'}
    </Button>
  )
}
