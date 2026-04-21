import { isInstanceAdmin } from '@/lib/admin'
import { getAuth } from '@/lib/auth'
import { encryptSecret } from '@/lib/crypto'
import { prisma } from '@/lib/db-init'
import { setSetting } from '@/server/settings/set'
import { parseEnv } from '@bebe/config'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({ password: z.string().min(1) })

export async function POST(req: Request) {
  const { user } = await getAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const env = parseEnv(process.env as Record<string, string | undefined>)
  if (!isInstanceAdmin(user.email, env.ADMIN_USER_EMAILS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const { password } = BodySchema.parse(await req.json())
    const enc = await encryptSecret(password, env.SECRET_KEY)
    await setSetting('smtp.password_enc', enc, user.id, prisma)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
