import { requireAdmin } from '@/lib/require-admin'
import { backupDir } from '@/server/backup/config'
import { findBackup, listBackups } from '@/server/backup/list'
import { deleteBackupFiles, hasDependentDescendant } from '@/server/backup/retention'
import { isValidBackupId } from '@/server/backup/manifest'
import { errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!isValidBackupId(id)) return errorJsonKey('backup.invalidId', 400)
  const dir = backupDir()
  const found = await findBackup(dir, id)
  if (!found) return errorJsonKey('backup.notFound', 404)
  // 이 백업에 의존하는 증분 체인이 있으면 삭제 거부 — 베이스/중간을 지우면 그 위 증분이
  // 복구 불능이 된다(applyRetention 조상보호와 같은 불변식).
  if (hasDependentDescendant(await listBackups(dir), id)) {
    return errorJsonKey('backup.hasDependents', 409)
  }
  await deleteBackupFiles(dir, id)
  return NextResponse.json({ ok: true })
}
