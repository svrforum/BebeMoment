import { requireRouteContext } from '@/lib/route-context'
import { prismaPublic } from '@/lib/db-init'
import { revokeShareLink } from '@/server/share/manage'
import { errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  // 공유 링크 관리(회수)도 발행과 같은 경계 — share.create 없는 역할은 토큰 회수 불가.
  if (!ctx.capabilities.includes('share.create')) return errorJsonKey('forbidden', 403)
  const { token } = await params
  const ok = await revokeShareLink(token, ctx.family.id, prismaPublic)
  return NextResponse.json({ ok })
}
