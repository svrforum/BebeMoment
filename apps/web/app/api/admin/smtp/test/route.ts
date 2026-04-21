import { isInstanceAdmin } from '@/lib/admin'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { sendMail } from '@/lib/mailer'
import { parseEnv } from '@bebe/config'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({ to: z.string().email() })

export async function POST(req: Request) {
  const { user } = await getAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const env = parseEnv(process.env as Record<string, string | undefined>)
  if (!isInstanceAdmin(user.email, env.ADMIN_USER_EMAILS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const { to } = BodySchema.parse(await req.json())
    await sendMail(
      {
        to,
        subject: 'bebe-moment SMTP 테스트',
        html: '<p>SMTP 설정이 정상적으로 동작합니다.</p>',
        text: 'SMTP 설정이 정상적으로 동작합니다.',
      },
      prisma,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
