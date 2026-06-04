import { requireAdmin } from '@/lib/require-admin'
import { backupDir, ownerDatabaseUrl, storageDataDir } from '@/server/backup/config'
import { findBackup } from '@/server/backup/list'
import { isValidBackupId } from '@/server/backup/manifest'
import { restoreBackup } from '@/server/backup/restore'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BodySchema = z.object({ confirm: z.string() })

/**
 * 인앱 완전 복구. requireAdmin 통과(이때까지 Prisma 사용) 후 restoreBackup 이 다른 DB
 * 연결을 끊고 pg_restore --clean 으로 덮어쓴다. 복구 자체는 execFile(Prisma 비의존)이라
 * 연결 종료의 영향을 안 받는다. 끝나면 프로세스를 종료해 컨테이너를 깨끗히 재시작시킨다
 * (run-app.sh 가 자식 종료를 감지 → Docker restart). 같은 인스턴스 롤백이 주 용도.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!isValidBackupId(id)) return errorJsonKey('backup.invalidId', 400)

  const body = BodySchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success || body.data.confirm !== id) {
    return errorJsonKey('backup.confirmMismatch', 400)
  }

  const found = await findBackup(backupDir(), id)
  if (!found) return errorJsonKey('backup.notFound', 404)

  try {
    const result = await restoreBackup({
      targetId: id,
      backupDir: backupDir(),
      dataDir: storageDataDir(),
      databaseUrl: ownerDatabaseUrl(),
      rolePasswords: {
        web: process.env.BEBE_WEB_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'bebe',
        media: process.env.BEBE_MEDIA_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'bebe',
      },
      // 인앱 복구는 라이브 DB 를 덮어쓰므로 사전 안전 스냅샷을 남긴다.
      safetySnapshot: true,
      log: (m) => console.log('[restore]', m),
    })
    // 응답을 흘려보낸 뒤 프로세스 종료 → 컨테이너 재시작(깨끗한 상태로 복구 반영).
    setTimeout(() => process.exit(0), 1500)
    return NextResponse.json({ ok: true, result, restarting: true })
  } catch (e) {
    return errorJson(e)
  }
}
