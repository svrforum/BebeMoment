'use client'
import { useFeatures } from '@/lib/features'
import {
  ArrowLeft,
  CalendarDays,
  FolderOpen,
  Search,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type Results = {
  query: string
  stories: {
    id: string
    publicNo: number
    title: string | null
    snippet: string
    entryDate: string
  }[]
  milestones: {
    id: string
    label: string
    note: string | null
    achievedAt: string
    babyId: string
  }[]
  albums: { id: string; name: string }[]
  babies: { id: string; name: string }[]
  people: { id: string; name: string }[]
  total: number
}

const EMPTY: Results = {
  query: '',
  stories: [],
  milestones: [],
  albums: [],
  babies: [],
  people: [],
  total: 0,
}

export default function SearchPage() {
  const t = useTranslations('search')
  const router = useRouter()
  const params = useSearchParams()
  const features = useFeatures()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [results, setResults] = useState<Results>(EMPTY)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 진입 시 입력에 포커스(검색 페이지는 입력이 주목적).
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const run = useCallback(async (query: string) => {
    abortRef.current?.abort()
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResults(EMPTY)
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        cache: 'no-store',
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error('search failed')
      setResults((await res.json()) as Results)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setResults(EMPTY)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  // 디바운스 검색 + URL ?q 동기화(공유·뒤로가기).
  useEffect(() => {
    const id = setTimeout(() => {
      void run(q)
      const next = q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search'
      router.replace(next, { scroll: false })
    }, 280)
    return () => clearTimeout(id)
  }, [q, run, router])

  const hasQuery = q.trim().length > 0

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24">
      <div className="sticky top-0 z-20 -mx-4 flex items-center gap-2 border-b border-base-200/60 bg-base-50/85 px-4 py-3 backdrop-blur-xl dark:border-base-800/60 dark:bg-base-950/75">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t('back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 dark:text-base-300 dark:hover:bg-base-800"
        >
          <ArrowLeft size={20} strokeWidth={2} />
        </button>
        <div className="relative flex-1">
          <Search
            size={17}
            strokeWidth={2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-400"
          />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('placeholder')}
            className="w-full rounded-full border border-base-200 bg-base-0 py-2.5 pl-9 pr-3 text-[15px] outline-none focus:border-point-400 dark:border-base-700 dark:bg-base-900"
          />
        </div>
      </div>

      {!hasQuery ? (
        <p className="mt-12 text-center text-sm text-base-400">{t('hint')}</p>
      ) : loading && results.total === 0 ? (
        <p className="mt-12 text-center text-sm text-base-400">{t('searching')}</p>
      ) : results.total === 0 ? (
        <p className="mt-12 text-center text-sm text-base-400">{t('noResults', { q: q.trim() })}</p>
      ) : (
        <div className="mt-3 space-y-5">
          <Section
            title={t('section.stories')}
            icon={<CalendarDays size={15} />}
            show={results.stories.length}
          >
            {results.stories.map((s) => (
              <Row
                key={s.id}
                href={`/story/${s.publicNo}`}
                title={s.title || s.snippet}
                sub={s.title ? s.snippet : undefined}
              />
            ))}
          </Section>
          <Section
            title={t('section.milestones')}
            icon={<Sparkles size={15} />}
            show={results.milestones.length}
          >
            {results.milestones.map((m) => (
              <Row
                key={m.id}
                href={`/babies/${m.babyId}/milestones`}
                title={m.label}
                sub={m.note ?? undefined}
              />
            ))}
          </Section>
          <Section
            title={t('section.albums')}
            icon={<FolderOpen size={15} />}
            show={results.albums.length}
          >
            {results.albums.map((a) => (
              <Row key={a.id} href={`/albums/${a.id}`} title={a.name} />
            ))}
          </Section>
          <Section
            title={t('section.babies')}
            icon={<UserRound size={15} />}
            show={results.babies.length}
          >
            {results.babies.map((b) => (
              <Row key={b.id} href={`/babies/${b.id}`} title={b.name} />
            ))}
          </Section>
          {features.faces && (
            <Section
              title={t('section.people')}
              icon={<UsersRound size={15} />}
              show={results.people.length}
            >
              {results.people.map((p) => (
                <Row key={p.id} href={`/people/${p.id}`} title={p.name} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  icon,
  show,
  children,
}: {
  title: string
  icon: React.ReactNode
  show: number
  children: React.ReactNode
}) {
  if (!show) return null
  return (
    <section>
      <h2 className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide text-base-400">
        {icon}
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 dark:border-base-800/70 dark:bg-base-900">
        {children}
      </div>
    </section>
  )
}

function Row({ href, title, sub }: { href: string; title: string; sub?: string | undefined }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-0.5 border-b border-base-100 px-4 py-3 transition-colors last:border-0 hover:bg-base-50 dark:border-base-800/60 dark:hover:bg-base-800/40"
    >
      <span className="truncate text-[15px] font-medium text-base-900 dark:text-base-50">
        {title}
      </span>
      {sub && <span className="truncate text-[13px] text-base-500">{sub}</span>}
    </Link>
  )
}
