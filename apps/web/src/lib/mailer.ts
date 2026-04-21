import { decryptSecret } from '@/lib/crypto'
import { getSetting } from '@/server/settings/get'
import type { PrismaClient } from '@bebe/db'
import nodemailer, { type Transporter } from 'nodemailer'
import { z } from 'zod'

const StringSchema = z.string()
const NumberSchema = z.number().int().positive()
const BoolSchema = z.boolean()

export type MailerConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  fromAddress: string
  fromName: string
}

export async function loadMailerConfig(prisma: PrismaClient): Promise<MailerConfig | null> {
  const [host, port, secure, user, passwordEnc, fromAddress, fromName] = await Promise.all([
    getSetting('smtp.host', StringSchema, '', prisma),
    getSetting('smtp.port', NumberSchema, 587, prisma),
    getSetting('smtp.secure', BoolSchema, false, prisma),
    getSetting('smtp.user', StringSchema, '', prisma),
    getSetting('smtp.password_enc', StringSchema, '', prisma),
    getSetting('smtp.from_address', StringSchema, '', prisma),
    getSetting('smtp.from_name', StringSchema, 'bebe-moment', prisma),
  ])
  if (!host || !user || !passwordEnc || !fromAddress) return null
  const secretKey = process.env.SECRET_KEY
  if (!secretKey) throw new Error('SECRET_KEY not set')
  const password = await decryptSecret(passwordEnc, secretKey)
  return { host, port, secure, user, password, fromAddress, fromName }
}

export function makeTransporter(cfg: MailerConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
  })
}

export async function sendMail(
  args: { to: string; subject: string; html: string; text?: string },
  prisma: PrismaClient,
): Promise<void> {
  const cfg = await loadMailerConfig(prisma)
  if (!cfg) throw new Error('SMTP not configured')
  const transporter = makeTransporter(cfg)
  await transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromAddress}>`,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  })
}
