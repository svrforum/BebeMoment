import { requireRouteContext } from '@/lib/route-context'
import { NextResponse } from 'next/server'

// 멤버 누구나 현재 가족 이름을 읽는다 — 앱의 다중 계정 라벨용(admin 전용
// /api/admin/family 와 달리 권한 없이). 가족 경계는 세션의 현재 가족으로 한정.
export async function GET() {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  return NextResponse.json({ name: ctx.family.name })
}
