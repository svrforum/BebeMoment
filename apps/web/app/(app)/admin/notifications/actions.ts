'use server'
import type { ActionResult } from '@/lib/action-result'
import { encryptSecret } from '@/lib/crypto'
import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { actionReject, withActionLog } from '@/lib/with-action-log'
import { normalizeFcmClientConfig } from '@/server/notifications/fcm-config'
import { parseServiceAccount } from '@/server/notifications/fcm'
import { hourInQuietWindow } from '@/server/notifications/quiet-window'
import { ensureVapidKeys } from '@/server/notifications/vapid'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { NOTIFICATION_CATEGORIES } from '@bebe/core'
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { z } from 'zod'

async function adminUserId(): Promise<string> {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) throw actionReject(403, 'admin.notifications.errAdminRequired')
  return ctx.user.id
}

function requireSecretKey(): string {
  const secretKey = process.env.SECRET_KEY
  // 설정 누락은 관리자가 고칠 수 있는 예상된 실패지만 서버 잘못이라 500 으로 남긴다.
  if (!secretKey) throw actionReject(500, 'admin.notifications.errSecretKeyMissing')
  return secretKey
}

export async function setPushMaster(enabled: boolean): Promise<ActionResult> {
  return withActionLog('admin.push.setMaster', async () => {
    const userId = await adminUserId()
    await setSetting('push.enabled', String(enabled), userId, prismaPublic)
  })
}

export async function setPushCategory(category: string, enabled: boolean): Promise<ActionResult> {
  return withActionLog('admin.push.setCategory', async () => {
    const userId = await adminUserId()
    if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)) {
      throw actionReject(400, 'admin.notifications.errUnknownCategory')
    }
    await setSetting(`push.categories.${category}.enabled`, String(enabled), userId, prismaPublic)
  })
}

const DeliverySchema = z
  .object({
    mode: z.enum(['immediate', 'digest']),
    interval: z.enum(['hourly', 'every3h', 'daily']),
    dailyHour: z.number().int().min(0).max(23),
    quietEnabled: z.boolean(),
    quietStart: z.number().int().min(0).max(23),
    quietEnd: z.number().int().min(0).max(23),
  })
  // 다이제스트 발송 시각이 조용한 시간 안에 있으면 스캔이 매번 그 슬롯을 건너뛰어 푸시가
  // 영구히 안 나간다(digest.ts 의 isDigestSlot 이 quiet 검사를 먼저 한다). 저장 시점에 막는다.
  .refine(
    (v) =>
      !(
        v.mode === 'digest' &&
        v.interval === 'daily' &&
        v.quietEnabled &&
        hourInQuietWindow(v.dailyHour, v.quietStart, v.quietEnd)
      ),
    { message: 'admin.delivery.digestHourInQuietHours', path: ['dailyHour'] },
  )

export async function setDeliverySettings(
  input: z.infer<typeof DeliverySchema>,
): Promise<ActionResult> {
  return withActionLog('admin.push.setDelivery', async () => {
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
  })
}

export async function generateVapidKeys(): Promise<ActionResult> {
  return withActionLog('admin.push.generateVapid', async () => {
    const userId = await adminUserId()
    await ensureVapidKeys(
      {
        get: (key) => getSetting(key, z.string().nullable(), null, prismaPublic),
        set: (key, value) => setSetting(key, value, userId, prismaPublic),
      },
      requireSecretKey(),
    )
  })
}

export async function regenerateVapidKeys(): Promise<ActionResult> {
  return withActionLog('admin.push.regenerateVapid', async () => {
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
  })
}

export async function setFcmEnabled(enabled: boolean): Promise<ActionResult> {
  return withActionLog('admin.push.setFcmEnabled', async () => {
    const userId = await adminUserId()
    await setSetting('push.fcm.enabled', String(enabled), userId, prismaPublic)
  })
}

export async function setFcmServiceAccount(json: string): Promise<ActionResult> {
  return withActionLog('admin.push.setFcmServiceAccount', async () => {
    const userId = await adminUserId()
    const trimmed = json.trim()
    if (trimmed === '') {
      await setSetting('push.fcm_service_account', '', userId, prismaPublic)
      return
    }
    if (!parseServiceAccount(trimmed)) {
      throw actionReject(400, 'admin.notifications.errInvalidServiceAccount')
    }
    const enc = await encryptSecret(trimmed, requireSecretKey())
    await setSetting('push.fcm_service_account', enc, userId, prismaPublic)
  })
}

export async function setFcmClientConfig(json: string): Promise<ActionResult> {
  return withActionLog('admin.push.setFcmClientConfig', async () => {
    const userId = await adminUserId()
    const trimmed = json.trim()
    if (trimmed === '') {
      await setSetting('push.fcm_client_config', '', userId, prismaPublic)
      return
    }
    // firebaseConfig 객체 또는 Firebase 에서 받은 google-services.json 을 그대로 받아 필요한
    // 4개 필드만 추출·정규화해 저장한다(관리자가 파일을 바로 올릴 수 있게).
    const config = normalizeFcmClientConfig(trimmed)
    if (!config) throw actionReject(400, 'admin.notifications.errInvalidClientConfig')
    await setSetting('push.fcm_client_config', JSON.stringify(config), userId, prismaPublic)
  })
}
