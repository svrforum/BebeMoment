import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { deleteSubscription, saveSubscription } from '@/server/notifications/subscriptions'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// 푸시 엔드포인트는 https URL(브라우저 push service)만 허용하고 길이를 캡한다 —
// 임의 문자열/거대 페이로드 저장(행 비대·blind SSRF 표면)을 막는다. register-device 의
// 토큰 길이 캡과 parity.
const subscribeSchema = z.object({
  endpoint: z
    .string()
    .url('올바른 엔드포인트가 필요합니다')
    .max(2048)
    .startsWith('https://', 'https 엔드포인트만 허용됩니다'),
  keys: z.object({
    p256dh: z.string().min(1, 'p256dh 키가 필요합니다').max(256),
    auth: z.string().min(1, 'auth 키가 필요합니다').max(256),
  }),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().min(1, '엔드포인트가 필요합니다').max(2048),
})

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  try {
    const body = subscribeSchema.parse(await req.json())
    await saveSubscription(
      {
        userId: session.userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: req.headers.get('user-agent'),
      },
      prismaPublic,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}

export async function DELETE(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  try {
    const body = unsubscribeSchema.parse(await req.json())
    await deleteSubscription({ userId: session.userId, endpoint: body.endpoint }, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
