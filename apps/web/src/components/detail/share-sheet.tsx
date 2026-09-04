'use client'
import { Sheet } from '@/components/ui/sheet'
import { shareOrCopy } from '@/lib/share-link'
import { shareTitle } from '@/lib/share-title'
import { useToast } from '@/lib/toast'
import { Link2, Loader2, Share2, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

type Translate = ReturnType<typeof useTranslations>

export type SheetTarget =
  | { kind: 'story'; storyId: string }
  | { kind: 'asset'; assetId: string }
  | { kind: 'album'; albumId: string }
  | { kind: 'selection'; assetIds: string[] }
  | { kind: 'date'; date: string }

// 목록 조회 쿼리. 선택(컬렉션)은 안정적인 타깃 식별자가 없어 per-target 으로 못 찾으므로,
// 본인이 만든 링크 전체(mine=1)를 받아 selection 종류만 추려 보여준다(회수 가능하게).
function listQuery(t: SheetTarget): string | null {
  switch (t.kind) {
    case 'story':
      return `storyId=${t.storyId}`
    case 'asset':
      return `assetId=${t.assetId}`
    case 'album':
      return `albumId=${t.albumId}`
    case 'date':
      return `date=${t.date}`
    case 'selection':
      return 'mine=1'
  }
}

function createBody(t: SheetTarget): Record<string, unknown> {
  switch (t.kind) {
    case 'story':
      return { storyId: t.storyId }
    case 'asset':
      return { assetId: t.assetId }
    case 'album':
      return { albumId: t.albumId }
    case 'selection':
      return { assetIds: t.assetIds }
    case 'date':
      return { date: t.date }
  }
}

type Ttl = 'permanent' | '1d' | '7d' | '30d'
// 짧은 것부터 — 기본(1일)이 맨 앞이고, 영구는 명시적으로 고르게 맨 뒤에 둔다.
const ttlOptions = (t: Translate): { value: Ttl; label: string }[] => [
  { value: '1d', label: t('share.ttl1d') },
  { value: '7d', label: t('share.ttl7d') },
  { value: '30d', label: t('share.ttl30d') },
  { value: 'permanent', label: t('share.ttlPermanent') },
]

type Link = {
  token: string
  expiresAt: string | null
  createdAt: string
  lastAccessedAt: string | null
  expired: boolean
  // mine=1 응답에만 존재(종류) — selection 추출용. per-target 응답엔 없음.
  kind?: string
}

function expiryLabel(l: Link, t: Translate, locale: string): string {
  if (l.expiresAt === null) return t('share.expiryPermanent')
  if (l.expired) return t('share.expiryExpired')
  const dateFmt = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' })
  return t('share.expiryUntil', { date: dateFmt.format(new Date(l.expiresAt)) })
}

const shareUrl = (token: string) => `${window.location.origin}/s/${token}`

const copyFor = (
  t: Translate,
  kind: SheetTarget['kind'],
): { sheetTitle: string; intro: string } => ({
  sheetTitle: t(`share.copy.${kind}.sheetTitle`),
  intro: t(`share.copy.${kind}.intro`),
})

export function ShareSheet({
  target,
  title: givenTitle,
  open,
  onOpenChange,
}: {
  target: SheetTarget
  /** 스토리·앨범 제목. 없거나 다른 대상이면 shareTitle 이 대상별 문구를 만든다. */
  title?: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const t = useTranslations('social')
  const locale = useLocale()
  const title = shareTitle(target, t, locale, givenTitle)
  // 기본은 1일 — 공유 링크는 로그인 없이 열리므로, 명시적으로 늘리지 않는 한 짧게 만료시킨다.
  const [ttl, setTtl] = useState<Ttl>('1d')
  const [links, setLinks] = useState<Link[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const query = listQuery(target)

  const refresh = useCallback(async () => {
    if (query === null) {
      setLinks([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/share?${query}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const fetched: Link[] = data.links ?? []
        // selection 시트는 mine=1 로 받아 selection 링크만 추린다(안정 타깃 식별자 없음).
        setLinks(
          target.kind === 'selection' ? fetched.filter((l) => l.kind === 'selection') : fetched,
        )
      }
    } finally {
      setLoading(false)
    }
  }, [query, target.kind])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const onCreate = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createBody(target), ttl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: data.error ?? t('share.createFailed'), variant: 'danger' })
        return
      }
      // 목록 가능(쿼리 있음)이면 새로고침, 선택(목록 불가)이면 만든 링크만 로컬에 추가.
      if (query !== null) await refresh()
      else
        setLinks((prev) => [
          {
            token: data.token,
            expiresAt: data.expiresAt ?? null,
            createdAt: new Date().toISOString(),
            lastAccessedAt: null,
            expired: false,
          },
          ...prev,
        ])
      const r = await shareOrCopy(shareUrl(data.token), title)
      if (r === 'copied')
        toast({
          title: t('share.copiedTitle'),
          description: t('share.copiedDescription'),
          variant: 'success',
        })
      else if (r === 'failed') toast({ title: t('share.createdCopyBelow'), variant: 'default' })
    } finally {
      setCreating(false)
    }
  }, [target, query, ttl, title, refresh, toast, t])

  const onShareExisting = useCallback(
    async (token: string) => {
      const r = await shareOrCopy(shareUrl(token), title)
      if (r === 'copied') toast({ title: t('share.copiedTitle'), variant: 'success' })
      else if (r === 'failed') toast({ title: t('share.copyFailed'), variant: 'danger' })
    },
    [title, toast, t],
  )

  const onRevoke = useCallback(
    async (token: string) => {
      setLinks((prev) => prev.filter((l) => l.token !== token))
      const res = await fetch(`/api/share/${encodeURIComponent(token)}`, { method: 'DELETE' })
      if (!res.ok) {
        toast({ title: t('share.revokeFailed'), variant: 'danger' })
        refresh()
        return
      }
      toast({
        title: t('share.revokedTitle'),
        description: t('share.revokedDescription'),
        variant: 'success',
      })
    },
    [refresh, toast, t],
  )

  const copy = copyFor(t, target.kind)
  const ttlOpts = ttlOptions(t)

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={copy.sheetTitle}>
      <div className="space-y-5 pb-2">
        <p className="text-[13px] leading-relaxed text-base-500">{copy.intro}</p>

        <div>
          <p className="mb-2 text-[12px] font-medium text-base-500">{t('share.expiry')}</p>
          <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-base-100 p-1 dark:bg-base-800">
            {ttlOpts.map((o) => (
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
          {t('share.createLink')}
        </button>

        <div>
          <p className="mb-2 text-[12px] font-medium text-base-500">
            {t('share.createdLinks')}
            {links.length > 0 ? ` · ${t('share.linkCount', { count: links.length })}` : ''}
          </p>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin text-base-400" />
            </div>
          ) : links.length === 0 ? (
            <p className="rounded-2xl bg-base-100 px-4 py-5 text-center text-[13px] text-base-400 dark:bg-base-800/60">
              {t('share.noLinks')}
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
                      {expiryLabel(l, t, locale)}
                    </p>
                    <p className="truncate text-[11px] text-base-400">
                      {l.lastAccessedAt ? t('share.opened') : t('share.notOpened')}
                    </p>
                  </div>
                  {!l.expired && (
                    <button
                      type="button"
                      onClick={() => onShareExisting(l.token)}
                      aria-label={t('share.shareThisLink')}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-base-500 transition-colors hover:bg-base-100 hover:text-base-800 active:scale-95 dark:hover:bg-base-800"
                    >
                      <Share2 size={16} strokeWidth={2.2} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRevoke(l.token)}
                    aria-label={t('share.revokeThisLink')}
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
  )
}
