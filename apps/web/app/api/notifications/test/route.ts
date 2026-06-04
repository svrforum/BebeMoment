import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { sendTestNotification } from '@/server/notifications/test-send'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// 본인 기기로만 보내는 테스트지만, FCM 쿼터·OAuth 발급 남용을 막으려 사용자별 쿨다운.
// 단일 노드 프로세스(standalone)라 모듈 레벨 Map 으로 충분(재시작 시 리셋 무해).
const COOLDOWN_MS = 30_000
const lastTestAt = new Map<string, number>()

export async function POST() {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const now = Date.now()
  const last = lastTestAt.get(session.userId) ?? 0
  if (now - last < COOLDOWN_MS) {
    return errorJsonKey('notif.testCooldown', 429)
  }
  lastTestAt.set(session.userId, now)
  const secretKey = process.env.SECRET_KEY
  if (!secretKey) return errorJsonKey('serverError', 500)
  const store = {
    get: (k: string) => getSetting(k, z.string().nullable(), null, prismaPublic),
    set: (k: string, v: string) => setSetting(k, v, null, prismaPublic),
  }
  try {
    const result = await sendTestNotification(session.userId, prismaPublic, store, secretKey)
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
