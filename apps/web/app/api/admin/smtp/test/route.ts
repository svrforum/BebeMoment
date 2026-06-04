import { prismaPublic } from '@/lib/db-init'
import { sendMail } from '@/lib/mailer'
import { requireAdmin } from '@/lib/require-admin'
import { errorJson } from '@/lib/error-response'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({ to: z.string().email() })

export async function POST(req: Request) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { to } = BodySchema.parse(await req.json())
    await sendMail(
      {
        to,
        subject: 'Bebe Moment SMTP 테스트',
        html: '<p>SMTP 설정이 정상적으로 동작합니다.</p>',
        text: 'SMTP 설정이 정상적으로 동작합니다.',
      },
      prismaPublic,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
