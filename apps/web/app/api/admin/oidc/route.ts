import { isInstanceAdmin } from '@/lib/admin'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { createProvider, listProviders } from '@/server/oidc/providers'
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

const CreateSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.array(z.string()).default(['openid', 'email', 'profile']),
})

export async function GET() {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const providers = await listProviders(prisma)
  return NextResponse.json({
    providers: providers.map((p) => ({
      id: p.id,
      name: p.name,
      issuer: p.issuer,
      clientId: p.clientId,
      scopes: p.scopes,
      enabled: p.enabled,
    })),
  })
}

export async function POST(req: Request) {
  const ctx = await checkAdmin()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = CreateSchema.parse(await req.json())
    const p = await createProvider(body, ctx.env.SECRET_KEY, prisma)
    return NextResponse.json({ id: p.id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
