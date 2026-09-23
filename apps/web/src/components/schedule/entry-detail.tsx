'use client'
import {
  deleteScheduleAction,
  setChecklistItemDoneAction,
  setScheduleDoneAction,
} from '@/(app)/schedule/actions'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { actionErrorText } from '@/lib/action-result'
import { cn } from '@/lib/cn'
import {
  type ChecklistDoneState,
  checklistDoneCredit,
  nextChecklistDone,
} from '@/lib/schedule-checklist-done'
import { useToast } from '@/lib/toast'
import type {
  ScheduleChecklistItemView,
  ScheduleEntryDetail,
  ScheduleReminderView,
} from '@/server/schedule/list'
import type { ReminderSpec } from '@/server/schedule/reminder-time'
import {
  Bell,
  Check,
  ChevronLeft,
  ListChecks,
  Pencil,
  Repeat,
  RotateCcw,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useState, useTransition } from 'react'
import { useScheduleForm } from './entry-form-sheet'
import { useMinuteOfDay, useReminderLabel } from './reminder-label'
import { ScheduleShareButton } from './schedule-share-button'

type Props = {
  entry: ScheduleEntryDetail
  canEdit: boolean
  /** 공유 링크 발급 권한(share.create)과 공유 기능이 모두 켜져 있을 때만. */
  canShare: boolean
  canDelete: boolean
  /** 내가 체크한 항목에 서버 왕복을 기다리지 않고 바로 이름을 붙이려고 받는다. */
  viewerName: string
}

function toSpec(reminder: ScheduleReminderView): ReminderSpec {
  return reminder.leadMinutes !== null
    ? { kind: 'lead', leadMinutes: reminder.leadMinutes }
    : { kind: 'dayBefore', daysBefore: reminder.daysBefore ?? 0, atMinute: reminder.atMinute ?? 0 }
}

