import type { NotificationCategory } from '@bebe/core'

type Member = { userId: string; role: 'owner' | 'guardian' | 'family' }
export function resolveRecipients(args: {
  members: Member[]
  actorUserId: string
  category: NotificationCategory
  visibility: 'family' | 'guardians'
}): string[] {
  const guardianRoles = new Set(['owner', 'guardian'])
  return args.members
    .filter((m) => m.userId !== args.actorUserId)
    .filter((m) => (args.visibility === 'guardians' ? guardianRoles.has(m.role) : true))
    .map((m) => m.userId)
}
