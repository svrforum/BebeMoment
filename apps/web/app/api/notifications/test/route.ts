import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { sendTestNotification } from '@/server/notifications/test-send'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export async function POST() {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const secretKey = process.env.SECRET_KEY
  if (!secretKey) return NextResponse.json({ error: 'SECRET_KEY required' }, { status: 500 })
  const store = {
    get: (k: string) => getSetting(k, z.string().nullable(), null, prismaPublic),
    set: (k: string, v: string) => setSetting(k, v, null, prismaPublic),
  }
  try {
    const result = await sendTestNotification(session.userId, prismaPublic, store, secretKey)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
