'use client'
import { useToast } from '@/lib/toast'
import { Share2 } from 'lucide-react'
import { useCallback } from 'react'

/**
 * 가족용 링크 공유 버튼. 현재 오리진 + path (예: /detail/<no>, /story/<no>) 를
 * 공유한다. 비공개 가족 인스턴스라 링크는 가족(로그인)만 열 수 있다.
 *
 * 3단 폴백:
 *  1) 네이티브 앱(Capacitor) → 안드로이드 공유 시트(카톡·메시지·…). HTTP LAN
 *     에서도 동작 — 네이티브 플러그인은 보안 컨텍스트를 따지지 않는다.
 *  2) 웹 + 보안 컨텍스트(HTTPS·localhost) → `navigator.share` 브라우저 공유 시트.
 *  3) 그 외(HTTP LAN 브라우저 등) → 클립보드 복사(`execCommand` 폴백).
 */

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean
    Plugins?: {
      Share?: {
        share: (args: {
          title?: string
          text?: string
          url?: string
          dialogTitle?: string
        }) => Promise<unknown>
      }
    }
  }
}

async function nativeShare(url: string, title: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const cap = (window as CapacitorWindow).Capacitor
  const plugin = cap?.Plugins?.Share
  if (!cap?.isNativePlatform?.() || !plugin) return false
  try {
    await plugin.share({ title, url, dialogTitle: title })
  } catch {
    // 사용자가 공유 시트를 닫았거나(취소) 전송에 실패 — 둘 다 네이티브가 처리한
    // 것으로 보고 클립보드 폴백으로 떨어지지 않는다.
  }
  return true
}

async function webShare(url: string, title: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share || !window.isSecureContext) return false
  try {
    await navigator.share({ title, url })
    return true
  } catch (e) {
    // AbortError = 사용자가 시트를 닫음 → 처리된 것으로 간주(복사 안 함).
    if (e instanceof DOMException && e.name === 'AbortError') return true
    return false
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to legacy
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
export function ShareLinkButton({
  path,
  title = '베베 모먼트',
  className,
  showLabel = false,
  iconSize = 22,
}: {
  path: string
  title?: string
  className?: string
  showLabel?: boolean
  iconSize?: number
}) {
  const toast = useToast()
  const onShare = useCallback(async () => {
    const url = `${window.location.origin}${path}`
    if (await nativeShare(url, title)) return
    if (await webShare(url, title)) return
    if (await copyText(url)) {
      toast({ title: '링크를 복사했어요', description: '가족만 열 수 있어요', variant: 'success' })
    } else {
      toast({
        title: '복사하지 못했어요 — 링크를 길게 눌러 복사해주세요',
        description: url,
        variant: 'danger',
      })
    }
  }, [path, title, toast])

  return (
    <button type="button" onClick={onShare} aria-label="공유" className={className}>
      <Share2 size={iconSize} strokeWidth={2} />
      {showLabel && <span>공유</span>}
    </button>
  )
}
