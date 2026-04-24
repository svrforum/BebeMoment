import { createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
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
    prismaPublic,
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
    const asset = await prismaMedia.asset.findFirst({
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
    const ext = path.extname(fullPath).slice(1).toLowerCase()
    const contentType = MIME[ext] ?? 'application/octet-stream'
    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stats.size),
        // Derivative/original files are content-addressed (by asset id) so
        // they never change in place. Keep a long private cache to avoid
        // the per-request auth+tenant DB lookups for thumbnails.
        'Cache-Control': 'private, max-age=604800, immutable',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}
