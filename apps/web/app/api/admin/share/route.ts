import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJson } from '@/lib/error-response'
import { requireAdmin } from '@/lib/require-admin'
import { resolveContext } from '@/server/context'
import { listAllShareLinks, revokeAllShareLinks, revokeShareLink } from '@/server/share/manage'
import { NextResponse } from 'next/server'
import { z } from 'zod'

async function adminFamilyId(): Promise<{ error: NextResponse } | { familyId: string }> {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return { error: ctx }
  const { session } = await getAuth()
  const resolved = await resolveContext(
    { userId: ctx.user.id, currentFamilyId: session?.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!resolved.family) return { error: NextResponse.json({ error: 'No family' }, { status: 400 }) }
  return { familyId: resolved.family.id }
}

export async function GET() {
  const r = await adminFamilyId()
  if ('error' in r) return r.error
  const links = await listAllShareLinks(r.familyId, prismaPublic)
  return NextResponse.json({ links })
}

const RevokeSchema = z.union([
  z.object({ token: z.string().min(1) }),
  z.object({ all: z.literal(true) }),
])

export async function POST(req: Request) {
  const r = await adminFamilyId()
  if ('error' in r) return r.error
  try {
    const body = RevokeSchema.parse(await req.json())
    if ('all' in body) {
      const count = await revokeAllShareLinks(r.familyId, prismaPublic)
      return NextResponse.json({ revoked: count })
    }
    const ok = await revokeShareLink(body.token, r.familyId, prismaPublic)
    return NextResponse.json({ revoked: ok ? 1 : 0 })
  } catch (e) {
    return errorJson(e)
  }
}
