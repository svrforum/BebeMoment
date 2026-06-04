import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { requireAdmin } from '@/lib/require-admin'
import { renameFamily } from '@/server/family/rename'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({ name: z.string() })

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { session } = await getAuth()
  const familyId = session?.currentFamilyId ?? null
  const fam = familyId
    ? await prismaPublic.family.findUnique({ where: { id: familyId }, select: { name: true } })
    : null
  return NextResponse.json({ name: fam?.name ?? '' })
}

export async function PUT(req: Request) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { session } = await getAuth()
  const familyId = session?.currentFamilyId ?? null
  if (!familyId) return errorJsonKey('noFamily', 400)
  try {
    const { name } = BodySchema.parse(await req.json())
    const updated = await renameFamily(familyId, name, prismaPublic)
    return NextResponse.json(updated)
  } catch (e) {
    return errorJson(e)
  }
}
