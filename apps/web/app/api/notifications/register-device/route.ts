import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { publicOrigin } from '@/lib/request-origin'
import { deleteDeviceToken, registerDeviceToken } from '@/server/notifications/device-tokens'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { parseEnv } from '@bebe/config'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// 멀티 인스턴스 앱은 알림을 탭하면 그 알림의 출처 가족(서버)으로 전환한 뒤 딥링크한다.
// 그러려면 푸시에 앱이 아는 공개 주소(리버스 프록시 도메인)가 실려야 하는데, 발송 워커엔
// 요청 컨텍스트가 없어 Host 를 못 읽는다. 그래서 기기 등록(요청 컨텍스트가 있는 시점)에서
// 실제 접속 오리진을 `push.public_base` 설정에 저장해두고, 워커가 그 값을 FCM server 필드로
// echo 한다. 한 인스턴스=한 가족=한 도메인이라 인스턴스당 단일 값이면 충분. 값이 바뀔 때만
// 기록(setting_history 스팸 방지)한다.
async function rememberPublicBase(req: Request, userId: string): Promise<void> {
  try {
    const env = parseEnv(process.env as Record<string, string | undefined>)
    const origin = publicOrigin(req, env.PUBLIC_URL)
    if (!origin) return
    const current = await getSetting('push.public_base', z.string(), '', prismaPublic)
    if (origin !== current) await setSetting('push.public_base', origin, userId, prismaPublic)
  } catch {
    // 라우팅 힌트일 뿐 — 저장 실패해도 기기 등록 자체는 성공시킨다.
  }
}

const registerSchema = z.object({
  token: z.string().min(1, '토큰이 필요합니다').max(4096, '토큰이 너무 깁니다'),
  platform: z.enum(['android', 'ios']).default('android'),
})

const unregisterSchema = z.object({
  token: z.string().min(1, '토큰이 필요합니다').max(4096, '토큰이 너무 깁니다'),
})

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  try {
    const body = registerSchema.parse(await req.json())
    await registerDeviceToken(
      { userId: session.userId, token: body.token, platform: body.platform },
      prismaPublic,
    )
    await rememberPublicBase(req, session.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}

export async function DELETE(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  try {
    const body = unregisterSchema.parse(await req.json())
    await deleteDeviceToken({ userId: session.userId, token: body.token }, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
