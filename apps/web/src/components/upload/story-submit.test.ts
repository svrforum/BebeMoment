import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  STORY_SUBMIT_NAMESPACE,
  type StorySubmitFailure,
  type StorySubmitIo,
  storySubmitFailureTitle,
  submitStory,
} from './story-submit'

type FileLike = { id: string; meta?: { assetId?: string } }

// 업로드 매니저 흉내 — 중단하면 진짜 매니저처럼 그 파일들을 목록에서 지운다.
function fakeUploads(initial: FileLike[]) {
  let files = [...initial]
  const calls: string[] = []
  return {
    calls,
    files: () => files,
    uploads: {
      readFiles: () => files,
      startStagedUploads: (opts: { notify: boolean }) => {
        calls.push(`start notify=${opts.notify}`)
      },
      abortUploads: async (ids: readonly string[]) => {
        calls.push(`abort ${ids.join(',')}`)
        files = files.filter((f) => !ids.includes(f.id))
      },
      pauseAutoDismiss: (paused: boolean) => {
        calls.push(`pause ${paused}`)
      },
    },
  }
}

function fakeIo(rollbackFails: string[] = []) {
  const rolledBack: string[][] = []
  const reports: Parameters<StorySubmitIo['report']>[0][] = []
  const io: StorySubmitIo = {
    // 기다리지 않고 지금 모인 것만 — 정체 판정은 collect-asset-ids.test 가 본다.
    collect: async (read, fileIds) =>
      fileIds
        .map((fid) => read().find((f) => f.id === fid)?.meta?.assetId)
        .filter((id): id is string => typeof id === 'string'),
    rollback: async (ids) => {
      rolledBack.push([...ids])
      const failed = ids.filter((id) => rollbackFails.includes(id))
      return { removed: ids.length - failed.length, failed }
    },
    report: async (input) => {
      reports.push(input)
    },
  }
  return { io, rolledBack, reports }
}

const uploaded = (id: string, assetId: string): FileLike => ({ id, meta: { assetId } })

