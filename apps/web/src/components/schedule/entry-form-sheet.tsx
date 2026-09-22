'use client'
import { babyFieldMode, initialBabyId } from '@/lib/schedule-baby-field'
import { createScheduleAction, updateScheduleAction } from '@/(app)/schedule/actions'
import { Sheet } from '@/components/ui/sheet'
import { Input, Label } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Toggle } from '@/components/ui/toggle'
import { actionErrorText } from '@/lib/action-result'
import { cn } from '@/lib/cn'
import { localDayKey } from '@/lib/day-key'
import { initialOnDate } from '@/lib/schedule-date-field'
import { useToast } from '@/lib/toast'
import type { ReminderSpec } from '@/server/schedule/reminder-time'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from 'react'
import { ChecklistEditor } from './checklist-editor'
import {
  type ChecklistDraftItem,
  MORNING_MINUTE,
  type ReminderMode,
  convertReminders,
} from './form-model'
import { ReminderPicker } from './reminder-picker'

export type ScheduleBabyOption = { id: string; name: string }

export type ScheduleFormInitial = {
  id: string
  title: string
  memo: string | null
  onDate: string | null
  startMinute: number | null
  repeatYearly: boolean
  repeatUntil: string | null
  babyId: string | null
  checklist: { id: string; label: string }[]
  reminders: ReminderSpec[]
}

type ScheduleFormApi = {
  /** 이 뷰어가 일정을 만들 수 있는지 — 화면들이 '일정 추가' 를 그릴지 판단한다. */
  canCreate: boolean
  /**
   * 작성 시트를 연다. 날짜 칸에서 열면 그 날로, 날짜 없이 열면 오늘로 채워 시작한다 —
   * 빈 날짜로 열면 알림 UI 가 숨어 버린다. 날짜 없는 할 일은 시트 안 '날짜 지우기' 로.
   */
  openCreate: (day?: string | null) => void
  openEdit: (initial: ScheduleFormInitial) => void
}

const Ctx = createContext<ScheduleFormApi | null>(null)

export function useScheduleForm(): ScheduleFormApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useScheduleForm must be inside ScheduleFormProvider')
  return api
}

type Draft = {
  id: string | null
  title: string
  memo: string
  onDate: string
  mode: ReminderMode
  startMinute: number
  repeatYearly: boolean
  repeatUntil: string
  babyId: string
  checklist: ChecklistDraftItem[]
  reminders: ReminderSpec[]
}

// 아기가 둘 이상이면 미리 골라 두지 않는다 — 가족 일정은 아기 소속이 아니고, 자동으로
// 붙으면 사용자가 고르지도 않은 연결이 생긴다. 한 명뿐이면 고를 것이 없어 그 아기로 찬다.
function blankDraft(day: string | null | undefined, babies: ScheduleBabyOption[]): Draft {
  return {
    id: null,
    title: '',
    memo: '',
    onDate: initialOnDate(day, localDayKey()),
    mode: 'allDay',
    startMinute: MORNING_MINUTE,
    repeatYearly: false,
    repeatUntil: '',
    babyId: initialBabyId(babies, null),
    checklist: [],
    reminders: [],
  }
}

function draftOf(initial: ScheduleFormInitial, babies: ScheduleBabyOption[]): Draft {
  return {
    id: initial.id,
    title: initial.title,
    memo: initial.memo ?? '',
    onDate: initial.onDate ?? '',
    mode: initial.startMinute === null ? 'allDay' : 'timed',
    startMinute: initial.startMinute ?? MORNING_MINUTE,
    repeatYearly: initial.repeatYearly,
    repeatUntil: initial.repeatUntil ?? '',
    babyId: initialBabyId(babies, initial.babyId ?? null),
    checklist: initial.checklist.map((item) => ({
      key: item.id,
      id: item.id,
      label: item.label,
    })),
    reminders: initial.reminders,
  }
}

