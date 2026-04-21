import { isInstanceAdmin } from '@/lib/admin'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { parseEnv } from '@bebe/config'
import { NextResponse } from 'next/server'
import { z } from 'zod'

async function checkAdmin() {
  const { user } = await getAuth()
  if (!user) return null
  const env = parseEnv(process.env as Record<string, string | undefined>)
  if (!isInstanceAdmin(user.email, env.ADMIN_USER_EMAILS)) return null
  return user
}

const BodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
})

export async function POST(req: Request) {
  const user = await checkAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = BodySchema.parse(await req.json())
    await setSetting(body.key, body.value, user.id, prisma)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function GET() {
  const user = await checkAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const AnySchema = z.unknown()
  const [appName, signupEnabled, retentionDays, uploadConvert] = await Promise.all([
    getSetting('general.app_name', AnySchema, 'bebe-moment', prisma),
    getSetting('auth.signup_enabled', AnySchema, false, prisma),
    getSetting('retention.trash_days', AnySchema, 30, prisma),
    getSetting('upload.convert_to_compatible', AnySchema, false, prisma),
  ])
  return NextResponse.json({
    general: { app_name: appName },
    auth: { signup_enabled: signupEnabled },
    retention: { trash_days: retentionDays },
    upload: { convert_to_compatible: uploadConvert },
  })
}
