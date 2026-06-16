'use server'
import { encryptSecret } from '@/lib/crypto'
import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { normalizeFcmClientConfig } from '@/server/notifications/fcm-config'
import { parseServiceAccount } from '@/server/notifications/fcm'
import { ensureVapidKeys } from '@/server/notifications/vapid'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { NOTIFICATION_CATEGORIES } from '@bebe/core'
import { getTranslations } from 'next-intl/server'
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { z } from 'zod'

async function adminUserId(): Promise<string> {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) {
    const t = await getTranslations('admin')
    throw new Error(t('notifications.errAdminRequired'))
  }
  return ctx.user.id
}

export async function setPushMaster(enabled: boolean): Promise<void> {
  const userId = await adminUserId()
  await setSetting('push.enabled', String(enabled), userId, prismaPublic)
}

export async function setPushCategory(category: string, enabled: boolean): Promise<void> {
  const userId = await adminUserId()
  if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)) {
    const t = await getTranslations('admin')
    throw new Error(t('notifications.errUnknownCategory'))
  }
  await setSetting(`push.categories.${category}.enabled`, String(enabled), userId, prismaPublic)
}

const DeliverySchema = z.object({
  mode: z.enum(['immediate', 'digest']),
  interval: z.enum(['hourly', 'every3h', 'daily']),
  dailyHour: z.number().int().min(0).max(23),
  quietEnabled: z.boolean(),
  quietStart: z.number().int().min(0).max(23),
  quietEnd: z.number().int().min(0).max(23),
})

export async function setDeliverySettings(input: z.infer<typeof DeliverySchema>): Promise<void> {
  const userId = await adminUserId()
  const d = DeliverySchema.parse(input)
  await Promise.all([
    setSetting('push.delivery.mode', d.mode, userId, prismaPublic),
    setSetting('push.delivery.interval', d.interval, userId, prismaPublic),
    setSetting('push.delivery.daily_hour', String(d.dailyHour), userId, prismaPublic),
    setSetting('push.quiet.enabled', String(d.quietEnabled), userId, prismaPublic),
    setSetting('push.quiet.start', String(d.quietStart), userId, prismaPublic),
    setSetting('push.quiet.end', String(d.quietEnd), userId, prismaPublic),
  ])
}

function requireSecretKey(): string {
  const secretKey = process.env.SECRET_KEY
  if (!secretKey) throw new Error('SECRET_KEY required')
  return secretKey
}

export async function generateVapidKeys(): Promise<void> {
  const userId = await adminUserId()
  await ensureVapidKeys(
    {
      get: (key) => getSetting(key, z.string().nullable(), null, prismaPublic),
      set: (key, value) => setSetting(key, value, userId, prismaPublic),
    },
    requireSecretKey(),
  )
}

export async function regenerateVapidKeys(): Promise<void> {
  const userId = await adminUserId()
  const generated = webpush.generateVAPIDKeys()
  await setSetting('push.vapid_public', generated.publicKey, userId, prismaPublic)
  // private 는 암호화 저장 (vapid.ts 와 동일 규약).
  await setSetting(
    'push.vapid_private',
    await encryptSecret(generated.privateKey, requireSecretKey()),
    userId,
    prismaPublic,
  )
  await prismaPublic.pushSubscription.deleteMany({})
}

export async function setFcmEnabled(enabled: boolean): Promise<void> {
  const userId = await adminUserId()
  await setSetting('push.fcm.enabled', String(enabled), userId, prismaPublic)
}

export async function setFcmServiceAccount(json: string): Promise<void> {
  const userId = await adminUserId()
  const trimmed = json.trim()
  if (trimmed === '') {
    await setSetting('push.fcm_service_account', '', userId, prismaPublic)
    return
  }
  const t = await getTranslations('admin')
  if (!parseServiceAccount(trimmed)) {
    throw new Error(t('notifications.errInvalidServiceAccount'))
  }
  const secretKey = process.env.SECRET_KEY
  if (!secretKey) throw new Error(t('notifications.errSecretKeyMissing'))
  const enc = await encryptSecret(trimmed, secretKey)
  await setSetting('push.fcm_service_account', enc, userId, prismaPublic)
}

export async function setFcmClientConfig(json: string): Promise<void> {
  const userId = await adminUserId()
  const trimmed = json.trim()
  if (trimmed === '') {
    await setSetting('push.fcm_client_config', '', userId, prismaPublic)
    return
  }
  const t = await getTranslations('admin')
  // firebaseConfig 객체 또는 Firebase 에서 받은 google-services.json 을 그대로 받아 필요한
  // 4개 필드만 추출·정규화해 저장한다(관리자가 파일을 바로 올릴 수 있게).
  const config = normalizeFcmClientConfig(trimmed)
  if (!config) {
    throw new Error(t('notifications.errInvalidClientConfig'))
  }
  await setSetting('push.fcm_client_config', JSON.stringify(config), userId, prismaPublic)
}