describe('submitStory', () => {
  it('사진을 올리고 보이는 순서의 assetId 로 저장한다', async () => {
    const m = fakeUploads([uploaded('f1', 'a1'), uploaded('f2', 'a2')])
    const { io, reports } = fakeIo()
    let got: string[] = []
    const r = await submitStory(
      {
        flow: 'timeline-composer',
        notReadyMessage: 'not ready',
        fileIds: ['f2', 'f1'],
        save: async (assetIds) => {
          got = assetIds
          return 7
        },
      },
      m.uploads,
      io,
    )
    expect(r).toEqual({ ok: true, saved: 7 })
    expect(got).toEqual(['a2', 'a1'])
    // 개별 '사진 추가' 푸시는 막고(스토리 푸시 하나로 갈음), 제출 동안 자동정리를 멈췄다 푼다.
    expect(m.calls).toEqual(['pause true', 'start notify=false', 'pause false'])
    expect(reports).toEqual([])
  })

  it('새로 담은 사진이 없으면 업로드를 시작하지 않는다', async () => {
    const m = fakeUploads([])
    const { io } = fakeIo()
    const r = await submitStory(
      {
        flow: 'story-edit',
        notReadyMessage: 'not ready',
        fileIds: [],
        save: async (assetIds) => assetIds,
      },
      m.uploads,
      io,
    )
    expect(r).toEqual({ ok: true, saved: [] })
    expect(m.calls).toEqual(['pause true', 'pause false'])
  })

  // 날짜 오타 하나에 담아 둔 사진이 매니저에서 지워져, 고친 뒤 다시 누르면 30초를 기다린 끝에
  // "다시 담아주세요"가 떴다(편집 화면은 그마저 없어 막다른 길이었다). 입력 오류는 아무것도
  // 시작하거나 지우기 전에 돌려보낸다.
  it('입력 오류면 사진을 올리지도 지우지도 않는다', async () => {
    const staged = { id: 'f1' }
    const m = fakeUploads([staged])
    const { io, rolledBack, reports } = fakeIo()
    let saved = false
    const r = await submitStory(
      {
        flow: 'timeline-composer',
        notReadyMessage: 'not ready',
        fileIds: ['f1'],
        invalid: 'bad date',
        save: async () => {
          saved = true
        },
      },
      m.uploads,
      io,
    )
    expect(r).toEqual({
      ok: false,
      message: 'bad date',
      rolledBack: 0,
      rollbackFailed: 0,
      dropped: [],
    })
    expect(saved).toBe(false)
    expect(m.calls).toEqual([])
    expect(m.files()).toEqual([staged])
    expect(rolledBack).toEqual([])
    expect(reports).toEqual([])
  })

  it('저장이 실패하면 올라간 사진을 되돌리고 배치를 걷어 낸다', async () => {
    const m = fakeUploads([uploaded('f1', 'a1'), uploaded('f2', 'a2'), uploaded('other', 'x')])
    const { io, rolledBack, reports } = fakeIo()
    const r = await submitStory(
      {
        flow: 'timeline-composer',
        notReadyMessage: 'not ready',
        fileIds: ['f1', 'f2'],
        save: async () => {
          throw new Error('server said no')
        },
      },
      m.uploads,
      io,
    )
    // 중단이 파일 목록을 비우므로 만들어진 id 는 그 전에 읽어야 한다 — 거꾸로면 되돌릴 게 없다.
    expect(rolledBack).toEqual([['a1', 'a2']])
    expect(m.calls).toEqual(['pause true', 'start notify=false', 'abort f1,f2', 'pause false'])
    // 같은 매니저에서 돌던 다른 업로드는 건드리지 않는다.
    expect(m.files().map((f) => f.id)).toEqual(['other'])
    expect(r).toEqual({
      ok: false,
      message: 'server said no',
      rolledBack: 2,
      rollbackFailed: 0,
      dropped: ['f1', 'f2'],
    })
    expect(reports).toEqual([
      {
        flow: 'timeline-composer',
        step: 'story-post',
        message: 'server said no',
        counts: { staged: 2, created: 2, rolledBack: 2, rollbackFailed: 0, stale: 0 },
      },
    ])
  })

  // stale 은 실패 시점에 이미 매니저에 없던 첨부 수다(다른 흐름이 치운 것) — 30초를 기다린 끝의
  // 'uploadNotReady' 막다른 길을 재현 없이 설명하는 유일한 숫자라, 중단이 지운 배치 전체(dropped)와
  // 섞이면 안 된다.
  it('중단 전에 이미 매니저에서 빠져 있던 첨부만 stale 로 센다', async () => {
    const m = fakeUploads([uploaded('f1', 'a1'), uploaded('other', 'x')])
    const { io, rolledBack, reports } = fakeIo()
    const r = await submitStory(
      {
        flow: 'timeline-composer',
        notReadyMessage: 'not ready',
        fileIds: ['f1', 'f2', 'f3'],
        save: async () => undefined,
      },
      m.uploads,
      io,
    )
    expect(rolledBack).toEqual([['a1']])
    // 화면은 배치 전체를 다시 담아야 한다 — 중단이 남은 것까지 지웠다.
    expect(r).toMatchObject({ ok: false, message: 'not ready', dropped: ['f1', 'f2', 'f3'] })
    expect(reports).toEqual([
      {
        flow: 'timeline-composer',
        step: 'collect-asset-ids',
        message: 'not ready',
        counts: { staged: 3, created: 1, rolledBack: 1, rollbackFailed: 0, stale: 2 },
      },
    ])
  })

  it('assetId 가 다 모이지 않으면 저장하지 않고 수집 단계로 보고한다', async () => {
    const m = fakeUploads([uploaded('f1', 'a1'), { id: 'f2' }])
    const { io, rolledBack, reports } = fakeIo()
    let saved = false
    const r = await submitStory(
      {
        flow: 'story-edit',
        notReadyMessage: 'not ready',
        fileIds: ['f1', 'f2'],
        save: async () => {
          saved = true
        },
      },
      m.uploads,
      io,
    )
    expect(saved).toBe(false)
    expect(rolledBack).toEqual([['a1']])
    expect(r).toMatchObject({ ok: false, message: 'not ready', dropped: ['f1', 'f2'] })
    expect(reports[0]).toMatchObject({ flow: 'story-edit', step: 'collect-asset-ids' })
  })

  it('편집 화면의 저장 실패는 story-patch 단계로, 되돌리지 못한 id 와 함께 보고한다', async () => {
    const m = fakeUploads([uploaded('f1', 'a1'), uploaded('f2', 'a2')])
    const { io, reports } = fakeIo(['a2'])
    const r = await submitStory(
      {
        flow: 'story-edit',
        notReadyMessage: 'not ready',
        fileIds: ['f1', 'f2'],
        save: async () => {
          throw new Error('nope')
        },
      },
      m.uploads,
      io,
    )
    expect(r).toMatchObject({ ok: false, rolledBack: 1, rollbackFailed: 1 })
    expect(reports).toEqual([
      {
        flow: 'story-edit',
        step: 'story-patch',
        message: 'nope',
        counts: { staged: 2, created: 2, rolledBack: 1, rollbackFailed: 1, stale: 0 },
        assetIds: ['a2'],
      },
    ])
  })

  it('업로드 시트의 저장 실패는 story-post 단계로 보고한다', async () => {
    const m = fakeUploads([uploaded('f1', 'a1')])
    const { io, rolledBack, reports } = fakeIo()
    const r = await submitStory(
      {
        flow: 'upload-sheet',
        notReadyMessage: 'not ready',
        fileIds: ['f1'],
        save: async () => {
          throw new Error('server said no')
        },
      },
      m.uploads,
      io,
    )
    expect(rolledBack).toEqual([['a1']])
    expect(r).toMatchObject({ ok: false, rolledBack: 1, dropped: ['f1'] })
    expect(reports).toEqual([
      {
        flow: 'upload-sheet',
        step: 'story-post',
        message: 'server said no',
        counts: { staged: 1, created: 1, rolledBack: 1, rollbackFailed: 0, stale: 0 },
      },
    ])
  })

  it('아무것도 만들어지지 않았으면 되돌리기를 부르지 않는다', async () => {
    const m = fakeUploads([{ id: 'f1' }])
    const { io, rolledBack } = fakeIo()
    const r = await submitStory(
      {
        flow: 'timeline-composer',
        notReadyMessage: 'not ready',
        fileIds: ['f1'],
        save: async () => undefined,
      },
      m.uploads,
      io,
    )
    expect(rolledBack).toEqual([])
    expect(r).toMatchObject({ ok: false, rolledBack: 0, dropped: ['f1'] })
  })
})

