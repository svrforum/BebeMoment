import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { deleteDeviceToken, registerDeviceToken } from '@/server/notifications/device-tokens'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const registerSchema = z.object({
  token: z.string().min(1, '토큰이 필요합니다').max(4096, '토큰이 너무 깁니다'),
  platform: z.enum(['android', 'ios']).default('android'),
})

const unregisterSchema = z.object({
  token: z.string().min(1, '토큰이 필요합니다').max(4096, '토큰이 너무 깁니다'),
})

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = registerSchema.parse(await req.json())
    await registerDeviceToken(
      { userId: session.userId, token: body.token, platform: body.platform },
      prismaPublic,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = unregisterSchema.parse(await req.json())
    await deleteDeviceToken({ userId: session.userId, token: body.token }, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