export function EntryDetail({ entry, canEdit, canShare, canDelete, viewerName }: Props) {
  const t = useTranslations('schedule')
  const minuteOfDay = useMinuteOfDay()
  const tRoot = useTranslations()
  const locale = useLocale()
  const toast = useToast()
  const router = useRouter()
  const form = useScheduleForm()
  const [, startTransition] = useTransition()
  const [doneAt, setDoneAt] = useState<Date | null>(entry.doneAt)
  const [items, setItems] = useState<ScheduleChecklistItemView[]>(entry.checklistItems)
  const doneCount = items.filter((item) => item.doneAt !== null).length
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // 수정 시트가 저장 후 router.refresh() 를 부르면 이 컴포넌트는 새 props 로 다시 그려지지만
  // useState 의 초기값은 그때 다시 읽히지 않는다 — 그대로 두면 지운 체크 항목이 화면에 남고,
  // 그걸 누르면 없는 행을 토글해 404 가 난다. 서버가 준 값이 언제나 진실이다.
  useEffect(() => {
    setDoneAt(entry.doneAt)
    setItems(entry.checklistItems)
  }, [entry.doneAt, entry.checklistItems])

  const fail = (result: { ok: false; errorKey: string; message?: string; status: number }) => {
    toast({
      title: t('detail.saveFailed'),
      description: actionErrorText(tRoot, result),
      variant: 'danger',
    })
  }

  // 저장이 실패하면 화면을 원래대로 되돌린다 — 이 기기에만 남는 '완료' 는 거짓말이다.
  const toggleDone = () => {
    const was = doneAt
    const next = was ? null : new Date()
    setDoneAt(next)
    setBusy(true)
    startTransition(async () => {
      const result = await setScheduleDoneAction(entry.id, next !== null)
      setBusy(false)
      if (!result.ok) {
        setDoneAt(was)
        fail(result)
        return
      }
      router.refresh()
    })
  }

  const toggleItem = (item: ScheduleChecklistItemView) => {
    const was: ChecklistDoneState = { doneAt: item.doneAt, doneByName: item.doneByName }
    const next = nextChecklistDone(item, new Date(), viewerName)
    const put = (value: ChecklistDoneState) =>
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, ...value } : i)))
    put(next)
    startTransition(async () => {
      const result = await setChecklistItemDoneAction(item.id, next.doneAt !== null)
      if (!result.ok) {
        put(was)
        fail(result)
        return
      }
      router.refresh()
    })
  }

  const remove = async () => {
    const result = await deleteScheduleAction(entry.id)
    if (!result.ok) {
      fail(result)
      return
    }
    router.replace('/calendar')
    router.refresh()
  }

  const openEdit = () => {
    form.openEdit({
      id: entry.id,
      title: entry.title,
      memo: entry.memo,
      onDate: entry.onDate,
      startMinute: entry.startMinute,
      repeatYearly: entry.repeatYearly,
      repeatUntil: entry.repeatUntil,
      babyId: entry.babyId,
      checklist: items.map((item) => ({ id: item.id, label: item.label })),
      reminders: entry.reminders.map(toSpec),
    })
  }

  const done = doneAt !== null
  const dateLine = entry.onDate ? formatDay(entry.onDate, locale) : t('detail.noDate')
  const timeLine =
    entry.onDate === null
      ? null
      : entry.startMinute === null
        ? t('allDay')
        : minuteOfDay(entry.startMinute)

  return (
    <>
      <header className="sticky top-0 pt-[env(safe-area-inset-top)] z-30 border-b border-base-200/60 bg-base-50/80 backdrop-blur-xl dark:border-base-800/60 dark:bg-base-950/70">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-5">
          <Link
            href="/calendar"
            className="focus-ring flex items-center gap-1 rounded-lg text-[15px] font-medium text-base-600 transition-colors hover:text-base-900 dark:text-base-300 dark:hover:text-base-50"
          >
            <ChevronLeft size={18} strokeWidth={2.2} aria-hidden />
            {t('detail.back')}
          </Link>
          <div className="flex items-center gap-3">
            {canShare && <ScheduleShareButton entryId={entry.id} title={entry.title} />}
            {canEdit && (
              <button
                type="button"
                onClick={openEdit}
                className="focus-ring flex items-center gap-1 rounded-lg text-[15px] font-medium text-point-500 transition active:opacity-70"
              >
                <Pencil size={16} strokeWidth={2.2} aria-hidden />
                {t('detail.edit')}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-5 py-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium tabular-nums text-base-500 dark:text-base-400">
            <span>{dateLine}</span>
            {timeLine && <span>· {timeLine}</span>}
            {entry.repeatYearly && (
              <span className="flex items-center gap-1 text-point-500">
                <Repeat size={13} strokeWidth={2.4} aria-hidden />
                {entry.repeatUntil
                  ? t('detail.repeatUntil', { date: formatDay(entry.repeatUntil, locale) })
                  : t('detail.repeatYearly')}
              </span>
            )}
            {/* 완료 '상태' 는 배지로, 완료를 '바꾸는' 일은 맨 아래 버튼으로 나눈다 —
                버튼 하나로 둘을 겸하면 완료된 일정이 "완료 취소" 라고만 적혀 있어 헷갈린다. */}
            {done && (
              <span className="flex items-center gap-1 rounded-full bg-point-500/12 px-2 py-0.5 font-semibold text-point-600 dark:text-point-500">
                <Check size={12} strokeWidth={3} aria-hidden />
                {t('detail.doneBadge')}
              </span>
            )}
          </div>
          <h1
            className={cn(
              'mt-1.5 text-[24px] font-bold leading-snug tracking-tight text-base-900 dark:text-base-50',
              done && 'text-base-400 line-through dark:text-base-500',
            )}
          >
            {entry.title}
          </h1>
        </div>

        {/* 메모와 체크리스트는 성격이 다르다 — 하나는 읽는 글, 하나는 누르는 목록. 같은 회색
            라벨 아래 이어 붙이면 어디서 끝나고 시작하는지 안 보여서 각각 제 칸에 담는다. */}
        {entry.memo && (
          <DetailCard
            icon={<StickyNote size={16} strokeWidth={2.2} aria-hidden />}
            title={t('detail.memo')}
          >
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-base-800 dark:text-base-100">
              {entry.memo}
            </p>
          </DetailCard>
        )}

        <DetailCard
          icon={<ListChecks size={16} strokeWidth={2.2} aria-hidden />}
          title={t('detail.checklist')}
          aside={
            items.length > 0 ? (
              <span className="text-[13px] font-semibold tabular-nums text-base-500 dark:text-base-400">
                {t('checklistProgress', { done: doneCount, total: items.length })}
              </span>
            ) : null
          }
        >
          {items.length === 0 ? (
            <p className="text-[14px] text-base-400">{t('detail.checklistEmpty')}</p>
          ) : (
            <>
              <div
                className="mb-2 h-1 overflow-hidden rounded-full bg-base-100 dark:bg-base-800"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-point-500 transition-[width] duration-300 ease-ios"
                  style={{ width: `${Math.round((doneCount / items.length) * 100)}%` }}
                />
              </div>
              <ul className="divide-y divide-base-100 dark:divide-base-800">
                {items.map((item) => (
                  <li key={item.id}>
                    <ChecklistRow item={item} onToggle={() => toggleItem(item)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </DetailCard>

        <section>
          <SectionTitle>{t('detail.reminders')}</SectionTitle>
          <ReminderList reminders={entry.reminders} />
        </section>

        {/* 메모·체크리스트를 읽고 난 다음에 오는 자리 — 화면을 열자마자 눈에 드는 건
            내용이어야 한다. 삭제는 같은 칸 안쪽에 작게 둬 혼자 떠 있지 않게 한다. */}
        <div className="space-y-1 border-t border-base-200/70 pt-5 dark:border-base-800/70">
          <button
            type="button"
            onClick={toggleDone}
            disabled={busy}
            aria-pressed={done}
            className={cn(
              'focus-ring flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50',
              done
                ? 'bg-base-100 text-base-600 dark:bg-base-800 dark:text-base-300'
                : 'border border-base-200 bg-base-0 text-base-800 shadow-card dark:border-base-700 dark:bg-base-900 dark:text-base-100',
            )}
          >
            {done ? (
              <RotateCcw size={16} strokeWidth={2.4} aria-hidden />
            ) : (
              <Check size={17} strokeWidth={2.8} aria-hidden className="text-point-500" />
            )}
            {done ? t('detail.markUndone') : t('detail.markDone')}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="focus-ring mx-auto flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-danger/80 transition active:opacity-70"
            >
              <Trash2 size={14} strokeWidth={2.2} aria-hidden />
              {t('detail.delete')}
            </button>
          )}
        </div>
      </div>

      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('detail.deleteConfirm')}
        description={t('detail.deleteConfirmBody')}
        confirmLabel={t('detail.delete')}
        onConfirm={remove}
      />
    </>
  )
}

function ChecklistRow({
  item,
  onToggle,
}: {
  item: ScheduleChecklistItemView
  onToggle: () => void
}) {
  const t = useTranslations('schedule')
  const credit = checklistDoneCredit(item)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={item.doneAt !== null}
      className="focus-ring flex min-h-11 w-full items-center gap-2.5 rounded-xl px-1 py-2.5 text-left transition active:opacity-70"
    >
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2',
          item.doneAt
            ? 'border-point-500 bg-point-500 text-white'
            : 'border-base-300 dark:border-base-600',
        )}
      >
        {item.doneAt && <Check size={12} strokeWidth={3.2} aria-hidden />}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 text-[15px] text-base-800 dark:text-base-100',
          item.doneAt && 'text-base-400 line-through dark:text-base-500',
        )}
      >
        {item.label}
      </span>
      {/* 누가 챙겼는지가 공유 목록의 절반이다. 좁은 화면에서 제목을 밀지 않게 조용히 뒤에. */}
      {credit && (
        <span className="max-w-[40%] shrink-0 truncate text-[12px] font-medium text-base-400 dark:text-base-500">
          {t('detail.checkedBy', { name: credit })}
        </span>
      )}
    </button>
  )
}

