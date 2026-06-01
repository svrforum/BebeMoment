import { promises as fs } from 'node:fs'
import path from 'node:path'
import { requireAdmin } from '@/lib/require-admin'
import { backupDir } from '@/server/backup/config'
import { findBackup } from '@/server/backup/list'
import { bundleName, manifestName } from '@/server/backup/manifest'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ID_RE = /^bebe-backup-\d{8}-\d{6}-(full|incr)$/

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!ID_RE.test(id)) return NextResponse.json({ error: '잘못된 백업 id' }, { status: 400 })
  const found = await findBackup(backupDir(), id)
  if (!found) return NextResponse.json({ error: '백업을 찾을 수 없어요' }, { status: 404 })
  const dir = backupDir()
  await fs.rm(path.join(dir, bundleName(id)), { force: true })
  await fs.rm(path.join(dir, manifestName(id)), { force: true })
  return NextResponse.json({ ok: true })
}
