import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { createProvider, listProviders } from '@/server/oidc/providers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateSchema = z
  .object({
    name: z.string().min(1),
    id: z.string().uuid().optional(),
    kind: z.enum(['oidc', 'naver']).default('oidc'),
    // 네이버는 discovery 가 없어 issuer 가 의미 없다 → oidc 일 때만 URL 강제.
    issuer: z.string().default(''),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    scopes: z.array(z.string()).default(['openid', 'email', 'profile']),
  })
  .refine((d) => d.kind === 'naver' || /^https?:\/\/.+/.test(d.issuer), {
    message: 'OIDC 공급자는 issuer URL 이 필요합니다',
    path: ['issuer'],
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
