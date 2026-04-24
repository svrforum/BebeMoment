import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { createProvider, listProviders } from '@/server/oidc/providers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.array(z.string()).default(['openid', 'email', 'profile']),
})

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const providers = await listProviders(prismaPublic)
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
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  try {
    const body = CreateSchema.parse(await req.json())
    const p = await createProvider(body, ctx.env.SECRET_KEY, prismaPublic)
    return NextResponse.json({ id: p.id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
