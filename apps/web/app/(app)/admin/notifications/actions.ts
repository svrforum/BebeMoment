'use server'
import { encryptSecret } from '@/lib/crypto'
import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { parseServiceAccount } from '@/server/notifications/fcm'
import { ensureVapidKeys } from '@/server/notifications/vapid'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { NOTIFICATION_CATEGORIES } from '@bebe/core'
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { z } from 'zod'

async function adminUserId(): Promise<string> {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) throw new Error('관리자 권한이 필요합니다.')
  return ctx.user.id
}

export async function setPushMaster(enabled: boolean): Promise<void> {
  const userId = await adminUserId()
  await setSetting('push.enabled', String(enabled), userId, prismaPublic)
}

export async function setPushCategory(category: string, enabled: boolean): Promise<void> {
  const userId = await adminUserId()
  if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error('알 수 없는 알림 카테고리입니다.')
  }
  await setSetting(`push.categories.${category}.enabled`, String(enabled), userId, prismaPublic)
}

export async function generateVapidKeys(): Promise<void> {
  const userId = await adminUserId()
  await ensureVapidKeys({
    get: (key) => getSetting(key, z.string().nullable(), null, prismaPublic),
    set: (key, value) => setSetting(key, value, userId, prismaPublic),
  })
}

export async function regenerateVapidKeys(): Promise<void> {
  const userId = await adminUserId()
  const generated = webpush.generateVAPIDKeys()
  await setSetting('push.vapid_public', generated.publicKey, userId, prismaPublic)
  await setSetting('push.vapid_private', generated.privateKey, userId, prismaPublic)
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
  if (!parseServiceAccount(trimmed)) {
    throw new Error(
      '올바른 Firebase 서비스 계정 JSON이 아닙니다 (project_id·client_email·private_key 필요).',
    )
  }
  const secretKey = process.env.SECRET_KEY
  if (!secretKey) throw new Error('SECRET_KEY가 설정되지 않았습니다.')
  const enc = await encryptSecret(trimmed, secretKey)
  await setSetting('push.fcm_service_account', enc, userId, prismaPublic)
}
