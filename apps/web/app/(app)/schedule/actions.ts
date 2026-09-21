'use server'
import type { ActionResult } from '@/lib/action-result'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { actionReject, withActionLog } from '@/lib/with-action-log'
import { resolveContext } from '@/server/context'
import {
  addChecklistItem,
  removeChecklistItem,
  renameChecklistItem,
  setChecklistItemDone,
} from '@/server/schedule/checklist'
import {
  createScheduleEntry,
  deleteScheduleEntry,
  setScheduleEntryDone,
  updateScheduleEntry,
} from '@/server/schedule/entry'
import { getScheduleEntry } from '@/server/schedule/list'
import { setScheduleReminders } from '@/server/schedule/reminders'
import { isFeatureEnabled } from '@/server/settings/features'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const DAY = /^\d{4}-\d{2}-\d{2}$/

const ChecklistDraft = z.object({
  id: z.string().uuid().nullable(),
  label: z.string().trim().min(1).max(200),
})

const ReminderInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lead'), leadMinutes: z.number().int().min(0).max(43200) }),
  z.object({
    kind: z.literal('dayBefore'),
    daysBefore: z.number().int().min(0).max(30),
    atMinute: z.number().int().min(0).max(1439),
  }),
])

const FormPayload = z
  .object({
    title: z.string().trim().min(1).max(200),
    memo: z.string().max(2000).nullable(),
    onDate: z.string().regex(DAY).nullable(),
    startMinute: z.number().int().min(0).max(1439).nullable(),
    repeatYearly: z.boolean(),
    repeatUntil: z.string().regex(DAY).nullable(),
    babyId: z.string().uuid().nullable(),
    checklist: z.array(ChecklistDraft).max(50),
    reminders: z.array(ReminderInput).max(20),
  })
  // 저장은 일정 → 체크리스트 → 알림 세 번의 쓰기로 나뉘고 한 트랜잭션이 아니다. 알림 단계가
  // 뒤늦게 거절하면 앞의 두 개는 이미 저장된 채 사용자는 실패만 본다 — "저장이 안 됐구나"
  // 하고 다시 누르게 된다. 그래서 그 조합을 쓰기 전에 여기서 걸러 낸다.
  .refine((v) => v.onDate !== null || v.reminders.length === 0, {
    message: 'schedule.reminderNeedsDate',
    path: ['reminders'],
  })

export type SchedulePayload = z.infer<typeof FormPayload>

type Caller = { familyId: string; userId: string }

/**
 * 기능 플래그는 화면과 서버 **양쪽**에서 막는다 — UI 만 숨기면 플래그를 끈 인스턴스에서도
 * 액션을 직접 부를 수 있다.
 */
async function caller(): Promise<Caller> {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  if (!(await isFeatureEnabled('schedule', prismaPublic)))
    throw actionReject(404, 'errors.featureOff.schedule')
  return { familyId: ctx.family.id, userId: ctx.user.id }
}

function refresh(id?: string): void {
  revalidatePath('/calendar')
  revalidatePath('/calendar/todo')
  if (id) revalidatePath(`/schedule/${id}`)
}

function entryPatch(payload: SchedulePayload) {
  return {
    title: payload.title,
    memo: payload.memo,
    onDate: payload.onDate,
    startMinute: payload.startMinute,
    repeatYearly: payload.repeatYearly,
    repeatUntil: payload.repeatUntil,
    babyId: payload.babyId,
  }
}

/** 위치 순서대로 하나씩 — 추가 순서가 곧 `position` 이다. */
async function addAll(entryId: string, who: Caller, labels: string[]): Promise<void> {
  for (const label of labels) {
    await addChecklistItem(
      { entryId, familyId: who.familyId, byUserId: who.userId, label },
      prismaPublic,
    )
  }
}

/**
 * 폼은 목록 전체를 보내지만 **바뀐 것만** 건드린다. 통째로 지우고 다시 만들면 체크해 둔
 * 항목의 완료 표시가 메모 한 줄 고친 저장에 함께 날아간다.
 */
