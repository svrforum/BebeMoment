import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { getFeatureFlags } from '@/server/settings/features'
import { DEFAULT_FACE_CLUSTER_DISTANCE } from '@bebe/core'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
})

// 암호화 저장·전용 라우트로만 다뤄야 하는 내부 키 — 이 일반 설정 엔드포인트로 평문/임의
// 값을 덮어쓰면 푸시·백업·메일이 조용히 깨진다(예: vapid_private 손상은 발송 때만 드러남).
// 각자 전용 라우트가 있으므로(notifications/vapid·smtp/password·backups/remote) 여기선 거부.
function isProtectedSettingKey(key: string): boolean {
  return (
    key === 'push.vapid_private' ||
    key === 'push.vapid_public' ||
    key === 'push.fcm_service_account' ||
    key.endsWith('.secret_key') ||
    key.endsWith('_enc')
  )
}

export async function POST(req: Request) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  try {
    const body = BodySchema.parse(await req.json())
    if (isProtectedSettingKey(body.key)) {
      return await errorJsonKey('protectedSetting', 403)
    }
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
