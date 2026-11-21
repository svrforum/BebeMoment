import { describe, expect, test } from 'vitest'
import type { BucketGroup } from './groups'
import { type Remembered, resumeView, snapshotOf } from './resume'

function day(dateKey: string, ids: string[]): BucketGroup {
  return {
    dateKey,
    label: dateKey,
    assets: ids.map((id, i) => ({
      id,
      publicNo: i + 1,
      status: 'ready',
      kind: 'image',
      urls: null,
    })),
  }
}

const firstPage = [day('2026-11-03', ['a', 'b']), day('2026-11-02', ['c', 'd'])]
const deeper = [...firstPage, day('2026-11-01', ['e']), day('2026-10-31', ['f', 'g'])]
const anchor = { dayKey: '2026-10-31', top: -40 }

function remembered(over: Partial<Remembered> = {}): Remembered {
  return {
    scope: 'timeline|taken|',
    groups: deeper,
    cursor: 'cur2',
    pagesLoaded: 2,
    expanded: [],
    anchor,
    ...over,
  }
}

describe('snapshotOf — what is worth remembering when leaving', () => {
  const view = {
    scope: 'timeline|taken|',
    groups: firstPage,
    cursor: 'cur1',
    pagesLoaded: 1,
    expanded: new Set<string>(),
    anchor: null,
  }

  test('first page with nothing expanded needs no memory — the browser restores the scroll', () => {
    expect(snapshotOf(view)).toBeNull()
  })

  test('pages loaded below the first one are remembered', () => {
    const snap = snapshotOf({ ...view, groups: deeper, cursor: 'cur2', pagesLoaded: 2, anchor })
    expect(snap).toEqual(remembered())
  })

  test('a day expanded with "more" is remembered even on the first page', () => {
    const snap = snapshotOf({ ...view, expanded: new Set(['photos:2026-11-03']) })
    expect(snap?.expanded).toEqual(['photos:2026-11-03'])
    expect(snap?.groups).toBe(firstPage)
  })
})

describe('resumeView — coming back to the same history entry', () => {
  const none = new Set<string>()

  test('nothing remembered → nothing to resume', () => {
    expect(resumeView(undefined, 'timeline|taken|', firstPage, none)).toBeNull()
  })

  test('memory of another list (sort, date, collection) is not applied', () => {
    expect(resumeView(remembered(), 'timeline|uploaded|', firstPage, none)).toBeNull()
    expect(resumeView(remembered(), 'saved|taken|', firstPage, none)).toBeNull()
  })

  test('same first page → the whole remembered list, cursor and anchor come back', () => {
    const back = resumeView(
      remembered({ expanded: ['photos:2026-10-31'] }),
      'timeline|taken|',
      firstPage,
      none,
    )
    expect(back?.groups.map((g) => g.dateKey)).toEqual(deeper.map((g) => g.dateKey))
    expect(back?.cursor).toBe('cur2')
    expect(back?.pagesLoaded).toBe(2)
    expect(back?.anchor).toEqual(anchor)
    expect(back?.expanded).toEqual(['photos:2026-10-31'])
  })

  test('a photo uploaded meanwhile shows at the head, pages below stay', () => {
    const fresh = [day('2026-11-04', ['new']), ...firstPage]
    const back = resumeView(remembered(), 'timeline|taken|', fresh, none)
    expect(back?.groups.map((g) => g.dateKey)).toEqual([
      '2026-11-04',
      '2026-11-03',
      '2026-11-02',
      '2026-11-01',
      '2026-10-31',
    ])
  })

  test('first page no longer overlaps what was loaded → start from the new list', () => {
    const fresh = [day('2026-12-01', ['x', 'y'])]
    expect(resumeView(remembered(), 'timeline|taken|', fresh, none)).toBeNull()
  })

  test('a photo deleted while away does not come back — nor does a day left empty', () => {
    const back = resumeView(remembered(), 'timeline|taken|', firstPage, new Set(['e', 'g']))
    expect(back?.groups.map((g) => [g.dateKey, g.assets.map((a) => a.id)])).toEqual([
      ['2026-11-03', ['a', 'b']],
      ['2026-11-02', ['c', 'd']],
      ['2026-10-31', ['f']],
    ])
  })

  test('a day left with only a story keeps its place', () => {
    const story = { id: 's1' } as NonNullable<BucketGroup['stories']>[number]
    const withStory = [...firstPage, { ...day('2026-11-01', ['e']), stories: [story] }]
    const back = resumeView(
      remembered({ groups: withStory }),
      'timeline|taken|',
      firstPage,
      new Set(['e']),
    )
    expect(back?.groups.at(-1)).toMatchObject({
      dateKey: '2026-11-01',
      assets: [],
      stories: [story],
    })
  })
})
