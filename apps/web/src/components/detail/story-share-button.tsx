'use client'
import { Sheet } from '@/components/ui/sheet'
import { shareOrCopy } from '@/lib/share-link'
import { useToast } from '@/lib/toast'
import { Link2, Loader2, Share2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type Ttl = 'permanent' | '1d' | '7d' | '30d'
const TTL_OPTIONS: { value: Ttl; label: string }[] = [
  { value: 'permanent', label: '영구' },
  { value: '1d', label: '1일' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
]

type Link = {
  token: string
  expiresAt: string | null
  createdAt: string
  lastAccessedAt: string | null
  expired: boolean
}

const dateFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' })

function expiryLabel(l: Link): string {
  if (l.expiresAt === null) return '영구 공유'
  if (l.expired) return '만료됨'
  return `${dateFmt.format(new Date(l.expiresAt))}까지`
}

const shareUrl = (token: string) => `${window.location.origin}/s/${token}`

export function StoryShareButton({
  storyId,
  title = '베베 모먼트',
  className,
}: {
  storyId: string
  title?: string
  className?: string
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [ttl, setTtl] = useState<Ttl>('permanent')
  const [links, setLinks] = useState<Link[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/share?storyId=${storyId}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) setLinks(data.links ?? [])
    } finally {
      setLoading(false)
    }
  }, [storyId])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const onCreate = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId, ttl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: data.error ?? '링크를 만들지 못했어요', variant: 'danger' })
        return
      }
      await refresh()
      const r = await shareOrCopy(shareUrl(data.token), title)
      if (r === 'copied')
        toast({
          title: '공유 링크를 복사했어요',
          description: '링크를 아는 사람은 볼 수 있어요',
          variant: 'success',
        })
      else if (r === 'failed')
        toast({ title: '링크는 만들었어요 — 아래에서 복사해주세요', variant: 'default' })
    } finally {
      setCreating(false)
    }
  }, [storyId, ttl, title, refresh, toast])

  const onShareExisting = useCallback(
    async (token: string) => {
      const r = await shareOrCopy(shareUrl(token), title)
      if (r === 'copied') toast({ title: '공유 링크를 복사했어요', variant: 'success' })
      else if (r === 'failed') toast({ title: '복사하지 못했어요', variant: 'danger' })
    },
    [title, toast],
  )

  const onRevoke = useCallback(
    async (token: string) => {
      setLinks((prev) => prev.filter((l) => l.token !== token))
      const res = await fetch(`/api/share/${encodeURIComponent(token)}`, { method: 'DELETE' })
      if (!res.ok) {
        toast({ title: '해제하지 못했어요', variant: 'danger' })
        refresh()
        return
      }
      toast({
        title: '링크를 해제했어요',
        description: '이제 이 링크로는 볼 수 없어요',
        variant: 'success',
      })
    },
    [refresh, toast],
  )

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="공유" className={className}>
        <Share2 size={13} strokeWidth={2.2} />
        <span>공유</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="공유 링크 만들기">
        <div className="space-y-5 pb-2">
          <p className="text-[13px] leading-relaxed text-base-500">
            링크를 아는 사람은 대표 사진과 글을 볼 수 있어요. 전체 사진은 가족만 볼 수 있어요.
          </p>

          {/* 유효기간 세그먼트 */}
          <div>
            <p className="mb-2 text-[12px] font-medium text-base-500">유효기간</p>
            <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-base-100 p-1 dark:bg-base-800">
              {TTL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setTtl(o.value)}
                  className={`h-9 rounded-xl text-[14px] font-semibold transition-colors ${
                    ttl === o.value
                      ? 'bg-base-0 text-base-900 shadow-sm dark:bg-base-950 dark:text-base-50'
                      : 'text-base-500'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-point-500 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
          >
            {creating ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />}
            공유 링크 만들기
          </button>

          {/* 만든 링크 목록 + 해제 */}
          <div>
            <p className="mb-2 text-[12px] font-medium text-base-500">
              만든 공유 링크{links.length > 0 ? ` · ${links.length}개` : ''}
            </p>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 size={20} className="animate-spin text-base-400" />
              </div>
            ) : links.length === 0 ? (
              <p className="rounded-2xl bg-base-100 px-4 py-5 text-center text-[13px] text-base-400 dark:bg-base-800/60">
                아직 만든 공유 링크가 없어요
              </p>
            ) : (
              <ul className="space-y-2">
                {links.map((l) => (
                  <li
                    key={l.token}
                    className="flex items-center gap-2 rounded-2xl border border-base-200/70 bg-base-0 px-3 py-2.5 dark:border-base-800/70 dark:bg-base-900"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[13px] font-semibold ${
                          l.expired ? 'text-base-400' : 'text-base-800 dark:text-base-100'
                        }`}
                      >
                        {expiryLabel(l)}
                      </p>
                      <p className="truncate text-[11px] text-base-400">
                        {l.lastAccessedAt ? '누군가 열어봤어요' : '아직 아무도 안 열었어요'}
                      </p>
                    </div>
                    {!l.expired && (
                      <button
                        type="button"
                        onClick={() => onShareExisting(l.token)}
                        aria-label="이 링크 공유"
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-base-500 transition-colors hover:bg-base-100 hover:text-base-800 active:scale-95 dark:hover:bg-base-800"
                      >
                        <Share2 size={16} strokeWidth={2.2} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRevoke(l.token)}
                      aria-label="이 링크 해제"
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-base-500 transition-colors hover:bg-danger/10 hover:text-danger active:scale-95"
                    >
                      <Trash2 size={16} strokeWidth={2.2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Sheet>
    </>
  )
}
