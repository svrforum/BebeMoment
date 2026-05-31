'use client'
import { ChevronDown, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

// 웹/PWA 멀티 인스턴스 — 브라우저는 오리진별로 격리돼서 앱처럼 통합 계정 목록이 불가하다.
// 대신 이 인스턴스의 localStorage 에 "다른 가족 주소" 목록을 두고, 가족 이름 드롭다운에
// 링크로 보여준다. 누르면 그 도메인으로 이동(로그인은 도메인별로 브라우저가 따로 기억).
const KEY = 'bebe.families'

type Family = { url: string; name: string }

function normalize(raw: string): string {
  let u = raw.trim()
  if (!u) return ''
  if (!/^https?:\/\//.test(u)) u = `https://${u}`
  return u.replace(/\/+$/, '')
}
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  }
}
function load(): Family[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((f) => f && typeof f.url === 'string') : []
  } catch {
    return []
  }
}
function save(list: Family[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
}

export function FamilySwitcher({ currentName }: { currentName: string }) {
  const [open, setOpen] = useState(false)
  const [families, setFamilies] = useState<Family[]>([])
  const [origin, setOrigin] = useState('')
  const [adding, setAdding] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // 현재 가족(이 오리진)을 목록에 항상 보장하고 이름을 최신화한다.
  useEffect(() => {
    const o = window.location.origin
    setOrigin(o)
    const list = load()
    const idx = list.findIndex((f) => f.url === o)
    if (idx === -1) list.push({ url: o, name: currentName })
    else if (currentName && list[idx]?.name !== currentName)
      list[idx] = { url: o, name: currentName }
    save(list)
    setFamilies(list)
  }, [currentName])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const addFamily = useCallback(() => {
    const url = normalize(draftUrl)
    if (!url) return
    setFamilies((prev) => {
      if (prev.some((f) => f.url === url)) return prev
      const next = [...prev, { url, name: draftName.trim() || hostOf(url) }]
      save(next)
      return next
    })
    setDraftName('')
    setDraftUrl('')
    setAdding(false)
  }, [draftUrl, draftName])

  const removeFamily = useCallback((url: string) => {
    setFamilies((prev) => {
      const next = prev.filter((f) => f.url !== url)
      save(next)
      return next
    })
  }, [])

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-full items-center gap-1.5 text-left active:opacity-70"
        aria-expanded={open}
      >
        <span className="truncate text-[34px] font-bold leading-tight tracking-tight text-base-900 dark:text-base-50">
          {currentName}
        </span>
        <ChevronDown size={26} strokeWidth={2.4} className="mt-1 shrink-0 text-base-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 max-w-[85vw] overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-elevated dark:border-base-800/70 dark:bg-base-900">
          <div className="max-h-[50vh] overflow-y-auto py-1">
            {families.map((f) => {
              const isCurrent = f.url === origin
              return (
                <div key={f.url} className="flex items-center gap-2 px-2 py-1.5">
                  <a
                    href={isCurrent ? undefined : f.url}
                    onClick={() => isCurrent && setOpen(false)}
                    className={`flex min-w-0 flex-1 flex-col rounded-xl px-2.5 py-2 transition-colors ${
                      isCurrent ? 'bg-point-500/10' : 'hover:bg-base-100 dark:hover:bg-base-800'
                    }`}
                  >
                    <span className="truncate text-[14px] font-semibold text-base-900 dark:text-base-50">
                      {f.name || hostOf(f.url)}
                    </span>
                    <span className="truncate text-[11px] text-base-400">{hostOf(f.url)}</span>
                  </a>
                  {isCurrent ? (
                    <span className="shrink-0 pr-1.5 text-[11px] font-semibold text-point-500">
                      현재
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label="제거"
                      onClick={() => removeFamily(f.url)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base-400 hover:bg-base-100 dark:hover:bg-base-800"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="border-t border-base-100 p-2 dark:border-base-800">
            {adding ? (
              <div className="flex flex-col gap-2">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="가족 이름 (선택)"
                  className="w-full rounded-xl border border-base-200 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-point-400 dark:border-base-700"
                />
                <input
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  placeholder="bebe.example.com"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-xl border border-base-200 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-point-400 dark:border-base-700"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="flex-1 rounded-full px-3 py-2 text-[13px] font-medium text-base-500 hover:bg-base-100 dark:hover:bg-base-800"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={addFamily}
                    className="flex-1 rounded-full bg-point-500 px-3 py-2 text-[13px] font-semibold text-white active:scale-95"
                  >
                    추가
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-medium text-base-600 hover:bg-base-100 dark:text-base-300 dark:hover:bg-base-800"
              >
                <Plus size={16} strokeWidth={2.4} />
                가족 추가
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
