'use client'
import { shareOrCopy } from '@/lib/share-link'
import { useToast } from '@/lib/toast'
import { Share2 } from 'lucide-react'
import { useCallback } from 'react'

/**
 * 가족용 링크 공유 버튼(asset 상세 /detail/<no>). 현재 오리진 + path 를 공유한다. 비공개
 * 가족 인스턴스라 링크는 가족(로그인)만 열 수 있다. (스토리 공유는 StoryShareButton 의
 * 난수 토큰 링크 — 이쪽은 로그인 게이트라 순번 노출 무방.) 공유/복사는 shareOrCopy 폴백.
 */
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
    const r = await shareOrCopy(url, title)
    if (r === 'copied') {
      toast({ title: '링크를 복사했어요', description: '가족만 열 수 있어요', variant: 'success' })
    } else if (r === 'failed') {
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
