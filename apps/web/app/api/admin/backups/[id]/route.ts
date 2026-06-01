import { requireAdmin } from '@/lib/require-admin'
import { backupDir } from '@/server/backup/config'
import { findBackup, listBackups } from '@/server/backup/list'
import { deleteBackupFiles, hasDependentDescendant } from '@/server/backup/retention'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ID_RE = /^bebe-backup-\d{8}-\d{6}-(full|incr)(-[0-9a-f]{6})?$/

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!ID_RE.test(id)) return NextResponse.json({ error: '잘못된 백업 id' }, { status: 400 })
  const dir = backupDir()
  const found = await findBackup(dir, id)
  if (!found) return NextResponse.json({ error: '백업을 찾을 수 없어요' }, { status: 404 })
  // 이 백업에 의존하는 증분 체인이 있으면 삭제 거부 — 베이스/중간을 지우면 그 위 증분이
  // 복구 불능이 된다(applyRetention 조상보호와 같은 불변식).
  if (hasDependentDescendant(await listBackups(dir), id)) {
    return NextResponse.json(
      { error: '이 백업에 의존하는 증분 백업이 있어 삭제할 수 없어요' },
      { status: 409 },
    )
  }
  await deleteBackupFiles(dir, id)
  return NextResponse.json({ ok: true })
}
