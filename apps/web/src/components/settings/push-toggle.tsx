'use client'
import {
  currentPushEnabled,
  isIos,
  isNativeApp,
  isStandalone,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push-client'
import { useToast } from '@/lib/toast'
import { Bell, Share } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Toggle } from '../ui/toggle'

type Support = 'loading' | 'supported' | 'native' | 'ios-install' | 'unsupported'

export function PushToggle(): React.JSX.Element {
  const [support, setSupport] = useState<Support>('loading')
  const [enabled, setEnabled] = useState(false)
  const [pending, setPending] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (isNativeApp()) {
      setSupport('native')
      return
    }
    if (pushSupported()) {
      setSupport('supported')
      currentPushEnabled().then(setEnabled)
      return
    }
    if (isIos() && !isStandalone()) {
      setSupport('ios-install')
      return
    }
    setSupport('unsupported')
  }, [])

  async function onToggle(): Promise<void> {
    if (pending) return
    setPending(true)
    try {
      if (enabled) {
        await unsubscribeFromPush()
        setEnabled(false)
        toast({ title: '이 기기에서 알림을 껐어요' })
      } else {
        const ok = await subscribeToPush()
        if (!ok) {
          toast({ title: '브라우저에서 알림이 차단되어 있어요', variant: 'danger' })
          return
        }
        setEnabled(true)
        toast({ title: '이 기기에서 알림을 켰어요', variant: 'success' })
      }
    } catch {
      toast({ title: '잠시 후 다시 시도해주세요', variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  if (support === 'loading') {
    return <div className="h-7 w-12 animate-pulse rounded-full bg-base-200 dark:bg-base-800" />
  }

  if (support === 'ios-install') {
    return (
      <div className="rounded-xl bg-base-100 px-4 py-3 text-[13px] leading-relaxed text-base-600 dark:bg-base-800/60 dark:text-base-300">
        <p className="font-medium text-base-900 dark:text-base-50">
          iOS에서는 홈 화면에 추가한 뒤 알림을 켤 수 있어요
        </p>
        <p className="mt-1.5 flex items-center gap-1.5">
          <Share className="h-4 w-4 flex-shrink-0 text-base-400" strokeWidth={1.9} />
          <span>공유 → 홈 화면에 추가</span>
        </p>
      </div>
    )
  }

  // 네이티브 앱: FCM 기기 등록이 앱 실행 시 자동(MainActivity). 끄고 켜는 토글이 아니라
  // 상태 안내로 보여준다(웹 push 토글은 원격 페이지에서 동작 불가).
  if (support === 'native') {
    return (
      <div className="flex items-center gap-3">
        <Bell className="h-[18px] w-[18px] flex-shrink-0 text-point-500" strokeWidth={1.9} />
        <span className="flex-1 text-[15px] text-base-900 dark:text-base-50">
          앱에서 알림을 받고 있어요
        </span>
        <span className="rounded-full bg-point-500/12 px-2.5 py-1 text-[12px] font-semibold text-point-600 dark:text-point-300">
          켜짐
        </span>
      </div>
    )
  }

  if (support === 'unsupported') {
    return <p className="text-[13px] text-base-500">이 브라우저는 알림을 지원하지 않아요</p>
  }

  return (
    <div className="flex items-center gap-3">
      <Bell className="h-[18px] w-[18px] flex-shrink-0 text-base-400" strokeWidth={1.9} />
      <span className="flex-1 text-[15px] text-base-900 dark:text-base-50">
        이 기기에서 알림 받기
      </span>
      <Toggle
        checked={enabled}
        disabled={pending}
        onChange={onToggle}
        aria-label="이 기기에서 알림 받기"
      />
    </div>
  )
}
