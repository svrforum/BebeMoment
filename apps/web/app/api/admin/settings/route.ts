import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { getFeatureFlags } from '@/server/settings/features'
import { DEFAULT_FACE_CLUSTER_DISTANCE } from '@bebe/core'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { errorJson } from '@/lib/error-response'
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
    return errorJson(e)
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
    defaultLocale,
    downloadCompress,
    features,
    navFamilyHidden,
    facesClusterDistance,
    backupIncludeSecret,
    backupSchedEnabled,
    backupSchedHour,
    backupSchedInterval,
    backupSchedWeekday,
    backupFullEvery,
    backupRetentionKeep,
    backupLastError,
    backupRemoteEnabled,
    backupRemoteConfigured,
  ] = await Promise.all([
    getSetting('general.app_name', AnySchema, 'Bebe Moment', prismaPublic),
    getSetting('auth.signup_enabled', AnySchema, false, prismaPublic),
    getSetting('retention.trash_days', AnySchema, 30, prismaPublic),
    getSetting('upload.convert_to_compatible', AnySchema, false, prismaPublic),
    getSetting('permissions.family', AnySchema, [], prismaPublic),
    getSetting('appearance.default_theme', AnySchema, 'auto', prismaPublic),
    getSetting('appearance.default_locale', AnySchema, 'ko', prismaPublic),
    getSetting('download.compress.enabled', AnySchema, true, prismaPublic),
    getFeatureFlags(prismaPublic),
    getSetting('nav.family.hidden', AnySchema, [], prismaPublic),
    getSetting('faces.cluster_distance', AnySchema, DEFAULT_FACE_CLUSTER_DISTANCE, prismaPublic),
    getSetting('backup.include_secret', AnySchema, false, prismaPublic),
    getSetting('backup.schedule.enabled', AnySchema, false, prismaPublic),
    getSetting('backup.schedule.hour', AnySchema, 4, prismaPublic),
    getSetting('backup.schedule.interval', AnySchema, 'daily', prismaPublic),
    getSetting('backup.schedule.weekday', AnySchema, 0, prismaPublic),
    getSetting('backup.full_every', AnySchema, 7, prismaPublic),
    getSetting('backup.retention.keep', AnySchema, 14, prismaPublic),
    getSetting('backup.last_error', AnySchema, null, prismaPublic),
    getSetting('backup.remote.enabled', AnySchema, false, prismaPublic),
    getSetting('backup.remote.secret_key', z.string(), '', prismaPublic).then((v) => v.length > 0),
  ])
  return NextResponse.json({
    general: { app_name: appName },
    auth: { signup_enabled: signupEnabled },
    retention: { trash_days: retentionDays },
    upload: { convert_to_compatible: uploadConvert },
    permissions: { family: permissionsFamily },
    appearance: { default_theme: defaultTheme, default_locale: defaultLocale },
    download: { compress: { enabled: downloadCompress } },
    features,
    nav: { family: { hidden: navFamilyHidden } },
    faces: { cluster_distance: facesClusterDistance },
    backup: {
      include_secret: backupIncludeSecret,
      schedule: {
        enabled: backupSchedEnabled,
        hour: backupSchedHour,
        interval: backupSchedInterval,
        weekday: backupSchedWeekday,
      },
      full_every: backupFullEvery,
      retention: { keep: backupRetentionKeep },
      last_error: backupLastError,
      remote: { enabled: backupRemoteEnabled, configured: backupRemoteConfigured },
    },
  })
}
