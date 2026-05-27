import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { getFeatureFlags } from '@/server/settings/features'
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
    await setSetting(body.key, body.value, ctx.user.id, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const AnySchema = z.unknown()
  const [
    appName,
    signupEnabled,
    retentionDays,
    uploadConvert,
    permissionsFamily,
    defaultTheme,
    features,
  ] = await Promise.all([
    getSetting('general.app_name', AnySchema, 'bebe-moment', prismaPublic),
    getSetting('auth.signup_enabled', AnySchema, false, prismaPublic),
    getSetting('retention.trash_days', AnySchema, 30, prismaPublic),
    getSetting('upload.convert_to_compatible', AnySchema, false, prismaPublic),
    getSetting('permissions.family', AnySchema, [], prismaPublic),
    getSetting('appearance.default_theme', AnySchema, 'auto', prismaPublic),
    getFeatureFlags(prismaPublic),
  ])
  return NextResponse.json({
    general: { app_name: appName },
    auth: { signup_enabled: signupEnabled },
    retention: { trash_days: retentionDays },
    upload: { convert_to_compatible: uploadConvert },
    permissions: { family: permissionsFamily },
    appearance: { default_theme: defaultTheme },
    features,
  })
}
