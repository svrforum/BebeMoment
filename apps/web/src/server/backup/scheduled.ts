import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import type { PrismaClient } from '@bebe/db-public'
import { z } from 'zod'
import { backupDir } from './config'
import { redactSecrets } from './remote'
import { applyRetention } from './retention'
import { runBackup } from './run'
import { DEFAULT_SCHEDULE, type ScheduleSettings, dayKey, decideScheduledBackup } from './schedule'

async function readSchedule(prisma: PrismaClient): Promise<ScheduleSettings> {
  return {
    enabled: await getSetting(
      'backup.schedule.enabled',
      z.boolean(),
      DEFAULT_SCHEDULE.enabled,
      prisma,
    ),
    hour: await getSetting('backup.schedule.hour', z.number(), DEFAULT_SCHEDULE.hour, prisma),
    interval: await getSetting(
      'backup.schedule.interval',
      z.enum(['daily', 'weekly']),
      DEFAULT_SCHEDULE.interval,
      prisma,
    ),
    weekday: await getSetting(
      'backup.schedule.weekday',
      z.number(),
      DEFAULT_SCHEDULE.weekday,
      prisma,
    ),
    fullEvery: await getSetting(
      'backup.full_every',
      z.number(),
      DEFAULT_SCHEDULE.fullEvery,
      prisma,
    ),
  }
}

/**
 * 매시간 틱 — 스케줄 설정을 읽어 지금 백업할지 판단하고, 맞으면 백업 생성 + 보존 정리 +
 * 원격 미러(있으면). 실패는 조용히 삼키지 않고 settings 에 기록(§2#6).
 */
export async function runScheduledBackupTick(
  now: Date,
  prisma: PrismaClient,
  log: (m: string) => void,
  onCreated?: (id: string) => Promise<void>,
): Promise<void> {
  const settings = await readSchedule(prisma)
  const lastRunDay = await getSetting('backup.last_run_day', z.string().nullable(), null, prisma)
  const runCount = await getSetting('backup.run_count', z.number(), 0, prisma)

  const decision = decideScheduledBackup({ settings, now, lastRunDay, runCount })
  if (!decision.run) return

  const includeSecret = await getSetting('backup.include_secret', z.boolean(), false, prisma)
  log(`scheduled backup start: ${decision.type}`)
  try {
    const { manifest } = await runBackup({ type: decision.type, includeSecret, now }, prisma)
    await setSetting('backup.last_run_day', dayKey(now), null, prisma)
    await setSetting('backup.run_count', runCount + 1, null, prisma)

    const keep = await getSetting('backup.retention.keep', z.number(), 14, prisma)
    const deleted = await applyRetention(backupDir(), keep)
    log(`scheduled backup done: ${manifest.id} (retention deleted ${deleted.length})`)

    if (onCreated) await onCreated(manifest.id)
  } catch (e) {
    const msg = redactSecrets(`${dayKey(now)}: ${(e as Error).message}`).slice(0, 300)
    log(`scheduled backup FAILED: ${msg}`)
    await setSetting('backup.last_error', msg, null, prisma).catch(() => {})
  }
}
