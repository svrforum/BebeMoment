import { prisma } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
})

export async function POST(req: Request) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  try {
    const body = BodySchema.parse(await req.json())
    await setSetting(body.key, body.value, ctx.user.id, prisma)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
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
