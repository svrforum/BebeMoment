import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { backupDir } from '@/server/backup/config'
import { listBackups } from '@/server/backup/list'
import { runBackup } from '@/server/backup/run'
import { getSetting } from '@/server/settings/get'
import { errorJson } from '@/lib/error-response'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const backups = await listBackups(backupDir())
  return NextResponse.json({ backups })
}

const PostSchema = z.object({
  type: z.enum(['full', 'incr']),
  includeSecret: z.boolean().optional(),
})

export async function POST(req: Request) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { type, includeSecret } = PostSchema.parse(await req.json())
    const defaultInclude = await getSetting(
      'backup.include_secret',
      z.boolean(),
      false,
      prismaPublic,
    )
    const result = await runBackup(
      { type, includeSecret: includeSecret ?? defaultInclude, now: new Date() },
      prismaPublic,
    )
    return NextResponse.json({
      ok: true,
      manifest: result.manifest,
      bundleBytes: result.bundleBytes,
      remoteMirrored: result.remoteMirrored,
    })
  } catch (e) {
    return errorJson(e)
  }
}
