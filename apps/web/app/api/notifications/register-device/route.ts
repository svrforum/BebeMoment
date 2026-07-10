import { hasAdminAccess } from '@/lib/admin-access'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { isPublicDomainOrigin } from '@/lib/public-domain-origin'
import { publicOrigin } from '@/lib/request-origin'
import { deleteDeviceToken, registerDeviceToken } from '@/server/notifications/device-tokens'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { parseEnv } from '@bebe/config'
import type { User } from '@bebe/db-public'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// 멀티 인스턴스 앱은 알림을 탭하면 그 알림의 출처 가족(서버)으로 전환한 뒤 딥링크한다.
// 그러려면 푸시에 앱이 아는 공개 주소(리버스 프록시 도메인)가 실려야 하는데, 발송 워커엔
// 요청 컨텍스트가 없어 Host 를 못 읽는다. 그래서 기기 등록(요청 컨텍스트가 있는 시점)에서
// 실제 접속 오리진을 `push.public_base` 설정에 저장해두고 워커가 FCM server 필드로 echo 한다.
// ⚠️ 이 값은 인스턴스 전역·모든 유저의 알림 라우팅에 쓰인다 — Host 헤더는 스푸핑 가능하므로
// **관리자(owner/인스턴스admin) 등록 요청에서만**, 그리고 **진짜 공개 도메인일 때만** 기록한다.
// (한 인스턴스=한 가족=한 도메인이라 owner 가 앱을 한 번 열면 채워진다.) 값이 바뀔 때만 기록.
async function rememberPublicBase(
  req: Request,
  user: Pick<User, 'id' | 'email' | 'emailVerified'>,
  currentFamilyId: string | null,
): Promise<void> {
  try {
    const env = parseEnv(process.env as Record<string, string | undefined>)
    const isAdmin = await hasAdminAccess(prismaPublic, user, currentFamilyId, env.ADMIN_USER_EMAILS)
    if (!isAdmin) return
    const origin = publicOrigin(req, env.PUBLIC_URL)
    if (!isPublicDomainOrigin(origin)) return
    const current = await getSetting('push.public_base', z.string(), '', prismaPublic)
    if (origin !== current) await setSetting('push.public_base', origin, user.id, prismaPublic)
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
  const { session, user } = await getAuth()
  if (!session || !user) return errorJsonKey('unauthorized', 401)
  try {
    const body = registerSchema.parse(await req.json())
    await registerDeviceToken(
      { userId: session.userId, token: body.token, platform: body.platform },
      prismaPublic,
    )
    await rememberPublicBase(req, user, session.currentFamilyId ?? null)
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
