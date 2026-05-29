'use client'
import { useToast } from '@/lib/toast'
import { Share2 } from 'lucide-react'
import { useCallback } from 'react'

/**
 * 가족용 링크 복사 버튼. 현재 오리진 + path (예: /detail/<id>, /story/<id>) 를
 * 클립보드에 복사한다. 비공개 가족 인스턴스라 링크는 가족(로그인)만 열 수 있다.
 *
 * `navigator.clipboard` 는 보안 컨텍스트(HTTPS·localhost)에서만 동작 — LAN·HTTP
 * (예: http://192.168.1.203) 에선 undefined 라, 레거시 `execCommand('copy')` 로
 * 폴백한다(비보안 컨텍스트에서도 동작). 둘 다 실패하면 URL 을 토스트로 노출.
 */
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
  className,
  showLabel = false,
  iconSize = 22,
}: {
  path: string
  className?: string
  showLabel?: boolean
  iconSize?: number
}) {
  const toast = useToast()
  const onShare = useCallback(async () => {
    const url = `${window.location.origin}${path}`
    if (await copyText(url)) {
      toast({ title: '링크를 복사했어요', description: '가족만 열 수 있어요', variant: 'success' })
    } else {
      toast({
        title: '복사하지 못했어요 — 링크를 길게 눌러 복사해주세요',
        description: url,
        variant: 'danger',
      })
    }
  }, [path, toast])

  return (
    <button type="button" onClick={onShare} aria-label="공유" className={className}>
      <Share2 size={iconSize} strokeWidth={2} />
      {showLabel && <span>공유</span>}
    </button>
  )
}
