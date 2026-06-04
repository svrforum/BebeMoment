import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { deleteProvider, updateProvider } from '@/server/oidc/providers'
import { errorJson } from '@/lib/error-response'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  issuer: z.string().url().optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    const body = UpdateSchema.parse(await req.json())
    await updateProvider(id, body, ctx.env.SECRET_KEY, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    await deleteProvider(id, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
