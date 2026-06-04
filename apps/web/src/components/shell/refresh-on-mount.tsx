'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * 마운트 시 router.refresh() 로 현재 라우트의 RSC 를 서버에서 다시 가져온다. 북마크/저장함
 * 같은 "다른 화면의 변경(북마크 토글)이 반영돼야 하는" 목록 페이지가 Next App Router 의
 * 클라이언트 라우터 캐시 때문에 stale 하게 보이던 문제를 막는다(예: 사진을 북마크하고
 * 앨범>북마크로 오면 옛 캐시가 떠 빈 화면). [[next-searchparams-client-cache]]
 */
export function RefreshOnMount() {
  const router = useRouter()
  useEffect(() => {
    router.refresh()
  }, [router])
  return null
}
