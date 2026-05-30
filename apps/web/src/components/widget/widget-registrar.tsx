'use client'
import { registerWidget } from '@/lib/widget-client'
import { useEffect } from 'react'

/**
 * 네이티브 앱 로드 시 위젯 토큰을 1회 등록한다(웹/미지원 앱에선 무동작). 렌더 없음.
 * (app) 레이아웃에 마운트.
 */
export function WidgetRegistrar(): null {
  useEffect(() => {
    void registerWidget()
  }, [])
  return null
}
