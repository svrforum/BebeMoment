import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { requireAdmin } from '@/lib/require-admin'
import { backupDir } from '@/server/backup/config'
import { findBackup } from '@/server/backup/list'
import { bundleName, isValidBackupId } from '@/server/backup/manifest'
import { errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!isValidBackupId(id)) return errorJsonKey('backup.invalidId', 400)
  const found = await findBackup(backupDir(), id)
  if (!found) return errorJsonKey('backup.notFound', 404)

  const file = path.join(backupDir(), bundleName(id))
  const stat = await fs.stat(file).catch(() => null)
  if (!stat) return errorJsonKey('backup.bundleMissing', 404)

  const stream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream<Uint8Array>
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zstd',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${bundleName(id)}"`,
    },
  })
}
