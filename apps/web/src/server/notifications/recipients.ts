import type { NotificationCategory } from '@bebe/core'

type Member = { userId: string; role: 'owner' | 'guardian' | 'family' }
export function resolveRecipients(args: {
  members: Member[]
  actorUserId: string
  category: NotificationCategory
  visibility: 'family' | 'guardians'
  mentionedUserIds?: string[]
}): string[] {
  const guardianRoles = new Set(['owner', 'guardian'])
  const ids = args.members
    .filter((m) => m.userId !== args.actorUserId)
    .filter((m) => (args.visibility === 'guardians' ? guardianRoles.has(m.role) : true))
    .map((m) => m.userId)
  // comment_mention 은 이름 그대로 @멘션된 사람에게만 — 전 가족 스팸 방지.
  if (args.category === 'comment_mention') {
    const mentioned = new Set(args.mentionedUserIds ?? [])
    return ids.filter((uid) => mentioned.has(uid))
  }
  return ids
}
