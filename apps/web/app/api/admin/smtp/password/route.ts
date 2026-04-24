import { encryptSecret } from '@/lib/crypto'
import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { setSetting } from '@/server/settings/set'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({ password: z.string().min(1) })

export async function POST(req: Request) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { password } = BodySchema.parse(await req.json())
    const enc = await encryptSecret(password, ctx.env.SECRET_KEY)
    await setSetting('smtp.password_enc', enc, ctx.user.id, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
