import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { requireAdmin } from '@/lib/require-admin'
import { backupDir } from '@/server/backup/config'
import { isValidBackupId } from '@/server/backup/manifest'
import { fetchRemoteChain, listRemoteBackups, loadRemoteConfig } from '@/server/backup/remote'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireRemote() {
  // 켜져 있는데 못 쓰는 상태면 loadRemoteConfig 가 이유를 담아 던진다 — 그대로 응답에 실어
  // "설정 안 됨"과 구분되게 한다.
  let cfg: Awaited<ReturnType<typeof loadRemoteConfig>>
  try {
    cfg = await loadRemoteConfig(prismaPublic, process.env.SECRET_KEY ?? '')
  } catch (e) {
    return errorJson(e)
  }
  if (!cfg) return errorJsonKey('backup.remoteNotConfigured', 400)
  return cfg
}

/** 원격 버킷에 있는 백업 목록. 로컬에 이미 있는지 함께 알려준다. */
export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const cfg = await requireRemote()
  if (cfg instanceof NextResponse) return cfg
  try {
    const backups = await listRemoteBackups(cfg)
    return NextResponse.json({ backups })
  } catch (e) {
    return errorJson(e)
  }
}

const PostSchema = z.object({ id: z.string() })

/**
 * 원격에서 복구 체인(베이스 full → 대상)을 로컬 백업 디렉터리로 가져온다.
 *
 * 가져오기만 하고 복구는 하지 않는다 — 복구는 돌아가는 앱이 없는 상태에서 CLI 로 해야
 * 하고(§bebe-restore), 여기서 바로 덮어쓰면 자기 자신을 밟는다.
 */
export async function POST(req: Request) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const cfg = await requireRemote()
  if (cfg instanceof NextResponse) return cfg
  try {
    const { id } = PostSchema.parse(await req.json())
    if (!isValidBackupId(id)) return errorJsonKey('backup.invalidId', 400)
    const chain = await fetchRemoteChain({ cfg, backupDir: backupDir(), targetId: id })
    return NextResponse.json({ chain })
  } catch (e) {
    return errorJson(e)
  }
}
