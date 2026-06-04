import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJsonKey } from '@/lib/error-response'
import { listUserIdentities } from '@/server/oidc/link'
import { NextResponse } from 'next/server'

// 로그인 사용자용 — 연동 가능한(활성) 공급자 + 내가 이미 연동한 신원 목록.
export async function GET() {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const [providers, linked] = await Promise.all([
    prismaPublic.oidcProvider.findMany({
      where: { enabled: true },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    listUserIdentities(session.userId, prismaPublic),
  ])
  return NextResponse.json({ providers, linked })
}
