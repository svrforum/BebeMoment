'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { AlertTriangle, Download, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

type Backup = {
  id: string
  createdAt: string
  type: 'full' | 'incr'
  parentId: string | null
  includesSecret: boolean
  dataFileCount: number
  dataBytes: number
  bundleBytes: number
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const u = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${u[i]}`
}

type Schedule = {
  enabled: boolean
  hour: number
  interval: 'daily' | 'weekly'
  weekday: number
  fullEvery: number
  retentionKeep: number
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

export default function BackupAdminPage() {
  const t = useTranslations('admin')
  const WEEKDAYS = [
    t('backup.weekdaySun'),
    t('backup.weekdayMon'),
    t('backup.weekdayTue'),
    t('backup.weekdayWed'),
    t('backup.weekdayThu'),
    t('backup.weekdayFri'),
    t('backup.weekdaySat'),
  ]
  const [backups, setBackups] = useState<Backup[]>([])
  const [includeSecret, setIncludeSecret] = useState(false)
  const [sched, setSched] = useState<Schedule>({
    enabled: false,
    hour: 4,
    interval: 'daily',
    weekday: 0,
    fullEvery: 7,
    retentionKeep: 14,
  })
  const [lastError, setLastError] = useState<string | null>(null)
  const [remote, setRemote] = useState({
    enabled: false,
    endpoint: '',
    region: 'us-east-1',
    bucket: '',
    prefix: '',
    accessKey: '',
    secretKey: '',
    secretConfigured: false,
    lastError: null as string | null,
  })
  const [remoteStatus, setRemoteStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [b, s, rm] = await Promise.all([
      fetch('/api/admin/backups').then((r) => r.json()),
      fetch('/api/admin/settings').then((r) => r.json()),
      fetch('/api/admin/backups/remote').then((r) => r.json()),
    ])
    if (Array.isArray(b.backups)) setBackups(b.backups)
    if (rm && typeof rm.bucket === 'string') {
      setRemote((prev) => ({
        ...prev,
        enabled: Boolean(rm.enabled),
        endpoint: rm.endpoint ?? '',
        region: rm.region ?? 'us-east-1',
        bucket: rm.bucket ?? '',
        prefix: rm.prefix ?? '',
        accessKey: rm.accessKey ?? '',
        secretConfigured: Boolean(rm.secretConfigured),
        lastError: rm.lastError ?? null,
        secretKey: '',
      }))
    }
    const bk = s.backup
    if (bk) {
      if (typeof bk.include_secret === 'boolean') setIncludeSecret(bk.include_secret)
      setLastError(typeof bk.last_error === 'string' ? bk.last_error : null)
      setSched({
        enabled: Boolean(bk.schedule?.enabled),
        hour: Number(bk.schedule?.hour ?? 4),
        interval: bk.schedule?.interval === 'weekly' ? 'weekly' : 'daily',
        weekday: Number(bk.schedule?.weekday ?? 0),
        fullEvery: Number(bk.full_every ?? 7),
        retentionKeep: Number(bk.retention?.keep ?? 14),
      })
    }
  }, [])

  async function saveSetting(key: string, value: unknown) {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
  }

  async function saveRemote(extra: Record<string, unknown> = {}) {
    setRemoteStatus(t('backup.saving'))
    const body = {
      enabled: remote.enabled,
      endpoint: remote.endpoint,
      region: remote.region,
      bucket: remote.bucket,
      prefix: remote.prefix,
      accessKey: remote.accessKey,
      ...(remote.secretKey ? { secretKey: remote.secretKey } : {}),
      ...extra,
    }
    const res = await fetch('/api/admin/backups/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    setRemoteStatus(res.ok ? t('backup.saved') : t('backup.failedWith', { error: d.error ?? '' }))
    if (res.ok) await load()
  }

  async function testRemote() {
    setRemoteStatus(t('backup.testingConnection'))
    const res = await fetch('/api/admin/backups/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test: true,
        endpoint: remote.endpoint,
        region: remote.region,
        bucket: remote.bucket,
        prefix: remote.prefix,
        accessKey: remote.accessKey,
        ...(remote.secretKey ? { secretKey: remote.secretKey } : {}),
      }),
    })
    const d = await res.json().catch(() => ({}))
    setRemoteStatus(
      res.ok ? t('backup.connectionOk') : t('backup.connectionFailed', { error: d.error ?? '' }),
    )
  }

  async function saveSchedule(next: Schedule) {
    setSched(next)
    await Promise.all([
      saveSetting('backup.schedule.enabled', next.enabled),
      saveSetting('backup.schedule.hour', next.hour),
      saveSetting('backup.schedule.interval', next.interval),
      saveSetting('backup.schedule.weekday', next.weekday),
      saveSetting('backup.full_every', next.fullEvery),
      saveSetting('backup.retention.keep', next.retentionKeep),
    ])
  }

  useEffect(() => {
    void load()
  }, [load])

  async function saveIncludeSecret(v: boolean) {
    setIncludeSecret(v)
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'backup.include_secret', value: v }),
    })
  }

  async function backup(type: 'full' | 'incr') {
    setBusy(type)
    setStatus(t('backup.creating'))
    try {
      const res = await fetch('/api/admin/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, includeSecret }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? t('backup.fail'))
      setStatus(
        t('backup.done', {
          id: d.manifest.id,
          size: fmtBytes(d.bundleBytes),
          mirror: d.remoteMirrored ? t('backup.remoteMirrored') : '',
        }),
      )
      await load()
    } catch (e) {
      setStatus(t('backup.failedWith', { error: (e as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!confirm(t('backup.confirmDelete', { id }))) return
    setBusy(id)
    try {
      await fetch(`/api/admin/backups/${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function restore(b: Backup) {
    const warn = b.includesSecret ? `\n\n${t('backup.restoreSecretWarn')}` : ''
    const typed = window.prompt(t('backup.restorePrompt', { warn, id: b.id }))
    if (typed !== b.id) {
      if (typed !== null) alert(t('backup.restoreMismatch'))
      return
    }
    setBusy(b.id)
    setStatus(t('backup.restoring'))
    try {
      const res = await fetch(`/api/admin/backups/${b.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: b.id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? t('backup.fail'))
      setStatus(t('backup.restoreDone'))
      // 컨테이너 재시작 대기 → 헬스 복귀하면 새로고침.
      const wait = async () => {
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 2000))
          try {
            const h = await fetch('/api/health', { cache: 'no-store' })
            if (h.ok) {
              window.location.reload()
              return
            }
          } catch {
            // 재시작 중 — 계속 대기
          }
        }
        setStatus(t('backup.restoreTimeout'))
      }
      void wait()
    } catch (e) {
      setStatus(t('backup.restoreFailed', { error: (e as Error).message }))
      setBusy(null)
    }
  }

  return (
    <>
      <AppHeader title={t('backup.title')} subtitle={t('backup.subtitle')} />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-4">
        {/* 백업 만들기 */}
        <Card>
          <CardBody className="space-y-4">
            <div>
              <div className="font-medium">{t('backup.createTitle')}</div>
              <div className="text-xs text-base-500">{t('backup.createDesc')}</div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => backup('full')} disabled={busy !== null}>
                {busy === 'full' ? t('backup.backingUp') : t('backup.fullBackup')}
              </Button>
              <Button variant="ghost" onClick={() => backup('incr')} disabled={busy !== null}>
                {busy === 'incr' ? t('backup.backingUp') : t('backup.incrBackup')}
              </Button>
            </div>
            {status && <p className="text-sm text-base-500">{status}</p>}
          </CardBody>
        </Card>

        {/* 자동 백업 스케줄 */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{t('backup.autoTitle')}</div>
                <div className="text-xs text-base-500">
                  {t('backup.autoDesc', { every: String(sched.fullEvery) })}
                </div>
              </div>
              <Toggle
                checked={sched.enabled}
                onChange={(e) => void saveSchedule({ ...sched, enabled: e.target.checked })}
              />
            </div>
            {sched.enabled && (
              <div className="space-y-3 border-t border-base-200/60 pt-3 dark:border-base-800/60">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t('backup.interval')}</span>
                  <select
                    value={sched.interval}
                    onChange={(e) =>
                      void saveSchedule({
                        ...sched,
                        interval: e.target.value === 'weekly' ? 'weekly' : 'daily',
                      })
                    }
                    className="rounded-lg border border-base-200 bg-base-0 px-2 py-1 dark:border-base-700 dark:bg-base-900"
                  >
                    <option value="daily">{t('backup.daily')}</option>
                    <option value="weekly">{t('backup.weekly')}</option>
                  </select>
                </label>
                {sched.interval === 'weekly' && (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>{t('backup.weekday')}</span>
                    <select
                      value={sched.weekday}
                      onChange={(e) =>
                        void saveSchedule({ ...sched, weekday: Number(e.target.value) })
                      }
                      className="rounded-lg border border-base-200 bg-base-0 px-2 py-1 dark:border-base-700 dark:bg-base-900"
                    >
                      {WEEKDAYS.map((w, i) => (
                        <option key={w} value={i}>
                          {t('backup.weekdayOption', { day: w })}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t('backup.time')}</span>
                  <select
                    value={sched.hour}
                    onChange={(e) => void saveSchedule({ ...sched, hour: Number(e.target.value) })}
                    className="rounded-lg border border-base-200 bg-base-0 px-2 py-1 dark:border-base-700 dark:bg-base-900"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t('backup.fullEvery')}</span>
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={sched.fullEvery}
                      onChange={(e) =>
                        void saveSchedule({
                          ...sched,
                          fullEvery: Math.max(1, Number(e.target.value)),
                        })
                      }
                      className="w-16 rounded-lg border border-base-200 bg-base-0 px-2 py-1 text-right dark:border-base-700 dark:bg-base-900"
                    />
                    <span className="text-xs text-base-500">{t('backup.everyNth')}</span>
                  </span>
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t('backup.retentionKeep')}</span>
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={sched.retentionKeep}
                      onChange={(e) =>
                        void saveSchedule({
                          ...sched,
                          retentionKeep: Math.max(1, Number(e.target.value)),
                        })
                      }
                      className="w-16 rounded-lg border border-base-200 bg-base-0 px-2 py-1 text-right dark:border-base-700 dark:bg-base-900"
                    />
                    <span className="text-xs text-base-500">{t('backup.keepCount')}</span>
                  </span>
                </label>
              </div>
            )}
            {lastError && (
              <p className="rounded-lg bg-danger/5 px-3 py-2 text-[12px] text-danger">
                {t('backup.lastAutoError', { error: lastError })}
              </p>
            )}
          </CardBody>
        </Card>

        {/* 시크릿 포함 토글 + 경고 */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{t('backup.includeSecret')}</div>
                <div className="text-xs text-base-500">{t('backup.includeSecretDesc')}</div>
              </div>
              <Toggle
                checked={includeSecret}
                onChange={(e) => void saveIncludeSecret(e.target.checked)}
              />
            </div>
            {includeSecret && (
              <div className="flex gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-[13px] text-danger">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  {t.rich('backup.secretWarn', {
                    b: (chunks) => <b>{chunks}</b>,
                  })}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* 원격 백업(S3 호환) */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{t('backup.remoteTitle')}</div>
                <div className="text-xs text-base-500">{t('backup.remoteDesc')}</div>
              </div>
              <Toggle
                checked={remote.enabled}
                onChange={(e) => setRemote((p) => ({ ...p, enabled: e.target.checked }))}
              />
            </div>
            {remote.enabled && (
              <div className="space-y-2 border-t border-base-200/60 pt-3 dark:border-base-800/60">
                <input
                  placeholder={t('backup.endpointPlaceholder')}
                  value={remote.endpoint}
                  onChange={(e) => setRemote((p) => ({ ...p, endpoint: e.target.value }))}
                  className="w-full rounded-lg border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-700 dark:bg-base-900"
                />
                <div className="flex gap-2">
                  <input
                    placeholder="Bucket"
                    value={remote.bucket}
                    onChange={(e) => setRemote((p) => ({ ...p, bucket: e.target.value }))}
                    className="min-w-0 flex-1 rounded-lg border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-700 dark:bg-base-900"
                  />
                  <input
                    placeholder="Region"
                    value={remote.region}
                    onChange={(e) => setRemote((p) => ({ ...p, region: e.target.value }))}
                    className="w-28 rounded-lg border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-700 dark:bg-base-900"
                  />
                </div>
                <input
                  placeholder={t('backup.prefixPlaceholder')}
                  value={remote.prefix}
                  onChange={(e) => setRemote((p) => ({ ...p, prefix: e.target.value }))}
                  className="w-full rounded-lg border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-700 dark:bg-base-900"
                />
                <input
                  placeholder="Access Key ID"
                  value={remote.accessKey}
                  onChange={(e) => setRemote((p) => ({ ...p, accessKey: e.target.value }))}
                  className="w-full rounded-lg border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-700 dark:bg-base-900"
                />
                <input
                  type="password"
                  placeholder={
                    remote.secretConfigured
                      ? t('backup.secretKeySavedPlaceholder')
                      : 'Secret Access Key'
                  }
                  value={remote.secretKey}
                  onChange={(e) => setRemote((p) => ({ ...p, secretKey: e.target.value }))}
                  className="w-full rounded-lg border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-700 dark:bg-base-900"
                />
                <div className="flex gap-2">
                  <Button onClick={() => void saveRemote()}>{t('backup.save')}</Button>
                  <Button variant="ghost" onClick={() => void testRemote()}>
                    {t('backup.testConnection')}
                  </Button>
                </div>
                {remoteStatus && <p className="text-sm text-base-500">{remoteStatus}</p>}
                {remote.lastError && (
                  <p className="rounded-lg bg-danger/5 px-3 py-2 text-[12px] text-danger">
                    {t('backup.lastRemoteError', { error: remote.lastError })}
                  </p>
                )}
              </div>
            )}
            {remote.enabled && !remote.secretConfigured && (
              <p className="text-[11px] text-base-400">{t('backup.saveToApplyHint')}</p>
            )}
          </CardBody>
        </Card>

        {/* 백업 목록 */}
        <Card>
          <CardBody className="space-y-3">
            <div className="font-medium">{t('backup.listTitle')}</div>
            {backups.length === 0 ? (
              <p className="text-sm text-base-500">{t('backup.empty')}</p>
            ) : (
              <div className="space-y-2">
                {backups.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 rounded-xl border border-base-200/70 px-3 py-2.5 dark:border-base-800/70"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {new Date(b.createdAt).toLocaleString('ko-KR')}
                        <span className="ml-2 rounded bg-base-100 px-1.5 py-0.5 text-[11px] text-base-500 dark:bg-base-800">
                          {b.type === 'full' ? t('backup.full') : t('backup.incr')}
                        </span>
                        {b.includesSecret && (
                          <span className="ml-1 rounded bg-danger/10 px-1.5 py-0.5 text-[11px] text-danger">
                            🔑 {t('backup.keyIncluded')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] tabular-nums text-base-500">
                        {t('backup.listMeta', {
                          size: fmtBytes(b.bundleBytes),
                          count: String(b.dataFileCount),
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void restore(b)}
                      disabled={busy !== null}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-base-500 hover:bg-point-500/10 hover:text-point-600"
                      aria-label={t('backup.restore')}
                      title={t('backup.restoreThis')}
                    >
                      <RotateCcw size={16} />
                    </button>
                    <a
                      href={`/api/admin/backups/${b.id}/download`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-base-500 hover:bg-base-100 dark:hover:bg-base-800"
                      aria-label={t('backup.download')}
                    >
                      <Download size={16} />
                    </a>
                    <button
                      type="button"
                      onClick={() => void remove(b.id)}
                      disabled={busy !== null}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-base-500 hover:bg-danger/10 hover:text-danger"
                      aria-label={t('backup.delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* 복구 안내 */}
        <Card>
          <CardBody className="space-y-2">
            <div className="font-medium">{t('backup.howToTitle')}</div>
            <div className="text-xs text-base-500">
              {t.rich('backup.howToWeb', { b: (chunks) => <b>{chunks}</b> })}
            </div>
            <div className="text-xs text-base-500">
              {t.rich('backup.howToDisaster', { b: (chunks) => <b>{chunks}</b> })}
            </div>
            <pre className="overflow-x-auto rounded-xl bg-base-900 px-3 py-2 text-[12px] text-base-100">
              docker compose run --rm --entrypoint bebe-restore app &lt;
              {t('backup.backupIdPlaceholder')}
              &gt;
            </pre>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