async function syncChecklist(
  entryId: string,
  who: Caller,
  wanted: SchedulePayload['checklist'],
): Promise<void> {
  const current = await getScheduleEntry({ id: entryId, familyId: who.familyId }, prismaPublic)
  const existing = current?.checklistItems ?? []
  const wantedIds = new Set(wanted.flatMap((item) => (item.id ? [item.id] : [])))
  for (const item of existing) {
    if (!wantedIds.has(item.id))
      await removeChecklistItem(
        { id: item.id, familyId: who.familyId, byUserId: who.userId },
        prismaPublic,
      )
  }
  const labelById = new Map(existing.map((item) => [item.id, item.label]))
  for (const item of wanted) {
    if (item.id && labelById.has(item.id) && labelById.get(item.id) !== item.label)
      await renameChecklistItem(
        { id: item.id, familyId: who.familyId, byUserId: who.userId, label: item.label },
        prismaPublic,
      )
  }
  await addAll(
    entryId,
    who,
    wanted.filter((item) => item.id === null || !labelById.has(item.id)).map((item) => item.label),
  )
}

export async function createScheduleAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return withActionLog('schedule.create', async () => {
    const who = await caller()
    const payload = FormPayload.parse(raw)
    const entry = await createScheduleEntry(
      { familyId: who.familyId, byUserId: who.userId, ...entryPatch(payload) },
      prismaPublic,
    )
    await addAll(
      entry.id,
      who,
      payload.checklist.map((item) => item.label),
    )
    await setScheduleReminders(
      {
        entryId: entry.id,
        familyId: who.familyId,
        byUserId: who.userId,
        specs: payload.reminders,
      },
      prismaPublic,
    )
    refresh(entry.id)
    return { id: entry.id }
  })
}

export async function updateScheduleAction(id: string, raw: unknown): Promise<ActionResult<void>> {
  return withActionLog('schedule.update', async () => {
    const who = await caller()
    const payload = FormPayload.parse(raw)
    await updateScheduleEntry(
      { id, familyId: who.familyId, byUserId: who.userId, patch: entryPatch(payload) },
      prismaPublic,
    )
    await syncChecklist(id, who, payload.checklist)
    await setScheduleReminders(
      { entryId: id, familyId: who.familyId, byUserId: who.userId, specs: payload.reminders },
      prismaPublic,
    )
    refresh(id)
  })
}

export async function deleteScheduleAction(id: string): Promise<ActionResult<void>> {
  return withActionLog('schedule.delete', async () => {
    const who = await caller()
    await deleteScheduleEntry({ id, familyId: who.familyId, byUserId: who.userId }, prismaPublic)
    refresh(id)
  })
}

export async function setScheduleDoneAction(
  id: string,
  done: boolean,
): Promise<ActionResult<void>> {
  return withActionLog('schedule.done', async () => {
    const who = await caller()
    await setScheduleEntryDone(
      { id, familyId: who.familyId, byUserId: who.userId, done },
      prismaPublic,
    )
    refresh(id)
  })
}

export async function addChecklistItemAction(
  entryId: string,
  label: string,
): Promise<ActionResult<{ id: string }>> {
  return withActionLog('schedule.checklist.add', async () => {
    const who = await caller()
    const item = await addChecklistItem(
      { entryId, familyId: who.familyId, byUserId: who.userId, label },
      prismaPublic,
    )
    refresh(entryId)
    return { id: item.id }
  })
}

export async function renameChecklistItemAction(
  id: string,
  label: string,
): Promise<ActionResult<void>> {
  return withActionLog('schedule.checklist.rename', async () => {
    const who = await caller()
    await renameChecklistItem(
      { id, familyId: who.familyId, byUserId: who.userId, label },
      prismaPublic,
    )
    refresh()
  })
}

export async function removeChecklistItemAction(id: string): Promise<ActionResult<void>> {
  return withActionLog('schedule.checklist.remove', async () => {
    const who = await caller()
    await removeChecklistItem({ id, familyId: who.familyId, byUserId: who.userId }, prismaPublic)
    refresh()
  })
}

export async function setChecklistItemDoneAction(
  id: string,
  done: boolean,
): Promise<ActionResult<void>> {
  return withActionLog('schedule.checklist.done', async () => {
    const who = await caller()
    await setChecklistItemDone(
      { id, familyId: who.familyId, byUserId: who.userId, done },
      prismaPublic,
    )
    refresh()
  })
}