function timeValue(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export function ScheduleFormProvider({
  children,
  babies,
  pushEnabled,
  canCreate,
}: {
  children: ReactNode
  babies: ScheduleBabyOption[]
  pushEnabled: boolean
  canCreate: boolean
}) {
  // `serial` 은 시트를 여는 횟수다. 폼 상태를 리셋하는 key 를 일정 id 로만 만들면 같은 날짜로
  // 연달아 새 일정을 쓸 때 컴포넌트가 리마운트되지 않아 직전 제목·메모가 그대로 남는다.
  const [draft, setDraft] = useState<{ serial: number; value: Draft } | null>(null)
  const [open, setOpen] = useState(false)

  const api = useMemo<ScheduleFormApi>(
    () => ({
      canCreate,
      openCreate: (day) => {
        setDraft((prev) => ({
          serial: (prev?.serial ?? 0) + 1,
          value: blankDraft(day, babies),
        }))
        setOpen(true)
      },
      openEdit: (initial) => {
        setDraft((prev) => ({ serial: (prev?.serial ?? 0) + 1, value: draftOf(initial, babies) }))
        setOpen(true)
      },
    }),
    [canCreate, babies],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      {draft && (
        <EntryFormSheet
          // 시트를 열 때마다 폼 상태를 새로 시작한다 — 이전 일정의 메모가 남으면 안 된다.
          key={draft.serial}
          open={open}
          onOpenChange={setOpen}
          initial={draft.value}
          babies={babies}
          pushEnabled={pushEnabled}
        />
      )}
    </Ctx.Provider>
  )
}

function EntryFormSheet({
  open,
  onOpenChange,
  initial,
  babies,
  pushEnabled,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  initial: Draft
  babies: ScheduleBabyOption[]
  pushEnabled: boolean
}) {
  const t = useTranslations('schedule')
  const tRoot = useTranslations()
  const toast = useToast()
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const patch = useCallback((next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next })), [])
  const babyMode = useMemo(() => babyFieldMode(babies), [babies])

  // 날짜가 사라지면 시각·반복·알림도 함께 사라진다. 남겨 두면 화면에는 걸려 있는데 발송
  // 경로는 그 일정을 영영 건너뛴다.
  const onDateChange = useCallback(
    (value: string) => {
      if (value === '') {
        patch({ onDate: '', mode: 'allDay', repeatYearly: false, repeatUntil: '', reminders: [] })
        return
      }
      patch({ onDate: value })
    },
    [patch],
  )

  // 종일↔시각을 바꾸면 알림을 같은 뜻의 다른 모양으로 옮긴다. 옮기지 못해 사라진 게
  // 있으면 그 자리에서 알린다 — 조용히 버리면 걸어 뒀다고 믿은 알림이 오지 않는다.
  const onModeChange = useCallback(
    (mode: ReminderMode) => {
      const moved = convertReminders(draft.reminders, mode, {
        startMinute: draft.startMinute,
        atMinute: MORNING_MINUTE,
      })
      if (moved.dropped > 0) toast({ title: t('reminder.converted', { count: moved.dropped }) })
      patch({ mode, reminders: moved.specs })
    },
    [draft.reminders, draft.startMinute, patch, t, toast],
  )

  const submit = () => {
    setError(null)
    const hasDate = draft.onDate !== ''
    const payload = {
      title: draft.title.trim(),
      memo: draft.memo.trim() === '' ? null : draft.memo.trim(),
      onDate: hasDate ? draft.onDate : null,
      startMinute: hasDate && draft.mode === 'timed' ? draft.startMinute : null,
      repeatYearly: hasDate && draft.repeatYearly,
      repeatUntil: hasDate && draft.repeatYearly && draft.repeatUntil ? draft.repeatUntil : null,
      babyId: draft.babyId === '' ? null : draft.babyId,
      checklist: draft.checklist.map((item) => ({ id: item.id, label: item.label.trim() })),
      reminders: hasDate ? draft.reminders : [],
    }
    startTransition(async () => {
      const result = draft.id
        ? await updateScheduleAction(draft.id, payload)
        : await createScheduleAction(payload)
      if (!result.ok) {
        setError(actionErrorText(tRoot, result))
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  const hasDate = draft.onDate !== ''
  const canSubmit = draft.title.trim() !== '' && !pending

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={draft.id ? t('form.editTitle') : t('form.createTitle')}
    >
      <div className="space-y-5 pb-2">
        {error && (
          <p className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        )}

        <div>
          <Label htmlFor="schedule-title">{t('form.title')}</Label>
          <Input
            id="schedule-title"
            value={draft.title}
            maxLength={200}
            placeholder={t('form.titlePlaceholder')}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="schedule-date">{t('form.date')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="schedule-date"
              type="date"
              value={draft.onDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="flex-1"
            />
            {hasDate && (
              <button
                type="button"
                onClick={() => onDateChange('')}
                className="focus-ring shrink-0 rounded-xl px-3 py-2 text-[13px] font-medium text-base-500 transition active:opacity-70 dark:text-base-400"
              >
                {t('form.clearDate')}
              </button>
            )}
          </div>
          {!hasDate && <p className="mt-1.5 text-[12px] text-base-400">{t('form.noDateHint')}</p>}
        </div>

        {hasDate && (
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={draft.mode}
              onChange={onModeChange}
              options={[
                { value: 'allDay' as const, label: t('allDay') },
                { value: 'timed' as const, label: t('form.timed') },
              ]}
            />
            {draft.mode === 'timed' && (
              <Input
                type="time"
                aria-label={t('form.time')}
                value={timeValue(draft.startMinute)}
                onChange={(e) => {
                  const m = /^(\d{2}):(\d{2})$/.exec(e.target.value)
                  if (m) patch({ startMinute: Number(m[1]) * 60 + Number(m[2]) })
                }}
                className="h-11 w-32 tabular-nums"
              />
            )}
          </div>
        )}

        <div>
          <Label htmlFor="schedule-memo">{t('form.memo')}</Label>
          <textarea
            id="schedule-memo"
            value={draft.memo}
            maxLength={2000}
            rows={3}
            placeholder={t('form.memoPlaceholder')}
            onChange={(e) => patch({ memo: e.target.value })}
            className="w-full resize-none rounded-2xl border border-transparent bg-base-100 px-4 py-3 text-[15px] text-base-900 placeholder:text-base-400 transition-all focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-100"
          />
        </div>

        <div>
          <Label>{t('form.checklist')}</Label>
          <ChecklistEditor items={draft.checklist} onChange={(checklist) => patch({ checklist })} />
        </div>

        <div>
          <Label>{t('form.reminders')}</Label>
          {hasDate ? (
            <ReminderPicker
              mode={draft.mode}
              specs={draft.reminders}
              onChange={(reminders) => patch({ reminders })}
              pushEnabled={pushEnabled}
            />
          ) : (
            <p className="text-[12.5px] text-base-400">{t('form.remindersNeedDate')}</p>
          )}
        </div>

        {hasDate && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium text-base-800 dark:text-base-100">
                {t('form.repeatYearly')}
              </span>
              <Toggle
                checked={draft.repeatYearly}
                aria-label={t('form.repeatYearly')}
                onChange={(e) =>
                  patch({
                    repeatYearly: e.target.checked,
                    ...(e.target.checked ? {} : { repeatUntil: '' }),
                  })
                }
              />
            </div>
            {draft.repeatYearly && (
              <div>
                <Label htmlFor="schedule-repeat-until">{t('form.repeatUntil')}</Label>
                <Input
                  id="schedule-repeat-until"
                  type="date"
                  value={draft.repeatUntil}
                  min={draft.onDate}
                  onChange={(e) => patch({ repeatUntil: e.target.value })}
                />
              </div>
            )}
          </div>
        )}

        {/* 아기가 하나면 이 줄을 아예 내지 않는다 — 고를 것이 없는 칸이다.
            값은 `initialBabyId` 가 그 아기로 채워 두므로 저장하면 그대로 연결된다. */}
        {babyMode.kind === 'choose' && (
          <div>
            <Label htmlFor="schedule-baby">{t('form.baby')}</Label>
            <select
              id="schedule-baby"
              value={draft.babyId}
              onChange={(e) => patch({ babyId: e.target.value })}
              className="h-12 w-full rounded-2xl bg-base-100 px-4 text-[15px] text-base-900 dark:bg-base-800 dark:text-base-100"
            >
              <option value="">{t('form.babyNone')}</option>
              {babies.map((baby) => (
                <option key={baby.id} value={baby.id}>
                  {baby.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className={cn(
            'focus-ring w-full rounded-2xl bg-point-500 py-3.5 text-[15px] font-semibold text-white transition active:scale-[0.98]',
            !canSubmit && 'opacity-40',
          )}
        >
          {pending ? t('form.saving') : t('form.save')}
        </button>
      </div>
    </Sheet>
  )
}
