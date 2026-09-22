'use client'
import { setScheduleDoneAction } from '@/(app)/schedule/actions'
import { EmptyState } from '@/components/ui/empty-state'
import { actionErrorText } from '@/lib/action-result'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import type { ScheduleEntryView } from '@/server/schedule/list'
import { Check, ChevronRight, ListChecks } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { useMinuteOfDay } from './reminder-label'
import {
  type TodoGroupKey,
  type TodoGroups,
  applyDone,
  buildTodoItems,
  groupTodoItems,
} from './todo-model'

type Props = {
  groups: TodoGroups
  /** 서버가 판단한 오늘(`YYYY-MM-DD`). 완료를 되돌릴 때 같은 기준으로 자리를 잡는다. */
  todayKey: string
}

const OPEN_GROUPS = ['overdue', 'today', 'upcoming', 'undated'] as const

export function TodoList({ groups, todayKey }: Props) {
  const t = useTranslations('schedule')
  const tRoot = useTranslations()
  const locale = useLocale()
  const toast = useToast()
  const router = useRouter()
  const [items, setItems] = useState(() => buildTodoItems(groups, todayKey))
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [showDone, setShowDone] = useState(false)

  // 서버가 새 목록을 주면 그쪽이 진실이다 — 낙관적 상태는 거기서 끝난다.
  useEffect(() => {
    setItems(buildTodoItems(groups, todayKey))
  }, [groups, todayKey])

  const toggle = (entry: ScheduleEntryView) => {
    const was = entry.doneAt
    const next = was ? null : new Date()
    setItems((cur) => applyDone(cur, entry.id, next))
    setBusy(entry.id)
    startTransition(async () => {
      const result = await setScheduleDoneAction(entry.id, next !== null)
      setBusy(null)
      if (!result.ok) {
        // 저장이 안 됐으면 화면도 원래대로. 남겨 두면 이 기기에만 있는 '완료' 가 된다.
        setItems((cur) => applyDone(cur, entry.id, was))
        toast({
          title: t('todo.saveFailed'),
          description: actionErrorText(tRoot, result),
          variant: 'danger',
        })
        return
      }
      router.refresh()
    })
  }

  const view = groupTodoItems(items)
  const openCount = OPEN_GROUPS.reduce((n, key) => n + view[key].length, 0)

  if (openCount === 0 && view.done.length === 0) {
    return (
      <EmptyState icon={ListChecks} title={t('todo.empty')} description={t('todo.emptyHint')} />
    )
  }

  return (
    <div className="space-y-6">
      {OPEN_GROUPS.map((key) =>
        view[key].length === 0 ? null : (
          <section key={key}>
            <GroupHeading label={t(`todo.group.${key}`)} count={view[key].length} groupKey={key} />
            <ul className="space-y-1.5">
              {view[key].map((entry) => (
                <TodoRow
                  key={entry.id}
                  entry={entry}
                  locale={locale}
                  busy={busy === entry.id}
                  onToggle={() => toggle(entry)}
                />
              ))}
            </ul>
          </section>
        ),
      )}

      {view.done.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="focus-ring mb-2 flex w-full items-center gap-1.5 rounded-lg py-1 text-[13px] font-semibold text-base-500 transition active:opacity-70 dark:text-base-400"
          >
            <ChevronRight
              size={15}
              strokeWidth={2.6}
              className={cn('transition-transform', showDone && 'rotate-90')}
              aria-hidden
            />
            {t('todo.group.done')}
            <span className="tabular-nums font-medium text-base-400">{view.done.length}</span>
          </button>
          {showDone && (
            <ul className="space-y-1.5">
              {view.done.map((entry) => (
                <TodoRow
                  key={entry.id}
                  entry={entry}
                  locale={locale}
                  busy={busy === entry.id}
                  onToggle={() => toggle(entry)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function GroupHeading({
  label,
  count,
  groupKey,
}: {
  label: string
  count: number
  groupKey: TodoGroupKey
}) {
  return (
    <h2
      className={cn(
        'mb-2 flex items-center gap-1.5 text-[13px] font-semibold',
        // 지난 것은 눈에 띄어야 한다 — 그게 이 화면에서 제일 먼저 처리할 일이다.
        groupKey === 'overdue' ? 'text-danger' : 'text-base-500 dark:text-base-400',
      )}
    >
      {label}
      <span className="font-medium tabular-nums text-base-400">{count}</span>
    </h2>
  )
}

function TodoRow({
  entry,
  locale,
  busy,
  onToggle,
}: {
  entry: ScheduleEntryView
  locale: string
  busy: boolean
  onToggle: () => void
}) {
  const t = useTranslations('schedule')
  const minuteOfDay = useMinuteOfDay()
  const done = entry.doneAt !== null

  const meta: string[] = []
  if (entry.onDate) {
    meta.push(
      new Date(`${entry.onDate}T00:00:00.000Z`).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        weekday: 'short',
        timeZone: 'UTC',
      }),
    )
    meta.push(entry.startMinute === null ? t('allDay') : minuteOfDay(entry.startMinute))
  } else {
    meta.push(t('todo.noDate'))
  }

  return (
    <li className="flex items-center gap-2 rounded-2xl bg-base-50 pl-2 pr-1 dark:bg-base-800/60">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={done}
        aria-label={done ? t('todo.markUndone') : t('todo.markDone')}
        className={cn(
          'focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-50',
          done ? 'text-point-500' : 'text-base-300 dark:text-base-600',
        )}
      >
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full border-2',
            done ? 'border-point-500 bg-point-500 text-white' : 'border-current',
          )}
        >
          {done && <Check size={12} strokeWidth={3.2} aria-hidden />}
        </span>
      </button>
      <Link
        href={`/schedule/${entry.id}`}
        prefetch={false}
        className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-xl py-3 pr-2 transition active:opacity-70"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-[15px] font-medium text-base-900 dark:text-base-50',
              done && 'text-base-400 line-through dark:text-base-500',
            )}
          >
            {entry.title}
          </span>
          <span className="mt-0.5 block text-[12px] tabular-nums text-base-500 dark:text-base-400">
            {meta.join(' · ')}
          </span>
        </span>
        {entry.checklistTotal > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-base-500 dark:text-base-400">
            <ListChecks size={13} strokeWidth={2.2} aria-hidden />
            {t('checklistProgress', { done: entry.checklistDone, total: entry.checklistTotal })}
          </span>
        )}
        <ChevronRight size={16} className="shrink-0 text-base-300 dark:text-base-600" aria-hidden />
      </Link>
    </li>
  )
}
