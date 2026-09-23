import type { NotificationJob } from '@bebe/core'
import { describe, expect, it } from 'vitest'
import type { ScheduleContent } from '@/lib/schedule-edit-diff'
import { notifyScheduleUpdated } from './updated-notice'

const before: ScheduleContent = {
  title: '강남 진료',
  memo: null,
  onDate: '2026-09-25',
  startMinute: 600,
  repeatYearly: false,
  repeatUntil: null,
  babyId: null,
  checklist: ['분유'],
}

function spy() {
  const jobs: NotificationJob[] = []
  return { jobs, enqueue: async (job: NotificationJob) => void jobs.push(job) }
}

describe('notifyScheduleUpdated', () => {
  it('내용이 바뀌면 고친 사람을 actor 로 벽시계 날짜·시각을 실어 보낸다', async () => {
    const s = spy()
    const sent = await notifyScheduleUpdated(
      {
        familyId: 'f',
        byUserId: 'u',
        entryId: 'e1',
        before,
        after: { ...before, startMinute: 630 },
      },
      s.enqueue,
    )
    expect(sent).toBe(true)
    expect(s.jobs).toEqual([
      {
        familyId: 'f',
        actorUserId: 'u',
        type: 'schedule.updated',
        payload: { entryId: 'e1', title: '강남 진료', onDate: '2026-09-25', startMinute: '630' },
      },
    ])
  })

  it('바뀐 게 없으면 보내지 않는다', async () => {
    const s = spy()
    expect(
      await notifyScheduleUpdated(
        { familyId: 'f', byUserId: 'u', entryId: 'e1', before, after: before },
        s.enqueue,
      ),
    ).toBe(false)
    expect(s.jobs).toEqual([])
  })

  it('날짜를 지워 할 일이 되면 날짜·시각 없이 보낸다', async () => {
    const s = spy()
    await notifyScheduleUpdated(
      {
        familyId: 'f',
        byUserId: 'u',
        entryId: 'e1',
        before,
        after: { ...before, onDate: null, startMinute: null },
      },
      s.enqueue,
    )
    expect(s.jobs[0]?.payload).toEqual({ entryId: 'e1', title: '강남 진료' })
  })
})
