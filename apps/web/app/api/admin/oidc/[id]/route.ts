import { isInstanceAdmin } from '@/lib/admin'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { deleteProvider, updateProvider } from '@/server/oidc/providers'
import { parseEnv } from '@bebe/config'
import { NextResponse } from 'next/server'
import { z } from 'zod'

async function checkAdmin() {
  const { user } = await getAuth()
  if (!user) return null
  const env = parseEnv(process.env as Record<string, string | undefined>)
  if (!isInstanceAdmin(user.email, env.ADMIN_USER_EMAILS)) return null
  return { user, env }
}

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  issuer: z.string().url().optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    const body = UpdateSchema.parse(await req.json())
    await updateProvider(id, body, ctx.env.SECRET_KEY, prisma)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    await deleteProvider(id, prisma)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
