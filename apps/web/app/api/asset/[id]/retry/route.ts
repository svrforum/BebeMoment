import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

/**
 * 처리 실패한 자산 재처리. 업로드 권한자만(asset.upload). media 가 status 를
 * processing 으로 되돌리고 처리 큐에 다시 넣는다.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return errorJsonKey('noFamily', 400)
  if (!ctx.capabilities.includes('asset.upload')) return errorJsonKey('asset.retryDenied', 403)
  try {
    const { id } = await params
    await getMediaClient().retryAsset(id, ctx.family.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