describe('storySubmitFailureTitle', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${values.count}:${values.error}` : key
  const failure = (over: Partial<StorySubmitFailure>): StorySubmitFailure => ({
    ok: false,
    message: 'boom',
    rolledBack: 0,
    rollbackFailed: 0,
    dropped: [],
    ...over,
  })

  it('되돌리지 못한 사진이 있으면 그것부터 알린다', () => {
    expect(storySubmitFailureTitle(failure({ rolledBack: 1, rollbackFailed: 2 }), t)).toBe(
      'rolledBackPartly:2:boom',
    )
  })

  it('되돌린 사진이 있으면 휴지통으로 갔다고 알린다', () => {
    expect(storySubmitFailureTitle(failure({ rolledBack: 3, dropped: ['f'] }), t)).toBe(
      'rolledBack:3:boom',
    )
  })

  it('걷어 낸 첨부만 있으면 다시 담으라고 알린다', () => {
    expect(storySubmitFailureTitle(failure({ dropped: ['f1', 'f2'] }), t)).toBe('reattach:2:boom')
  })

  it('사진과 무관한 실패는 그 문구 그대로', () => {
    expect(storySubmitFailureTitle(failure({}), t)).toBe('boom')
  })
})

// 실패 문구는 흐름별 네임스페이스에서 동적 키로 읽는다 — 빠지면 토스트에 키 경로가 그대로 뜬다.
describe('스토리 제출 실패 문구', () => {
  for (const locale of ['ko', 'en']) {
    it(`${locale}: 모든 흐름의 네임스페이스에 실패 문구가 있다`, () => {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'))
      for (const ns of Object.values(STORY_SUBMIT_NAMESPACE)) {
        const scope = ns.split('.').reduce((o, k) => o?.[k], messages)
        for (const key of ['uploadNotReady', 'rolledBack', 'rolledBackPartly', 'reattach']) {
          expect(typeof scope?.[key], `${ns}.${key}`).toBe('string')
        }
      }
    })
  }
})
