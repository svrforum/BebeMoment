import { createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { parseEnv } from '@bebe/config'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path: segs } = await params
  const env = parseEnv(process.env as Record<string, string | undefined>)
  if (env.STORAGE_MODE !== 'local') {
    return new NextResponse('Media route disabled for s3 mode', { status: 404 })
  }

  const { session } = await getAuth()
  if (!session) return new NextResponse('Unauthorized', { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.membership) return new NextResponse('Forbidden', { status: 403 })

  // Path format: families/<familyId>/... OR derivatives/<assetId>/...
  if (segs[0] === 'families') {
    const familyId = segs[1]
    if (!familyId || familyId !== ctx.membership.familyId) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  } else if (segs[0] === 'derivatives') {
    const assetId = segs[1]
    if (!assetId) return new NextResponse('Not found', { status: 404 })
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, familyId: ctx.membership.familyId, deletedAt: null },
    })
    if (!asset) return new NextResponse('Forbidden', { status: 403 })
  } else {
    return new NextResponse('Not found', { status: 404 })
  }

  for (const seg of segs) {
    if (seg === '..' || seg.includes('/') || seg.includes('\\')) {
      return new NextResponse('Not found', { status: 404 })
    }
  }
  const base = path.resolve(env.STORAGE_PATH)
  const fullPath = path.resolve(base, ...segs)
  if (!fullPath.startsWith(base + path.sep) && fullPath !== base) {
    return new NextResponse('Not found', { status: 404 })
  }
  try {
    const stats = statSync(fullPath)
    const stream = createReadStream(fullPath)
    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        'Content-Length': String(stats.size),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
