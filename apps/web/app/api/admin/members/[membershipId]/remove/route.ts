import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { requireAdmin } from '@/lib/require-admin'
import { resolveContext } from '@/server/context'
import { removeMember } from '@/server/member-admin/remove'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// 확인 단어는 로케일마다 다르다(ko '제외' / en 'REMOVE') — 단어 대조는 모달이 하고 서버는
// 명시적 확인 플래그만 본다. 서버가 한글 리터럴을 요구하던 동안 en 관리자는 아무도 제외할 수 없었다.
const Body = z.object({ confirm: z.literal(true) })

export async function POST(
  req: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { session } = await getAuth()
  const ctx = await resolveContext(
    { userId: session?.userId ?? null, currentFamilyId: session?.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
  try {
    const { membershipId } = await params
    Body.parse(await req.json())
    await removeMember(
      { membershipId, familyId: ctx.family.id, actorUserId: ctx.user.id },
      prismaPublic,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
