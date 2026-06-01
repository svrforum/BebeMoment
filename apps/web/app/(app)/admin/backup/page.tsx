'use client'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import { AlertTriangle, Download, Trash2 } from 'lucide-react'
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

export default function BackupAdminPage() {
  const [backups, setBackups] = useState<Backup[]>([])
  const [includeSecret, setIncludeSecret] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [b, s] = await Promise.all([
      fetch('/api/admin/backups').then((r) => r.json()),
      fetch('/api/admin/settings').then((r) => r.json()),
    ])
    if (Array.isArray(b.backups)) setBackups(b.backups)
    if (typeof s.backup?.include_secret === 'boolean') setIncludeSecret(s.backup.include_secret)
  }, [])

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
      setStatus(`완료: ${d.manifest.id} (${fmtBytes(d.bundleBytes)})`)
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
              완전 복구는 안전을 위해 앱을 내린 상태에서 명령으로 진행해요. 백업 파일을 백업 폴더에
              둔 뒤, 서버에서:
            </div>
            <pre className="overflow-x-auto rounded-xl bg-base-900 px-3 py-2 text-[12px] text-base-100">
              docker compose run --rm --entrypoint bebe-restore app &lt;백업-id&gt;
            </pre>
            <div className="text-[11px] text-base-500">
              새 기기에서도 compose 를 받고 이 한 줄이면 사진·설정이 복구돼요. (인앱 복구 버튼은
              다음 단계에서 추가됩니다.)
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
