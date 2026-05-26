import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { ensureVapidKeys } from '@/server/notifications/vapid'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export async function GET() {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const store = {
    get: (k: string) => getSetting(k, z.string().nullable(), null, prismaPublic),
    set: (k: string, v: string) => setSetting(k, v, null, prismaPublic),
  }
  const { publicKey } = await ensureVapidKeys(store)
  return NextResponse.json({ publicKey })
}
