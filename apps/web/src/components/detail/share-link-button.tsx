'use client'
import { useToast } from '@/lib/toast'
import { Share2 } from 'lucide-react'
import { useCallback } from 'react'

/**
 * 가족용 링크 복사 버튼. 현재 오리진 + path (예: /detail/<id>, /diary/<id>) 를
 * 클립보드에 복사한다. 비공개 가족 인스턴스라 링크는 가족(로그인)만 열 수 있다.
 * LAN·HTTP 등 비보안 오리진에서는 navigator.clipboard 가 없을 수 있어 폴백 토스트.
 */
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
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(url)
      toast({ title: '링크를 복사했어요', description: '가족만 열 수 있어요', variant: 'success' })
    } catch {
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
