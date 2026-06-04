import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { requireAdmin } from '@/lib/require-admin'
import { resolveContext } from '@/server/context'
import { issuePasswordReset } from '@/server/member-admin/reset-password'
import { NextResponse } from 'next/server'

export async function POST(
  _req: Request,
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
    const result = await issuePasswordReset(
      {
        membershipId,
        familyId: ctx.family.id,
        actorUserId: ctx.user.id,
        publicUrl: admin.env.PUBLIC_URL,
      },
      prismaPublic,
    )
    return NextResponse.json({ url: result.url, expiresAt: result.expiresAt })
  } catch (e) {
    return errorJson(e)
  }
}
