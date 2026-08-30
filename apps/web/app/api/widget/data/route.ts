import { errorJsonKey } from '@/lib/error-response'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { isUserFullySuspended } from '@/server/auth/suspension'
import { getWidgetData } from '@/server/widget/data'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return await errorJsonKey('unauthorized', 401)

  const row = await prismaPublic.widgetToken.findUnique({ where: { token } })
  if (!row) return await errorJsonKey('unauthorized', 401)
  if (await isUserFullySuspended(row.userId, prismaPublic)) {
    return await errorJsonKey('forbidden', 403)
  }

  const data = await getWidgetData(row.userId, prismaMedia, prismaPublic, getMediaClient(), {
    source: row.widgetSource,
  })
  if (!data) return await errorJsonKey('notFound', 404)

  await prismaPublic.widgetToken.update({
    where: { token },
    data: { lastUsedAt: new Date() },
  })
  return NextResponse.json(data)
}
