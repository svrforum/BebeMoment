'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { AlertTriangle, Download, RotateCcw, Trash2 } from 'lucide-react'
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

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

export default function BackupAdminPage() {
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
    setRemoteStatus('저장 중…')
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
    setRemoteStatus(res.ok ? '저장됨' : `실패: ${d.error ?? ''}`)
    if (res.ok) await load()
  }

  async function testRemote() {
    setRemoteStatus('연결 테스트 중…')
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
    setRemoteStatus(res.ok ? '연결 성공 ✓' : `연결 실패: ${d.error ?? ''}`)
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
    setStatus('백업을 만드는 중… (사진이 많으면 시간이 걸려요)')
    try {
      const res = await fetch('/api/admin/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, includeSecret }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? '실패')
      setStatus(
        `완료: ${d.manifest.id} (${fmtBytes(d.bundleBytes)})${d.remoteMirrored ? ' · 원격 업로드됨' : ''}`,
      )
      await load()
    } catch (e) {
      setStatus(`실패: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (!confirm(`백업을 삭제할까요?\n${id}`)) return
    setBusy(id)
    try {
      await fetch(`/api/admin/backups/${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function restore(b: Backup) {
    const warn = b.includesSecret
      ? '\n\n⚠️ 이 백업은 다른 SECRET_KEY 로 만들어졌다면 암호화 설정이 복구 후 풀리지 않아요(그 경우 CLI 복구 권장).'
      : ''
    const typed = window.prompt(
      `현재 DB·사진을 이 백업 시점으로 되돌려요. 되돌릴 수 없어요.${warn}\n\n복구하려면 아래 백업 id 를 그대로 입력하세요:\n${b.id}`,
    )
    if (typed !== b.id) {
      if (typed !== null) alert('입력이 일치하지 않아 취소했어요.')
      return
    }
    setBusy(b.id)
    setStatus('복구 중… 끝나면 앱이 자동 재시작돼요.')
    try {
      const res = await fetch(`/api/admin/backups/${b.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: b.id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? '실패')
      setStatus('복구 완료 — 앱 재시작 중이에요. 자동으로 새로고침할게요…')
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
        setStatus('복구는 끝났어요. 앱이 안 돌아오면 수동으로 새로고침하세요.')
      }
      void wait()
    } catch (e) {
      setStatus(`복구 실패: ${(e as Error).message}`)
      setBusy(null)
    }
  }

  return (
    <>
      <AppHeader title="백업 / 복구" subtitle="사진·설정 백업" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-4">
        {/* 백업 만들기 */}
        <Card>
          <CardBody className="space-y-4">
            <div>
              <div className="font-medium">백업 만들기</div>
              <div className="text-xs text-base-500">
                DB(설정·메타) + 사진·영상을 한 파일로 묶어 백업 폴더에 저장해요. 전체는 모든 사진,
                증분은 직전 백업 이후 새 사진만 담아요.
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => backup('full')} disabled={busy !== null}>
                {busy === 'full' ? '백업 중…' : '전체 백업'}
              </Button>
              <Button variant="ghost" onClick={() => backup('incr')} disabled={busy !== null}>
                {busy === 'incr' ? '백업 중…' : '증분 백업'}
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
                <div className="font-medium">자동 백업</div>
                <div className="text-xs text-base-500">
                  정해진 시각에 자동으로 백업해요. {sched.fullEvery}회마다 전체, 나머지는 증분.
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
                  <span>주기</span>
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
                    <option value="daily">매일</option>
                    <option value="weekly">매주</option>
                  </select>
                </label>
                {sched.interval === 'weekly' && (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>요일</span>
                    <select
                      value={sched.weekday}
                      onChange={(e) =>
                        void saveSchedule({ ...sched, weekday: Number(e.target.value) })
                      }
                      className="rounded-lg border border-base-200 bg-base-0 px-2 py-1 dark:border-base-700 dark:bg-base-900"
                    >
                      {WEEKDAYS.map((w, i) => (
                        <option key={w} value={i}>
                          {w}요일
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>시각</span>
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
                  <span>전체 백업 주기</span>
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
                    <span className="text-xs text-base-500">회마다</span>
                  </span>
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>보관 개수</span>
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
                    <span className="text-xs text-base-500">개 유지</span>
                  </span>
                </label>
              </div>
            )}
            {lastError && (
              <p className="rounded-lg bg-danger/5 px-3 py-2 text-[12px] text-danger">
                최근 자동 백업 오류: {lastError}
              </p>
            )}
          </CardBody>
        </Card>

        {/* 시크릿 포함 토글 + 경고 */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">SECRET_KEY 포함</div>
                <div className="text-xs text-base-500">
                  암호화된 설정(OIDC·푸시·세션)을 복구하려면 필요해요. 기본은 미포함.
                </div>
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
                  <b>주의 — 이 백업 파일은 비밀번호 금고와 같아요.</b> SECRET_KEY 가 들어가면 백업
                  파일 하나로 OIDC·푸시·세션 시크릿이 전부 풀려요. 외부에 절대 유출하지 말고, 신뢰할
                  수 있는 저장소에만 보관하세요.
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
                <div className="font-medium">원격 백업 (S3 호환)</div>
                <div className="text-xs text-base-500">
                  백업을 만든 뒤 S3 호환 저장소(B2·MinIO·S3 등)에도 올려요.
                </div>
              </div>
              <Toggle
                checked={remote.enabled}
                onChange={(e) => setRemote((p) => ({ ...p, enabled: e.target.checked }))}
              />
            </div>
            {remote.enabled && (
              <div className="space-y-2 border-t border-base-200/60 pt-3 dark:border-base-800/60">
                <input
                  placeholder="Endpoint (예: https://s3.us-west-002.backblazeb2.com, AWS면 비움)"
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
                  placeholder="경로 prefix (선택, 예: bebe-backups)"
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
                      ? 'Secret Access Key (저장됨 — 바꿀 때만 입력)'
                      : 'Secret Access Key'
                  }
                  value={remote.secretKey}
                  onChange={(e) => setRemote((p) => ({ ...p, secretKey: e.target.value }))}
                  className="w-full rounded-lg border border-base-200 bg-base-0 px-3 py-2 text-sm dark:border-base-700 dark:bg-base-900"
                />
                <div className="flex gap-2">
                  <Button onClick={() => void saveRemote()}>저장</Button>
                  <Button variant="ghost" onClick={() => void testRemote()}>
                    연결 테스트
                  </Button>
                </div>
                {remoteStatus && <p className="text-sm text-base-500">{remoteStatus}</p>}
                {remote.lastError && (
                  <p className="rounded-lg bg-danger/5 px-3 py-2 text-[12px] text-danger">
                    최근 원격 업로드 오류: {remote.lastError}
                  </p>
                )}
              </div>
            )}
            {remote.enabled && !remote.secretConfigured && (
              <p className="text-[11px] text-base-400">
                저장을 눌러야 적용돼요. 시크릿 키는 암호화 저장되고 다시 표시되지 않아요.
              </p>
            )}
          </CardBody>
        </Card>

        {/* 백업 목록 */}
        <Card>
          <CardBody className="space-y-3">
            <div className="font-medium">백업 목록</div>
            {backups.length === 0 ? (
              <p className="text-sm text-base-500">아직 백업이 없어요.</p>
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
                          {b.type === 'full' ? '전체' : '증분'}
                        </span>
                        {b.includesSecret && (
                          <span className="ml-1 rounded bg-danger/10 px-1.5 py-0.5 text-[11px] text-danger">
                            🔑 키포함
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] tabular-nums text-base-500">
                        {fmtBytes(b.bundleBytes)} · 사진 {b.dataFileCount}개
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void restore(b)}
                      disabled={busy !== null}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-base-500 hover:bg-point-500/10 hover:text-point-600"
                      aria-label="복구"
                      title="이 백업으로 복구"
                    >
                      <RotateCcw size={16} />
                    </button>
                    <a
                      href={`/api/admin/backups/${b.id}/download`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-base-500 hover:bg-base-100 dark:hover:bg-base-800"
                      aria-label="다운로드"
                    >
                      <Download size={16} />
                    </a>
                    <button
                      type="button"
                      onClick={() => void remove(b.id)}
                      disabled={busy !== null}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-base-500 hover:bg-danger/10 hover:text-danger"
                      aria-label="삭제"
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
            <div className="font-medium">복구 방법</div>
            <div className="text-xs text-base-500">
              <b>웹에서 복구</b>: 위 목록의 ↺ 버튼 → 백업 id 입력 → 복구. 끝나면 앱이 자동
              재시작돼요(같은 인스턴스 롤백용).
            </div>
            <div className="text-xs text-base-500">
              <b>완전/재해 복구</b>(새 기기·다른 SECRET_KEY): 백업 파일을 백업 폴더에 둔 뒤
              서버에서:
            </div>
            <pre className="overflow-x-auto rounded-xl bg-base-900 px-3 py-2 text-[12px] text-base-100">
              docker compose run --rm --entrypoint bebe-restore app &lt;백업-id&gt;
            </pre>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
