import { prismaPublic } from '@/lib/db-init'
import { getTranslations } from 'next-intl/server'
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
    const t = await getTranslations('admin')
    const body = t('smtp.testMail.body')
    await sendMail(
      {
        to,
        subject: t('smtp.testMail.subject'),
        html: `<p>${body}</p>`,
        text: body,
      },
      prismaPublic,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
