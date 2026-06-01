import { describe, expect, it } from 'vitest'
import { resolveRecipients } from './recipients'

const members = [
  { userId: 'a', role: 'owner' as const },
  { userId: 'b', role: 'guardian' as const },
  { userId: 'c', role: 'family' as const },
]
describe('resolveRecipients', () => {
  it('actor 제외 + 전원', () => {
    const r = resolveRecipients({
      members,
      actorUserId: 'a',
      category: 'album_add',
      visibility: 'family',
    })
    expect(r.sort()).toEqual(['b', 'c'])
  })
  it('guardians-only 가시성은 보호자(owner/guardian)만', () => {
    const r = resolveRecipients({
      members,
      actorUserId: 'a',
      category: 'diary_growth_milestone',
      visibility: 'guardians',
    })
    expect(r).toEqual(['b']) // c(family) 제외, a(actor) 제외
  })
  it('comment_mention 은 멘션된 사람에게만 보낸다', () => {
    const r = resolveRecipients({
      members,
      actorUserId: 'a',
      category: 'comment_mention',
      visibility: 'family',
      mentionedUserIds: ['c'],
    })
    expect(r).toEqual(['c'])
  })
  it('comment_mention 멘션이 없으면 아무에게도 안 보낸다', () => {
    const r = resolveRecipients({
      members,
      actorUserId: 'a',
      category: 'comment_mention',
      visibility: 'family',
      mentionedUserIds: [],
    })
    expect(r).toEqual([])
  })
  it('comment_mention 은 actor 자기 자신을 멘션해도 제외한다', () => {
    const r = resolveRecipients({
      members,
      actorUserId: 'a',
      category: 'comment_mention',
      visibility: 'family',
      mentionedUserIds: ['a', 'b'],
    })
    expect(r).toEqual(['b'])
  })
})