function DetailCard({
  icon,
  title,
  aside,
  children,
}: {
  icon: ReactNode
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-base-200/70 bg-base-0 px-4 pb-3 pt-3.5 shadow-card dark:border-base-800/70 dark:bg-base-900">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-point-500/10 text-point-500">
          {icon}
        </span>
        <h2 className="flex-1 text-[14px] font-semibold text-base-800 dark:text-base-100">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="mb-2 text-[13px] font-semibold text-base-500 dark:text-base-400">{children}</h2>
  )
}

function ReminderList({ reminders }: { reminders: ScheduleReminderView[] }) {
  const t = useTranslations('schedule')
  const describe = useReminderLabel()
  if (reminders.length === 0)
    return <p className="text-[14px] text-base-400">{t('detail.remindersEmpty')}</p>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reminders.map((reminder) => (
        <li
          key={reminder.id}
          className="flex items-center gap-1.5 rounded-full bg-base-100 px-3 py-1.5 text-[13px] font-medium text-base-700 dark:bg-base-800 dark:text-base-200"
        >
          <Bell size={13} strokeWidth={2.2} aria-hidden className="text-point-500" />
          {describe(toSpec(reminder))}
        </li>
      ))}
    </ul>
  )
}

function formatDay(day: string, locale: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  })
}
