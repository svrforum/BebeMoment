import { AppHeader } from '@/components/shell/app-header'
import { backupDir, storageDataDir } from '@/server/backup/config'
import { formatBytes, getSystemInfo } from '@/server/system/info'
import { getTranslations } from 'next-intl/server'

// 라이브 지표(메모리·디스크)라 매 요청 새로 읽는다.
export const dynamic = 'force-dynamic'

function formatUptime(
  sec: number,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const parts: string[] = []
  if (d) parts.push(t('system.uptimeDays', { d }))
  if (h) parts.push(t('system.uptimeHours', { h }))
  parts.push(t('system.uptimeMinutes', { m }))
  return parts.join(' ')
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-[13px] text-base-500">{label}</span>
      <span className="min-w-0 truncate text-right text-[14px] font-medium text-base-900 dark:text-base-50">
        {value}
      </span>
    </div>
  )
}

function UsageBar({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const danger = pct >= 90
  const warn = pct >= 75
  return (
    <div className="px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-[13px] text-base-500">{label}</span>
        <span className="text-[13px] font-medium tabular-nums text-base-700 dark:text-base-300">
          {formatBytes(used)} / {formatBytes(total)} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-base-100 dark:bg-base-800">
        <div
          className={
            danger
              ? 'h-full rounded-full bg-danger'
              : warn
                ? 'h-full rounded-full bg-amber-500'
                : 'h-full rounded-full bg-point-500'
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-base-200/70 overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-card dark:divide-base-800/70 dark:border-base-800/70 dark:bg-base-900">
      {children}
    </div>
  )
}

export default async function AdminSystemPage() {
  const t = await getTranslations('admin')
  const info = await getSystemInfo([
    { label: t('system.diskMedia'), path: storageDataDir() },
    { label: t('system.diskBackup'), path: backupDir() },
  ])

  return (
    <>
      <AppHeader title={t('system.title')} subtitle={t('system.subtitle')} />
      <div className="mx-auto max-w-3xl space-y-5 px-5 py-4">
        <Card>
          <InfoRow label={t('system.version')} value={info.version} />
          <InfoRow label={t('system.platform')} value={`${info.platform} · ${info.arch}`} />
          <InfoRow
            label={t('system.cpu')}
            value={t('system.cpuValue', { model: info.cpuModel, count: info.cpuCount })}
          />
          <InfoRow label={t('system.uptime')} value={formatUptime(info.uptimeSec, t)} />
        </Card>

        <Card>
          <UsageBar label={t('system.memory')} used={info.mem.used} total={info.mem.total} />
          {info.disks.map((d) =>
            'total' in d ? (
              <UsageBar key={d.path} label={d.label} used={d.used} total={d.total} />
            ) : (
              <InfoRow key={d.path} label={d.label} value={t('system.unavailable')} />
            ),
          )}
        </Card>
      </div>
    </>
  )
}
